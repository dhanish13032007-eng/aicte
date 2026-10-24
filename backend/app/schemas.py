"""Pydantic schemas (validation for every request body, typed responses)."""
from __future__ import annotations

from datetime import date as date_t, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth ---------------------------------------------------------------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(ORMModel):
    id: str
    email: str
    name: str
    role: str
    institution_id: str | None = None
    region: str | None = None
    is_active: bool
    must_change_password: bool = False


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


# --- users / admin -------------------------------------------------------------
class UserCreateIn(BaseModel):
    email: EmailStr
    name: str
    role: str
    password: str = Field(min_length=8)
    institution_id: str | None = None
    region: str | None = None


class UserUpdateIn(BaseModel):
    name: str | None = None
    role: str | None = None
    region: str | None = None
    is_active: bool | None = None
    institution_id: str | None = None
    new_password: str | None = Field(None, min_length=8)


class InstitutionIn(BaseModel):
    code: str
    name: str
    identifier: str | None = None
    category: str = "private_unaided"
    institution_type: str = "engineering"
    state: str
    region: str
    address: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None


# --- applications ---------------------------------------------------------------
class ProgrammeIn(BaseModel):
    name: str
    level: str = "undergraduate"
    intake: int | None = None


class ApplicationCreateIn(BaseModel):
    institution_id: str
    academic_year: str = "2024-25"
    category: str = "new_approval"
    approval_type: str | None = None
    title: str
    programmes: list[ProgrammeIn] = Field(default_factory=list)
    requested_intake: int | None = None


class ApplicationUpdateIn(BaseModel):
    title: str | None = None
    programmes: list[ProgrammeIn] | None = None
    requested_intake: int | None = None
    approval_type: str | None = None


class TransitionIn(BaseModel):
    action: str
    reason: str | None = None
    note: str | None = None


class AssignOfficerIn(BaseModel):
    officer_id: str


# --- documents -----------------------------------------------------------------
class DocumentOut(ORMModel):
    id: str
    application_id: str | None
    institution_id: str
    doc_type: str
    name: str
    mime_type: str
    size_bytes: int
    sha256: str
    version_no: int
    replaces_id: str | None
    status: str
    issue_date: date_t | None
    expiry_date: date_t | None
    is_current_version: bool
    uploaded_by: str
    created_at: datetime


class DocumentVerifyIn(BaseModel):
    decision: Literal["verified", "deficient", "needs_manual_review"]
    comments: str | None = None


# --- checklist / notes ----------------------------------------------------------
class ChecklistUpdateIn(BaseModel):
    status: Literal["pending", "verified", "deficient", "manual_review", "not_applicable"]
    note: str | None = None


class NoteIn(BaseModel):
    content: str
    visibility: Literal["internal", "institution", "all"] = "internal"


# --- EVC ------------------------------------------------------------------------
class EvcProposeIn(BaseModel):
    date: date_t
    note: str | None = None


class EvcRescheduleIn(BaseModel):
    date: date_t
    reason: str


class EvcConfirmIn(BaseModel):
    date: date_t | None = None
    note: str | None = None


class EvcParticipantIn(BaseModel):
    name: str
    role: Literal["chairperson", "member", "coordinator"]
    organization: str | None = None


class EvcReportIn(BaseModel):
    outcome: Literal["satisfactory", "deficiencies_found", "deferred"]
    summary: str | None = None
    deficiencies: list[str] = Field(default_factory=list)
    visit_held_on: date_t | None = None


# --- compliance ---------------------------------------------------------------
class ObligationCreateIn(BaseModel):
    institution_id: str
    application_id: str | None = None
    title: str
    description: str | None = None
    category: str = "undertaking"
    due_date: datetime | None = None
    assigned_officer_id: str | None = None
    source_ref: str | None = None
    source_type: Literal["internal_target", "official_policy", "demonstration"] = "internal_target"
    required_evidence: list[str] = Field(default_factory=list)
    reminder_days: list[int] | None = None


class EvidenceSubmitIn(BaseModel):
    note: str | None = None
    evidence_document_ids: list[str] = Field(default_factory=list)


class EvidenceVerifyIn(BaseModel):
    decision: Literal["verified", "deficient", "needs_more_info"]
    comments: str | None = None


# --- workflow config ------------------------------------------------------------
class StageIn(BaseModel):
    key: str
    name: str
    description: str | None = None
    target_days: int | None = None
    owner_roles: list[str] = Field(default_factory=list)
    required_doc_types: list[str] = Field(default_factory=list)
    checklist: list[dict] = Field(default_factory=list)


class TransitionIn_(BaseModel):
    action: str
    label: str
    from_stage: str
    to_stage: str
    allowed_roles: list[str] = Field(default_factory=list)
    requires_reason: bool = False
    prerequisites: list[str] = Field(default_factory=list)


class WorkflowVersionIn(BaseModel):
    change_note: str | None = None
    stages: list[StageIn]
    transitions: list[TransitionIn_]


class WorkflowIn(BaseModel):
    key: str
    name: str
    description: str | None = None
    applicable_categories: list[str] = Field(default_factory=list)


# --- rules ---------------------------------------------------------------------
class RuleFinding(BaseModel):
    requirement: str
    evidence_found: str | None = None
    location: str | None = None
    confidence: float | None = None
    suggestion: Literal["pass", "fail", "needs_human_review"]
    explanation: str | None = None


# --- misc -----------------------------------------------------------------------
class RuleCreateIn(BaseModel):
    rule_key: str
    name: str
    description: str | None = None
    rule_type: Literal["doc_validity", "lease_duration_min", "intake_ceiling"]
    params: dict = Field(default_factory=dict)
    applicable_categories: list[str] = Field(default_factory=list)
    source_document_title: str | None = None
    clause: str | None = None
    page: int | None = None
    source_url: str | None = None


class RuleSimulateIn(BaseModel):
    inputs: dict
    application_id: str | None = None


class RagDocRegisterIn(BaseModel):
    title: str
    authority: str = "AICTE"
    academic_year: str | None = None
    version: str | None = None
    publication_date: date_t | None = None
    source_url: str | None = None


class RagQuestionIn(BaseModel):
    question: str


class EscalationPolicyIn(BaseModel):
    key: str
    name: str
    config: dict


class SettingIn(BaseModel):
    key: str
    value: dict
    description: str | None = None
