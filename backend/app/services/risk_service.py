"""Explainable delay-risk radar (deterministic rules only — no black-box ML).

Every factor is explicit: name, contribution to score, and the evidence used.
Risk output prioritizes operational attention; it NEVER determines the legal
merits of an application (spec §12). Weights come from system_settings
('risk_weights') when configured, else built-in defaults.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.orm_models import (
    Application,
    BackgroundJob,
    ChecklistItem,
    Document,
    EvcCase,
    Task,
    utcnow,
)

DEFAULT_WEIGHTS = {
    "stage_progress": 30,
    "deadline_proximity": 20,
    "unresolved_dependencies": 15,
    "returns": 10,
    "evc_pending": 10,
    "awaiting_institution": 5,
    "failed_jobs": 5,
    "age": 5,
}


def _weights(db: Session) -> dict:
    from app.models.orm_models import SystemSetting

    s = db.get(SystemSetting, "risk_weights")
    if s and isinstance(s.value, dict):
        return {**DEFAULT_WEIGHTS, **s.value}
    return dict(DEFAULT_WEIGHTS)


def compute_risk(db: Session, app: Application) -> dict:
    now = utcnow()
    factors: list[dict] = []
    score = 0

    def add_factor(name, points, detail, evidence=None):
        nonlocal score
        score += points
        factors.append({
            "factor": name,
            "points": points,
            "detail": detail,
            "evidence": evidence,
        })

    stage = app.current_stage
    # 1. stage progress
    target_days = None
    if app.stage_started_at is not None:
        elapsed = (now - app.stage_started_at).days
        # target from stage config (via version) if available
        entry_age_days = elapsed
        # We use stage_deadline when present to derive target length:
        if app.stage_deadline is not None and app.stage_deadline > app.stage_started_at:
            target_days = (app.stage_deadline - app.stage_started_at).days
        if target_days and target_days > 0:
            pct = min(1.0, elapsed / target_days)
            if pct >= 1.0:
                pts = int(DEFAULT_WEIGHTS["stage_progress"])
                add_factor("stage_target_exceeded", pts,
                           f"Stage target exceeded: {elapsed}d elapsed vs {target_days}d target",
                           {"elapsed_days": elapsed, "target_days": target_days})
            elif pct >= 0.8:
                pts = int(DEFAULT_WEIGHTS["stage_progress"] * (pct - 0.5) * 2)  # ramp 0.6→1.0 weight
                add_factor("stage_time_consuming", pts,
                           f"{pct:.0%} of internal stage target elapsed",
                           {"elapsed_days": elapsed, "target_days": target_days})

    # 2. deadline proximity / overdue
    if app.stage_deadline is not None:
        days_left = (app.stage_deadline - now).days
        if days_left < 0:
            pts = int(DEFAULT_WEIGHTS["deadline_proximity"])
            add_factor("past_internal_deadline", pts,
                       f"Internal target deadlined {-days_left} day(s) ago",
                       {"days_overdue": -days_left})
        elif days_left <= 2:
            pts = int(DEFAULT_WEIGHTS["deadline_proximity"] * 0.7)
            add_factor("deadline_approaching", pts,
                       f"Internal target due in {days_left} day(s)",
                       {"days_left": days_left})

    # 3. unresolved dependencies (documents pending OCR/verification, checklist)
    unverified_docs = db.query(func.count(Document.id)).filter(
        Document.application_id == app.id,
        Document.is_current_version.is_(True),
        Document.status.in_(["ocr_pending", "needs_manual_review", "verification_pending"]),
    ).scalar() or 0
    pending_checklist = db.query(func.count(ChecklistItem.id)).filter(
        ChecklistItem.application_id == app.id,
        ChecklistItem.required.is_(True),
        ChecklistItem.status.in_(["pending", "deficient"]),
    ).scalar() or 0
    open_tasks = db.query(func.count(Task.id)).filter(
        Task.application_id == app.id, Task.status == "open"
    ).scalar() or 0
    deps = unverified_docs + pending_checklist + open_tasks
    if deps:
        pts = min(DEFAULT_WEIGHTS["unresolved_dependencies"], deps * 5)
        add_factor("unresolved_dependencies", pts,
                   f"{deps} open dependency item(s): {unverified_docs} document(s) pending review, "
                   f"{pending_checklist} checklist item(s), {open_tasks} open task(s)",
                   {"unverified_docs": unverified_docs, "pending_checklist": pending_checklist,
                    "open_tasks": open_tasks})
    if open_tasks:
        oldest = db.query(func.max(Task.created_at)).filter(
            Task.application_id == app.id, Task.status == "open").scalar()
        if oldest:
            oldest_age = (now - oldest).days
            if oldest_age >= 5:
                add_factor("oldest_task_old", int(DEFAULT_WEIGHTS["age"]),
                           f"Oldest open task is {oldest_age} days old", {"oldest_task_age_days": oldest_age})

    # 4. repeated returns
    if (app.stage_return_count or 0) >= 2:
        add_factor("repeated_returns", int(DEFAULT_WEIGHTS["returns"]),
                   f"Returned for clarification {app.stage_return_count} time(s)",
                   {"return_count": app.stage_return_count})

    # 5. EVC pending
    evc = db.query(EvcCase).filter(EvcCase.application_id == app.id).first()
    if evc is not None and evc.status in ("ready_to_schedule", "scheduled", "in_progress"):
        unscheduled = evc.status in ("ready_to_schedule")
        pts = int(DEFAULT_WEIGHTS["evc_pending"] * (1.0 if unscheduled else 0.6))
        add_factor("evc",
                   pts,
                   (f"EVC not yet scheduled (status: {evc.status})" if unscheduled
                    else f"EVC scheduled '{evc.status}' with report pending"),
                   {"evc_status": evc.status, "confirmed_date": str(evc.confirmed_date or "")})
    elif evc is not None and evc.status == "awaiting_report":
        add_factor("evc", int(DEFAULT_WEIGHTS["evc_pending"]),
                   "EVC visit held, report pending", {"evc_status": evc.status})

    # 6. awaiting institution response
    if stage == "clarification":
        add_factor("awaiting_institution", int(DEFAULT_WEIGHTS["awaiting_institution"]),
                   "Institution response outstanding",
                   {"stage": stage})

    # 7. failed background jobs touching this application (payload filtered in
    # Python so the same ORM query works on SQLite and PostgreSQL)
    failed_jobs = sum(
        1
        for j in db.query(BackgroundJob).filter(BackgroundJob.status == "failed")
        if j.payload.get("application_id") == app.id
    )
    if failed_jobs:
        add_factor("failed_jobs", int(DEFAULT_WEIGHTS["failed_jobs"]),
                   f"{failed_jobs} background job(s) failed for this application",
                   {"failed_jobs": failed_jobs})

    # 8. overall ageing in stage > 14 days
    if app.stage_started_at and (now - app.stage_started_at).days >= 14:
        add_factor("long_stage_age", int(DEFAULT_WEIGHTS["age"]),
                   f"In stage '{stage}' for {(now - app.stage_started_at).days} days",
                   {"age_days": (now - app.stage_started_at).days})

    # classification — deliberately conservative thresholds
    if score >= 60:
        risk = "Critical"
    elif score >= 35:
        risk = "High"
    elif score >= 15:
        risk = "Medium"
    else:
        risk = "Low"

    # recommended next action — derived deterministically from factors
    next_action = _next_action(app, stage, dep_summary_local := (unverified_docs, pending_checklist, open_tasks),
                               evc_status=(evc.status if evc else None))

    return {
        "application_id": app.id,
        "ref_no": app.ref_no,
        "stage": stage,
        "status": app.status,
        "risk": risk,
        "score": score,
        "factors": sorted(factors, key=lambda f: -f["points"]),
        "next_action": next_action,
        "computed_at": now.isoformat(),
        "weights_version": "2024-v1 (internal operational prioritization only)",
        "note": "This is an operational delay prioritization indicator. It never determines the legal or regulatory merits of an application.",
    }


def _next_action(app: Application, stage, deps: tuple[int, int, int], evc_status: str | None) -> str:
    unverified_docs, pending_checklist, open_tasks = deps
    if unverified_docs:
        return "Verify pending documents (OCR review) before completing the stage"
    if evc_status == "ready_to_schedule":
        return "Schedule the EVC visit"
    if evc_status in ("scheduled", "in_progress"):
        return "Follow up EVC participants; record the visit outcome"
    if pending_checklist:
        return "Complete the outstanding checklist items"
    if open_tasks:
        return "Resolve the open tasks for this application"
    if stage == "clarification":
        return "Await institution response; remind after configured interval"
    if stage == "sac_review":
        return "Record the SAC/SHC review recommendation"
    if stage == "decision":
        return "Record the authorized decision with reasons"
    return "Proceed with the stage's configured transitions"


def bulk_radar(db: Session, apps: list[Application]) -> list[dict]:
    """Compute risk for many applications; N+1 is acceptable at demo scale."""
    return [compute_risk(db, a) for a in apps]
