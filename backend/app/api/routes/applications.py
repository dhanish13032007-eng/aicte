"""Application registry + workflow endpoints."""
from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import (
    app_access_filter,
    can_view_application,
    get_current_user,
    require_app_access,
    require_perm,
)
from app.core.permissions import Perm
from app.db import get_db
from app.models.orm_models import (
    Application,
    ChecklistItem,
    Institution,
    ScrutinyNote,
    Task,
    User,
    utcnow,
)
from app.schemas import ApplicationCreateIn, ApplicationUpdateIn, AssignOfficerIn, NoteIn, TransitionIn
from app.services import audit_service, notification_service, risk_service
from app.services.idempotency import get_stored, key_for, store
from app.services.workflow_engine import WorkflowEngine, WorkflowError

router = APIRouter(prefix="/applications", tags=["applications"])


def _app_out(db: Session, app: Application, user: User, include_detail: bool = False) -> dict:
    out = {
        "id": app.id,
        "ref_no": app.ref_no,
        "institution_id": app.institution_id,
        "institution_name": app.institution.name if app.institution else None,
        "academic_year": app.academic_year,
        "category": app.category,
        "approval_type": app.approval_type,
        "title": app.title,
        "programmes": app.programmes or [],
        "requested_intake": app.requested_intake,
        "workflow_id": app.workflow_id,
        "workflow_version_no": app.workflow_version_no,
        "current_stage": app.current_stage,
        "status": app.status,
        "state": app.state,
        "assigned_officer": (
            {"id": o.id, "name": o.name, "role": o.role}
            if (o := db.get(User, app.assigned_officer_id)) else None
        ),
        "submitted_at": app.submitted_at,
        "stage_started_at": app.stage_started_at,
        "stage_deadline": app.stage_deadline,
        "stage_return_count": app.stage_return_count,
        "decision": app.decision,
        "decision_reason": app.decision_reason,
        "decision_at": app.decision_at,
        "created_by": app.created_by,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
    }
    if include_detail:
        eng = WorkflowEngine(db)
        out["valid_actions"] = [a.as_json() for a in eng.valid_actions(app, user)]
        out["checklist"] = [
            {"id": i.id, "key": i.key, "label": i.label, "required": i.required,
             "status": i.status, "note": i.note, "reviewed_at": i.reviewed_at}
            for i in db.query(ChecklistItem).filter(ChecklistItem.application_id == app.id).all()
        ]
        out["risk"] = risk_service.compute_risk(db, app)
        deadline_days = (
            (app.stage_deadline - utcnow()).days if app.stage_deadline is not None else None
        )
        out["days_in_stage"] = (utcnow() - app.stage_started_at).days
        out["days_to_stage_deadline"] = deadline_days
    return out


def _new_ref(db: Session) -> str:
    year = utcnow().strftime("%Y")
    return f"AIC/{year}/{uuid.uuid4().hex[:10].upper()}"


def _open_application(db: Session, body: ApplicationCreateIn, user: User) -> Application:
    """User-agnostic creation used by both the API route and seed data."""
    eng = WorkflowEngine(db)
    inst = db.get(Institution, body.institution_id)
    if inst is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    # choose an active workflow applicable to the category
    from app.models.orm_models import Workflow, WorkflowVersion

    wf = (
        db.query(Workflow)
        .filter(Workflow.is_active.is_(True),
                Workflow.applicable_categories.contains([body.category]))
        .first()
    )
    if wf is None:
        raise HTTPException(status_code=400, detail=f"No active workflow configured for category '{body.category}'")
    version_no = wf.active_version_no or 1
    version = db.query(WorkflowVersion).filter(
        WorkflowVersion.workflow_id == wf.id, WorkflowVersion.version_no == version_no).first()
    if version is None:
        raise HTTPException(status_code=500, detail="Workflow version missing")

    app = Application(
        ref_no=_new_ref(db),
        institution_id=inst.id,
        academic_year=body.academic_year,
        category=body.category,
        approval_type=body.approval_type,
        title=body.title,
        programmes=[p.model_dump() for p in body.programmes],
        requested_intake=body.requested_intake,
        workflow_id=wf.id,
        workflow_version_no=version_no,
        current_stage=version.stages[0].key if version.stages else "draft",
        status="draft",
        created_by=user.id,
        created_at=utcnow(),
        stage_started_at=utcnow(),
    )
    db.add(app)
    db.flush()
    # seed checklist for the review stage if defined in draft-stage entry config
    eng.stage(app)
    audit_service.record_event(
        db, actor=user, action="application.created", entity_type="application",
        entity_id=app.id, application_id=app.id,
        new_state={"stage": app.current_stage, "workflow": f"{wf.key}@v{version_no}"},
    )
    return app


@router.post("")
def create_application(
    body: ApplicationCreateIn,
    request: Request,
    idempotency_key: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm(Perm.APPLICATION_CREATE)),
):
    saved = get_stored(db, key_for(request, idempotency_key)) if idempotency_key else None
    if saved is not None:
        return saved.response_json
    # institutions may create only for their own institution
    if user.role == "institution" and user.institution_id != body.institution_id:
        raise HTTPException(status_code=403, detail="Institution users may only create applications for their own institution")
    app = _open_application(db, body, user)
    db.commit()
    out = {"id": app.id, "ref_no": app.ref_no, "message": "Draft created"}
    if idempotency_key:
        store(db, key_for(request, idempotency_key), endpoint="/applications", status=200, response=out)
    db.commit()
    return out


@router.get("")
def list_applications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    q: str | None = None,
    stage: str | None = None,
    status: str | None = None,
    category: str | None = None,
    academic_year: str | None = None,
    institution_id: str | None = None,
    assigned_to: str | None = None,
    state: str | None = "open",
    sort: str = Query("stage_deadline", pattern="^(stage_deadline|created_at|updated_at|submitted_at)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    overdue_only: bool = False,
):
    query = db.query(Application)
    query = app_access_filter(user)(query)
    if institution_id:
        if user.role == "institution" and institution_id != user.institution_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        query = query.filter(Application.institution_id == institution_id)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(Application.ref_no).like(like)
            | func.lower(Application.title).like(like)
            | Application.institution_id.in_(
                db.query(Institution.id).filter(func.lower(Institution.name).like(like))
            )
        )
    for col, val in [(Application.current_stage, stage), (Application.status, status),
                     (Application.category, category), (Application.academic_year, academic_year),
                     (Application.state, state)]:
        if val:
            query = query.filter(col == val)
    if assigned_to == "me":
        query = query.filter(Application.assigned_officer_id == user.id)
    elif assigned_to:
        query = query.filter(Application.assigned_officer_id == assigned_to)
    if overdue_only:
        query = query.filter(
            Application.stage_deadline.isnot(None), Application.stage_deadline < utcnow())
    col = {
        "stage_deadline": Application.stage_deadline,
        "created_at": Application.created_at,
        "updated_at": Application.updated_at,
        "submitted_at": Application.submitted_at,
    }[sort]
    query = query.order_by(col.asc() if order == "asc" else col.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_app_out(db, a, user) for a in rows],
    }


@router.get("/{app_id}")
def get_application(app_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    app = db.get(Application, app_id)
    if app is None or not can_view_application(user, db, app):
        raise HTTPException(status_code=404, detail="Application not found")
    out = _app_out(db, app, user, include_detail=True)
    from app.models.orm_models import AuditEvent, Document, ScrutinyNote

    audit = (
        db.query(AuditEvent)
        .filter(AuditEvent.application_id == app.id)
        .order_by(AuditEvent.seq.desc())
        .limit(100)
        .all()
    )
    out["audit_events"] = [
        {"seq": e.seq, "ts": e.created_at, "action": e.action,
         "actor_role": e.actor_role or e.actor_fallback, "reason": e.reason,
         "previous_state": e.previous_state, "new_state": e.new_state}
        for e in audit
    ]
    out["notes"] = [
        {"id": n.id, "author_id": n.author_id, "visibility": n.visibility, "content": n.content,
         "created_at": n.created_at,
         "author_name": (au.name if (au := db.get(User, n.author_id)) else None)}
        for n in db.query(ScrutinyNote)
        .filter(ScrutinyNote.application_id == app.id)
        .order_by(ScrutinyNote.created_at.desc()).all()
        if n.visibility in ("all",)
        or (n.visibility == "internal" and user.role != "institution")
        or (n.visibility == "institution" and user.institution_id == app.institution_id)
    ]
    out["tasks"] = [
        {"id": t.id, "title": t.title, "status": t.status, "due_date": t.due_date,
         "assignee_id": t.assignee_id,
         "assignee_name": (tu.name if (tu := db.get(User, t.assignee_id)) else None)}
        for t in db.query(Task).filter(Task.application_id == app.id).order_by(Task.created_at.desc()).all()
    ]
    return out


@router.patch("/{app_id}")
def update_application(
    app_id: str, body: ApplicationUpdateIn, db: Session = Depends(get_db),
    user: User = Depends(require_perm(Perm.APPLICATION_EDIT_DRAFT)),
):
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    from app.api.deps import can_view_application as _cv

    if not _cv(user, db, app):
        raise HTTPException(status_code=403, detail="Not authorized")
    if user.role == "institution" and user.institution_id != app.institution_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if app.current_stage not in ("draft", "clarification"):
        raise HTTPException(status_code=400, detail="Application can be edited only in draft or clarification stages")
    prev = {"title": app.title, "programmes": app.programmes, "requested_intake": app.requested_intake}
    if body.title is not None:
        app.title = body.title
    if body.programmes is not None:
        app.programmes = [p.model_dump() for p in body.programmes]
        app.requested_intake = sum(p.intake or 0 for p in body.programmes) or None
    if body.requested_intake is not None:
        app.requested_intake = body.requested_intake
    if body.approval_type is not None:
        app.approval_type = body.approval_type
    audit_service.record_event(
        db, actor=user, action="application.updated", entity_type="application",
        entity_id=app.id, application_id=app.id,
        previous_state=prev, new_state={"title": app.title, "programmes": app.programmes,
                                        "requested_intake": app.requested_intake},
    )
    db.commit()
    return _app_out(db, app, user)


@router.post("/{app_id}/transition")
def transition(
    app_id: str,
    body: TransitionIn,
    request: Request,
    idempotency_key: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    saved = get_stored(db, key_for(request, idempotency_key)) if idempotency_key else None
    if saved is not None:
        return saved.response_json
    try:
        result = WorkflowEngine(db).execute(
            app, user, action=body.action, reason=body.reason, note=body.note
        )
    except WorkflowError as e:
        status_code = 403 if e.code == "forbidden" else 400
        raise HTTPException(status_code=status_code, detail=str(e))
    db.commit()
    payload = {"ok": True, "application_id": app.id, **result}
    if idempotency_key:
        store(db, key_for(request, idempotency_key), endpoint="/transition", status=200, response=payload)
    db.commit()
    return payload


@router.get("/{app_id}/actions")
def actions(app_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    app = db.get(Application, app_id)
    if app is None or not can_view_application(user, db, app):
        raise HTTPException(status_code=404, detail="Application not found")
    return [a.as_json() for a in WorkflowEngine(db).valid_actions(app, user)]


@router.put("/{app_id}/checklist/{item_id}")
def update_checklist(
    app_id: str, item_id: str, body: dict, db: Session = Depends(get_db),
    user: User = Depends(require_perm(Perm.WORKFLOW_ACT_SCRUTINY)),
):
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.current_stage not in ("scrutiny", "re_scrutiny"):
        raise HTTPException(status_code=400, detail="Checklist can be updated in scrutiny stages only")
    item = db.get(ChecklistItem, item_id)
    if item is None or item.application_id != app.id:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    prev = {"status": item.status}
    item.status = body.get("status", item.status)
    item.note = body.get("note", item.note)
    item.reviewed_by = user.id
    item.reviewed_at = utcnow()
    audit_service.record_event(
        db, actor=user, action="checklist.updated", entity_type="application",
        entity_id=app.id, application_id=app.id,
        previous_state=prev, new_state={"key": item.key, "status": item.status, "note": item.note},
    )
    db.commit()
    return {"ok": True}


@router.post("/{app_id}/notes")
def add_note(
    app_id: str, body: NoteIn, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.api.deps import can_view_application as _cv

    app = db.get(Application, app_id)
    if app is None or not _cv(user, db, app):
        raise HTTPException(status_code=404, detail="Application not found")
    if user.role == "institution" and user.institution_id != app.institution_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    n = ScrutinyNote(application_id=app.id, author_id=user.id, visibility=body.visibility, content=body.content)
    db.add(n)
    audit_service.record_event(
        db, actor=user, action="note.added", entity_type="application", entity_id=app.id,
        application_id=app.id, meta={"visibility": n.visibility},
    )
    if body.visibility in ("institution", "all"):
        from app.models.orm_models import User as U

        for u in db.query(U).filter(U.institution_id == app.institution_id, U.is_active.is_(True)):
            notification_service.notify(
                db, recipient=u, type="application.note",
                title=f"Note added on {app.ref_no}", body=body.content[:400],
                link_path=f"/applications/{app.id}", application_id=app.id,
                idempotency_key=f"note:{n.id}:{u.id}",
            )
    db.commit()
    return {"ok": True, "id": n.id}


@router.post("/{app_id}/assign")
def assign_officer(
    app_id: str, body: AssignOfficerIn, db: Session = Depends(get_db),
    user: User = Depends(require_perm(Perm.APPLICATION_ASSIGN_OFFICER)),
):
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    officer = db.get(User, body.officer_id)
    if officer is None or not officer.is_active or officer.role == "institution":
        raise HTTPException(status_code=400, detail="Invalid officer")
    if officer.region and officer.region != app.institution.region:
        raise HTTPException(status_code=400, detail="Officer is outside the institution's region; choose an officer for the jurisdiction")
    prev = app.assigned_officer_id
    app.assigned_officer_id = officer.id
    db.add(Task(
        application_id=app.id, title=f"Handle application {app.ref_no} at stage '{app.current_stage}'",
        task_type="review", assignee_id=officer.id, created_by=user.id,
        due_date=app.stage_deadline,
    ))
    notification_service.notify(
        db, recipient=officer, type="application.assigned",
        title=f"You were assigned {app.ref_no}",
        body=f"Stage '{app.current_stage}'.",
        link_path=f"/applications/{app.id}", application_id=app.id,
        idempotency_key=f"assign:{app.id}:{officer.id}",
    )
    audit_service.record_event(
        db, actor=user, action="application.assigned", entity_type="application",
        entity_id=app.id, application_id=app.id,
        previous_state={"assigned_officer": prev},
        new_state={"assigned_officer": officer.id, "officer_name": officer.name},
    )
    db.commit()
    return {"ok": True}


@router.get("/{app_id}/risk")
def app_risk(app_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    app = require_app_access(app_id, user, db)
    return risk_service.compute_risk(db, app)
