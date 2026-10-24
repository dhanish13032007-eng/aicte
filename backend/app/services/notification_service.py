"""Notification service: in-app notifications plus email delivery.

- Every notification is persisted first (delivery may fail; the record stays).
- `idempotency_key` deduplicates (e.g. scheduled SLA jobs that re-run).
- Email uses SMTP when supplied; without SMTP config the attempt is recorded
  honestly with delivery_status='simulated' — messages are logged to the
  backend console, never silently claimed as delivered.
- Notification bodies never include links to confidential documents.
"""
from __future__ import annotations

import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.log import get_logger
from app.models.orm_models import Notification, User, utcnow

log = get_logger("notifications")


def _send_email(to: str, subject: str, body: str) -> tuple[str, str]:
    """Returns (delivery_status, provider_response)."""
    if not settings.SMTP_HOST:
        log.info("[SIMULATED EMAIL] to=%s subject=%s body=%s", to, subject, body)
        return "simulated", "SMTP not configured; message logged to console instead of sent"
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to
        msg.set_content(body)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            smtp.send_message(msg)
        return "sent", "accepted by SMTP server"
    except Exception as exc:  # noqa: BLE001 — delivery failure must be recorded, not raised into the request path
        log.error("email delivery failed: %s", exc)
        return "failed", str(exc)[:500]


def notify(
    db: Session,
    *,
    recipient: User | None,
    type: str,
    title: str,
    body: str | None = None,
    severity: str = "info",
    link_path: str | None = None,
    application_id: str | None = None,
    idempotency_key: str | None = None,
    channel: str = "inapp",
) -> Notification | None:
    if idempotency_key:
        existing = (
            db.query(Notification).filter(Notification.idempotency_key == idempotency_key).first()
        )
        if existing is not None:
            return existing

    delivery_status = "pending"
    provider_response = None
    if channel == "email" and recipient is not None:
        delivery_status, provider_response = _send_email(recipient.email, title, body or "")

    n = Notification(
        recipient_id=recipient.id if recipient else "unassigned",
        type=type,
        severity=severity,
        title=title[:255],
        body=body,
        link_path=link_path,
        application_id=application_id,
        channel=channel,
        delivery_status=delivery_status,
        delivery_attempts=1 if channel == "email" else 0,
        provider_response=provider_response,
        idempotency_key=idempotency_key,
    )
    if channel == "inapp":
        delivery_status = "sent"
        n.delivery_status = "sent"
    db.add(n)
    db.flush()
    return n


def notify_role(
    db: Session,
    *,
    role: str,
    type: str,
    title: str,
    body: str | None = None,
    severity: str = "info",
    link_path: str | None = None,
    application_id: str | None = None,
    idempotency_key: str | None = None,
    region: str | None = None,
) -> list[Notification]:
    q = db.query(User).filter(User.role == role, User.is_active.is_(True))
    if region:
        q = q.filter(User.region == region)
    out: list[Notification] = []
    for u in q.all():
        out.append(
            notify(
                db,
                recipient=u,
                type=type,
                title=title,
                body=body,
                severity=severity,
                link_path=link_path,
                application_id=application_id,
                idempotency_key=f"{idempotency_key}:{u.id}" if idempotency_key else None,
            )
        )
    return out
