"""Document service: secure storage, validation, versioning, downloads.

Storage backends:
- LocalStorage (default): private on-disk directory, never web-served.
- S3Storage (S3_ENABLED=true): private S3/MinIO bucket; no public URLs.
Downloads always go through this service and require record-level permission
checks performed by the API layer.
"""
from __future__ import annotations

import hashlib
import os
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.orm_models import Application, Document, User, utcnow


class StorageBackend:
    def put(self, key: str, content: bytes) -> None:  # pragma: no cover - interface
        raise NotImplementedError

    def get(self, key: str) -> bytes:  # pragma: no cover
        raise NotImplementedError


class LocalStorage(StorageBackend):
    def _root(self) -> str:
        root = os.path.abspath(settings.LOCAL_UPLOAD_DIR)
        os.makedirs(root, exist_ok=True)
        return root

    def put(self, key: str, content: bytes) -> None:
        path = os.path.join(self._root(), key.replace("/", os.sep))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(content)

    def get(self, key: str) -> bytes:
        path = os.path.join(self._root(), key.replace("/", os.sep))
        with open(path, "rb") as fh:
            return fh.read()


class S3Storage(StorageBackend):
    def __init__(self):
        import boto3  # imported lazily so local mode needs no credentials

        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
        self.bucket = settings.S3_BUCKET

    def put(self, key: str, content: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content)

    def get(self, key: str) -> bytes:
        resp = self.client.get_object(Bucket=self.bucket, Key=key)
        return resp["Body"].read()


def storage() -> StorageBackend:
    return S3Storage() if settings.S3_ENABLED else LocalStorage()


# --- upload validation -------------------------------------------------------

DISALLOWED_EXT_MESSAGE = "File type not permitted. Allowed: PDF, PNG, JPG, TIFF"


def validate_upload(file: UploadFile, content: bytes) -> None:
    if file.filename and "." in file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
    else:
        ext = ""
    if ext not in settings.ALLOWED_UPLOAD_EXT:
        raise HTTPException(status_code=400, detail=DISALLOWED_EXT_MESSAGE)
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.MAX_UPLOAD_MB} MB limit")
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")


def sniff_signature(content: bytes, ext: str) -> bool:
    """Best-effort magic-byte verification (extension/MIME alone is not trusted)."""
    sigs = {
        b"%PDF": ".pdf",
        b"\x89PNG": ".png",
        b"\xff\xd8\xff": ".jpg",
        b"\xff\xd8\xff": ".jpeg",
    }
    for sig, e in sigs.items():
        if content.startswith(sig) and e in {ext.lstrip("."), ext}:
            return True
    return content.startswith(b"II") or content.startswith(b"MM")  # TIFF


# --- document operations ------------------------------------------------------


def create_document(
    db: Session,
    *,
    institution_id: str,
    application_id: str | None,
    doc_type: str,
    name: str,
    file: UploadFile,
    content: bytes,
    uploaded_by: str,
    issue_date=None,
    expiry_date=None,
    replaces_id: str | None = None,
) -> Document:
    validate_upload(file, content)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if not sniff_signature(content, ext):
        raise HTTPException(status_code=400, detail="File content does not match its extension; upload rejected")

    key = f"{institution_id}/{uuid.uuid4().hex}{ext}"
    storage().put(key, content)
    sha = hashlib.sha256(content).hexdigest()

    version_no = 1
    if replaces_id:
        prior = db.get(Document, replaces_id)
        if prior is None or not prior.is_current_version:
            raise HTTPException(status_code=400, detail="Document to replace not found or already replaced")
        prior.is_current_version = False
        prior.status = "replaced"
        version_no = prior.version_no + 1

    doc = Document(
        institution_id=institution_id,
        application_id=application_id,
        doc_type=doc_type,
        name=name,
        storage_key=key,
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        sha256=sha,
        version_no=version_no,
        replaces_id=replaces_id,
        status="ocr_pending",
        issue_date=issue_date,
        expiry_date=expiry_date,
        uploaded_by=uploaded_by,
    )
    db.add(doc)
    db.flush()
    return doc


def get_download(
    db: Session, *, user: User, document_id: str
) -> tuple[Document, bytes]:
    """Returns (document, bytes) after record-level permission enforcement
    (authorization logic lives in the caller/deps — this function assumes the
    permission check has been applied)."""
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        content = storage().get(doc.storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Stored file missing")
    return doc, content


def replace(
    db: Session,
    *,
    user: User,
    document_id: str,
    doc_type: str | None,
    name: str | None,
    file: UploadFile,
    content: bytes,
) -> Document:
    from app.services import audit_service

    old = db.get(Document, document_id)
    if old is None or not old.is_current_version:
        raise HTTPException(status_code=404, detail="Document not found or not current")
    new = create_document(
        db,
        institution_id=old.institution_id,
        application_id=old.application_id,
        doc_type=doc_type or old.doc_type,
        name=name or old.name,
        file=file,
        content=content,
        uploaded_by=user.id,
        replaces_id=old.id,
    )
    audit_service.record_event(
        db,
        actor=user,
        action="document.replaced",
        entity_type="document",
        entity_id=old.id,
        application_id=old.application_id,
        previous_state={"version": old.version_no, "sha256": old.sha256},
        new_state={"version": new.version_no, "sha256": new.sha256},
    )
    return new


# --- document validation panels ------------------------------------------------


def flags_for_document(doc: Document, today=None) -> list[str]:
    from datetime import date

    today = today or date.today()
    flags: list[str] = []
    if doc.expiry_date:
        if doc.expiry_date < today:
            flags.append("expired")
        elif (doc.expiry_date - today).days <= 60:
            flags.append("expiry_approaching")
    if doc.status == "deficient":
        flags.append("deficiency_recorded")
    return flags


def required_doc_types_for_version(db: Session, app: Application) -> list[str]:
    from app.services.workflow_engine import WorkflowEngine

    stage = WorkflowEngine(db).stage(app, key="draft") or WorkflowEngine(db).stage(app)
    if stage is None:
        return []
    engine = WorkflowEngine(db)
    types: list[str] = []
    for st in engine.version(app).stages:
        types.extend(st.required_doc_types or [])
    return sorted(set(types))
