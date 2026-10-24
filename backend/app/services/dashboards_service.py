"""Database-backed dashboard metrics. No number here is ever hardcoded —
every statistic comes from a live query (or a clearly-labelled synthetic
academic year in seed data)."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.orm_models import (
    Application,
    ChecklistItem,
    ComplianceObligation,
    Document,
    EvcCase,
    Notification,
    Task,
    User,
    utcnow,
)


def executive_snapshot(db: Session, region: str | None = None) -> dict:
    now = utcnow()
    q = db.query(Application)
    if region:
        q = q.join(User, Application.created_by == User.id).filter(User.region == region)
    apps = q.subquery()
    base = db.query(Application)
    if region:
        base = base.join(User, Application.created_by == User.id).filter(User.region == region)

    by_stage_rows = (
        base.with_entities(Application.current_stage, func.count(Application.id))
        .group_by(Application.current_stage)
        .all()
    )
    active = base.filter(Application.state == "open").count()
    pending = base.filter(Application.state == "open", Application.status.notin_(
        ["approved", "rejected", "closed", "withdrawn", "on_hold"])).count()
    overdue = base.filter(
        Application.state == "open", Application.stage_deadline.isnot(None),
        Application.stage_deadline < now).count()
    approaching = base.filter(
        Application.state == "open", Application.stage_deadline.isnot(None),
        Application.stage_deadline >= now,
        Application.stage_deadline <= now + timedelta(days=3)).count()
    awaiting_decision = base.filter(Application.status == "awaiting_decision").count()
    clarification = base.filter(Application.status == "clarification_required").count()

    # avg stage duration of CLOSED apps in last 90 days (seconds)
    dur = db.query(func.avg(func.julianday(Application.closed_at) - func.julianday(Application.created_at))) \
        .filter(Application.closed_at.isnot(None)).scalar()

    # EVC
    evc_q = db.query(EvcCase).join(Application, EvcCase.application_id == Application.id).join(User, Application.created_by == User.id)
    if region:
        evc_q = evc_q.filter(User.region == region)
    ec_pending_scheduling = evc_q.filter(EvcCase.status == "ready_to_schedule").count()
    ec_awaiting_report = evc_q.filter(EvcCase.status.in_(["in_progress", "awaiting_report"])).count()

    # compliance
    ob_q = db.query(ComplianceObligation).join(User, ComplianceObligation.created_by == User.id)
    if region:
        ob_q = ob_q.filter(User.region == region)
    ob_open = ob_q.filter(ComplianceObligation.status.in_(
        ["not_started", "pending_submission", "submitted", "under_verification", "additional_info_required"])).count()
    ob_overdue = ob_q.filter(
        ComplianceObligation.due_date.isnot(None),
        ComplianceObligation.due_date < now,
        ComplianceObligation.status.in_(
            ["not_started", "pending_submission", "submitted", "under_verification", "additional_info_required"])).count()

    # docs near expiry
    doc_q = db.query(Document).join(User, Document.uploaded_by == User.id)
    if region:
        doc_q = doc_q.filter(User.region == region)
    docs_expiring = doc_q.filter(Document.is_current_version.is_(True),
                                 Document.expiry_date.isnot(None),
                                 Document.expiry_date <= (now + timedelta(days=60)).date(),
                                 Document.expiry_date >= now.date()).count()
    docs_expired = doc_q.filter(Document.is_current_version.is_(True),
                                Document.expiry_date < now.date()).count()

    return {
        "active_applications": active,
        "pending_applications": pending,
        "applications_by_stage": [{"stage": s, "count": c} for s, c in by_stage_rows],
        "stage_deadlines": {"overdue": overdue, "approaching_3d": approaching},
        "applications_awaiting_decision": awaiting_decision,
        "applications_awaiting_clarification": clarification,
        "avg_days_to_close": round(dur, 1) if dur is not None else None,
        "evc": {"pending_scheduling": ec_pending_scheduling, "awaiting_report": ec_awaiting_report},
        "compliance": {"open": ob_open, "overdue": ob_overdue},
        "documents": {"nearing_expiry_60d": docs_expiring, "expired": docs_expired},
        "data_provenance": "live database counts",
    }


def officer_snapshot(db: Session, user_id: str) -> dict:
    now = utcnow()
    mine = db.query(Application).filter(Application.assigned_officer_id == user_id)
    my_open_tasks = db.query(Task).filter(Task.assignee_id == user_id, Task.status == "open")
    overdue_tasks = my_open_tasks.filter(Task.due_date.isnot(None), Task.due_date < now).count()
    upcoming = my_open_tasks.filter(Task.due_date.isnot(None), Task.due_date >= now,
                                    Task.due_date <= now + timedelta(days=7)).count()
    return {
        "assigned_applications": mine.filter(Application.state == "open").count(),
        "awaiting_review": mine.filter(Application.current_stage.in_(
            ["scrutiny", "re_scrutiny", "sac_review", "decision"])).count(),
        "open_tasks": my_open_tasks.count(),
        "overdue_tasks": overdue_tasks,
        "tasks_due_7d": upcoming,
        "clarification_required": mine.filter(Application.status == "clarification_required").count(),
    }


def institution_snapshot(db: Session, institution_id: str) -> dict:
    now = utcnow()
    apps = db.query(Application).filter(Application.institution_id == institution_id)
    obs = db.query(ComplianceObligation).filter(ComplianceObligation.institution_id == institution_id)
    docs = db.query(Document).filter(Document.institution_id == institution_id,
                                     Document.is_current_version.is_(True))
    return {
        "applications_total": apps.count(),
        "applications_open": apps.filter(Application.state == "open").count(),
        "awaiting_my_action": apps.filter(Application.current_stage == "clarification").count(),
        "outstanding_obligations": obs.filter(ComplianceObligation.status.in_(
            ["not_started", "pending_submission", "submitted", "under_verification", "additional_info_required"])).count(),
        "obligations_overdue": obs.filter(
            ComplianceObligation.due_date.isnot(None),
            ComplianceObligation.due_date < now,
            ComplianceObligation.status.in_(
                ["not_started", "pending_submission", "submitted", "under_verification", "additional_info_required"])).count(),
        "documents_needing_attention": docs.filter(Document.status.in_(
            ["ocr_pending", "needs_manual_review", "deficient"])).count(),
        "documents_expiring_soon": docs.filter(
            Document.expiry_date.isnot(None),
            Document.expiry_date <= (now + timedelta(days=60)).date(),
            Document.expiry_date >= now.date()).count(),
    }


def compliance_snapshot(db: Session) -> dict:
    now = utcnow()
    total = db.query(ComplianceObligation).count()
    by_status_rows = (
        db.query(ComplianceObligation.status, func.count(ComplianceObligation.id))
        .group_by(ComplianceObligation.status).all()
    )
    overdue = db.query(ComplianceObligation).filter(
        ComplianceObligation.due_date.isnot(None),
        ComplianceObligation.due_date < now,
        ComplianceObligation.status.in_(
            ["not_started", "pending_submission", "submitted", "under_verification", "additional_info_required"])).count()
    verified = db.query(ComplianceObligation).filter(ComplianceObligation.status == "verified").count()
    due_7d = db.query(ComplianceObligation).filter(
        ComplianceObligation.due_date.isnot(None),
        ComplianceObligation.due_date >= now,
        ComplianceObligation.due_date <= now + timedelta(days=7),
        ComplianceObligation.status.in_(
            ["not_started", "pending_submission", "submitted", "under_verification", "additional_info_required"])).count()
    return {
        "total": total,
        "by_status": [{"status": s, "count": c} for s, c in by_status_rows],
        "overdue": overdue,
        "verified": verified,
        "due_7d": due_7d,
    }


def ageing_distribution(db: Session) -> list[dict]:
    rows = db.query(Application).filter(Application.state == "open").all()
    buckets = [
        {"bucket": "0-7d", "min": 0, "max": 7, "count": 0},
        {"bucket": "8-14d", "min": 8, "max": 14, "count": 0},
        {"bucket": "15-30d", "min": 15, "max": 30, "count": 0},
        {"bucket": "31-60d", "min": 31, "max": 60, "count": 0},
        {"bucket": "60d+", "min": 61, "max": 10_000, "count": 0},
    ]
    now = utcnow()
    for a in rows:
        if a.submitted_at is None:
            continue
        age = (now - a.submitted_at).days
        for b in buckets:
            if b["min"] <= age <= b["max"]:
                b["count"] += 1
                break
    return buckets


def workload_by_officer(db: Session) -> list[dict]:
    rows = (
        db.query(User, func.count(Application.id))
        .join(Application, Application.assigned_officer_id == User.id)
        .filter(Application.state == "open")
        .group_by(User.id, User.name)
        .all()
    )
    return [{"officer": u.name, "role": u.role, "open_applications": c} for u, c in rows]


def monthly_processing_trend(db: Session) -> list[dict]:
    # submitted per calendar month over the last 6 months of data
    rows = db.query(Application).filter(Application.submitted_at.isnot(None)).all()
    by_month: dict[str, int] = {}
    for a in rows:
        key = a.submitted_at.strftime("%Y-%m")
        by_month[key] = by_month.get(key, 0) + 1
    return [{"month": k, "submitted": v} for k, v in sorted(by_month.items())[-6:]]
