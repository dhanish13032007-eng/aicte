"""Undertakings & compliance register.

Core rule (spec §9): an obligation is NEVER marked verified because a file was
uploaded or an AI model returned a positive result — verification is an
explicit human decision by an authorized officer, recorded with comments.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.orm_models import (
    Application,
    ComplianceObligation,
    ComplianceSubmission,
    ComplianceVerification,
    User,
    utcnow,
)
from app.services import audit_service, notification_service

OPEN_STATUSES = {
    "not_started", "pending_submission", "submitted", "under_verification", "additional_info_required"
}


def next_ref(db: Session) -> str:
    return f"OB-{utcnow().strftime('%Y%m')}-{uuid.uuid4().hex[:8].upper()}"


def create_obligation(
    db: Session,
    *,
    institution_id: str,
    application_id: str | None,
    title: str,
    description: str | None,
    category: str,
    due_date,
    assigned_officer_id: str | None,
    source_ref: str | None = None,
    source_type: str = "internal_target",
    required_evidence: list[str] | None = None,
    reminder_days: list[int] | None = None,
    created_by: str,
    auto_created: bool = False,
) -> ComplianceObligation:
    ob = ComplianceObligation(
        ref_no=next_ref(db),
        institution_id=institution_id,
        application_id=application_id,
        title=title,
        description=description,
        category=category,
        source_ref=source_ref,
        source_type=source_type,
        due_date=due_date,
        assigned_officer_id=assigned_officer_id,
        required_evidence=required_evidence or [],
        reminder_days=reminder_days or [7, 2, 0],
        status="pending_submission",
        created_by=created_by,
    )
    db.add(ob)
    db.flush()
    audit_service.record_event(
        db,
        actor=(db.get(User, created_by) if created_by else None),
        action="compliance.created",
        entity_type="compliance_obligation",
        entity_id=ob.id,
        application_id=application_id,
        new_state={"title": title, "due": str(due_date), "auto_created": auto_created,
                   "source_type": source_type},
    )
    notification_service.notify_role(
        db, role="compliance_officer", type="compliance.created",
        title=f"New compliance obligation {ob.ref_no}",
        body=f"Title: {title}. Due {due_date}.",
        severity="info", application_id=application_id,
        idempotency_key=f"comp:create:{ob.id}",
    )
    return ob


def get_by_id(db: Session, obligation_id: str) -> ComplianceObligation:
    ob = db.get(ComplianceObligation, obligation_id)
    if ob is None:
        raise HTTPException(status_code=404, detail="Obligation not found")
    return ob


def submit_evidence(
    db: Session, *, user: User, obligation: ComplianceObligation,
    note: str | None, evidence_document_ids: list[str],
) -> ComplianceSubmission:
    if not user.institution_id or user.institution_id != obligation.institution_id:
        raise HTTPException(status_code=403, detail="Only the owning institution may submit evidence")
    if obligation.status in ("verified", "closed", "waived"):
        raise HTTPException(status_code=400, detail=f"Obligation already {obligation.status}")
    sub = ComplianceSubmission(
        obligation_id=obligation.id,
        note=note,
        evidence_document_ids=evidence_document_ids,
        submitted_by=user.id,
    )
    db.add(sub)
    obligation.status = "under_verification"
    audit_service.record_event(
        db, actor=user, action="compliance.evidence_submitted",
        entity_type="compliance_obligation", entity_id=obligation.id,
        application_id=obligation.application_id,
        previous_state={"status": obligation.status},
        new_state={"status": "under_verification",
                   "evidence_count": len(evidence_document_ids)},
    )
    if obligation.assigned_officer_id:
        notification_service.notify(
            db, recipient=db.get(User, obligation.assigned_officer_id),
            type="compliance.submitted",
            title=f"Evidence submitted for {obligation.ref_no}",
            body="Awaiting your verification.",
            severity="info", application_id=obligation.application_id,
            idempotency_key=f"comp:submit:{sub.id}",
        )
    db.flush()
    return sub


def verify_submission(
    db: Session, *, user: User, submission: ComplianceSubmission,
    decision: str, comments: str | None,
) -> ComplianceVerification:
    obligation = submission.obligation
    if user.role != "compliance_officer" and user.role != "system_admin":
        raise HTTPException(status_code=403, detail="Only compliance officers or administrators may verify")
    ver = ComplianceVerification(
        submission_id=submission.id, verified_by=user.id, decision=decision, comments=comments
    )
    db.add(ver)
    if decision == "verified":
        obligation.status = "verified"
        obligation.closed_at = utcnow()
        obligation.closed_by = user.id
        obligation.closure_reason = comments or "Evidence verified"
    elif decision in ("deficient", "needs_more_info"):
        obligation.status = (
            "additional_info_required" if decision == "needs_more_info" else "pending_submission"
        )
    else:
        raise HTTPException(status_code=400, detail="decision must be verified|deficient|needs_more_info")

    audit_service.record_event(
        db, actor=user, action="compliance.evidence_verified",
        entity_type="compliance_obligation", entity_id=obligation.id,
        application_id=obligation.application_id,
        previous_state={"status": "under_verification"},
        new_state={"status": obligation.status, "decision": decision},
        reason=comments,
    )
    db.flush()
    return ver


def escalate(db: Session, *, obligation: ComplianceObligation, level: int, message: str,
             actor: User | None = None, system: bool = False) -> None:
    from app.models.orm_models import EscalationEvent

    obligation.escalation_level = max(obligation.escalation_level, level)
    db.add(EscalationEvent(
        obligation_id=obligation.id, application_id=obligation.application_id,
        level=level, message=message, notified_role="regional_officer"))
    notification_service.notify_role(
        db, role="regional_officer", type="compliance.escalated",
        title=f"Compliance escalation L{level}: {obligation.ref_no}",
        body=message, severity="critical", application_id=obligation.application_id,
        idempotency_key=f"comp:esc:{obligation.id}:{level}:{utcnow().date().isoformat()}",
    )
    audit_service.record_event(
        db,
        actor=None if system else actor,
        actor_fallback="sla_scheduler" if system else "user",
        action="compliance.escalated",
        entity_type="compliance_obligation",
        entity_id=obligation.id,
        application_id=obligation.application_id,
        new_state={"level": level},
        reason=message,
    )
