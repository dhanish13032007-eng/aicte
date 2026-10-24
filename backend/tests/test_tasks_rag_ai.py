"""Tests for the endpoints added to complete the spec surface:
- /tasks worklist + completion (My Tasks page)
- /rag/ask handbook assistant (abstains with no sources, cites with sources)
- /ai/documents/{id}/summary (degrades honestly without a configured provider)
"""
from __future__ import annotations


def test_tasks_list_scoped_to_assignee_and_complete(seeded):
    client, token = seeded["client"], seeded["token"]
    tok = token("scrutiny@ops.local")
    h = {"Authorization": f"Bearer {tok}"}

    mine = client.get("/tasks", headers=h).json()
    assert mine["total"] >= 3
    assert all(
        (t["assignee"] or {}).get("name", "").startswith("Arun") for t in mine["items"]
    ), "tasks must be scoped to the assignee"

    open_task = next(t for t in mine["items"] if t["status"] == "open")
    r = client.post(f"/tasks/{open_task['id']}/complete", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "done"
    # idempotency guard: completing twice is refused, not duplicated
    assert client.post(f"/tasks/{open_task['id']}/complete", headers=h).status_code == 400

    # another officer cannot complete someone else's task
    other = token("evc@ops.local")
    r = client.post(f"/tasks/{open_task['id']}/complete", headers={"Authorization": f"Bearer {other}"})
    assert r.status_code == 403


def test_tasks_scope_all_requires_permission(seeded):
    client, token = seeded["client"], seeded["token"]
    inst = token("office.sunrise@ops.local")
    assert client.get("/tasks?scope=all", headers={"Authorization": f"Bearer {inst}"}).status_code == 403
    auditor = token("auditor@ops.local")
    assert client.get("/tasks?scope=all", headers={"Authorization": f"Bearer {auditor}"}).status_code == 200
    assert client.get("/tasks?overdue_only=true", headers={"Authorization": f"Bearer {auditor}"}).status_code == 200


def test_rag_ask_requires_permission_and_abstains_without_sources(seeded):
    client, token = seeded["client"], seeded["token"]
    tok = token("scrutiny@ops.local")
    h = {"Authorization": f"Bearer {tok}"}
    # no sources ingested in the seed -> honest abstention, never a fabricated answer
    r = client.post("/rag/ask", json={"question": "What does the handbook say about lease validity?"}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["answer"] is None and body["citations"] == []
    assert body["source_count"] == 0
    assert "registered and ingested" in body["reason"]


def test_rag_ask_unauthenticated_rejected(seeded):
    client = seeded["client"]
    assert client.post("/rag/ask", json={"question": "lease validity"}).status_code == 401


def test_ai_document_summary_requires_extraction_and_degrades(seeded):
    client, token = seeded["client"], seeded["token"]
    tok = token("scrutiny@ops.local")
    h = {"Authorization": f"Bearer {tok}"}
    docs = client.get("/documents", headers=h).json()["items"]
    # one of the seeded docs has OCR results with real extracted text
    with_text = None
    for d in docs:
        hist = client.get(f"/documents/{d['id']}/ocr-history", headers=h).json()
        if hist and (hist[0].get("text_preview") or "").strip():
            with_text = d
            break
    assert with_text is not None, "seed should include a document with extracted text"
    r = client.post(f"/ai/documents/{with_text['id']}/summary", headers=h)
    assert r.status_code == 200
    body = r.json()
    # AI provider is not configured in tests: the endpoint must say so, not fake output
    assert body["available"] is False and "not configured" in body["message"]

    # documents without extraction get an honest "run OCR first" answer
    without = next(d for d in docs if not (d.get("ocr") or {}).get("fields"))
    body2 = client.post(f"/ai/documents/{without['id']}/summary", headers=h).json()
    assert body2["ok"] is False and "OCR" in body2["message"]
