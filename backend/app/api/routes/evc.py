"""EVC endpoints (spec §8)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import can_view_application, get_current_user, require_perm
from app.core.permissions import Perm
from app.db import get_db
from app.models.orm_models import (
    Application,
    Document,
    EvcCase,
    EvcParticipant,
    EvcReport,
    EvcScheduleEvent,
    Institution,
    User,
    utcnow,
)
from app.schemas import (
    EvcConfirmIn,
    EvcParticipantIn,
    EvcProposeIn,
    EvcReportIn,
    EvcRescheduleIn,
)
from app.services import audit_service, evc_service
from fastapi import UploadFile, File, Form
from datetime import date

router = APIRouter(prefix="/evc", tags=["evc"])


def _accessible_cases(db: Session, user: User):
    q = db.query(EvcCase).join(Application, EvcCase.application_id == Application.id)
    admin_roles = ("system_admin", "approving_authority", "auditor", "regional_officer")
    if user.role == "institution":
        q = q.filter(Application.institution_id == user.institution_id)
    elif user.region and user.role not in admin_roles:
        # EVC cases are cross-regional committees: a coordinator/member always sees
        # cases they are explicitly assigned to, in addition to their region.
        from sqlalchemy import or_

        region_inst_ids = db.query(Institution.id).filter(Institution.region == user.region)
        q = q.filter(
            or_(
                Application.institution_id.in_(region_inst_ids),
                EvcCase.coordinator_id == user.id,
                EvcCase.participants.any(EvcParticipant.user_id == user.id),
                Application.assigned_officer_id == user.id,
            )
        )
    if user.role == "evc_member":
        q = q.filter(
            or_(
                EvcCase.participants.any(EvcParticipant.user_id == user.id),
                Application.institution_id.in_(region_inst_ids) if user.region else False,
                Application.assigned_officer_id == user.id,
            )
        )
    return q.order_by(EvcCase.updated_at.desc())


def _case_out(db: Session, c: EvcCase) -> dict:
    return {
        "id": c.id,
        "application_id": c.application_id,
        "ref_no": c.application.ref_no,
        "institution": c.application.institution.name,
        "institution_id": c.application.institution_id,
        "stage": c.application.current_stage,
        "status": c.status,
        "coordinator": (
            {"id": u.id, "name": u.name} if (u := db.get(User, c.coordinator_id)) else None
        ),
        "proposed_date": c.proposed_date,
        "confirmed_date": c.confirmed_date,
        "reschedule_count": c.reschedule_count,
        "report_due_date": c.report_due_date,
        "report_status": c.report_status,
        "flags": evc_service.list_flags(c),
        "updated_at": c.updated_at,
    }


@router.get("")
def list_cases(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = _accessible_cases(db, user)
    if status_filter:
        q = q.filter(EvcCase.status == status_filter)
    rows = q.limit(200).all()
    return {"total": len(rows), "items": [_case_out(db, c) for c in rows]}


@router.get("/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.get(EvcCase, case_id)
    if c is None or not can_view_application(user, db, c.application):
        raise HTTPException(status_code=404, detail="EVC case not found")
    out = _case_out(db, c)
    out.update(
        {
            "reason": c.reason,
            "notes": c.notes,
            "participants": [
                {"id": p.id, "name": p.name, "role": p.role, "organization": p.organization,
                 "invited": p.invited, "accepted": p.accepted}
                for p in c.participants
            ],
            "schedule_events": [
                {"id": e.id, "event_type": e.event_type, "planned_date": e.planned_date,
                 "reason": e.reason, "created_at": e.created_at,
                 "actor": (u.name if (u := db.get(User, e.actor_id)) else None)}
                for e in sorted(c.schedules, key=lambda s: s.created_at)
            ],
            "reports": [
                {"id": r.id, "outcome": r.outcome, "summary": r.summary,
                 "deficiencies": r.deficiencies, "visit_held_on": r.visit_held_on,
                 "document_id": r.document_id,
                 "submitted_by": (u.name if (u := db.get(User, r.submitted_by)) else None),
                 "submitted_at": r.submitted_at}
                for r in c.reports
            ],
        }
    )
    return out


@router.post("/{case_id}/propose")
def propose(case_id: str, body: EvcProposeIn, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    c = db.get(EvcCase, case_id)
    if c is None or not can_view_application(user, db, c.application):
        raise HTTPException(status_code=404, detail="EVC case not found")
    if user.role not in ("evc_coordinator", "regional_officer", "system_admin"):
        raise HTTPException(status_code=403, detail="Only EVC coordinators may propose dates")
    evc_service.propose_date(db, c, user, body.date, body.note)
    db.commit()
    return _case_out(db, c)


@router.post("/{case_id}/confirm")
def confirm(case_id: str, body: EvcConfirmIn, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    c = db.get(EvcCase, case_id)
    if c is None or not can_view_application(user, db, c.application):
        raise HTTPException(status_code=404, detail="EVC case not found")
    if user.role not in ("evc_coordinator", "regional_officer", "system_admin"):
        raise HTTPException(status_code=403, detail="Only EVC coordinators may confirm schedules")
    evc_service.confirm_schedule(db, c, user, body.date, body.note)
    db.commit()
    return _case_out(db, c)


@router.post("/{case_id}/reschedule")
def reschedule(case_id: str, body: EvcRescheduleIn, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    c = db.get(EvcCase, case_id)
    if c is None or not can_view_application(user, db, c.application):
        raise HTTPException(status_code=404, detail="EVC case not found")
    if user.role not in ("evc_coordinator", "regional_officer", "system_admin"):
        raise HTTPException(status_code=403, detail="Only EVC coordinators may reschedule")
    evc_service.reschedule(db, c, user, body.date, body.reason)
    db.commit()
    return _case_out(db, c)


@router.post("/{case_id}/participants")
def add_participant(case_id: str, body: EvcParticipantIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    c = db.get(EvcCase, case_id)
    if c is None or not can_view_application(user, db, c.application):
        raise HTTPException(status_code=404, detail="EVC case not found")
    if user.role not in ("evc_coordinator", "regional_officer", "system_admin"):
        raise HTTPException(status_code=403, detail="Only EVC coordinators may add participants")
    evc_service.add_participant(db, c, user, name=body.name, role=body.role, organization=body.organization)
    db.commit()
    return {"ok": True}


@router.post("/{case_id}/start-visit")
def start_visit(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.get(EvcCase, case_id)
    if c is None or not can_view_application(user, db, c.application):
        raise HTTPException(status_code=404, detail="EVC case not found")
    if user.role not in ("evc_coordinator", "evc_member", "system_admin"):
        raise HTTPException(status_code=403, detail="Only committee roles may record the start of a visit")
    evc_service.start_visit(db, c, user)
    db.commit()
    return _case_out(db, c)


@router.post("/{case_id}/report")
def submit_report(
    case_id: str,
    outcome: str = Form(...),
    summary: str | None = Form(None),
    deficiencies: str | None = Form(None),
    visit_held_on: str | None = Form(None),
    report_document_id: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.get(EvcCase, case_id)
    if c is None or not can_view_application(user, db, c.application):
        raise HTTPException(status_code=404, detail="EVC case not found")
    if user.role not in ("evc_coordinator", "evc_member", "system_admin"):
        raise HTTPException(status_code=403, detail="Only committee roles may submit the EVC report")
    deficiencies_list = [d.strip() for d in (deficiencies or "").split(";") if d.strip()]
    vis = date.fromisoformat(visit_held_on) if visit_held_on else None
    evc_service.submit_report(
        db, c, user, outcome=outcome, summary=summary,
        deficiencies=deficiencies_list, visit_held_on=vis,
        document_id=report_document_id,
    )
    db.commit()
    return _case_out(db, c)
