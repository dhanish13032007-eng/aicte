"""Synthetic demo-data seeding (spec §25).

Every record is clearly synthetic: fictional institutions, hand-built
demo accounts, and generated sample PDFs. Run:

    python -m app.seed            # create demo data
    python -m app.seed --reset    # wipe + reseed

Demo credentials (LOCAL DEVELOPMENT ONLY; documented in README):
	every seeded account shares the password  Demo@12345
	admin@ops.local, scrutiny@ops.local, evc@ops.local, office.sunrise@ops.local, ...
"""
from __future__ import annotations

import argparse
import io
import sys
from datetime import datetime, timedelta

from app.core.log import configure_logging, get_logger
from app.db import SessionLocal, engine
from app.models.orm_models import Base, utcnow

log = get_logger("seed")

DEMO_YEAR = "2024-25"


def _demo_pdf(title: str, lines: list[str]) -> bytes:
    """Minimal, valid single-page PDF with real text so pdfplumber OCR works.

    Pure-python writer — no external dependency, honestly synthetic content.
    """
    import zlib


    def _esc(s: str) -> str:
        return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


    content_parts = [f"BT /F1 14 Tf 50 760 Td ({_esc(title)}) Tj ET"]
    y = 730
    for line in lines:
        content_parts.append(f"BT /F1 10 Tf 50 {y} Td ({_esc(line)}) Tj ET")
        y -= 16
    stream = "\n".join(content_parts).encode("latin-1", "replace")
    objs = []

    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>")
    objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref_pos = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode())
    return out.getvalue()


def reset(db) -> None:
    # drop + recreate everything (demo convenience; documented behavior)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def seed(db) -> dict:
    from app.models import orm_models as M
    from app.core.security import hash_password
    from app.services import (
        audit_service,
        compliance_service,
        document_service,
        evc_service,
        ocr_service,
        notification_service,
    )
    from app.api.routes.applications import _open_application
    from app.schemas import ApplicationCreateIn, ProgrammeIn

    # Idempotency guard: a populated database (e.g. docker-compose restart, where
    # `python -m app.seed` runs on every boot) must be left untouched instead of
    # crashing on duplicate keys or duplicating demo data.
    if db.query(M.User).limit(1).first() is not None:
        existing_users = db.query(M.User).count()
        log.info("seed skipped: database already populated (%d users)", existing_users)
        return {"skipped": True, "users": existing_users}

    counts = {"applications": 0, "documents": 0, "obligations": 0, "notifications": 0}

    # ------------------------------------------------------------------ workflows
    def make_workflow(key, name, categories, stages, transitions):
        wf = M.Workflow(key=key, name=name, applicable_categories=categories, is_active=True)
        db.add(wf)
        db.flush()
        v = M.WorkflowVersion(workflow_id=wf.id, version_no=1, is_active=True, change_note="seed v1")
        db.add(v)
        db.flush()
        for i, s in enumerate(stages):
            db.add(M.WorkflowStage(version_id=v.id, order=i, **s))
        for t in transitions:
            db.add(M.WorkflowTransition(version_id=v.id, **t))
        db.flush()
        wf.active_version_no = 1
        return wf

    REV = ["scrutiny_officer"]
    full_stages = [
        dict(key="draft", name="Draft (Institution)", target_days=None, owner_roles=["institution"],
             required_doc_types=["declaration"], checklist=[]),
        dict(key="intake_validation", name="Intake Validation", target_days=3,
             owner_roles=["scrutiny_officer", "regional_officer", "system_admin"],
             required_doc_types=[], checklist=[]),
        dict(key="scrutiny", name="Scrutiny", target_days=10, owner_roles=["scrutiny_officer"],
             required_doc_types=[],
             checklist=[{"key": "land_document", "label": "Land ownership/lease document verified", "required": True},
                        {"key": "building_safety", "label": "Building safety certificate verified", "required": True},
                        {"key": "fire_safety", "label": "Fire safety certificate verified", "required": True},
                        {"key": "declaration", "label": "Institution declaration verified", "required": True}]),
        dict(key="clarification", name="Clarification Awaiting Response", target_days=15,
             owner_roles=["institution"], required_doc_types=[], checklist=[]),
        dict(key="re_scrutiny", name="Re-scrutiny", target_days=5, owner_roles=["scrutiny_officer"],
             required_doc_types=[], checklist=[]),
        dict(key="evc", name="Expert Visit Committee", target_days=20,
             owner_roles=["evc_coordinator", "evc_member"], required_doc_types=[], checklist=[]),
        dict(key="sac_review", name="SAC/SHC Review", target_days=10, owner_roles=["sac_shc_reviewer"],
             required_doc_types=[], checklist=[]),
        dict(key="decision", name="Authorized Decision", target_days=5,
             owner_roles=["approving_authority"], required_doc_types=[], checklist=[]),
        dict(key="closed", name="Closed", target_days=None, owner_roles=[], required_doc_types=[], checklist=[]),
    ]
    full_transitions = [
        dict(action="submit", label="Submit application", from_stage="draft",
             to_stage="intake_validation", allowed_roles=["institution"],
             requires_reason=False,
             prerequisites=["mandatory_fields_complete", "required_docs_present"]),
        dict(action="validate_intake", label="Validate intake and route to scrutiny",
             from_stage="intake_validation", to_stage="scrutiny",
             allowed_roles=["scrutiny_officer", "regional_officer", "system_admin"]),
        dict(action="complete_scrutiny", label="Complete scrutiny, recommend decision",
             from_stage="scrutiny", to_stage="decision", allowed_roles=["scrutiny_officer"],
             prerequisites=["checklist_complete", "required_docs_present"]),
        dict(action="send_to_evc", label="Send to EVC", from_stage="scrutiny", to_stage="evc",
             allowed_roles=["scrutiny_officer"], prerequisites=["checklist_complete"]),
        dict(action="request_clarification", label="Return for clarification",
             from_stage="scrutiny", to_stage="clarification", allowed_roles=["scrutiny_officer"],
             requires_reason=True),
        dict(action="respond_clarification", label="Submit clarification response",
             from_stage="clarification", to_stage="re_scrutiny", allowed_roles=["institution"]),
        dict(action="complete_re_scrutiny", label="Complete re-scrutiny, recommend decision",
             from_stage="re_scrutiny", to_stage="decision", allowed_roles=["scrutiny_officer"],
             prerequisites=["checklist_complete"]),
        dict(action="rescrut_send_to_evc", label="Send to EVC after re-scrutiny",
             from_stage="re_scrutiny", to_stage="evc", allowed_roles=["scrutiny_officer"],
             prerequisites=["checklist_complete"]),
        dict(action="submit_evc_report", label="Submit EVC report, route to SAC/SHC review",
             from_stage="evc", to_stage="sac_review",
             allowed_roles=["evc_coordinator", "evc_member", "system_admin"],
             prerequisites=["evc_report_present"]),
        dict(action="evc_direct_decision", label="Submit EVC report, route to decision",
             from_stage="evc", to_stage="decision",
             allowed_roles=["evc_coordinator", "system_admin"],
             prerequisites=["evc_report_present"]),
        dict(action="complete_sac_review", label="Record review, submit recommendation",
             from_stage="sac_review", to_stage="decision", allowed_roles=["sac_shc_reviewer"]),
        dict(action="review_request_clarification", label="Return for clarification (review stage)",
             from_stage="sac_review", to_stage="clarification",
             allowed_roles=["sac_shc_reviewer", "approving_authority"], requires_reason=True),
        dict(action="approve", label="Record approval decision", from_stage="decision",
             to_stage="closed", allowed_roles=["approving_authority"]),
        dict(action="reject", label="Record rejection decision", from_stage="decision",
             to_stage="closed", allowed_roles=["approving_authority"], requires_reason=True),
        dict(action="hold", label="Place on hold", from_stage="decision",
             to_stage="closed", allowed_roles=["approving_authority"], requires_reason=True),
        dict(action="withdraw", label="Withdraw application", from_stage="draft",
             to_stage="closed", allowed_roles=["institution"], requires_reason=True),
    ]
    ext_stages = [
        dict(key="draft", name="Draft (Institution)", target_days=None, owner_roles=["institution"],
             required_doc_types=["declaration"], checklist=[]),
        dict(key="intake_validation", name="Intake Validation", target_days=3,
             owner_roles=["scrutiny_officer", "regional_officer", "system_admin"],
             required_doc_types=[], checklist=[]),
        dict(key="scrutiny", name="Scrutiny", target_days=10, owner_roles=["scrutiny_officer"],
             required_doc_types=[],
             checklist=[{"key": "declaration", "label": "Institution declaration verified", "required": True},
                        {"key": "intake_undertaking", "label": "Intake undertaking verified", "required": True}]),
        dict(key="clarification", name="Clarification Awaiting Response", target_days=15,
             owner_roles=["institution"], required_doc_types=[], checklist=[]),
        dict(key="decision", name="Authorized Decision", target_days=5,
             owner_roles=["approving_authority"], required_doc_types=[], checklist=[]),
        dict(key="closed", name="Closed", target_days=None, owner_roles=[], required_doc_types=[], checklist=[]),
    ]
    ext_transitions = [
        dict(action="submit", label="Submit application", from_stage="draft",
             to_stage="intake_validation", allowed_roles=["institution"],
             prerequisites=["mandatory_fields_complete", "required_docs_present"]),
        dict(action="validate_intake", label="Validate intake and route to scrutiny",
             from_stage="intake_validation", to_stage="scrutiny",
             allowed_roles=["scrutiny_officer", "regional_officer", "system_admin"]),
        dict(action="complete_scrutiny", label="Complete scrutiny, recommend decision",
             from_stage="scrutiny", to_stage="decision", allowed_roles=["scrutiny_officer"],
             prerequisites=["checklist_complete"]),
        dict(action="request_clarification", label="Return for clarification",
             from_stage="scrutiny", to_stage="clarification", allowed_roles=["scrutiny_officer"],
             requires_reason=True),
        dict(action="respond_clarification", label="Submit clarification response",
             from_stage="clarification", to_stage="scrutiny", allowed_roles=["institution"]),
        dict(action="approve", label="Record approval decision", from_stage="decision",
             to_stage="closed", allowed_roles=["approving_authority"]),
        dict(action="reject", label="Record rejection decision", from_stage="decision",
             to_stage="closed", allowed_roles=["approving_authority"], requires_reason=True),
        dict(action="hold", label="Place on hold", from_stage="decision",
             to_stage="closed", allowed_roles=["approving_authority"], requires_reason=True),
    ]
    wf_full = make_workflow("new_approval_full", "New Approval - Full Lifecycle",
                            ["new_approval"], full_stages, full_transitions)
    wf_ext = make_workflow("extension_fast", "Extension of Approval - Scrutiny-to-Decision",
                           ["extension_of_approval"], ext_stages, ext_transitions)

    # ------------------------------------------------------------------ institutions
    insts = [
        dict(code="INST-DEMO-001", name="Sunrise Institute of Engineering",
             identifier="PID-DEMO-1001", state="State A", region="Northern Region"),
        dict(code="INST-DEMO-002", name="Greenfield Polytechnic College",
             identifier="PID-DEMO-1002", state="State A", region="Northern Region"),
        dict(code="INST-DEMO-003", name="Lakeside Technical University",
             identifier="PID-DEMO-1003", state="State B", region="Southern Region"),
        dict(code="INST-DEMO-004", name="Harbour City Institute of Technology",
             identifier="PID-DEMO-1004", state="State B", region="Southern Region"),
        dict(code="INST-DEMO-005", name="Meridian Business School",
             identifier="PID-DEMO-1005", state="State C", region="Western Region"),
        dict(code="INST-DEMO-006", name="Pinecrest Pharmacy College",
             identifier="PID-DEMO-1006", state="State D", region="Eastern Region"),
    ]
    institutions = {}
    for sd in insts:
        inst = M.Institution(category="private_unaided", institution_type="engineering",
                             address="Demo Civil Lines, Demonstration District, PIN-000000",
                             contact_email=f"office@{sd['code'].lower()}.example",
                             created_at=utcnow() - timedelta(days=400), **sd)
        db.add(inst)
        institutions[sd["code"]] = inst
    db.flush()

    # ------------------------------------------------------------------ users
    def user(email, name, role, inst=None, region=None):
        u = M.User(email=email, name=name, role=role,
                   password_hash=hash_password("Demo@12345"),
                   institution_id=inst.id if inst else None,
                   region=region)
        db.add(u)
        return u

    admin = user("admin@ops.local", "Priya Menon (System Admin)", "system_admin", region="Northern Region")
    scr1 = user("scrutiny@ops.local", "Arun Krishnan (Scrutiny Officer)", "scrutiny_officer", region="Northern Region")
    scr2 = user("scrutiny2@ops.local", "Vivek Chandra (Scrutiny Officer)", "scrutiny_officer", region="Southern Region")
    evc1 = user("evc@ops.local", "Rohit Sharma (EVC Coordinator)", "evc_coordinator", region="Northern Region")
    evcm1 = user("evcmember@ops.local", "Dr. Lakshmi Nair (EVC Member)", "evc_member", region="Southern Region")
    review1 = user("review@ops.local", "Sunita Reddy (SAC/SHC Reviewer)", "sac_shc_reviewer", region="Southern Region")
    comp1 = user("compliance@ops.local", "Farah Khan (Compliance Officer)", "compliance_officer", region="Northern Region")
    reg1 = user("regional@ops.local", "Dinesh Iyer (Regional Officer North)", "regional_officer", region="Northern Region")
    approve1 = user("approver@ops.local", "Gita Rao (Authorized Approving Officer)", "approving_authority")
    audit1 = user("auditor@ops.local", "Nikhil Bose (Auditor)", "auditor")
    u_sunrise = user("office@sunrise@ops.local", "Sunrise Office (K. Anand)", "institution", institutions["INST-DEMO-001"])
    u_sunrise.email = "office.sunrise@ops.local"
    u_green = user("office.green@ops.local", "Greenfield Office (M. Joy)", "institution", institutions["INST-DEMO-002"])
    u_lake = user("office.lake@ops.local", "Lakeside Office (S. Dutta)", "institution", institutions["INST-DEMO-003"])
    u_harbor = user("office.harbor@ops.local", "Harbour City Office (T. Pillai)", "institution", institutions["INST-DEMO-004"])
    db.flush()
    all_inst_users = [u_sunrise, u_green, u_lake, u_harbor]

    # ------------------------------------------------------------------ applications
    now = utcnow()

    def mk_app(inst, cat, title, stage, status, officer, created_days_ago, stage_started_days_ago,
               submitted=True, deadline=None, returns=0, programmes=None, decision=None):
        body = ApplicationCreateIn(
            institution_id=inst.id, academic_year=DEMO_YEAR, category=cat,
            title=title,
            programmes=programmes or [ProgrammeIn(name="Computer Science & Engineering", level="undergraduate", intake=120)],
        )
        app = _open_application(db, body, u_sunrise)
        # adjust generated fields to the desired demo state (owner = institution user of that institution)
        creator = {i.id: u for u, i in zip(all_inst_users, list(institutions.values()))}.get(inst.id)
        app.created_by = creator.id if creator else u_sunrise.id
        db.flush()
        if submitted:
            app.submitted_at = now - timedelta(days=created_days_ago)
            app.current_stage = stage
            app.status = status
            app.stage_started_at = now - timedelta(days=stage_started_days_ago)
            app.stage_deadline = deadline
            app.stage_return_count = returns
            app.assigned_officer_id = officer.id if officer else None
        else:
            app.submitted_at = None
            app.assigned_officer_id = None
        if decision:
            app.decision = decision
        counts["applications"] += 1
        return app

    d = lambda dd: now + timedelta(days=dd)  # noqa: E731

    app_overdue = mk_app(institutions["INST-DEMO-001"], "new_approval", "New approval - B.Tech (CSE, ECE)",
                         "scrutiny", "under_scrutiny", scr1, 40, 14, deadline=now - timedelta(days=4))
    app_pdfs = mk_app(institutions["INST-DEMO-002"], "new_approval", "New approval - Diploma (ME, CE)",
                      "scrutiny", "under_scrutiny", scr1, 12, 6, deadline=d(4))
    app_clarif = mk_app(institutions["INST-DEMO-003"], "new_approval", "New approval - B.Sc (MB, PY)",
                        "clarification", "clarification_required", scr2, 55, 8,
                        deadline=d(9), returns=1)
    app_evc_sch = mk_app(institutions["INST-DEMO-004"], "new_approval", "New approval - B.Tech (ME)",
                         "evc", "evc_scheduled", evc1, 60, 6, deadline=d(14))
    app_evc_ready = mk_app(institutions["INST-DEMO-003"], "new_approval", "New approval - B.Tech (AI&DS)",
                           "evc", "evc_pending", evc1, 30, 3, deadline=d(17))
    app_sac = mk_app(institutions["INST-DEMO-002"], "new_approval", "New approval - BBA (General)",
                     "sac_review", "awaiting_review", review1, 65, 5, deadline=d(10))
    app_decision = mk_app(institutions["INST-DEMO-001"], "new_approval", "New approval - BTech CSE Karad campus",
                          "decision", "awaiting_decision", approve1, 80, 2, deadline=d(3))
    app_ext = mk_app(institutions["INST-DEMO-005"], "extension_of_approval", "Extension of approval - MBA 2025-26",
                     "intake_validation", "submitted", None, 5, 2, deadline=d(1))
    app_ext2 = mk_app(institutions["INST-DEMO-006"], "extension_of_approval", "Extension of approval - B.Pharm",
                      "decision", "awaiting_decision", approve1, 25, 4, deadline=d(2))
    app_closed_ok = mk_app(institutions["INST-DEMO-004"], "new_approval", "Closed settled case (approved, demo)",
                           "closed", "approved", None, 100, 0, deadline=None)
    app_closed_ok.decision = "approved"
    app_closed_ok.state = "closed"
    app_closed_ok.closed_at = now - timedelta(days=10)
    app_closed_ok.stage_started_at = now - timedelta(days=12)
    app_draft = mk_app(institutions["INST-DEMO-001"], "new_approval", "Draft intake application (in progress)",
                       "draft", "draft", None, 0, 0, submitted=False)

    # ------------------------------------------------------------------ documents
    document_rows = []

    def add_doc(app, inst, doc_type, name, lines, issue_days=None, expiry_days=None, status="uploaded"):
        content = _demo_pdf(name, lines)
        import uuid as _uuid
        import hashlib

        key = f"{inst.id}/{_uuid.uuid4().hex}.pdf"
        document_service.storage().put(key, content)

        doc = M.Document(
            application_id=app.id, institution_id=inst.id, doc_type=doc_type, name=name,
            storage_key=key, mime_type="application/pdf", size_bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(), version_no=1,
            status=status, uploaded_by=app.created_by,
            issue_date=(utcnow().date() - timedelta(days=issue_days)) if issue_days else None,
            expiry_date=(utcnow().date() + timedelta(days=expiry_days)) if expiry_days is not None else None,
            created_at=utcnow() - timedelta(days=3),
        )
        db.add(doc)
        document_rows.append(doc)
        counts["documents"] += 1
        return doc

    expected_lines_common = [
        "Institution name: Sunrise Institute of Engineering",
        "Regno: DEMOCERT-0001",
        "Issued date: 2023-04-10",
        "Expiry date: 2030-04-09",
        "Validity: valid for the stated period",
    ]

    for app, inst in [(app_pdfs, institutions["INST-DEMO-002"]), (app_decision, institutions["INST-DEMO-001"])]:
        for dtype in ("land_document", "building_safety", "fire_safety", "declaration"):
            add_doc(app, inst, dtype, f"{dtype}: {app.ref_no}",
                    [f"Institution name: {inst.name}", f"Regno: {app.ref_no.replace('/', '-')}-{dtype}",
                     "Issued date: 2023-04-10", "Expiry date: 2030-04-09"],
                    issue_days=(400 if dtype == "land_document" else 900),
                    expiry_days=None if dtype == "land_document" else 500)
    add_doc(app_overdue, institutions["INST-DEMO-001"], "land_document", "Land deed - Sale",
            [f"Institution name: {institutions['INST-DEMO-001'].name}", "Issued date: 2023-04-10",
             "Expiry date: 2030-04-09"], issue_days=900)
    add_doc(app_overdue, institutions["INST-DEMO-001"], "fire_safety", f"Fire NOC - {app_overdue.ref_no}",
            [f"Institution name: {institutions['INST-DEMO-001'].name}", "Issued date: 2024-01-05",
             "Expiry date: 2026-01-04"], issue_days=1000, status="ocr_pending", expiry_days=None)
    add_doc(app_overdue, institutions["INST-DEMO-001"], "building_safety", f"Building certificate - {app_overdue.ref_no}",
            [f"Institution name: {institutions['INST-DEMO-001'].name}", "Issued date: 2024-01-05",
             "Expiry date: 2026-02-28"], issue_days=1000, expiry_days=400)
    add_doc(app_clarif, institutions["INST-DEMO-003"], "land_document", f"Lease deed - {app_clarif.ref_no}",
            [f"Institution name: {institutions['INST-DEMO-003'].name}", "Issued date: 2020-05-01",
             "Expiry date: 2025-05-01"], issue_days=1400, status="needs_manual_review", expiry_days=None)
    add_doc(app_clarif, institutions["INST-DEMO-003"], "declaration", f"Declaration - {app_clarif.ref_no}",
            [f"Institution name: {institutions['INST-DEMO-003'].name}", "Issued date: 2024-09-01",
             "Expiry date: 2027-08-31"], issue_days=60, expiry_days=350)
    add_doc(app_ext, institutions["INST-DEMO-005"], "declaration", f"Declaration - {app_ext.ref_no}",
            [f"Institution name: {institutions['INST-DEMO-005'].name}", "Issued date: 2024-06-15",
             "Expiry date: 2031-06-14"], issue_days=100, expiry_days=900)
    add_doc(app_ext2, institutions["INST-DEMO-006"], "intake_undertaking", f"Undertaking - {app_ext2.ref_no}",
            [f"Institution name: {institutions['INST-DEMO-006'].name}", "Issued date: 2024-02-02",
             "Expiry date: 2026-02-01"], issue_days=150, expiry_days=75)
    # one document expiring in 30 days and one expired (for expiry calendar)
    add_doc(app_evc_sch, institutions["INST-DEMO-004"], "building_safety", f"Building certificate - {app_evc_sch.ref_no}",
            [f"Institution name: {institutions['INST-DEMO-004'].name}", "Issued date: 2023-11-11",
             "Expiry date: 2025-11-25"], issue_days=1050, expiry_days=30)
    add_doc(app_sac, institutions["INST-DEMO-002"], "fire_safety", f"Fire NOC - {app_sac.ref_no}",
            [f"Institution name: {institutions['INST-DEMO-002'].name}", "Issued date: 2023-01-01",
             "Expiry date: 2025-09-01"], issue_days=1100, expiry_days=-40)

    db.flush()
    # run OCR on a couple of seeded docs (real extraction on demo PDFs)
    for doc in document_rows[:3]:
        ocr_service.run_ocr(db, doc)
    db.flush()

    # ------------------------------------------------------------------ checklist (for a case in scrutiny)
    from app.services.workflow_engine import WorkflowEngine

    eng = WorkflowEngine(db)
    for app in (app_pdfs, app_overdue):
        eng._apply_side_effects(app, scr1, type("T", (), dict(
            to_stage="scrutiny", from_stage="draft", label="seed", action="seed"))(), eng.stage(app))
    db.flush()

    # ------------------------------------------------------------------ EVC cases
    ec_ready = M.EvcCase(application_id=app_evc_ready.id, status="ready_to_schedule", created_at=now)
    ec_sch = M.EvcCase(
        application_id=app_evc_sch.id, status="scheduled", coordinator_id=evc1.id,
        proposed_date=(now + timedelta(days=9)).date(), confirmed_date=(now + timedelta(days=9)).date(),
        report_due_date=(now + timedelta(days=16)).date(), report_status="pending")
    db.add(ec_ready)
    db.add(ec_sch)
    db.flush()
    evc_service.add_participant(db, ec_sch, evcm1, name="Dr. Lakshmi Nair", role="chairperson",
                                organization="Demonstration Engineering College", user_id=evcm1.id)
    evc_service.add_participant(db, ec_sch, evc1, name="Rohit Sharma", role="coordinator", organization="Platform", user_id=evc1.id)
    evc_service.propose_date(db, ec_sch, evc1, (now + timedelta(days=9)).date(), note="Initial proposal seeded (synthetic)")
    evc_service.confirm_schedule(db, ec_sch, evc1, (now + timedelta(days=9)).date(), note="Confirmed (synthetic demo)")
    # link several seed docs to an existing EVC visit under a completed case
    app_evc_done = mk_app(institutions["INST-DEMO-004"], "new_approval", "EVC-visit case (waiting report)",
                          "evc", "evc_scheduled", evc1, 70, 3, deadline=d(15))
    ec_done = M.EvcCase(
        application_id=app_evc_done.id, status="scheduled", coordinator_id=evc1.id,
        proposed_date=(now - timedelta(days=2)).date(), confirmed_date=(now - timedelta(days=2)).date(),
        report_due_date=(now + timedelta(days=5)).date(), report_status="pending")
    db.add(ec_done)
    db.flush()
    evc_service.add_participant(db, ec_done, evc1, name="Rohit Sharma", role="coordinator",
                                organization="Platform", user_id=evc1.id)
    evc_service.start_visit(db, ec_done, evcm1)  # visit held on-site; report belonging to the next stage

    # ------------------------------------------------------------------ compliance obligations
    ex_overlap = institutions["INST-DEMO-001"]
    ob1 = M.ComplianceObligation(
        ref_no="OB-DEMO-0001", institution_id=institutions["INST-DEMO-001"].id,
        application_id=app_closed_ok.id, title="Fire safety NOC renewal before expiry",
        description="Renew the fire-safety NOC and submit a scanned copy with application reference.",
        category="fire_safety_renewal", source_ref="Internal target (APD-OP-04) - verify against APH",
        source_type="internal_target", due_date=now - timedelta(days=10),
        assigned_officer_id=comp1.id, required_evidence=["fire_safety"],
        reminder_days=[14, 7, 3], status="pending_submission", escalation_level=1,
        created_by=comp1.id)
    ob2 = M.ComplianceObligation(
        ref_no="OB-DEMO-0002", institution_id=institutions["INST-DEMO-003"].id,
        title="Lease validity undertaking (2025-26)",
        description="Submit signed undertaking confirming lease validity for the coming academic year.",
        category="undertaking", source_ref="Internal op policy APD-OP-07 (demo)",
        source_type="internal_target", due_date=now + timedelta(days=3),
        assigned_officer_id=comp1.id, required_evidence=["declaration"],
        reminder_days=[7, 2], status="pending_submission", created_by=admin.id)
    ob3 = M.ComplianceObligation(
        ref_no="OB-DEMO-0003", institution_id=institutions["INST-DEMO-004"].id,
        title="Intake and infrastructure undertaking",
        description="Undertaking on intake delivered against approved norms (synthetic demo obligation).",
        category="undertaking", source_ref="APD-OP-07 (demo)", source_type="internal_target",
        due_date=now + timedelta(days=25), assigned_officer_id=comp1.id,
        required_evidence=["declaration"], reminder_days=[7, 2, 0],
        status="not_started", created_by=comp1.id)
    db.add(ob1)
    db.add(ob2)
    db.add(ob3)
    db.flush()
    counts["obligations"] += 3
    # a submitted + verified pair to show the full flow
    ob4 = M.ComplianceObligation(
        ref_no="OB-DEMO-0004", institution_id=institutions["INST-DEMO-005"].id,
        application_id=app_ext.id,
        title="Faculty-attendance undertaking (demo)",
        description="Submit the term-wise faculty attendance ledger (demonstration obligation).",
        category="faculty", source_ref="APD-OP-10 (demo)", source_type="internal_target",
        due_date=now - timedelta(days=2), assigned_officer_id=comp1.id,
        required_evidence=["declaration"], created_by=admin.id,
        status="verified", closed_at=now - timedelta(days=1), closed_by=comp1.id,
        closure_reason="Reviewed by compliance officer; evidence accepted")
    db.add(ob4)
    db.flush()
    sub_ob4 = M.ComplianceSubmission(
        obligation_id=ob4.id, note="Attendance ledger for reference term (synthetic)",
        evidence_document_ids=[], submitted_by=u_lake.id)
    db.add(sub_ob4)
    db.flush()
    db.add(M.ComplianceVerification(
        submission_id=sub_ob4.id, verified_by=comp1.id, decision="verified",
        comments="Read and accepted (demo)."))
    # an under-verification pair
    ob5 = M.ComplianceObligation(
        ref_no="OB-DEMO-0005", institution_id=institutions["INST-DEMO-004"].id,
        title="Building safety remedy plan",
        description="Remediation plan for flagged fire-exit issue (demo).",
        category="building_safety", source_ref="APD-OP-11 (demo)", source_type="internal_target",
        due_date=now + timedelta(days=12), assigned_officer_id=comp1.id,
        status="under_verification", created_by=admin.id)
    db.add(ob5)
    db.flush()
    sub_ob5 = M.ComplianceSubmission(
        obligation_id=ob5.id, note="Remedy plan uploaded", evidence_document_ids=[], submitted_by=u_harbor.id)
    db.add(sub_ob5)
    db.flush()

    # ------------------------------------------------------------------ tasks
    db.add(M.Task(application_id=app_pdfs.id, title=f"Review OCR findings - {app_pdfs.ref_no}",
                  task_type="review", assignee_id=scr1.id, due_date=d(2), created_by=admin.id))
    db.add(M.Task(application_id=app_pdfs.id, title=f"Verify land document - {app_pdfs.ref_no}",
                  task_type="verification", assignee_id=scr1.id, due_date=d(5), created_by=admin.id))
    db.add(M.Task(application_id=app_overdue.id, title=f"Overdue: complete scrutiny {app_overdue.ref_no}",
                  task_type="review", assignee_id=scr1.id, due_date=now - timedelta(days=2), created_by=admin.id))
    db.add(M.Task(obligation_id=ob1.id, title=f"Follow up overdue obligation {ob1.ref_no}",
                  task_type="follow_up", assignee_id=comp1.id, due_date=now - timedelta(days=1),
                  created_by=admin.id))
    db.add(M.Task(evc_case_id=ec_done.id, application_id=app_evc_done.id, title="Submit EVC visit report",
                  task_type="evc_report", assignee_id=evc1.id, due_date=d(5), created_by=evc1.id))

    # ------------------------------------------------------------------ notifications
    demo_notifs = [
        (scr1.id, "application.assigned", "warning", f"You were assigned {app_pdfs.ref_no}", app_pdfs.id, 1),
        (comp1.id, "compliance.overdue", "critical", f"{ob1.ref_no} overdue by 10 days", None, 2),
        (u_lake.id, "application.stage_update", "info",
         f"{app_clarif.ref_no}: clarification requested", app_clarif.id, 3),
        (evc1.id, "evc_scheduling_required", "warning",
         "EVC scheduling required for Lakeside (demo)", app_evc_ready.id, 4),
        (u_lake.id, "compliance.due_soon", "warning", f"{ob2.ref_no} due in 3 days", app_clarif.id, 5),
    ]
    for rid, typ, sev, title, appid, _i in demo_notifs:
        notif = M.Notification(
            recipient_id=rid, type=typ, severity=sev, title=title,
            body="Synthetic demo notification seeded at database initialization.",
            application_id=appid, is_read=False, channel="inapp", delivery_status="sent")
        db.add(notif)
        counts["notifications"] += 1

    # ------------------------------------------------------------------ regulatory rules
    rules = [
        dict(rule_key="lease_duration_min", name="Lease remaining-validity minimum (courses)", version=1,
             rule_type="lease_duration_min", params={"min_years_of_course_cover": 2.0},
             applicable_categories=["new_approval"],
             source_document_title="Verification ledger (synthetic register)",
             status="under_review", verification_status="needs_verification",
             description=("Configurable minimum remaining lease validity. The value chosen here is a "
                          "DEMO parameter. It must be cross-verified against the applicable AICTE "
                          "Approval Process Handbook clause before any official use.")),
        dict(rule_key="support_doc_validity", name="Supporting-document validity thresholds", version=1,
             rule_type="doc_validity", params={"grace_days": 30, "warn_days": 60},
             applicable_categories=["new_approval", "extension_of_approval"],
             source_document_title="Internal operating target (synthetic)",
             status="active", verification_status="internal_target",
             activated_at=utcnow(),
             description="Demo rule: warn 60 days before expiry; grace period 30 days after expiry. Internal target."),
        dict(rule_key="intake_ceiling_demo", name="Requested intake ceiling (demo)", version=1,
             rule_type="intake_ceiling", params={"max_intake": 300},
             applicable_categories=["new_approval"],
             source_document_title="Demonstration parameter (synthetic)",
             status="draft", verification_status="needs_verification",
             description="Demonstration of a parameterized threshold rule. Grain of salt: placeholder animation."),
    ]
    rule_rows = []
    for rd in rules:
        r = M.RegulatoryRule(created_by=admin.id, created_at=utcnow(), **rd)
        db.add(r)
        rule_rows.append(r)

    # ------------------------------------------------------------------ escalation policies
    db.add(M.EscalationPolicy(key="compliance_reminder", name="Compliance deadline reminders",
                              config={"reminder_days": [7, 2], "escalate_after_days": 3,
                                      "escalate_to_role": "regional_officer"}))
    db.add(M.EscalationPolicy(key="stage_deadline", name="Stage internal-target reminders",
                              config={"reminder_days": [7, 2, 0], "escalate_to_role": "regional_officer"}))
    db.add(M.SystemSetting(key="default_academic_year", value={"year": DEMO_YEAR},
                           description="Default academic year for new applications"))
    db.add(M.SystemSetting(key="demo_notice",
                           value={"text": "All seeded data is synthetic. No live AICTE integration."},
                           description="Shown in UI"))

    # finalize: token audit event for chain start
    counts["audit_chain_started"] = bool(
        audit_service.record_event(db, actor=None, actor_fallback="seed",
                                   action="seed.completed", entity_type="system"))
    db.commit()
    return counts


def main() -> None:
    configure_logging()  # so seed progress/completion is visible on stdout (JSON lines)
    parser = argparse.ArgumentParser(description="Seed synthetic demo data")
    parser.add_argument("--reset", action="store_true", help="Drop and recreate all tables first")
    args = parser.parse_args()

    import os

    os.makedirs("data", exist_ok=True)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if args.reset:
            log.info("resetting database...")
            reset(db)
        counts = seed(db)
        log.info("seed complete: %s", counts)
    finally:
        db.close()


if __name__ == "__main__":
    main()
