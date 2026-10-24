"""Idempotency guard for sensitive, non-repeatable API operations.

Clients send an `Idempotency-Key` header on state-changing workflow, document
and compliance endpoints. The first call stores the response; replays with the
same key within the window return the stored response instead of re-executing
the side effects.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models.orm_models import ApiIdempotency, utcnow


def key_for(request: Request, client_key: str | None) -> str:
    if not client_key:
        return ""
    identity = request.headers.get("X-User-Identity") or request.client.host if request.client else ""
    return f"{request.method}:{request.url.path}:{identity}:{client_key}"[:160]


def get_stored(db: Session, key: str) -> ApiIdempotency | None:
    if not key:
        return None
    rec = db.get(ApiIdempotency, key)
    if rec is None:
        return None
    if rec.expires_at and rec.expires_at < utcnow():
        return None
    return rec


def store(
    db: Session, key: str, *, endpoint: str, status: int, response: dict, ttl_hours: int = 24
) -> None:
    if not key:
        return
    db.add(
        ApiIdempotency(
            key=key,
            endpoint=endpoint,
            response_status=status,
            response_json=response,
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=ttl_hours),
        )
    )
