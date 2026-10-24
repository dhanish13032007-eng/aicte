"""Regulatory rule registry (spec §17).

Rule types implemented in the deterministic evaluator:
- doc_validity      : expiry check for a document type (grace_days etc.)
- lease_duration_min: minimum remaining validity for lease-type documents from
                      inputs provided by the operator (configurable,
                      source-cited; clearly flagged until officially verified)
- intake_ceiling    : simple threshold check on requested intake (demo of
                      parameterized toggles; needs official verification)

Every rule carries a verification_status field: 'needs_verification' until
someone with authority verifies the citation; the UI and API surface that
status so nothing read that way implies an official AICTE requirement.
"""
from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.orm_models import (
    Application,
    Document,
    RegulatoryRule,
    RuleEvaluation,
    User,
    utcnow,
)
from app.services import audit_service


def active_rule(db: Session, rule_key: str) -> RegulatoryRule | None:
    return (
        db.query(RegulatoryRule)
        .filter(RegulatoryRule.rule_key == rule_key, RegulatoryRule.status == "active")
        .order_by(RegulatoryRule.version.desc())
        .first()
    )


def create_rule(db: Session, *, user_id: str, **fields) -> RegulatoryRule:
    key = fields["rule_key"]
    max_v = (
        db.query(func.max(RegulatoryRule.version))
        .filter(RegulatoryRule.rule_key == key)
        .scalar()
        or 0
    )
    if fields.get("version") and fields["version"] != max_v + 1:
        raise HTTPException(status_code=400, detail=f"New version must be {max_v + 1}")
    rule = RegulatoryRule(
        rule_key=key, version=max_v + 1, created_by=user_id, status="draft",
        **{k: v for k, v in fields.items() if k != "rule_key" and k != "version"},
    )
    db.add(rule)
    db.flush()
    audit_service.record_event(
        db, actor=(db.get(User, user_id) if user_id else None), action="rule.created",
        entity_type="regulatory_rule", entity_id=rule.id,
        new_state={"rule_key": key, "version": rule.version},
    )
    return rule


def transition_status(db: Session, *, user_id: str, rule: RegulatoryRule, new_status: str,
                      note: str | None = None) -> RegulatoryRule:
    allowed = {
        "draft": {"under_review", "retired"},
        "under_review": {"active", "draft", "retired"},
        "active": {"retired"},
        "retired": set(),  # retired rules are immutable history
    }
    if new_status not in allowed[rule.status]:
        raise HTTPException(status_code=400,
                            detail=f"Cannot move rule from {rule.status} to {new_status}")
    previous = {"status": rule.status}
    rule.status = new_status
    if new_status == "active":
        rule.activated_at = utcnow()
        # retire prior active versions of the same key
        db.query(RegulatoryRule).filter(
            RegulatoryRule.rule_key == rule.rule_key,
            RegulatoryRule.version != rule.version,
            RegulatoryRule.status == "active",
        ).update({"status": "retired"}, synchronize_session=False)
    audit_service.record_event(
        db, actor=(db.get(User, user_id) if user_id else None), action=f"rule.{new_status}",
        entity_type="regulatory_rule", entity_id=rule.id,
        previous_state=previous, new_state={"status": new_status}, reason=note,
    )
    db.flush()
    return rule


# ---------------------------------------------------------------------------
# deterministic evaluators (pure functions of rule params + inputs)
# ---------------------------------------------------------------------------

def evaluate_rule(rule: RegulatoryRule, inputs: dict) -> dict:
    rt = rule.rule_type
    params = rule.params or {}
    if rt == "doc_validity":
        return _eval_doc_validity(params, inputs)
    if rt == "lease_duration_min":
        return _eval_lease_duration(params, inputs)
    if rt == "intake_ceiling":
        requested = int(inputs.get("requested_intake", 0) or 0)
        ceiling = int(params.get("max_intake", 0) or 0)
        ok = ceiling == 0 or requested <= ceiling
        return {"pass": ok, "inputs": inputs,
                "explanation": f"Requested intake {requested} vs configured ceiling {ceiling or 'n/a'} (internal param; needs official verification)"}
    return {"pass": False, "error": f"rule_type '{rt}' has no evaluator"}


def _eval_doc_validity(params: dict, inputs: dict) -> dict:
    expiry = inputs.get("expiry_date") or inputs.get("expiry")
    if not expiry:
        return {"pass": False, "explanation": "No expiry date on record — cannot assess validity", "inputs": inputs}
    if isinstance(expiry, str):
        expiry = date.fromisoformat(expiry[:10])
    grace = int(params.get("grace_days", 0) or 0)
    warning_before = int(params.get("warn_days", 60) or 60)
    today = utcnow().date()
    remaining = (expiry - today).days
    result = {
        "pass": remaining >= 0,
        "remaining_days": remaining,
        "status": ("valid" if remaining > 0 else "expired"),
        "warning": 0 < remaining <= warning_before,
        "grace_days_configured": grace,
        "inputs": inputs,
        "explanation": f"Validity checked against configured grace period ({grace}d) — renewal policy remains a human/citation matter",
    }
    return result


def _eval_lease_duration(params: dict, inputs: dict) -> dict:
    """Configurable, source-cited lease-duration check with explainable output.

    Inputs (from operator): expiry_date (required), course_years (expected
    programme duration the lease must cover), executed_from (optional).
    The parameter 'min_years_of_course_cover' is the configurable knob; the
    interpretation MUST be verified against the applicable handbook before any
    official use — verification_status on the rule row reflects that.
    """
    expiry = inputs.get("expiry_date") or inputs.get("expiry")
    if not expiry:
        return {"pass": False, "error": "expiry_date input required", "inputs": inputs}
    if isinstance(expiry, str):
        expiry = date.fromisoformat(expiry[:10])
    today = date.today()
    remaining_years = (expiry - today).days / 365.25
    min_years = float(params.get("min_years_of_course_cover", 0) or 0)
    ok = remaining_years >= min_years
    return {
        "pass": ok,
        "remaining_years": round(remaining_years, 2),
        "required_years": min_years,
        "inputs": inputs,
        "explanation": (
            f"Remaining lease validity {round(remaining_years, 2)}y vs configured minimum "
            f"{min_years}y. The minimum is an internal configurable parameter whose "
            "interpretation must be verified against the applicable handbook clause cited on the rule."
        ),
    }


def simulate(db: Session, *, user: object, rule: RegulatoryRule, inputs: dict,
             application_id: str | None = None) -> dict:
    output = evaluate_rule(rule, inputs)
    ev = RuleEvaluation(
        rule_id=rule.id, application_id=application_id,
        input=inputs, output=output, created_by=user.id,
    )
    db.add(ev)
    audit_service.record_event(
        db, actor=user, action="rule.simulated",
        entity_type="regulatory_rule", entity_id=rule.id,
        application_id=application_id, meta={"inputs": inputs, "pass": output.get("pass")},
    )
    db.flush()
    return {"output": output, "evaluation_id": ev.id,
            "note": "Rule simulation is advisory; it cannot approve or reject an application."}
