"""EVC (Expert Visit Committee) service.

Rules encoded here:
- Scheduling requires the case to have passed prerequisites (status
  'ready_to_schedule' or later, never 'pending_prerequisites').
- Rescheduling requires a reason and increments reschedule_count, and records
  a full schedule-change history row.
- A visit is recorded as HELD with an outcome; reports follow. GPS, timestamps
  or video metadata are treated as SUPPLEMENTARY evidence only — they never
  automatically confirm that an inspection occurred (spec §8).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.orm_models import (
    Application,
    EvcCase,
    EvcParticipant,
    EvcReport,
    EvcScheduleEvent,
    User,
    utcnow,
)
from app.services import audit_service, notification_service


def get_case(db: Session, case_id: str) -> EvcCase:
    case = db.get(EvcCase, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="EVC case not found")
    return case


def case_for_application(db: Session, application_id: str) -> EvcCase | None:
    return db.query(EvcCase).filter(EvcCase.application_id == application_id).first()


def propose_date(db: Session, case: EvcCase, user: User, date, note: str | None = None) -> EvcCase:
    if case.status in ("pending_prerequisites", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot schedule from status '{case.status}'")
    case.proposed_date = date
    case.status = "scheduled"
    db.add(
        EvcScheduleEvent(
            evc_case_id=case.id, event_type="proposed", planned_date=date, actor_id=user.id, reason=note
        )
    )
    audit_service.record_event(
        db, actor=user, action="evc.proposed_date", entity_type="evc_case", entity_id=case.id,
        application_id=case.application_id, new_state={"date": str(date)},
    )
    db.flush()
    return case


def confirm_schedule(db: Session, case: EvcCase, user: User, date, note: str | None = None) -> EvcCase:
    if case.proposed_date is None and not date:
        raise HTTPException(status_code=400, detail="Propose a date first, or provide one with the confirmation")
    case.confirmed_date = date or case.proposed_date
    case.status = "scheduled"
    case.report_due_date = case.report_due_date or (
        datetime.combine(case.confirmed_date, datetime.min.time()).replace(
            tzinfo=None) + timedelta(days=7)
    )
    case.report_status = "pending"
    db.add(
        EvcScheduleEvent(
            evc_case_id=case.id, event_type="confirmed", planned_date=case.confirmed_date,
            actor_id=user.id, reason=note,
        )
    )
    for part in case.participants:
        part.invited = True
        notification_service.notify_role(
            db, role="evc_member", type="evc.invited", title=f"EVC visit confirmed for {case.application.ref_no}",
            body=f"Confirmed date: {case.confirmed_date.isoformat()}.",
            link_path="/evc", application_id=case.application_id,
            idempotency_key=f"evc:confirm:{case.id}",
        )
    audit_service.record_event(
        db, actor=user, action="evc.confirmed_schedule", entity_type="evc_case", entity_id=case.id,
        application_id=case.application_id, new_state={"date": str(case.confirmed_date)},
    )
    db.flush()
    return case


def reschedule(db: Session, case: EvcCase, user: User, new_date, reason: str) -> EvcCase:
    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required when rescheduling")
    old = case.confirmed_date or case.proposed_date
    case.proposed_date = new_date
    case.confirmed_date = new_date
    case.reschedule_count = (case.reschedule_count or 0) + 1
    db.add(
        EvcScheduleEvent(
            evc_case_id=case.id, event_type="rescheduled", planned_date=new_date,
            actor_id=user.id, reason=reason,
        )
    )
    audit_service.record_event(
        db, actor=user, action="evc.rescheduled", entity_type="evc_case", entity_id=case.id,
        application_id=case.application_id, previous_state={"date": str(old or "")},
        new_state={"date": str(new_date)}, reason=reason,
    )
    db.flush()
    return case


def start_visit(db: Session, case: EvcCase, user: User) -> EvcCase:
    if case.status != "scheduled":
        raise HTTPException(status_code=400, detail="Visit can start only for a scheduled case")
    case.status = "in_progress"
    db.add(
        EvcScheduleEvent(evc_case_id=case.id, event_type="visit_held", actor_id=user.id,
                         reason=None, planned_date=case.confirmed_date))
    audit_service.record_event(
        db, actor=user, action="evc.visit_started", entity_type="evc_case", entity_id=case.id,
        application_id=case.application_id, new_state={"status": "in_progress"},
        reason=None, meta={"note": "visit held on site; date/time recorded as declared by committee"},
    )
    db.flush()
    return case


def add_participant(db: Session, case: EvcCase, user: User, *, name: str, role: str,
                    organization: str | None = None, user_id: str | None = None) -> EvcParticipant:
    p = EvcParticipant(evc_case_id=case.id, name=name, role=role, organization=organization, user_id=user_id)
    db.add(p)
    audit_service.record_event(
        db, actor=user, action="evc.participant_added", entity_type="evc_case", entity_id=case.id,
        application_id=case.application_id, new_state={"name": name, "role": role},
    )
    db.flush()
    return p


def submit_report(
    db: Session, case: EvcCase, user: User, *, outcome: str, summary: str | None,
    deficiencies: list[str] | None, visit_held_on=None, document_id: str | None = None,
) -> EvcReport:
    if case.status not in ("scheduled", "in_progress", "awaiting_report"):
        raise HTTPException(status_code=400, detail=f"Cannot submit a report from status '{case.status}'")
    report = EvcReport(
        evc_case_id=case.id,
        outcome=outcome,
        summary=summary,
        deficiencies=deficiencies or [],
        visit_held_on=visit_held_on,
        document_id=document_id,
        submitted_by=user.id,
    )
    db.add(report)
    case.status = "completed"
    case.report_status = "submitted"
    notification_service.notify_role(
        db, role="sac_shc_reviewer", type="evc.report_submitted",
        title=f"EVC report submitted for {case.application.ref_no}",
        body=f"Outcome: {outcome}.",
        link_path=f"/applications/{case.application_id}", application_id=case.application_id,
        idempotency_key=f"evc:report:{case.id}",
    )
    audit_service.record_event(
        db, actor=user, action="evc.report_submitted", entity_type="evc_case", entity_id=case.id,
        application_id=case.application_id,
        new_state={"outcome": outcome, "deficiency_count": len(deficiencies or [])},
    )
    db.flush()
    return report


def list_flags(case: EvcCase) -> list[str]:
    flags: list[str] = []
    if case.status == "awaiting_report" and case.report_status != "submitted":
        flags.append("report_pending")
    due = case.report_due_date
    if due is not None and isinstance(due, datetime):
        due = due.date()
    if case.report_status == "pending" and due and due < utcnow().date():
        flags.append("report_overdue")
    return flags
