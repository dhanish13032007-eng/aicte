"""FastAPI application entrypoint. Routes stay thin; logic lives in services.

Run:  uvicorn app.main:app --reload --port 8000   (from backend/)
"""
from __future__ import annotations

import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.log import configure_logging, get_logger
from app.db import engine
from app.api.routes import (
    admin as admin_routes,
    ai as ai_routes,
    analytics,
    applications,
    auth as auth_routes,
    compliance,
    documents,
    evc,
    rag as rag_routes,
    tasks as task_routes,
)

configure_logging()
log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_thread = None
    if settings.JOB_MODE == "inprocess" and not settings.is_testing:
        from datetime import datetime, timedelta

        import apscheduler
        from apscheduler.schedulers.background import BackgroundScheduler

        def _tick():
            # Each tick opens its own DB session; failures are logged, never fatal.
            from app.db import SessionLocal
            from app.services import sla_service

            db = SessionLocal()
            try:
                summary = sla_service.sla_tick(db)
                db.commit()
                log.info("sla tick", extra={"event": "sla_tick", **summary})
            except Exception as exc:  # noqa: BLE001
                log.error("sla tick failed: %s", exc)
                db.rollback()
            finally:
                db.close()

        scheduler_thread = BackgroundScheduler(daemon=True)
        scheduler_thread.add_job(
            _tick, "interval", hours=1, id="sla_tick",
            next_run_time=datetime.now() + timedelta(seconds=45),
        )
        scheduler_thread.start()
        log.info("in-process scheduler started (sla_tick every hour)")
    yield
    if scheduler_thread:
        scheduler_thread.shutdown(wait=False)


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description=(
        "Independent Smart India Hackathon SIH26262 prototype: integrated AICTE "
        "approval workflow automation, compliance monitoring and alert management "
        "(demo platform — not the official AICTE system)."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Idempotency-Key"],
    expose_headers=["Content-Disposition"],
)

app.include_router(auth_routes.router)
app.include_router(applications.router)
app.include_router(documents.router)
app.include_router(evc.router)
app.include_router(compliance.router)
app.include_router(analytics.router)
app.include_router(admin_routes.router)
app.include_router(ai_routes.router)
app.include_router(task_routes.router)
app.include_router(rag_routes.router)


@app.get("/health")
def health():
    """Health checks for API, database and job queue configuration."""
    out: dict = {"api": "ok", "app": settings.APP_NAME, "environment": settings.ENVIRONMENT}
    try:
        db_ok = False
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
        out["database"] = "ok" if db_ok else "fail"
        out["database_kind"] = "sqlite" if settings.database_is_sqlite else "postgresql"
    except Exception as exc:  # noqa: BLE001
        out["database"] = f"fail: {exc}"[:200]
    out["job_mode"] = settings.JOB_MODE
    out["ai_configured"] = bool(settings.AI_API_BASE_URL and settings.AI_API_KEY and settings.AI_MODEL)
    out["email"] = "smtp" if settings.SMTP_HOST else "console-simulation"
    out["storage"] = "s3" if settings.S3_ENABLED else "local-disk"
    return out


@app.exception_handler(Exception)
async def unhandled_error_handler(request, exc):  # pragma: no cover
    """Never leak stack traces or secrets; log server-side with correlation id."""
    import uuid

    ref = uuid.uuid4().hex[:12]
    log.error("unhandled error ref=%s: %s", ref, exc, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error (reference {ref}). The incident has been logged."},
    )
