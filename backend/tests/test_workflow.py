"""Workflow engine tests (spec §30 - workflow)."""
from __future__ import annotations

import io

from fastapi.testclient import TestClient

DOC_PDF = b"%PDF-1.4\n" + b"1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"  # placeholder (upload validation checks the header)


def _upload(client, headers, app_id, doc_type, filename="doc.pdf"):
    return client.post(
        "/documents",
        data={"application_id": app_id, "doc_type": doc_type, "name": f"{doc_type} file"},
        files={"file": (filename, b"%PDF-1.4 dummy content", "application/pdf")},
        headers=headers)


def test_missing_doc_blocks_submit(seeded):
    client = seeded["client"]
    tok = seeded["token"]("office.sunrise@ops.local")
    headers = {"Authorization": f"Bearer {tok}"}
    insts = client.get("/admin/institutions", headers=headers).json()
    sunrise = next(i for i in insts if i["code"] == "INST-DEMO-001")
    r = client.post("/applications", json={
        "institution_id": sunrise["id"], "title": "Test intake app",
        "category": "new_approval", "academic_year": "2024-25",
        "programmes": [{"name": "CSE", "level": "undergraduate", "intake": 60}],
    }, headers=headers)
    assert r.status_code == 200, r.text
    app_id = r.json()["id"]

    # submit without the required declaration document must fail
    r2 = client.post(f"/applications/{app_id}/transition",
                     json={"action": "submit"}, headers=headers)
    assert r2.status_code == 400
    assert "declaration" in r2.json()["detail"].lower() or "missing" in r2.json()["detail"].lower()

    # upload the declaration and submit successfully
    up = _upload(client, headers, app_id, "declaration")
    assert up.status_code == 200, up.text
    r3 = client.post(f"/applications/{app_id}/transition", json={"action": "submit"}, headers=headers)
    assert r3.status_code == 200, r3.text
    assert r3.json()["stage"] == "intake_validation"


def test_full_lifecycle_with_clarification_and_decision(seeded):
    client = seeded["client"]
    inst_tok = {"Authorization": f"Bearer {seeded['token']('office.green@ops.local')}"}
    scr_tok = {"Authorization": f"Bearer {seeded['token']('scrutiny@ops.local')}"}
    adm_tok = {"Authorization": f"Bearer {seeded['token']('admin@ops.local')}"}
    appr_tok = {"Authorization": f"Bearer {seeded['token']('approver@ops.local')}"}

    greenfields = next(i for i in client.get("/admin/institutions", headers=inst_tok).json()
                       if i["code"] == "INST-DEMO-002")
    r = client.post("/applications", json={
        "institution_id": greenfields["id"], "title": "Lifecycle demo application",
        "category": "new_approval", "programmes": [{"name": "ME", "level": "undergraduate", "intake": 90}],
    }, headers=inst_tok)
    app_id = r.json()["id"]

    # 1. institution uploads docs and submits
    for dtype in ("declarement", "declaration", "land_document", "building_safety", "fire_safety"):
        if dtype != "declarement":
            up = _upload(client, inst_tok, app_id, dtype)
            assert up.status_code == 200, up.text
    assert client.post(f"/applications/{app_id}/transition", json={"action": "submit"},
                       headers=inst_tok).status_code == 200

    # 2. officer validates intake
    assert client.post(f"/applications/{app_id}/transition", json={"action": "validate_intake"},
                       headers=scr_tok).status_code == 200

    # 3. officer returns for clarification (reason REQUIRED)
    r_clar = client.post(f"/applications/{app_id}/transition",
                         json={"action": "request_clarification", "reason": ""},
                         headers=scr_tok)
    assert r_clar.status_code == 400  # empty reason rejected
    r_clar = client.post(f"/applications/{app_id}/transition",
                         json={"action": "request_clarification",
                               "reason": "Lease document name mismatch"},
                         headers=scr_tok)
    assert r_clar.status_code == 200
    assert r_clar.json()["status"] == "clarification_required"

    # 4. institution responds
    r_resp = client.post(f"/applications/{app_id}/transition",
                         json={"action": "respond_clarification"}, headers=inst_tok)
    assert r_resp.status_code == 200
    assert r_resp.json()["stage"] == "re_scrutiny"

    # 5. officer completes re-scrutiny checklist then completes
    items = client.get(f"/applications/{app_id}", headers=scr_tok).json()["checklist"]
    for item in items:
        rr = client.put(f"/applications/{app_id}/checklist/{item['id']}",
                        json={"status": "verified"}, headers=scr_tok)
        assert rr.status_code == 200, rr.text
    rsc = client.post(f"/applications/{app_id}/transition",
                      json={"action": "complete_re_scrutiny"}, headers=scr_tok)
    assert rsc.status_code == 200, rsc.text

    # 6. scrutiny attempts final decision (not authorized) → 403
    r_bad = client.post(f"/applications/{app_id}/transition", json={"action": "approve"},
                        headers=scr_tok)
    assert r_bad.status_code == 403

    # 7. approving authority records the approval
    r_dec = client.post(f"/applications/{app_id}/transition", json={"action": "approve"},
                        headers=appr_tok)
    assert r_dec.status_code == 200, r_dec.text
    detail = client.get(f"/applications/{app_id}", headers=adm_tok).json()
    assert detail["decision"] == "approved"
    assert detail["state"] == "closed"

    # 8. audit events exist and chain intact
    events = [e for e in detail["audit_events"]]
    actions = {e["action"] for e in events}
    assert "workflow.approve" in actions
    assert "application.created" in actions
    verify = client.get("/audit/verify", headers=adm_tok).json()
    assert verify["valid"] is True


def test_invalid_transition_rejected(seeded):
    client = seeded["client"]
    scr_tok = {"Authorization": f"Bearer {seeded['token']('scrutiny@ops.local')}"}
    apps = client.get("/applications", headers=scr_tok).json()["items"]
    target = next((a for a in apps if a["current_stage"] == "scrutiny"), None)
    if target is None:
        return
    r = client.post(f"/applications/{target['id']}/transition",
                    json={"action": "approve"}, headers=scr_tok)
    assert r.status_code in (400, 403)  # not a valid action at this stage for this role


def test_idempotency_key_prevents_duplicate_submission(seeded):
    client = seeded["client"]
    tok = seeded["token"]("office.sunrise@ops.local")
    headers = {"Authorization": f"Bearer {tok}"}
    sunrise = next(i for i in client.get("/admin/institutions", headers=headers).json()
                   if i["code"] == "INST-DEMO-001")
    r = client.post("/applications", json={
        "institution_id": sunrise["id"], "title": "Idempotency check",
        "category": "new_approval",
        "programmes": [{"name": "CSE", "level": "undergraduate", "intake": 60}],
    }, headers=headers, params={"idempotency_key": "abc-123"})
    assert r.status_code == 200
    ref = r.json()["ref_no"]
    # replay: same key returns the SAME first response, not a new application
    r2 = client.post("/applications", json={
        "institution_id": sunrise["id"], "title": "Idempotency check",
        "category": "new_approval",
        "programmes": [{"name": "CSE", "level": "undergraduate", "intake": 60}],
    }, headers=headers, params={"idempotency_key": "abc-123"})
    assert r2.status_code == 200
    assert r2.json()["ref_no"] == ref
