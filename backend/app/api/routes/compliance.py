"""Compliance register endpoints (spec §9)."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_perm
from app.core.permissions import Perm
from app.db import get_db
from app.models.orm_models import (
    Application,
    ComplianceObligation,
    ComplianceSubmission,
    ComplianceVerification,
    Institution,
    User,
    utcnow,
)
from app.schemas import (
    EvidenceSubmitIn,
    EvidenceVerifyIn,
    ObligationCreateIn,
)
from app.services import audit_service, compliance_service

router = APIRouter(prefix="/compliance", tags=["compliance"])

_OPEN = ["not_started", "pending_submission", "submitted", "under_verification", "additional_info_required"]


def ob_out(db: Session, ob: ComplianceObligation) -> dict:
    latest_sub = (
        db.query(ComplianceSubmission).filter(ComplianceSubmission.obligation_id == ob.id)
        .order_by(ComplianceSubmission.submitted_at.desc()).first()
    )
    days_left = None
    if ob.due_date is not None:
        days_left = (ob.due_date - utcnow()).days
    return {
        "id": ob.id,
        "ref_no": ob.ref_no,
        "institution_id": ob.institution_id,
        "application_id": ob.application_id,
        "application_ref": (ob.application.ref_no if ob.application else None),
        "title": ob.title,
        "description": ob.description,
        "category": ob.category,
        "source_ref": ob.source_ref,
        "source_type": ob.source_type,
        "due_date": ob.due_date,
        "days_left": days_left,
        "status": ob.status,
        "assigned_officer": (
            {"id": u.id, "name": u.name} if (u := db.get(User, ob.assigned_officer_id)) else None
        ),
        "required_evidence": ob.required_evidence or [],
        "escalation_level": ob.escalation_level,
        "created_at": ob.created_at,
        "closed_at": ob.closed_at,
        "submissions": (
            {
                "id": latest_sub.id,
                "note": latest_sub.note,
                "evidence_document_ids": latest_sub.evidence_document_ids,
                "submitted_at": latest_sub.submitted_at,
                "verifications": [
                    {"decision": v.decision, "comments": v.comments, "created_at": v.created_at,
                     "verified_by": (u.name if (u := db.get(User, v.verified_by)) else None)}
                    for v in latest_sub.verifications
                ],
            }
            if latest_sub else None
        ),
    }


@router.get("")
def list_obligations(
    status_filter: str | None = None,
    institution_id: str | None = None,
    overdue_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(ComplianceObligation)
    if user.role == "institution":
        if not user.institution_id:
            raise HTTPException(status_code=403, detail="Account is not linked to an institution")
        q = q.filter(ComplianceObligation.institution_id == user.institution_id)
    elif institution_id:
        from app.api.deps import require_institution_access

        require_institution_access(institution_id, user, db)
        q = q.filter(ComplianceObligation.institution_id == institution_id)
    if status_filter:
        q = q.filter(ComplianceObligation.status == status_filter)
    if overdue_only:
        q = q.filter(ComplianceObligation.due_date.isnot(None),
                     ComplianceObligation.due_date < utcnow(),
                     ComplianceObligation.status.in_(_OPEN))
    rows = q.order_by(ComplianceObligation.due_date.asc()).limit(300).all()
    items = []
    for ob in rows:
        item = ob_out(db, ob)
        item["institution"] = (
            db.get(Institution, ob.institution_id).name if ob.institution_id else None
        )
        items.append(item)
    return {"total": len(items), "items": items}


@router.post("")
def create(body: ObligationCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not (user.role == "system_admin" or user.role == "compliance_officer" or user.role == "regional_officer"):
        raise HTTPException(status_code=403, detail="Only compliance or administrative officers may create obligations")
    if body.due_date is None:
        raise HTTPException(status_code=400, detail="due_date is required")
    ob = compliance_service.create_obligation(
        db,
        institution_id=body.institution_id,
        application_id=body.application_id,
        title=body.title,
        description=body.description,
        category=body.category,
        due_date=body.due_date,
        assigned_officer_id=body.assigned_officer_id or user.id,
        source_ref=body.source_ref,
        source_type=body.source_type,
        required_evidence=body.required_evidence,
        reminder_days=body.reminder_days,
        created_by=user.id,
    )
    db.commit()
    return ob_out(db, ob)


@router.post("/{ob_id}/submit")
def submit_evidence(ob_id: str, body: EvidenceSubmitIn, db: Session = Depends(get_db),
                    user: User = Depends(require_perm(Perm.COMPLIANCE_SUBMIT_EVIDENCE))):
    ob = compliance_service.get_by_id(db, ob_id)
    if ob.institution_id != user.institution_id:
        raise HTTPException(status_code=403, detail="You may submit only for your own institution")
    compliance_service.submit_evidence(
        db, user=user, obligation=ob, note=body.note,
        evidence_document_ids=body.evidence_document_ids,
    )
    db.commit()
    return ob_out(db, ob)


@router.post("/{ob_id}/verify-latest")
def verify_latest(ob_id: str, body: EvidenceVerifyIn, db: Session = Depends(get_db),
                  user: User = Depends(require_perm(Perm.COMPLIANCE_VERIFY))):
    ob = compliance_service.get_by_id(db, ob_id)
    latest = (
        db.query(ComplianceSubmission).filter(ComplianceSubmission.obligation_id == ob.id)
        .order_by(ComplianceSubmission.submitted_at.desc()).first()
    )
    if latest is None:
        raise HTTPException(status_code=400, detail="No submission to verify")
    compliance_service.verify_submission(db, user=user, submission=latest, decision=body.decision, comments=body.comments)
    db.commit()
    return ob_out(db, ob)


@router.post("/{ob_id}/escalate")
def escalate(ob_id: str, body: dict, db: Session = Depends(get_db),
             user: User = Depends(require_perm(Perm.COMPLIANCE_ESCALATE))):
    ob = compliance_service.get_by_id(db, ob_id)
    level = int(body.get("level") or ob.escalation_level + 1)
    compliance_service.escalate(
        db, obligation=ob, level=level,
        message=body.get("message") or f"Manual escalation at level {level}",
        actor=user,
    )
    db.commit()
    return ob_out(db, ob)


@router.get("/snapshot")
def snapshot(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.services.dashboards_service import compliance_snapshot

    return compliance_snapshot(db)
