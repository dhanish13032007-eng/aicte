"""Task endpoints: the officer's "My Tasks" worklist (spec §5 / §23).

Scope rules:
- `scope=mine` (default): tasks assigned to the authenticated user.
- `scope=institution`: tasks attached to the user's own institution records.
- `scope=all`: only for roles holding application.view_all (admin/authority/auditor).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_perm
from app.core.permissions import Perm, role_has
from app.db import get_db
from app.models.orm_models import (
    Application,
    ComplianceObligation,
    EvcCase,
    Task,
    User,
    utcnow,
)
from app.services import audit_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _task_out(db: Session, t: Task) -> dict:
    app = db.get(Application, t.application_id) if t.application_id else None
    ob = db.get(ComplianceObligation, t.obligation_id) if t.obligation_id else None
    case = db.get(EvcCase, t.evc_case_id) if t.evc_case_id else None
    overdue = bool(t.status == "open" and t.due_date and t.due_date < utcnow())
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "task_type": t.task_type,
        "status": t.status,
        "due_date": t.due_date,
        "overdue": overdue,
        "created_at": t.created_at,
        "completed_at": t.completed_at,
        "assignee": (
            {"id": u.id, "name": u.name} if (u := db.get(User, t.assignee_id)) else None
        ),
        "application": (
            {"id": app.id, "ref_no": app.ref_no, "stage": app.current_stage, "status": app.status}
            if app else None
        ),
        "obligation": (
            {"id": ob.id, "ref_no": ob.ref_no, "title": ob.title, "status": ob.status}
            if ob else None
        ),
        "evc_case": (
            {"id": case.id, "status": case.status} if case else None
        ),
    }


@router.get("")
def list_tasks(
    scope: str = Query("mine", pattern="^(mine|institution|all)$"),
    status_filter: str | None = Query(None, pattern="^(open|done|cancelled)$"),
    overdue_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Task)
    if scope == "all":
        if not role_has(user.role, Perm.APPLICATION_VIEW_ALL):
            raise HTTPException(status_code=403, detail="Requires permission to view all records")
    elif scope == "institution":
        if not user.institution_id:
            raise HTTPException(status_code=403, detail="Account is not linked to an institution")
        app_ids = [a.id for a in db.query(Application.id).filter(Application.institution_id == user.institution_id)]
        ob_ids = [o.id for o in db.query(ComplianceObligation.id).filter(
            ComplianceObligation.institution_id == user.institution_id)]
        from sqlalchemy import or_

        q = q.filter(or_(Task.application_id.in_(app_ids), Task.obligation_id.in_(ob_ids)))
    else:
        q = q.filter(Task.assignee_id == user.id)
    if status_filter:
        q = q.filter(Task.status == status_filter)
    if overdue_only:
        q = q.filter(Task.status == "open", Task.due_date.isnot(None), Task.due_date < utcnow())
    rows = q.order_by(
        Task.status.asc(), Task.due_date.asc().nulls_last(), Task.created_at.desc()
    ).limit(300).all()
    items = [_task_out(db, t) for t in rows]
    return {
        "total": len(items),
        "open": sum(1 for i in items if i["status"] == "open"),
        "overdue": sum(1 for i in items if i["overdue"]),
        "items": items,
    }


@router.post("/{task_id}/complete")
def complete_task(task_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.get(Task, task_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Task not found")
    # only the assignee (or a role that may assign/see everything) may complete it
    if t.assignee_id != user.id and not role_has(user.role, Perm.APPLICATION_ASSIGN_OFFICER):
        raise HTTPException(status_code=403, detail="Only the assignee may complete this task")
    if t.status != "open":
        raise HTTPException(status_code=400, detail=f"Task is already '{t.status}'")
    prev = {"status": t.status}
    t.status = "done"
    t.completed_at = utcnow()
    t.completed_by = user.id
    audit_service.record_event(
        db, actor=user, action="task.completed", entity_type="task", entity_id=t.id,
        application_id=t.application_id, previous_state=prev, new_state={"status": "done"},
    )
    db.commit()
    return {"ok": True, "id": t.id, "status": t.status}
