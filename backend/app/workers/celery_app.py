"""Celery application for docker-compose deployments (JOB_MODE=celery).

In local demo mode (JOB_MODE=inprocess) the same job functions run inside the
API process via the APScheduler thread and synchronous task endpoints — no
Redis/Celery required. With the compose stack this module can be run as:
    celery -A app.workers.celery_app worker --beat --loglevel=info
"""
from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "aicte_ops",
    broker=settings.CELERY_BROKER_URL,
    backend=None,
    include=["app.workers.jobs"],
)
celery_app.conf.beat_schedule = {
    "sla-tick": {"task": "app.workers.jobs.sla_tick_task", "schedule": crontab(minute=15)},
}


@celery_app.task(name="app.workers.jobs.sla_tick_task")
def sla_tick_task() -> dict:
    from app.db import SessionLocal
    from app.services import sla_service

    db = SessionLocal()
    try:
        summary = sla_service.sla_tick(db)
        db.commit()
        return summary
    finally:
        db.close()
