"""Append-only, hash-chained audit event service.

Every sensitive operation should be recorded through `record_event()`. Events
are chained with SHA-256 over a canonical serialization including the previous
event hash, so any alteration of recorded events is detectable by
`verify_chain()`.

Honest limitation (documented in docs/security-notes.md): a hash chain within
the same database detects tampering but does not make the database immutable.
Production deployments should additionally export periodic checkpoints to
independently protected storage and restrict write access to this service.
"""
from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.orm_models import AuditEvent, User

_chain_lock = threading.Lock()


def _canonical(event_dump: dict) -> str:
    return json.dumps(event_dump, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def _compute_hash(event_dump: dict) -> str:
    return hashlib.sha256(_canonical(event_dump).encode("utf-8")).hexdigest()


def record_event(
    db: Session,
    *,
    actor: User | None = None,
    actor_fallback: str = "system",
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    application_id: str | None = None,
    previous_state: dict | None = None,
    new_state: dict | None = None,
    reason: str | None = None,
    meta: dict | None = None,
) -> AuditEvent:
    """Append one audit event and chain it to the previous event's hash."""
    with _chain_lock:
        prev_stmt = select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)
        prev = db.execute(prev_stmt).scalar_one_or_none()
        previous_hash = prev.hash if prev is not None else None
        next_seq = (prev.seq + 1) if prev is not None else 1

        payload: dict = {
            "seq": next_seq,
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            "actor_id": actor.id if actor else None,
            "actor_role": actor.role if actor else None,
            "actor_fallback": None if actor else actor_fallback,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "application_id": application_id,
            "previous_state": previous_state,
            "new_state": new_state,
            "reason": reason,
            "meta": meta or {},
            "previous_hash": previous_hash,
        }
        event_hash = _compute_hash(payload)

        ev = AuditEvent(
            id=payload_id(payload),
            seq=next_seq,
            created_at=_parse(payload["created_at"]),
            actor_id=payload["actor_id"],
            actor_role=payload["actor_role"],
            actor_fallback=payload["actor_fallback"],
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            application_id=application_id,
            previous_state=previous_state,
            new_state=new_state,
            reason=reason,
            meta=meta or {},
            previous_hash=previous_hash,
            hash=event_hash,
        )
        db.add(ev)
        db.flush()
        return ev


def payload_id(payload: dict) -> str:
    import uuid

    m = hashlib.md5(_canonical({"action": payload["action"], "ts": payload["created_at"], "prev": payload["previous_hash"]}).encode())
    return str(uuid.UUID(m.hexdigest()))


def _parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=None)


def verify_chain(db: Session, start_seq: int = 1) -> dict:
    """Recompute the chain and return {valid, total, first_broken_seq|None, issues[]}."""
    issues: list[dict] = []
    total = db.scalar(select(func.count(AuditEvent.seq))) or 0
    expected_prev: str | None = None
    expected_seq = start_seq
    stmt = select(AuditEvent).order_by(AuditEvent.seq).offset(start_seq - 1)
    first_broken: int | None = None
    for ev in db.execute(stmt).scalars():
        # reconstruct what the hash SHOULD have been
        payload = {
            "seq": ev.seq,
            "created_at": ev.created_at.isoformat(),
            "actor_id": ev.actor_id,
            "actor_role": ev.actor_role,
            "actor_fallback": ev.actor_fallback,
            "action": ev.action,
            "entity_type": ev.entity_type,
            "entity_id": ev.entity_id,
            "application_id": ev.application_id,
            "previous_state": ev.previous_state,
            "new_state": ev.new_state,
            "reason": ev.reason,
            "meta": ev.meta or {},
            "previous_hash": ev.previous_hash,
        }
        expected_hash = _compute_hash(payload)
        ok = True
        if ev.seq != expected_seq:
            issues.append({"seq": ev.seq, "issue": "sequence_gap", "expected_seq": expected_seq})
            ok = False
        if (ev.previous_hash or None) != expected_prev:
            issues.append({"seq": ev.seq, "issue": "previous_hash_mismatch"})
            ok = False
        if ev.hash != expected_hash:
            issues.append({"seq": ev.seq, "issue": "hash_mismatch", "stored": ev.hash, "expected": expected_hash})
            ok = False
        if not ok and first_broken is None:
            first_broken = ev.seq
        expected_prev = ev.hash
        expected_seq = ev.seq + 1
    return {"valid": not issues, "total": total, "first_broken_seq": first_broken, "issues": issues[:50]}


def touch_audit_seq(db: Session, seq: int) -> None:  # pragma: no cover - helper used by tests to simulate tampering
    db.execute(update(AuditEvent).where(AuditEvent.seq == seq).values(meta={"tampered": True}))
