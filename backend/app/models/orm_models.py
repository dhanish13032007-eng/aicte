"""SQLAlchemy ORM models for the AICTE Approval Operations Intelligence Platform.

Portability notes:
- UUIDs are stored as 36-char strings so the same models run on SQLite (local
  demo) and PostgreSQL (production-style deployment via docker-compose).
- JSON columns are used where content is genuinely flexible (OCR results,
  workflow parameters). Core operational state lives in real columns.
- All timestamps are naive-UTC. Business days/calendar handling for SLAs is
  implemented in services, not in the database layer.
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Users, institutions, sessions
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    institution_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="SET NULL"), nullable=True
    )
    # Officers may be scoped to a region/jurisdiction
    region: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    institution: Mapped["Institution | None"] = relationship(back_populates="users")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Institution(Base):
    __tablename__ = "institutions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Institution identifier such as PID; format is configurable per category
    identifier: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(60), nullable=False)  # e.g. private_unaided
    institution_type: Mapped[str] = mapped_column(String(60), nullable=False)  # e.g. engineering
    state: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    region: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    users: Mapped[list[User]] = relationship(back_populates="institution")
    applications: Mapped[list["Application"]] = relationship(back_populates="institution")


# ---------------------------------------------------------------------------
# Workflow engine
# ---------------------------------------------------------------------------


class Workflow(Base):
    """A named, configurable approval workflow (e.g. 'New Approval - Full
    Lifecycle', 'Extension of Approval - Scrutiny only')."""

    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    key: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    applicable_categories: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    active_version_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    versions: Mapped[list["WorkflowVersion"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )


class WorkflowVersion(Base):
    """An immutable version of a workflow: its stage set, transitions and
    SLA targets. Applications keep a reference to the version they were
    processed under, so later edits never rewrite history."""

    __tablename__ = "workflow_versions"
    __table_args__ = (UniqueConstraint("workflow_id", "version_no", name="uq_workflow_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    workflow_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    workflow: Mapped[Workflow] = relationship(back_populates="versions")
    stages: Mapped[list["WorkflowStage"]] = relationship(
        back_populates="version", cascade="all, delete-orphan", order_by="WorkflowStage.order"
    )
    transitions: Mapped[list["WorkflowTransition"]] = relationship(
        back_populates="version", cascade="all, delete-orphan"
    )


class WorkflowStage(Base):
    __tablename__ = "workflow_stages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    version_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflow_versions.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Internal operational target in business days. Clearly an internal target,
    # NOT a statutory deadline (which must come from cited official policy).
    target_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Roles allowed to perform this stage's primary actions
    owner_roles: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Required document types before the stage can be completed
    required_doc_types: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Optional checklist template: [{key,label,required}] attached on entry
    checklist: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    version: Mapped[WorkflowVersion] = relationship(back_populates="stages")


class WorkflowTransition(Base):
    __tablename__ = "workflow_transitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    version_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflow_versions.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)  # e.g. submit_for_scrutiny
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    from_stage: Mapped[str] = mapped_column(String(80), nullable=False)
    to_stage: Mapped[str] = mapped_column(String(80), nullable=False)
    allowed_roles: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    requires_reason: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # return/reject/hold
    # Transition-level prerequisites expressed as declarative checks, e.g.
    # "checklist_complete", "required_docs_present", "evc_report_present"
    prerequisites: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Actions this transition fans out: notify, create_evc, create_compliance
    side_effects: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    version: Mapped[WorkflowVersion] = relationship(back_populates="transitions")


# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    ref_no: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    institution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # application category drives workflow + document checklist, e.g.
    # new_approval, extension_of_approval, change_of_site, clergy…
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    approval_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # programmes: [{name, level, intake}]
    programmes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    requested_intake: Mapped[int | None] = mapped_column(Integer, nullable=True)

    workflow_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflows.id", ondelete="RESTRICT"), nullable=False
    )
    workflow_version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_stage: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    # status is orthogonal to stage, e.g. (scrutiny, clarification_required)
    status: Mapped[str] = mapped_column(String(60), nullable=False, default="draft", index=True)
    state: Mapped[str] = mapped_column(String(60), nullable=False, default="open", index=True)  # open|closed
    assigned_officer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    next_action: Mapped[str | None] = mapped_column(Text, nullable=True)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    stage_started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    stage_deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    stage_return_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    decision: Mapped[str | None] = mapped_column(String(60), nullable=True)  # approved|rejected|held
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    institution: Mapped[Institution] = relationship(back_populates="applications")
    documents: Mapped[list["Document"]] = relationship(back_populates="application")
    checklist_items: Mapped[list["ChecklistItem"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )


class ChecklistItem(Base):
    """Per-application instance of the stage's configurable checklist."""

    __tablename__ = "checklist_items"
    __table_args__ = (UniqueConstraint("application_id", "key", name="uq_checklist_app_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    application_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), index=True, nullable=False
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # pending | verified | deficient | manual_review | not_applicable
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    application: Mapped[Application] = relationship(back_populates="checklist_items")


class ScrutinyNote(Base):
    __tablename__ = "scrutiny_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    application_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), index=True, nullable=False
    )
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    visibility: Mapped[str] = mapped_column(String(30), default="internal", nullable=False)  # internal|institution|all
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Documents, OCR, verification
# ---------------------------------------------------------------------------


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    application_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), nullable=True, index=True
    )
    institution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    doc_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    version_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    replaces_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("documents.id"), nullable=True)

    status: Mapped[str] = mapped_column(String(40), default="uploaded", nullable=False, index=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    is_current_version: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    application: Mapped[Application | None] = relationship(back_populates="documents")
    ocr_results: Mapped[list["OcrResult"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    verifications: Mapped[list["DocumentVerification"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class OcrResult(Base):
    __tablename__ = "ocr_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    extractor: Mapped[str] = mapped_column(String(60), nullable=False)  # pdfplumber | tesseract | none
    # queued | running | completed | failed
    status: Mapped[str] = mapped_column(String(30), default="queued", nullable=False, index=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # fields: [{key, value, confidence, page, snippet}]
    fields: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    avg_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    flags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # low_confidence, date_inconsistent...
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    parser_version: Mapped[str] = mapped_column(String(60), default="v1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    document: Mapped[Document] = relationship(back_populates="ocr_results")


class DocumentVerification(Base):
    __tablename__ = "document_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    verified_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    # verified | deficient | needs_manual_review
    decision: Mapped[str] = mapped_column(String(40), nullable=False)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    document: Mapped[Document] = relationship(back_populates="verifications")


# ---------------------------------------------------------------------------
# EVC
# ---------------------------------------------------------------------------


class EvcCase(Base):
    __tablename__ = "evc_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    application_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    # pending_prerequisites | ready_to_schedule | scheduled | in_progress |
    # awaiting_report | completed | cancelled
    status: Mapped[str] = mapped_column(String(40), default="pending_prerequisites", nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    coordinator_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    proposed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    confirmed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reschedule_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    report_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    report_status: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)  # pending|submitted|overdue
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    application: Mapped[Application] = relationship()
    participants: Mapped[list["EvcParticipant"]] = relationship(
        back_populates="evc_case", cascade="all, delete-orphan"
    )
    schedules: Mapped[list["EvcScheduleEvent"]] = relationship(
        back_populates="evc_case", cascade="all, delete-orphan"
    )
    reports: Mapped[list["EvcReport"]] = relationship(back_populates="evc_case", cascade="all, delete-orphan")


class EvcParticipant(Base):
    __tablename__ = "evc_participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    evc_case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("evc_cases.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(60), nullable=False)  # chairperson | member | coordinator
    organization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    accepted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    evc_case: Mapped[EvcCase] = relationship(back_populates="participants")


class EvcScheduleEvent(Base):
    """Full schedule-change history for an EVC case (proposals, confirmations,
    reschedules — each with actor and reason)."""

    __tablename__ = "evc_schedule_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    evc_case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("evc_cases.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)  # proposed|confirmed|rescheduled|cancelled|visit_held
    planned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    evc_case: Mapped[EvcCase] = relationship(back_populates="schedules")


class EvcReport(Base):
    __tablename__ = "evc_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    evc_case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("evc_cases.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("documents.id"), nullable=True)
    visit_held_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(60), nullable=True)  # satisfactory|deficiencies_found|deferred
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    deficiencies: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    submitted_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    evc_case: Mapped[EvcCase] = relationship(back_populates="reports")


# ---------------------------------------------------------------------------
# Tasks, compliance
# ---------------------------------------------------------------------------


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    application_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), nullable=True, index=True
    )
    obligation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("compliance_obligations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    evc_case_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("evc_cases.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_type: Mapped[str] = mapped_column(String(60), default="review", nullable=False, index=True)
    assignee_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assignee_role: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    payload_before: Mapped[str | None] = mapped_column(String(80), nullable=True)  # stage key
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False, index=True)  # open|done|cancelled
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class ComplianceObligation(Base):
    __tablename__ = "compliance_obligations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    ref_no: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    institution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("institutions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    application_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    # source_ref: cited clause/page or internal operating procedure — free-form
    source_ref: Mapped[str | None] = mapped_column(String(400), nullable=True)
    source_type: Mapped[str] = mapped_column(String(30), default="internal_target", nullable=False)
    # internal_target | official_policy | demonstration
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    responsible_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_officer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    required_evidence: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # not_started | pending_submission | submitted | under_verification |
    # additional_info_required | verified | overdue | closed | waived
    status: Mapped[str] = mapped_column(String(40), default="not_started", nullable=False, index=True)
    reminder_days: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # e.g. [7, 2, 0]
    escalation_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    closure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    submissions: Mapped[list["ComplianceSubmission"]] = relationship(
        back_populates="obligation", cascade="all, delete-orphan"
    )
    application: Mapped["Application | None"] = relationship(viewonly=True)


class ComplianceSubmission(Base):
    __tablename__ = "compliance_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    obligation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("compliance_obligations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_document_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    submitted_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    obligation: Mapped[ComplianceObligation] = relationship(back_populates="submissions")
    verifications: Mapped[list["ComplianceVerification"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )


class ComplianceVerification(Base):
    __tablename__ = "compliance_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    submission_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("compliance_submissions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    verified_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(40), nullable=False)  # verified | deficient | needs_more_info
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    submission: Mapped[ComplianceSubmission] = relationship(back_populates="verifications")


# ---------------------------------------------------------------------------
# Notifications, escalations
# ---------------------------------------------------------------------------


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    recipient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)  # info|warning|critical
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    link_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    application_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), default="inapp", nullable=False)  # inapp|email|console
    delivery_status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    # pending|sent|failed|simulated
    delivery_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    provider_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class EscalationPolicy(Base):
    __tablename__ = "escalation_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    key: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # config: {reminder_days: [7,2,0], escalate_to_role, escalate_after_days}
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class EscalationEvent(Base):
    __tablename__ = "escalation_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    obligation_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    application_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    policy_key: Mapped[str | None] = mapped_column(String(60), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    notified_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Regulatory rules + RAG sources
# ---------------------------------------------------------------------------


class RegulatoryDocument(Base):
    __tablename__ = "regulatory_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(400), nullable=False)
    authority: Mapped[str] = mapped_column(String(255), nullable=False)
    academic_year: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    version: Mapped[str | None] = mapped_column(String(60), nullable=True)
    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    retrieval_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="current", nullable=False, index=True)  # current|archived|draft
    storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_ingested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    chunks: Mapped[list["RagChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class RegulatoryRule(Base):
    """A versioned, citable config rule. `rule_key` identifies the logical
    rule; successive versions are rows with increasing `version`, previous
    versions stay with status='retired' so historical decisions are not
    rewritten."""

    __tablename__ = "regulatory_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    rule_key: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_type: Mapped[str] = mapped_column(String(60), nullable=False)  # doc_validity | threshold | boolean | list
    params: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    applicable_categories: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # source citation
    source_document_title: Mapped[str | None] = mapped_column(String(400), nullable=True)
    clause: Mapped[str | None] = mapped_column(String(120), nullable=True)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verification_status: Mapped[str] = mapped_column(
        String(40), default="needs_verification", nullable=False
    )  # needs_verification | verified_official | internal_target
    # draft | under_review | active | retired
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False, index=True)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    academic_year: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("rule_key", "version", name="uq_rule_key_version"),)


class RuleEvaluation(Base):
    __tablename__ = "rule_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    rule_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("regulatory_rules.id", ondelete="CASCADE"), index=True, nullable=False
    )
    application_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    input: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    output: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class RagChunk(Base):
    __tablename__ = "rag_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("regulatory_documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section: Mapped[str | None] = mapped_column(String(300), nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # embedding stored as JSON list when an embedding model is configured;
    # pgvector is used on PostgreSQL deployments (see rag_service notes).
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    document: Mapped[RegulatoryDocument] = relationship(back_populates="chunks")


class AiOperation(Base):
    __tablename__ = "ai_operations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    purpose: Mapped[str] = mapped_column(String(60), nullable=False, index=True)  # summarize_document|summarize_application|draft_communication|checklist_assist|rag_answer|next_action
    provider: Mapped[str | None] = mapped_column(String(60), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    application_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    document_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    request_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="ok", nullable=False)  # ok|unconfigured|error
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Audit trail (hash-chained), settings, jobs
# ---------------------------------------------------------------------------


class AuditEvent(Base):
    """Append-only application event history with a SHA-256 hash chain.

    seq is a monotonically increasing serial number; each event stores the hash
    of the canonical serialization of the event plus the previous event hash.
    Database constraints keep the row immutable at the service level; an
    independent integrity verifier in app/services/audit_service.py detects
    tampering. (SHA-256 chaining detects *detection-capable* tampering — it is
    not a substitute for WORM storage or external checkpointing in production.)
    """

    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_actor_ts", "actor_id", "created_at"),
        Index("ix_audit_app_ts", "application_id", "created_at"),
    )

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, default=new_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    actor_fallback: Mapped[str | None] = mapped_column(String(120), nullable=True)  # e.g. "system"
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    application_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    previous_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    job_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="queued", nullable=False, index=True)  # queued|running|succeeded|failed
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=False, default=None)


class ApiIdempotency(Base):
    """Idempotency guard for sensitive POST/transition endpoints."""

    __tablename__ = "api_idempotency"

    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


# Named enums kept for reference and API docs (DB stores plain strings to stay
# portable across SQLite/PostgreSQL).
class AppStatus(enum.StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    INTAKE_VALIDATION = "intake_validation"
    AWAITING_SCRUTINY = "awaiting_scrutiny"
    UNDER_SCRUTINY = "under_scrutiny"
    CLARIFICATION_REQUIRED = "clarification_required"
    AWAITING_INSTITUTION_RESPONSE = "awaiting_institution_response"
    RE_SCRUTINY = "re_scrutiny"
    EVC_PENDING = "evc_pending"
    EVC_SCHEDULED = "evc_scheduled"
    EVC_COMPLETED = "evc_completed"
    AWAITING_REVIEW = "awaiting_review"
    AWAITING_DECISION = "awaiting_decision"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    ON_HOLD = "on_hold"
    CLOSED = "closed"


class ObligationStatus(enum.StrEnum):
    NOT_STARTED = "not_started"
    PENDING_SUBMISSION = "pending_submission"
    SUBMITTED = "submitted"
    UNDER_VERIFICATION = "under_verification"
    ADDITIONAL_INFO_REQUIRED = "additional_info_required"
    VERIFIED = "verified"
    OVERDUE = "overdue"
    CLOSED = "closed"
    WAIVED = "waived"
