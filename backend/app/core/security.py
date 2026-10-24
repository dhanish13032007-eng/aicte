"""Password hashing and JWT helpers.

Uses bcrypt directly (passlib is unmaintained under Python 3.13) and PyJWT
with short-lived, revocable access tokens (jti tracked in the sessions table).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings

_JWT_LEEWAY = 30  # seconds


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password or not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(*, user_id: str, role: str) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at)."""
    now = datetime.now(timezone.utc)
    expires = now + settings.token_expire_delta
    jti = uuid.uuid4().hex
    payload = {
        "sub": user_id,
        "role": role,
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "iss": "aicte-ops-platform",
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti, expires


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            leeway=_JWT_LEEWAY,
            issuer="aicte-ops-platform",
        )
        return payload if "sub" in payload and "jti" in payload else None
    except jwt.PyJWTError:
        return None


def access_expiry_minutes() -> int:
    return int(timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES).total_seconds() // 60)
