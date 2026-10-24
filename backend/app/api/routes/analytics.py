"""Dashboards, analytics, delay-risk radar, bottleneck analysis, audit trail,
notifications and reports."""
from __future__ import annotations

import csv
import io
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import app_access_filter, can_view_application, get_current_user, require_perm
from app.core.permissions import Perm
from app.db import get_db
from app.models.orm_models import (
    Application,
    AuditEvent,
    Document,
    EvcCase,
    Institution,
    Notification,
    User,
    utcnow,
)
from app.services import audit_service, dashboards_service, risk_service

router = APIRouter(tags=["analytics"])


@router.get("/dashboards/executive")
def executive(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.DASH_EXECUTIVE))):
    return dashboards_service.executive_snapshot(db)


@router.get("/dashboards/officer")
def officer_dash(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return dashboards_service.officer_snapshot(db, user.id)


@router.get("/dashboards/institution")
def institution_dash(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "institution" or not user.institution_id:
        raise HTTPException(status_code=403, detail="Institution accounts only")
    return dashboards_service.institution_snapshot(db, user.institution_id)


@router.get("/dashboards/compliance")
def compliance_dash(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.DASH_COMPLIANCE))):
    return dashboards_service.compliance_snapshot(db)


@router.get("/dashboards/evc")
def evc_dash(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(EvcCase)
    rows = q.all()
    by_status: dict[str, int] = {}
    for c in rows:
        by_status[c.status] = by_status.get(c.status, 0) + 1
    upcoming = [c for c in rows if c.confirmed_date and utcnow().date() <= c.confirmed_date <= (utcnow() + timedelta(days=30)).date()]
    return {
        "by_status": by_status,
        "upcoming_visits": len(upcoming),
        "rescheduled": sum(1 for c in rows if c.reschedule_count or 0),
        "pending_reports": sum(1 for c in rows if c.report_status == "pending"),
        "coordinators": dashboards_service.workload_by_officer(db),
    }


@router.get("/analytics/ageing")
def ageing(db: Session = Depends(get_db)):
    return dashboards_service.ageing_distribution(db)


@router.get("/analytics/workload")
def workload(db: Session = Depends(get_db)):
    return dashboards_service.workload_by_officer(db)


@router.get("/analytics/monthly")
def monthly(db: Session = Depends(get_db)):
    return dashboards_service.monthly_processing_trend(db)


# --- delay-risk radar -----------------------------------------------------------


@router.get("/risk-radar")
def risk_radar(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    apps = app_access_filter(user)(db.query(Application)).filter(Application.state == "open").all()
    radar = [risk_service.compute_risk(db, a) for a in apps]
    radar.sort(key=lambda r: -r["score"])
    return radar


@router.get("/applications/{app_id}/risk")
def app_risk(app_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    app = db.get(Application, app_id)
    if app is None or not can_view_application(user, db, app):
        raise HTTPException(status_code=404, detail="Application not found")
    return risk_service.compute_risk(db, app)


# --- bottleneck / dependency analysis ---------------------------------------------


@router.get("/bottlenecks")
def bottlenecks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from datetime import datetime

    from app.models.orm_models import ChecklistItem, Task, BackgroundJob, utcnow as _now

    def _categorize(a: Application) -> tuple[str, str | None, str | None]:
        now = utcnow()
        if a.current_stage == "clarification":
            return "institution_action_pending", None, None
        evc = db.query(EvcCase).filter(EvcCase.application_id == a.id).first()
        unv_docs = db.query(Document).filter(
            Document.application_id == a.id, Document.is_current_version.is_(True),
            Document.status.in_(["ocr_pending", "needs_manual_review", "verification_pending"])).count()
        pending_cl = db.query(ChecklistItem).filter(
            ChecklistItem.application_id == a.id, ChecklistItem.required.is_(True),
            ChecklistItem.status.in_(["pending", "deficient"])).count()
        failed = sum(1 for j in db.query(BackgroundJob).filter(BackgroundJob.status == "failed")
                     if j.payload.get("application_id") == a.id)
        if failed:
            return "technical_processing_failure", failed, None
        if unv_docs:
            return "document_verification_pending", unv_docs, None
        if evc and evc.status == "ready_to_schedule":
            return "evc_scheduling_pending", None, evc.id
        if evc and evc.status in ("scheduled", "in_progress"):
            return "evc_report_pending", None, evc.id
        if a.current_stage in ("scrutiny", "re_scrutiny"):
            return "officer_review_pending", None, None
        if a.current_stage == "sac_review":
            return "review_stage_pending", None, None
        if a.current_stage == "decision":
            return "authorized_decision_pending", None, None
        return "workflow_in_progress", None, None

    apps = app_access_filter(user)(db.query(Application)).filter(Application.state == "open").all()
    items = []
    for a in apps:
        cat, extra, evc_id = _categorize(a)
        owner = db.get(User, a.assigned_officer_id) if a.assigned_officer_id else None
        since = a.stage_started_at
        items.append({
            "application_id": a.id, "ref_no": a.ref_no, "institution": a.institution.name,
            "category": cat, "extra": extra,
            "stage": a.current_stage, "status": a.status,
            "owner": owner.name if owner else None, "owner_role": owner.role if owner else "institution",
            "blocked_for_days": (utcnow() - since).days if since else None,
            "stage_deadline": a.stage_deadline,
        })
    by_cat: dict[str, int] = {}
    for i in items:
        by_cat[i["category"]] = by_cat.get(i["category"], 0) + 1
    items.sort(key=lambda i: -(i["blocked_for_days"] or 0))
    return {"summary": by_cat, "items": items[:100],
            "note": "Categories are factual stage/dependency states, not blame assignments."}


# --- audit trail viewer --------------------------------------------------------------


@router.get("/audit")
def audit_list(
    application_id: str | None = None,
    user_id: str | None = None,
    action: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if application_id:
        app = db.get(Application, application_id)
        if app is None or not can_view_application(user, db, app):
            raise HTTPException(status_code=404, detail="Application not found")
        q = db.query(AuditEvent).filter(AuditEvent.application_id == app.id)
    else:
        if not user.role in ("system_admin", "approving_authority", "auditor", "regional_officer"):
            raise HTTPException(status_code=403, detail="Requires audit access")
        q = db.query(AuditEvent)
    if user_id:
        q = q.filter(AuditEvent.actor_id == user_id)
    if action:
        q = q.filter(AuditEvent.action.like(f"%{action}%"))
    rows = q.order_by(AuditEvent.seq.desc()).limit(min(limit, 500)).all()
    return {
        "items": [
            {"seq": e.seq, "id": e.id, "ts": e.created_at, "action": e.action,
             "actor_id": e.actor_id, "actor": (u.name if (u := db.get(User, e.actor_id)) else None),
             "actor_role": e.actor_role or e.actor_fallback,
             "entity_type": e.entity_type, "entity_id": e.entity_id,
             "application_id": e.application_id,
             "previous_state": e.previous_state, "new_state": e.new_state,
             "reason": e.reason, "meta": e.meta,
             "hash": e.hash, "previous_hash": e.previous_hash}
            for e in rows
        ]
    }


@router.get("/audit/verify")
def audit_verify(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.AUDIT_VIEW_ALL))):
    return audit_service.verify_chain(db)


# --- notifications --------------------------------------------------------------


@router.get("/notifications")
def notifications(
    unread_only: bool = False, limit: int = 50,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    q = db.query(Notification).filter(Notification.recipient_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    rows = q.order_by(Notification.created_at.desc()).limit(min(limit, 200)).all()
    return {
        "unread": db.query(Notification).filter(
            Notification.recipient_id == user.id, Notification.is_read.is_(False)).count(),
        "items": [
            {"id": n.id, "type": n.type, "severity": n.severity, "title": n.title,
             "body": n.body, "link_path": n.link_path, "is_read": n.is_read,
             "channel": n.channel, "delivery_status": n.delivery_status,
             "created_at": n.created_at}
            for n in rows
        ],
    }


@router.post("/notifications/{n_id}/read")
def mark_read(n_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(Notification, n_id)
    if n is None or n.recipient_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}


# --- exports / reports -----------------------------------------------------------


@router.get("/reports/applications.csv")
def export_applications_csv(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.APPLICATION_CSV_EXPORT))):
    apps = app_access_filter(user)(db.query(Application)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ref_no", "institution", "academic_year", "category", "stage", "status",
                "assigned_officer", "submitted_at", "stage_deadline", "days_in_stage", "decision"])
    for a in apps:
        w.writerow([a.ref_no, a.institution.name if a.institution else "", a.academic_year,
                    a.category, a.current_stage, a.status,
                    (db.get(User, a.assigned_officer_id).name if a.assigned_officer_id else ""),
                    a.submitted_at, a.stage_deadline,
                    (utcnow() - a.stage_started_at).days, a.decision or ""])
    filename = f"applications-export-{utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/audit.csv")
def export_audit_csv(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.AUDIT_EXPORT))):
    rows = db.query(AuditEvent).order_by(AuditEvent.seq).limit(5000).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["seq", "ts_utc", "action", "actor_id", "actor_role", "entity_type",
                "entity_id", "application_id", "reason", "hash", "previous_hash"])
    for e in rows:
        w.writerow([e.seq, e.created_at, e.action, e.actor_id, e.actor_role or e.actor_fallback,
                    e.entity_type, e.entity_id, e.application_id, e.reason, e.hash, e.previous_hash])
    filename = f"audit-export-{utcnow().strftime('%Y%m%d-%H%M')}.csv"
    audit_service.record_event(db, actor=user, action="audit.exported", entity_type="audit",
                               meta={"rows": len(rows)})
    db.commit()
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/reports/summary")
def reports_summary(db: Session = Depends(get_db), user: User = Depends(require_perm(Perm.REPORTS_VIEW))):
    return {
        "executive": dashboards_service.executive_snapshot(db),
        "ageing": dashboards_service.ageing_distribution(db),
        "workload": dashboards_service.workload_by_officer(db),
        "compliance": dashboards_service.compliance_snapshot(db),
        "monthly": dashboards_service.monthly_processing_trend(db),
        "generated_at": utcnow().isoformat(),
        "data_provenance": "live database (or clearly-labelled synthetic demo year data)",
    }
