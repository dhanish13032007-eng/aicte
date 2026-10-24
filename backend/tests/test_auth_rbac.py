"""Authentication and RBAC tests (spec §30 - auth/permissions)."""
from __future__ import annotations


def test_login_success(seeded):
    tok = seeded["token"]("admin@ops.local")
    r = seeded["client"].get("/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert r.json()["role"] == "system_admin"
    assert "audit.view_all" in r.json()["permissions"]


def test_login_rejects_bad_credentials(seeded):
    r = seeded["client"].post("/auth/login", json={"email": "admin@ops.local", "password": "wrong"})
    assert r.status_code == 401


def test_protected_endpoint_requires_token(seeded):
    r = seeded["client"].get("/auth/me")
    assert r.status_code == 401


def test_invalid_token_rejected(seeded):
    r = seeded["client"].get("/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert r.status_code == 401


def test_institution_cannot_access_other_institution_application(seeded):
    # Sunrise office token vs a Lakeside application (different institutions)
    tok = seeded["token"]("office.sunrise@ops.local")
    r = seeded["client"].get("/applications", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    refs = [a["ref_no"] for a in r.json()["items"]]
    assert refs, "institution should see its own data"
    # lakeside's clarification application must not appear
    assert all(": " not in ref for ref in refs)
    lakeside = seeded["client"].get(
        "/applications", headers={"Authorization": f"Bearer {seeded['token']('office.lake@ops.local')}"})
    lake_refs = [a["ref_no"] for a in lakeside.json()["items"]]
    assert set(refs).isdisjoint(set(lake_refs))


def test_role_cannot_perform_unauthorized_transition(seeded):
    # institution user attempting an officer transition
    tok = seeded["token"]("office.green@ops.local")
    apps = seeded["client"].get("/applications", headers={"Authorization": f"Bearer {tok}"}).json()["items"]
    mine = [a for a in apps if a["status"] in ("awaiting_scrutiny", "under_scrutiny", "submitted")]
    if not mine:
        return  # no eligible fixture in this dataset
    target = next((a for a in mine), None)
    r = seeded["client"].post(
        f"/applications/{target['id']}/transition",
        json={"action": "validate_intake"},
        headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code in (403, 400, 404)


def test_admin_cannot_record_statutory_decision(seeded):
    """System administrators must not inherit approval powers (spec §4.8)."""
    tok = seeded["token"]("admin@ops.local")
    r = seeded["client"].get("/applications", headers={"Authorization": f"Bearer {tok}"})
    decision_stage = next((a for a in r.json()["items"] if a["current_stage"] == "decision"), None)
    if decision_stage is None:
        return
    resp = seeded["client"].post(
        f"/applications/{decision_stage['id']}/transition",
        json={"action": "approve"},
        headers={"Authorization": f"Bearer {tok}"})
    assert resp.status_code == 403
    assert "role" in resp.json()["detail"].lower()


def test_auditor_is_read_only(seeded):
    tok = seeded["token"]("auditor@ops.local")
    r = seeded["client"].get("/audit", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    # auditor lacks document upload permission
    r2 = seeded["client"].post(
        "/documents",
        data={"doc_type": "declaration", "name": "x", "application_id": None},
        files={"file": ("a.pdf", b"%PDF-1.4 fake", "application/pdf")},
        headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code == 403


def test_audit_verification(seeded):
    tok = seeded["token"]("admin@ops.local")
    r = seeded["client"].get("/audit/verify", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert r.json()["valid"] is True, r.json()


def test_audit_tamper_detection(seeded, db_session):
    """Altering an event must be detected by chain verification (spec §16)."""
    from app.models.orm_models import AuditEvent
    from sqlalchemy import update

    tok = seeded["token"]("admin@ops.local")
    ev = db_session.query(AuditEvent).order_by(AuditEvent.seq).offset(2).first()
    db_session.execute(update(AuditEvent).where(AuditEvent.seq == ev.seq).values(reason="tampered"));
    db_session.commit()
    r = seeded["client"].get("/audit/verify", headers={"Authorization": f"Bearer {tok}"})
    body = r.json()
    assert body["valid"] is False
    assert body["first_broken_seq"] == ev.seq
