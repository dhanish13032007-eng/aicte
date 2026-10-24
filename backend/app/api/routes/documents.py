"""Document endpoints: upload, list, download, verify, OCR trigger, expiry panel."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_app_access, require_perm
from app.core.permissions import Perm
from app.db import get_db
from app.models.orm_models import (
    Application,
    BackgroundJob,
    Document,
    DocumentVerification,
    OcrResult,
    User,
    utcnow,
)
from app.schemas import DocumentOut, DocumentVerifyIn
from app.services import audit_service, document_service, notification_service, ocr_service
from fastapi import File, Form

router = APIRouter(prefix="/documents", tags=["documents"])


def _doc_out(d: Document) -> DocumentOut:
    return DocumentOut(
        id=d.id, application_id=d.application_id, institution_id=d.institution_id,
        doc_type=d.doc_type, name=d.name, mime_type=d.mime_type, size_bytes=d.size_bytes,
        sha256=d.sha256, version_no=d.version_no, replaces_id=d.replaces_id,
        status=d.status, issue_date=d.issue_date, expiry_date=d.expiry_date,
        is_current_version=d.is_current_version, uploaded_by=d.uploaded_by, created_at=d.created_at,
    )


@router.post("")
def upload_document(
    application_id: str | None = Form(None),
    doc_type: str = Form(...),
    name: str = Form(...),
    issue_date: str | None = Form(None),
    expiry_date: str | None = Form(None),
    replaces_document_id: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_perm(Perm.DOC_UPLOAD)),
):
    content = file.file.read()
    app = db.get(Application, application_id) if application_id else None
    institution_id = app.institution_id if app else user.institution_id
    if user.role == "institution" and institution_id != user.institution_id:
        raise HTTPException(status_code=403, detail="Institution users upload only for their own institution")
    if app and app.current_stage not in ("draft", "clarification", "intake_validation"):
        raise HTTPException(status_code=400,
                            detail="Documents can be uploaded in draft, intake-validation and clarification stages")
    from datetime import date

    doc = document_service.create_document(
        db,
        institution_id=institution_id,
        application_id=app.id if app else None,
        doc_type=doc_type,
        name=name,
        file=file,
        content=content,
        uploaded_by=user.id,
        issue_date=date.fromisoformat(issue_date) if issue_date else None,
        expiry_date=date.fromisoformat(expiry_date) if expiry_date else None,
        replaces_id=replaces_document_id,
    )
    audit_service.record_event(
        db, actor=user, action="document.uploaded", entity_type="document", entity_id=doc.id,
        application_id=doc.application_id,
        new_state={"doc_type": doc.doc_type, "name": doc.name, "sha256": doc.sha256[:16] + "…",
                   "version": doc.version_no},
    )
    db.commit()
    return _doc_out(doc)


@router.get("")
def list_documents(
    application_id: str | None = None,
    institution_id: str | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Document).filter(Document.is_current_version.is_(True))
    if application_id:
        app = require_app_access(application_id, user, db)
        q = q.filter(Document.application_id == app.id)
    elif institution_id:
        from app.api.deps import require_institution_access

        require_institution_access(institution_id, user, db)
        q = q.filter(Document.institution_id == institution_id)
    elif not (user.role not in ("institution",)):
        q = q.filter(Document.institution_id == user.institution_id)
    else:
        # role-scoped officers can list all non-private registry entries
        if not (user.role in ("scrutiny_officer", "compliance_officer", "system_admin",
                              "regional_officer", "approving_authority", "auditor")):
            q = q.filter(Document.institution_id == user.institution_id)
    if status_filter:
        q = q.filter(Document.status == status_filter)
    rows = q.order_by(Document.created_at.desc()).limit(200).all()
    out = []
    for d in rows:
        item = _doc_out(d).model_dump(mode="json")
        item["flags"] = document_service.flags_for_document(d)
        latest_ocr = (
            db.query(OcrResult).filter(OcrResult.document_id == d.id)
            .order_by(OcrResult.created_at.desc()).first()
        )
        item["ocr"] = (
            {"status": latest_ocr.status, "fields": latest_ocr.fields, "flags": latest_ocr.flags,
             "avg_confidence": latest_ocr.avg_confidence, "error": latest_ocr.error}
            if latest_ocr else None
        )
        out.append(item)
    return {"total": len(out), "items": out}


@router.get("/{doc_id}/download")
def download(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    # record-level authorization: institution isolation + application access
    if user.role == "institution":
        if doc.institution_id != user.institution_id:
            raise HTTPException(status_code=403, detail="Not authorized to download this document")
    else:
        if doc.application_id:
            from app.api.deps import can_view_application

            app = db.get(Application, doc.application_id)
            if not can_view_application(user, db, app):
                raise HTTPException(status_code=403, detail="Not authorized to download this document")
        elif user.role not in ("compliance_officer", "system_admin", "regional_officer",
                               "approving_authority", "auditor"):
            raise HTTPException(status_code=403, detail="Not authorized")
    data = document_service.storage().get(doc.storage_key)
    audit_service.record_event(
        db, actor=user, action="document.downloaded", entity_type="document", entity_id=doc.id,
        application_id=doc.application_id,
    )
    db.commit()
    from fastapi.responses import Response

    return Response(
        content=data,
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.name}"'},
    )


@router.put("/{doc_id}/verify")
def verify(
    doc_id: str, body: DocumentVerifyIn, db: Session = Depends(get_db),
    user: User = Depends(require_perm(Perm.DOC_VERIFY)),
):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    prev = doc.status
    if body.decision == "verified":
        doc.status = "verified"
    elif body.decision == "deficient":
        doc.status = "deficient"
    else:
        doc.status = "needs_manual_review"
    ver = DocumentVerification(
        document_id=doc.id, verified_by=user.id, decision=body.decision, comments=body.comments
    )
    db.add(ver)
    audit_service.record_event(
        db, actor=user, action="document.verdict", entity_type="document", entity_id=doc.id,
        application_id=doc.application_id,
        previous_state={"status": prev},
        new_state={"status": doc.status, "decision": body.decision, "comments": body.comments},
    )
    db.commit()
    return {"ok": True, "status": doc.status}


@router.post("/{doc_id}/ocr")
def run_ocr(
    doc_id: str, async_job: bool = False, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # permission: upload-own institution OR run_ocr permission
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.institution_id != user.institution_id and user.role not in (
        "scrutiny_officer", "system_admin", "regional_officer", "approving_authority"
    ):
        raise HTTPException(status_code=403, detail="Not authorized to run OCR for this document")
    if doc.application_id:
        from app.api.deps import can_view_application

        app = db.get(Application, doc.application_id)
        if app and not can_view_application(user, db, app):
            raise HTTPException(status_code=403, detail="Not authorized")

    if async_job:
        job = BackgroundJob(job_type="ocr", payload={"document_id": doc.id})
        db.add(job)
        db.flush()
        # in-process execution (JOB_MODE=celery would defer to a worker);
        # execution is synchronous here — honest, not a fake progress bar
        try:
            ocr = ocr_service.run_ocr(db, doc)
            job.status = "succeeded"
            job.result = {"ocr_id": ocr.id, "status": ocr.status}
        except Exception as exc:  # noqa: BLE001
            job.status = "failed"
            job.error = str(exc)[:500]
        db.commit()
        ocr = db.query(OcrResult).filter(OcrResult.document_id == doc.id).order_by(
            OcrResult.created_at.desc()).first()
    else:
        try:
            ocr = ocr_service.run_ocr(db, doc)
        except Exception as exc:  # noqa: BLE001
            doc.status = "needs_manual_review"
            ocr = OcrResult(
                document_id=doc.id, status="failed", extractor="none",
                error=str(exc)[:800], finished_at=utcnow(),
            )
            db.add(ocr)
        audit_service.record_event(
            db, actor=user, action="document.ocr_run", entity_type="document", entity_id=doc.id,
            application_id=doc.application_id,
            new_state={"ocr_status": ocr.status, "extractor": ocr.extractor},
        )
        db.commit()

    return {
        "ocr_id": ocr.id,
        "status": ocr.status,
        "extractor": ocr.extractor,
        "page_count": ocr.page_count,
        "fields": ocr.fields,
        "flags": ocr.flags,
        "avg_confidence": ocr.avg_confidence,
        "error": ocr.error,
        "note": "OCR output is an extraction aid, never proof of document authenticity. A reviewer must verify.",
    }


@router.get("/expiry/calendar")
def expiry_calendar(
    days: int = 120, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    from datetime import date

    q = db.query(Document).filter(
        Document.is_current_version.is_(True), Document.expiry_date.isnot(None))
    if user.role == "institution":
        q = q.filter(Document.institution_id == user.institution_id)
    today = date.today()
    rows = q.order_by(Document.expiry_date.asc()).all()
    items = []
    for d in rows:
        if d.expiry_date and today <= d.expiry_date <= today + timedelta(days=days) or (
            d.expiry_date and d.expiry_date < today
        ):
            item = _doc_out(d).model_dump(mode="json")
            item["days_left"] = (d.expiry_date - today).days
            item["flags"] = document_service.flags_for_document(d)
            items.append(item)
    return {"items": items}


@router.get("/{doc_id}/ocr-history")
def ocr_history(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if user.role == "institution" and doc.institution_id != user.institution_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    rows = (
        db.query(OcrResult).filter(OcrResult.document_id == doc.id)
        .order_by(OcrResult.created_at.desc()).all()
    )
    return [
        {"id": r.id, "status": r.status, "extractor": r.extractor, "fields": r.fields,
         "flags": r.flags, "avg_confidence": r.avg_confidence, "error": r.error,
         "created_at": r.created_at, "text_preview": (r.text or "")[:600]}
        for r in rows
    ]
