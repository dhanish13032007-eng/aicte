"""End-to-end demonstration journey (spec §30) against the in-process API.

Covers: create → upload → OCR → submit → intake validation → scrutiny →
clarification (reason required) → institution response → re-scrutiny → EVC
(scheduling, participants, visit, report) → SAC/SHC review → authorized decision
→ compliance evidence submission & verification → audit chain verification.
"""
from __future__ import annotations

import io


def _pdf(title: str) -> bytes:
    content = (
        f"BT /F1 14 Tf 50 760 Td ({title}) Tj ET\n"
        "BT /F1 10 Tf 50 730 Td (Institution name: Sunrise Institute of Engineering) Tj ET\n"
        "BT /F1 10 Tf 50 714 Td (Issued date: 2024-05-01) Tj ET\n"
        "BT /F1 10 Tf 50 698 Td (Expiry date: 2030-04-30) Tj ET"
    ).encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return out.getvalue()


def test_full_demonstration_journey(seeded):
    client, token = seeded["client"], seeded["token"]

    def h(email: str) -> dict:
        return {"Authorization": f"Bearer {token(email)}"}

    inst_h = h("office.sunrise@ops.local")
    scr_h = h("scrutiny@ops.local")
    evc_h = h("evc@ops.local")
    rev_h = h("review@ops.local")
    appr_h = h("approver@ops.local")
    comp_h = h("compliance@ops.local")

    # 1. create ----------------------------------------------------------------
    insts = client.get("/admin/institutions", headers=inst_h).json()
    my_inst = next(i["id"] for i in insts if i["code"] == "INST-DEMO-001")
    r = client.post(
        "/applications?idempotency_key=journey-001",
        headers=inst_h,
        json={
            "institution_id": my_inst,
            "academic_year": "2025-26",
            "category": "new_approval",
            "title": "Journey — B.Tech (CSE)",
            "programmes": [{"name": "Computer Science & Engineering", "level": "undergraduate", "intake": 120}],
        },
    )
    assert r.status_code == 200, r.text
    app_id, ref_no = r.json()["id"], r.json()["ref_no"]

    # idempotent replay creates no second record
    r2 = client.post(
        "/applications?idempotency_key=journey-001",
        headers=inst_h,
        json={"institution_id": my_inst, "academic_year": "2025-26", "category": "new_approval",
              "title": "dupe", "programmes": [{"name": "X"}]},
    )
    assert r2.json()["id"] == app_id

    # 2. upload + OCR ------------------------------------------------------------
    r = client.post(
        "/documents",
        headers=inst_h,
        data={"application_id": app_id, "doc_type": "declaration", "name": "Declaration",
              "issue_date": "2024-05-01", "expiry_date": "2030-04-30"},
        files={"file": ("declaration.pdf", _pdf("Declaration"), "application/pdf")},
    )
    assert r.status_code == 200, r.text
    doc_id = r.json()["id"]
    ocr = client.post(f"/documents/{doc_id}/ocr", headers=inst_h).json()
    assert ocr["status"] == "completed" and ocr["fields"], ocr

    # 3. submit (idempotency + duplicate protection) ------------------------------
    s1 = client.post(f"/applications/{app_id}/transition?idempotency_key=j-submit", headers=inst_h,
                     json={"action": "submit"})
    assert s1.status_code == 200 and s1.json()["stage"] == "intake_validation"
    replay = client.post(f"/applications/{app_id}/transition?idempotency_key=j-submit", headers=inst_h,
                         json={"action": "submit"})
    assert replay.status_code == 200 and replay.json() == s1.json()
    fresh = client.post(f"/applications/{app_id}/transition?idempotency_key=j-submit-2", headers=inst_h,
                        json={"action": "submit"})
    assert fresh.status_code == 400

    # 4. scrutiny --------------------------------------------------------------
    assert client.post(f"/applications/{app_id}/transition", headers=inst_h,
                       json={"action": "validate_intake"}).status_code == 403
    assert client.post(f"/applications/{app_id}/transition", headers=scr_h,
                       json={"action": "validate_intake"}).json()["stage"] == "scrutiny"

    detail = client.get(f"/applications/{app_id}", headers=scr_h).json()
    assert len(detail["checklist"]) >= 4 and isinstance(detail["valid_actions"], list)

    # 5. clarification loop ----------------------------------------------------
    no_reason = client.post(f"/applications/{app_id}/transition", headers=scr_h,
                            json={"action": "request_clarification"})
    assert no_reason.status_code == 400 and "reason" in no_reason.json()["detail"].lower()
    returned = client.post(f"/applications/{app_id}/transition", headers=scr_h,
                           json={"action": "request_clarification", "reason": "Land record unreadable"})
    assert returned.status_code == 200 and returned.json()["stage"] == "clarification"

    responded = client.post(f"/applications/{app_id}/transition", headers=inst_h,
                            json={"action": "respond_clarification"})
    assert responded.json()["stage"] == "re_scrutiny"
    detail = client.get(f"/applications/{app_id}", headers=scr_h).json()
    assert detail["stage_return_count"] >= 1, "returns must be tracked for the risk radar"

    for item in detail["checklist"]:
        if item["required"]:
            client.put(f"/applications/{app_id}/checklist/{item['id']}", headers=scr_h,
                       json={"status": "verified"})

    # 6. EVC -------------------------------------------------------------------
    assert client.post(f"/applications/{app_id}/transition", headers=scr_h,
                       json={"action": "rescrut_send_to_evc"}).json()["stage"] == "evc"
    cases = client.get("/evc", headers=evc_h).json()["items"]
    case = next(c for c in cases if c["application_id"] == app_id)
    assert client.post(f"/evc/{case['id']}/propose", headers=evc_h,
                       json={"date": "2026-11-20"}).json()["proposed_date"]
    assert client.post(f"/evc/{case['id']}/confirm", headers=evc_h,
                       json={"date": "2026-11-20"}).json()["confirmed_date"]
    # reschedule requires a reason
    bad = client.post(f"/evc/{case['id']}/reschedule", headers=evc_h, json={"date": "2026-11-25", "reason": ""})
    assert bad.status_code == 400
    assert client.post(f"/evc/{case['id']}/participants", headers=evc_h,
                       json={"name": "Dr. J Chair", "role": "chairperson"}).status_code == 200
    assert client.post(f"/evc/{case['id']}/start-visit", headers=evc_h).status_code == 200
    rep = client.post(f"/evc/{case['id']}/report", headers=evc_h,
                      data={"outcome": "satisfactory", "summary": "Visit completed.", "visit_held_on": "2026-11-20"})
    assert rep.status_code == 200
    assert client.post(f"/applications/{app_id}/transition", headers=evc_h,
                       json={"action": "submit_evc_report"}).json()["stage"] == "sac_review"

    # 7. review + decision -----------------------------------------------------
    assert client.post(f"/applications/{app_id}/transition", headers=rev_h,
                       json={"action": "complete_sac_review"}).json()["stage"] == "decision"
    decided = client.post(f"/applications/{app_id}/transition", headers=appr_h,
                          json={"action": "approve", "reason": "E2E decision"})
    assert decided.status_code == 200 and decided.json()["stage"] == "closed"
    final = client.get(f"/applications/{app_id}", headers=appr_h).json()
    assert final["decision"] == "approved" and final["decision_reason"]

    # 8. compliance ------------------------------------------------------------
    ob = client.post("/compliance", headers=comp_h, json={
        "institution_id": my_inst, "application_id": app_id, "title": "Post-decision undertaking",
        "category": "undertaking", "due_date": "2026-12-31T12:00:00",
        "source_type": "demonstration", "required_evidence": ["declaration"],
    })
    assert ob.status_code == 200, ob.text
    ob_id = ob.json()["id"]
    submitted = client.post(f"/compliance/{ob_id}/submit", headers=inst_h, json={"note": "submitted"})
    assert submitted.status_code == 200 and submitted.json()["status"] in ("submitted", "under_verification")
    verified = client.post(f"/compliance/{ob_id}/verify-latest", headers=comp_h,
                           json={"decision": "verified", "comments": "accepted"})
    assert verified.json()["status"] == "verified"
    # evidence must exist before verification
    ob2 = client.post("/compliance", headers=comp_h, json={
        "institution_id": my_inst, "title": "Second obligation", "category": "undertaking",
        "due_date": "2026-12-30T12:00:00", "source_type": "demonstration"})
    assert client.post(f"/compliance/{ob2.json()['id']}/verify-latest", headers=comp_h,
                       json={"decision": "verified"}).status_code == 400

    # 9. audit + isolation -----------------------------------------------------
    audit = client.get(f"/audit?application_id={app_id}&limit=100", headers=appr_h).json()["items"]
    assert len(audit) >= 10
    assert sum(1 for e in audit if e["action"].startswith("workflow.")) >= 8
    chain = client.get("/audit/verify", headers=appr_h).json()
    assert chain["valid"] is True and chain["total"] > 0

    other = h("office.green@ops.local")
    assert client.get(f"/applications/{app_id}", headers=other).status_code in (403, 404)
    assert client.get("/admin/users", headers=h("auditor@ops.local")).status_code == 403
    assert client.post("/documents", headers=h("auditor@ops.local"),
                       data={"doc_type": "declaration", "name": "x"},
                       files={"file": ("x.pdf", _pdf("x"), "application/pdf")}).status_code == 403


def test_tasks_and_rag_assistant_surfaces(seeded):
    """The My Tasks and Handbook Assistant surfaces behave honestly."""
    client, token = seeded["client"], seeded["token"]
    scr_h = {"Authorization": f"Bearer {token('scrutiny@ops.local')}"}

    tasks = client.get("/tasks", headers=scr_h).json()
    assert tasks["total"] >= 3 and tasks["open"] >= 1
    open_id = next(t["id"] for t in tasks["items"] if t["status"] == "open")
    done = client.post(f"/tasks/{open_id}/complete", headers=scr_h)
    assert done.status_code == 200 and done.json()["status"] == "done"
    assert client.post(f"/tasks/{open_id}/complete", headers=scr_h).status_code == 400

    asked = client.post("/rag/ask", headers=scr_h, json={"question": "lease validity"}).json()
    assert asked["answer"] is None and asked["citations"] == [] and "registered and ingested" in asked["reason"]

    ai = client.get("/ai/status").json()
    assert ai["configured"] is False
    brief = client.post(f"/ai/applications/{client.get('/applications', headers=scr_h).json()['items'][0]['id']}/brief",
                        headers=scr_h).json()
    assert brief["available"] is False and "not configured" in brief["message"]
