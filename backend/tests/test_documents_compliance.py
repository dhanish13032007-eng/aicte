"""Documents, EVC, compliance and dashboards tests."""
from __future__ import annotations


def test_upload_rejects_disallowed_type(seeded):
    client = seeded["client"]
    tok = seeded["token"]("office.sunrise@ops.local")
    r = client.post(
        "/documents",
        data={"doc_type": "declaration", "name": "virus.zip"},
        files={"file": ("virus.exe", b"MZ\x90\x00dropper", "application/x-msdownload")},
        headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 400
    assert "not permitted" in r.json()["detail"].lower()


def test_upload_rejects_signature_mismatch(seeded):
    client = seeded["client"]
    tok = seeded["token"]("office.sunrise@ops.local")
    r = client.post(
        "/documents",
        data={"doc_type": "declaration", "name": "fake.docx"},
        files={"file": ("fake.pdf", b"This is not a real pdf", "application/pdf")},
        headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 400
    assert "extension" in r.json()["detail"].lower()


def test_upload_and_ocr_and_verify(seeded):
    client = seeded["client"]
    inst_tok = {"Authorization": f"Bearer {seeded['token']('office.sunrise@ops.local')}"}
    scr_tok = {"Authorization": f"Bearer {seeded['token']('scrutiny@ops.local')}"}
    sunrise = next(i for i in client.get("/admin/institutions", headers=inst_tok).json()
                   if i["code"] == "INST-DEMO-001")
    app_id = client.post("/applications", json={
        "institution_id": sunrise["id"], "title": "OCR demo application",
        "category": "new_approval",
        "programmes": [{"name": "CSE", "level": "undergraduate", "intake": 60}],
    }, headers=inst_tok).json()["id"]

    # institution uploads a real text PDF (built exactly like seed ones)
    import sys

    sys.path.insert(0, "tests")
    from app.seed import _demo_pdf

    pdf = _demo_pdf("Declaration Demo", ["Institution name: Sunrise Institute of Engineering",
                                         "Regno: Z999", "Issued date: 2024-05-01"])
    up = client.post(
        "/documents",
        data={"application_id": app_id, "doc_type": "declaration", "name": "Signed declaration"},
        files={"file": ("declaration.pdf", pdf, "application/pdf")},
        headers=inst_tok)
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]

    # officer runs OCR
    ocr = client.post(f"/documents/{doc_id}/ocr", headers=scr_tok)
    assert ocr.status_code == 200, ocr.text
    assert ocr.json()["status"] == "completed"
    keys = {f["key"] for f in ocr.json()["fields"]}
    assert "institution_name" in keys

    # officer verifies
    ver = client.put(f"/documents/{doc_id}/verify",
                     json={"decision": "verified", "comments": "checked"},
                     headers=scr_tok)
    assert ver.status_code == 200 and ver.json()["status"] == "verified"


def test_download_permission_enforced(seeded):
    client = seeded["client"]
    tok = seeded["token"]("office.sunrise@ops.local")
    other_tok = seeded["token"]("office.lake@ops.local")
    sunrise = next(i for i in client.get("/admin/institutions", headers={"Authorization": f"Bearer {tok}"}).json()
                   if i["code"] == "INST-DEMO-001")
    app_id = client.post("/applications", json={
        "institution_id": sunrise["id"], "title": "Download-ACL check",
        "category": "new_approval",
        "programmes": [{"name": "CSE", "level": "undergraduate", "intake": 60}],
    }, headers={"Authorization": f"Bearer {tok}"}).json()["id"]
    up = client.post(
        "/documents",
        data={"application_id": app_id, "doc_type": "declaration", "name": "secret.pdf"},
        files={"file": ("d.pdf", b"%PDF-1.4 ok", "application/pdf")},
        headers={"Authorization": f"Bearer {tok}"})
    doc_id = up.json()["id"]
    mine = client.get(f"/documents/{doc_id}/download", headers={"Authorization": f"Bearer {tok}"})
    assert mine.status_code == 200
    theirs = client.get(f"/documents/{doc_id}/download", headers={"Authorization": f"Bearer {other_tok}"})
    assert theirs.status_code == 403


def test_evc_scheduling_and_report_flow(seeded):
    client = seeded["client"]
    evc_tok = {"Authorization": f"Bearer {seeded['token']('evc@ops.local')}"}
    cases = client.get("/evc", headers=evc_tok).json()["items"]
    scheduled = next(c for c in cases if c["status"] == "ready_to_schedule")
    cid = scheduled["id"]

    # propose + confirm
    import datetime as dt

    future = (dt.date.today() + dt.timedelta(days=10)).isoformat()
    assert client.post(f"/evc/{cid}/propose", json={"date": future}, headers=evc_tok).status_code == 200
    assert client.post(f"/evc/{cid}/confirm", json={}, headers=evc_tok).status_code == 200

    # reschedule without reason → 400; with reason → ok
    later = (dt.date.today() + dt.timedelta(days=15)).isoformat()
    r = client.post(f"/evc/{cid}/reschedule", json={"date": later, "reason": ""}, headers=evc_tok)
    assert r.status_code == 400
    r = client.post(f"/evc/{cid}/reschedule", json={"date": later, "reason": "committee member unavailable"},
                    headers=evc_tok)
    assert r.status_code == 200

    # report flow
    assert client.post(f"/evc/{cid}/start-visit", headers=evc_tok).status_code == 200
    rr = client.post(f"/evc/{cid}/report",
                     data={"outcome": "deficiencies_found", "summary": "Fire exit marked; repair advised",
                           "deficiencies": "Fire exit repair advisory"},
                     headers=evc_tok)
    assert rr.status_code == 200, rr.text
    assert rr.json()["status"] == "completed"


def test_compliance_submission_needs_human_verification(seeded):
    client = seeded["client"]
    inst_tok = {"Authorization": f"Bearer {seeded['token']('office.sunrise@ops.local')}"}
    comp_tok = {"Authorization": f"Bearer {seeded['token']('compliance@ops.local')}"}

    obs = client.get("/compliance", headers=inst_tok).json()["items"]
    target = next(o for o in obs if o["status"] in ("not_started", "pending_submission"))
    ob_id = target["id"]

    sub = client.post(f"/compliance/{ob_id}/submit",
                      json={"note": "Ledger attached", "evidence_document_ids": []}, headers=inst_tok)
    assert sub.status_code == 200
    assert sub.json()["status"] == "under_verification"

    # institution cannot self-verify
    selfv = client.post(f"/compliance/{ob_id}/verify-latest",
                        json={"decision": "verified"}, headers=inst_tok)
    assert selfv.status_code == 403

    # officer verifies with comments
    ver = client.post(f"/compliance/{ob_id}/verify-latest",
                      json={"decision": "verified", "comments": "human review done"}, headers=comp_tok)
    assert ver.status_code == 200
    assert ver.json()["status"] == "verified"


def test_dashboards_are_database_backed(seeded):
    client = seeded["client"]
    adm_tok = {"Authorization": f"Bearer {seeded['token']('admin@ops.local')}"}
    ex = client.get("/dashboards/executive", headers=adm_tok).json()
    assert ex["data_provenance"] == "live database counts"
    assert ex["active_applications"] > 0
    comp = client.get("/dashboards/compliance", headers=adm_tok).json()
    assert comp["total"] >= 5
    # risk radar explains its factors
    radar = client.get("/risk-radar", headers=adm_tok).json()
    assert radar, "risk radar must produce entries"
    sample = next(r for r in radar if r["score"] > 0)
    assert sample["factors"] and all("detail" in f for f in sample["factors"])
    assert "operational" in sample["note"].lower()


def test_notification_dedup_on_repeated_sla_tick(seeded, db_session):
    """Scheduled SLA ticks must be idempotent: running twice in a day produces
    no duplicate notifications (spec §10, §30)."""
    from app.services import sla_service

    sla_service.sla_tick(db_session)
    db_session.commit()
    from app.models.orm_models import Notification

    ids_after_first = {(n.id) for n in db_session.query(Notification).all()}
    sla_service.sla_tick(db_session)
    db_session.commit()
    ids_after_second = {(n.id) for n in db_session.query(Notification).all()}
    assert ids_after_second == ids_after_first, "duplicate notifications created by the second tick"
