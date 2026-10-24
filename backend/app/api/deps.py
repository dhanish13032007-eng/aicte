"""FastAPI dependencies: authentication and server-side RBAC.

Every permission-sensitive endpoint declares its requirements here; the
frontend never decides authorization (it only reflects what the backend
answers).
"""
from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.permissions import Perm, role_has
from app.core.security import decode_access_token
from app.db import get_db
from app.models.orm_models import Application, Institution, Session as DBSession, User

bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Authentication required"):
    e = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
    # 401 without WWW-Authenticate to avoid triggering browser prompts (Bearer)
    e.headers = {"WWW-Authenticate": "Bearer"}
    return e


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _unauthorized()
    payload = decode_access_token(creds.credentials)
    if payload is None:
        raise _unauthorized("Invalid or expired token")
    sess = db.query(DBSession).filter(DBSession.jti == payload["jti"]).first()
    if sess is None or sess.revoked_at is not None:
        raise _unauthorized("Session revoked; please sign in again")
    user = db.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise _unauthorized("Account inactive")
    return user


class _RequirePerm:
    """Dependency factory: require an exact permission."""

    def __init__(self, perm: str):
        self.perm = perm

    def __call__(self, user: User = Depends(get_current_user)) -> User:
        if not role_has(user.role, self.perm):
            raise HTTPException(status_code=403, detail=f"Requires permission '{self.perm}'")
        return user


def require_perm(perm: str):
    return _RequirePerm(perm)


# --- application-level access ------------------------------------------------------


def app_access_filter(user: User):
    """Return a function filtering the Applications query per the user's role:
    institution → own institution; scrutiny/review/compliance/regional →
    assigned to them OR their jurisdiction; approving authority/admin/auditor →
    everything (view-all roles)."""
    if role_has(user.role, Perm.APPLICATION_VIEW_ALL):
        return lambda q: q
    if role_has(user.role, Perm.APPLICATION_VIEW_OWN_INSTITUTION):
        return lambda q: q.filter(Application.institution_id == user.institution_id)
    if role_has(user.role, Perm.APPLICATION_VIEW_ASSIGNED):
        from app.models.orm_models import Institution

        def scope(q):
            sub = q.session.query(Institution.id).filter(Institution.region == user.region) if user.region else None
            clauses = [Application.assigned_officer_id == user.id]
            if sub is not None:
                clauses.append(Application.institution_id.in_(sub))
            return q.filter(*clauses)

        return scope
    raise HTTPException(status_code=403, detail="No application-access permission for this role")


def can_view_application(user: User, db: Session, app: Application) -> bool:
    from sqlalchemy import func

    if role_has(user.role, Perm.APPLICATION_VIEW_ALL):
        return True
    if role_has(user.role, Perm.APPLICATION_VIEW_OWN_INSTITUTION):
        return app.institution_id == user.institution_id
    if role_has(user.role, Perm.APPLICATION_VIEW_ASSIGNED):
        if app.assigned_officer_id == user.id:
            return True
        if user.region:
            inst = db.get(Institution, app.institution_id) if app.institution_id else None
            return bool(inst and inst.region == user.region)
        return False
    return False


def require_app_access(app_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Application:
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if not can_view_application(user, db, app):
        raise HTTPException(status_code=403, detail="You are not authorized to access this application")
    return app


# Institution document/DATA isolation (IDOR protection)
def require_institution_access(institution_id_arg: str, user: User, db: Session) -> Institution:
    inst = db.get(Institution, institution_id_arg)
    if inst is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    # officers use jurisdiction; institution users use their own record
    if role_has(user.role, Perm.APPLICATION_VIEW_ALL) or role_has(user.role, Perm.COMPLIANCE_VIEW_ALL):
        return inst
    if user.institution_id == inst.id:
        return inst
    if role_has(user.role, Perm.APPLICATION_VIEW_ASSIGNED) and (inst.region == user.region):
        return inst
    raise HTTPException(status_code=403, detail="Not authorized to access this institution's data")
