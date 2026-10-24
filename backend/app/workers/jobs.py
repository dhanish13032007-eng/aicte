"""Reusable job implementations (used by in-process scheduler and Celery)."""
from __future__ import annotations

from app.db import SessionLocal
from app.services import sla_service


def run_sla_tick() -> dict:
    db = SessionLocal()
    try:
        summary = sla_service.sla_tick(db)
        db.commit()
        return summary
    finally:
        db.close()
