"""SLA/deadline monitoring job (spec §10).

Runs on a schedule (in-process scheduler in local mode; Celery beat with the
docker-compose stack). Every run is IDEMPOTENT via idempotent notification keys
identical for the same logical day of the run.

Three clearly distinguished deadline kinds (never mixed):
1. official_policy — hypothetical or sourced references marked as such
2. internal_target — administrator-configured operational targets (default)
3. demonstration  — synthetic seed data for demo purpose

Configured reminder cadence example (T-7/T-2/T-0/T+3) is an ILLUSTRATIVE LOCAL
policy, not an official AICTE rule.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.log import get_logger
from app.models.orm_models import (
    Application,
    ComplianceObligation,
    EvcCase,
    EscalationPolicy,
    SystemSetting,
    Task,
    User,
    utcnow,
)
from app.services import notification_service

log = get_logger("sla")

DEFAULT_REMINDER_DAYS = [7, 2, 0]


def _reminder_days(db: Session, policy_key: str) -> list[int]:
    policy = db.query(EscalationPolicy).filter(EscalationPolicy.key == policy_key).first()
    if policy and policy.config and isinstance(policy.config.get("reminder_days"), list):
        return list(policy.config["reminder_days"])
    return list(DEFAULT_REMINDER_DAYS)


def sla_tick(db: Session) -> dict:
    """One scheduler pass: stage-deadline reminders, overdue compliance
    obligations, EVC report overdue, task overdue. All notifications use
    idempotency keys of `sla:<kind>:<id>:<YYYY-MM-DD>` so re-running the tick
    on the same day never duplicates messages."""
    now = utcnow()
    today = now.date().isoformat()
    summary: dict[str, int] = {"stage_reminders": 0, "applications_overdue": 0,
                               "compliance_overdue": 0, "evc_report_overdue": 0,
                               "task_overdue": 0}

    # --- Application stage deadlines ---------------------------------------
    apps = db.query(Application).filter(
        Application.state == "open", Application.stage_deadline.isnot(None)
    ).all()
    for app in apps:
        days_left = (app.stage_deadline - now).days
        days_late = (now - app.stage_deadline).days if now > app.stage_deadline else None
        if days_late is not None:
            summary["applications_overdue"] += 1
            recipients: set[str] = set()
            if app.assigned_officer_id:
                recipients.add(app.assigned_officer_id)
            for g in db.query(User).filter(User.role == "regional_officer").all():
                recipients.add(g.id)
            for uid in recipients:
                notification_service.notify(
                    db, recipient=db.get(User, uid),
                    type="application.overdue",
                    title=f"{app.ref_no} is past its internal target by {days_late}d",
                    body=f"Stage '{app.current_stage}' exceeded its configured operational target.",
                    severity="critical", application_id=app.id,
                    idempotency_key=f"sla:app_overdue:{app.id}:{uid}:{today}",
                )
        elif days_left in (7, 2, 0):
            recipients = set()
            if app.assigned_officer_id:
                recipients.add(app.assigned_officer_id)
            for u in db.query(User).filter(User.role == "regional_officer").all():
                recipients.add(u.id)
            for uid in recipients:
                notification_service.notify(
                    db, recipient=db.get(User, uid),
                    type="application.deadline_approaching",
                    title=f"{app.ref_no}: internal target in {days_left}d",
                    body=f"Stage '{app.current_stage}' deadline approaching (configured operational target).",
                    severity="warning" if days_left else "critical", application_id=app.id,
                    idempotency_key=f"sla:app_reminder:{app.id}:{uid}:{today}",
                )
            summary["stage_reminders"] += 1

    # --- Compliance obligations ----------------------------------------------
    obs = db.query(ComplianceObligation).filter(
        ComplianceObligation.due_date.isnot(None),
        ComplianceObligation.status.in_(
            ["not_started", "pending_submission", "submitted", "under_verification",
             "additional_info_required"]
        ),
    ).all()
    for ob in obs:
        if ob.due_date is None:
            continue
        days_late = (now - ob.due_date).days if now > ob.due_date else None
        if days_late is not None:
            summary["compliance_overdue"] += 1
            notification_service.notify_role(
                db, role="compliance_officer", type="compliance.overdue",
                title=f"{ob.ref_no} overdue by {days_late}d",
                body=f"Institution deadline passed; escalation level {ob.escalation_level + 1}.",
                severity="critical", application_id=ob.application_id,
                idempotency_key=f"sla:comp_overdue:{ob.id}:{today}",
            )
        else:
            days_left = (ob.due_date - now).days
            if days_left in _reminder_days(db, "compliance_reminder"):
                notification_service.notify_role(
                    db, role="compliance_officer", type="compliance.due_soon",
                    title=f"{ob.ref_no} due in {days_left}d",
                    severity="warning", application_id=ob.application_id,
                    body="Reminder window reached per configured schedule.",
                    idempotency_key=f"sla:comp_reminder:{ob.id}:{today}",
                )
                # remind institution users directly as well
                for u in db.query(User).filter(
                    User.institution_id == ob.institution_id, User.is_active.is_(True)
                ).all():
                    notification_service.notify(
                        db, recipient=u, type="compliance.due_soon",
                        title=f"{ob.ref_no} due in {days_left}d",
                        body=f"Compliance obligation '{ob.title}' is due {ob.due_date if not hasattr(ob.due_date, 'date') else ob.due_date.date()} (configured internal target, not an official deadline).",
                        severity="warning", application_id=ob.application_id,
                        link_path="/compliance",
                        idempotency_key=f"sla:comp_inst:{ob.id}:{u.id}:{today}",
                    )

    # --- EVC reports ----------------------------------------------------------
    evcs = db.query(EvcCase).filter(
        EvcCase.report_status == "pending", EvcCase.report_due_date.isnot(None),
        EvcCase.status.in_(["scheduled", "in_progress", "awaiting_report"]),
    ).all()
    for ec in evcs:
        if ec.report_due_date is None:
            continue
        late = (now.date() - ec.report_due_date).days if now.date() > ec.report_due_date else None
        if late is not None:
            summary["evc_report_overdue"] += len(
                notification_service.notify_role(
                    db, role="evc_coordinator", type="evc.report_overdue",
                    title=f"EVC report for {ec.application.ref_no} overdue by {late}d",
                    severity="critical", application_id=ec.application_id,
                    idempotency_key=f"sla:evc_report:{ec.id}:{today}",
                    body="The visit committee's report has not been submitted; please follow up.",
                )
            )

    # --- stale open tasks -------------------------------------------------------
    tasks = db.query(Task).filter(Task.status == "open", Task.due_date.isnot(None)).all()
    for t in tasks:
        if t.due_date < now:
            summary["task_overdue"] += 1
            if t.assignee_id:
                notification_service.notify(
                    db, recipient=db.get(User, t.assignee_id), type="task.overdue",
                    title=f"Task overdue: {t.title}",
                    severity="warning", application_id=t.application_id,
                    idempotency_key=f"sla:task:{t.id}:{today}",
                )

    return summary


def health(db: Session) -> dict:
    """Basic SLA health snapshot for the dashboard."""
    from sqlalchemy import func

    counts = {
        "applications_overdue": db.query(func.count(Application.id)).filter(
            Application.state == "open",
            Application.stage_deadline.isnot(None),
            Application.stage_deadline < utcnow(),
        ).scalar() or 0,
    }
    counts["escalation_policies_configured"] = db.query(EscalationPolicy).count()
    tick = db.get(SystemSetting, "sla.last_tick")
    counts["last_tick_at"] = tick.value.get("ts") if tick else None
    return counts
