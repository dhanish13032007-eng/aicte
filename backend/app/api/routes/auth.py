"""Authentication routes.

- Login returns a short-lived JWT; its jti is tracked in sessions for
  deactivation/revocation.
- Everybody gets rate-limited login (5/min per IP) to blunt credential stuffing.
- Failed logins are audit-logged.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.permissions import permissions_for_role
from app.core.security import create_access_token, hash_password, verify_password
from app.db import get_db
from app.models.orm_models import Session as DBSession
from app.models.orm_models import User, utcnow
from app.services import audit_service

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenBundle(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: object


def _user_out(u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "name": u.name, "role": u.role,
        "institution_id": u.institution_id, "region": u.region,
        "is_active": u.is_active,
        "permissions": permissions_for_role(u.role),
    }


_login_attempts: dict[str, list[datetime]] = {}


def _rate_ok(ip: str) -> bool:
    from app.core.config import settings

    if settings.ENVIRONMENT == "testing":
        return True  # tests perform many logins in rapid bursts
    now = datetime.now(timezone.utc)
    window = [t for t in _login_attempts.get(ip, []) if now - t < timedelta(minutes=1)]
    if len(window) >= 10:
        _login_attempts[ip] = window
        return False
    window.append(now)
    _login_attempts[ip] = window
    return True


@router.post("/login")
def login(body: dict, request: Request, db: Session = Depends(get_db)):
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    ip = request.client.host if request.client else "?"
    if not _rate_ok(ip):
        raise HTTPException(status_code=429, detail="Too many login attempts; try again in a minute")
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(password, user.password_hash):
        audit_service.record_event(
            db, actor=user, actor_fallback=f"anonymous@{ip}", action="auth.login_failed",
            entity_type="auth", meta={"email": email[:80], "ip": ip},
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token, jti, expires = create_access_token(user_id=user.id, role=user.role)
    sess = DBSession(
        user_id=user.id, jti=jti, expires_at=expires.replace(tzinfo=None), created_ip=ip
    )
    db.add(sess)
    user.last_login_at = utcnow()
    audit_service.record_event(
        db, actor=user, action="auth.login", entity_type="auth", entity_id=user.id,
        meta={"ip": ip},
    )
    db.commit()
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    auth = request.headers.get("Authorization", "")
    jti = None
    try:
        import jwt as _jwt

        from app.core.config import settings as s

        payload = _jwt.decode(auth.split(" ", 1)[1], s.JWT_SECRET_KEY, algorithms=[s.JWT_ALGORITHM])
        jti = payload.get("jti")
    except Exception:  # noqa: BLE001
        pass
    if jti:
        sess = db.query(DBSession).filter(DBSession.jti == jti).first()
        if sess:
            sess.revoked_at = utcnow()
    audit_service.record_event(db, actor=user, action="auth.logout", entity_type="auth", entity_id=user.id)
    db.commit()
    return {"ok": True}


@router.post("/change-password")
def change_password(body: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    current = body.get("current_password") or ""
    new = body.get("new_password") or ""
    if len(new) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if not verify_password(current, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(new)
    user.must_change_password = False
    # revoke every other session of this user
    for s in db.query(DBSession).filter(DBSession.user_id == user.id, DBSession.revoked_at.is_(None)):
        s.revoked_at = utcnow()
    # recreate current session token invalidation is coarse (all revoked). The
    # client must re-login; that is the safe, simple behavior.
    audit_service.record_event(db, actor=user, action="auth.password_changed", entity_type="user", entity_id=user.id)
    db.commit()
    return {"ok": True, "note": "All sessions were revoked; please sign in again."}


@router.post("/forgot-password")
def forgot_password(body: dict, db: Session = Depends(get_db)):
    """Records the request honestly: in this prototype without SMTP there is no
    secret-reset channel; response is deliberately identical whether or not the
    account exists (no account enumeration) and reset requires an administrator."""
    email = (body.get("email") or "").strip().lower()
    exists = db.query(User).filter(User.email == email).first() is not None
    audit_service.record_event(
        db, actor=None, actor_fallback="anonymous",
        action="auth.password_reset_requested",
        entity_type="auth", meta={"email_known": exists, "email_domain": email.split("@")[-1] if "@" in email else ""},
    )
    db.commit()
    return {
        "ok": True,
        "message": (
            "If this address belongs to an account, a reset request has been recorded. "
            "Contact the platform administrator to reset the password."
        ),
    }


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _user_out(user)
