"""Role and permission definitions.

Roles are coarse; permissions are fine-grained capabilities checked on every
sensitive endpoint. Permissions are ALWAYS enforced server-side in
`app/api/deps.py`; the frontend merely reflects them.
"""
from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    INSTITUTION = "institution"
    SCRUTINY_OFFICER = "scrutiny_officer"
    EVC_COORDINATOR = "evc_coordinator"
    EVC_MEMBER = "evc_member"
    REVIEW_OFFICER = "sac_shc_reviewer"
    COMPLIANCE_OFFICER = "compliance_officer"
    REGIONAL_OFFICER = "regional_officer"
    APPROVING_AUTHORITY = "approving_authority"
    SYSTEM_ADMIN = "system_admin"
    AUDITOR = "auditor"


ROLE_LABELS: dict[str, str] = {
    Role.INSTITUTION.value: "Institution Applicant",
    Role.SCRUTINY_OFFICER.value: "Scrutiny Officer",
    Role.EVC_COORDINATOR.value: "EVC Coordinator",
    Role.EVC_MEMBER.value: "EVC Member",
    Role.REVIEW_OFFICER.value: "SAC/SHC Review Officer",
    Role.COMPLIANCE_OFFICER.value: "Compliance Officer",
    Role.REGIONAL_OFFICER.value: "Regional / Department Officer",
    Role.APPROVING_AUTHORITY.value: "Senior Authority / Approving Officer",
    Role.SYSTEM_ADMIN.value: "System Administrator",
    Role.AUDITOR.value: "Auditor / Read-only Reviewer",
}


class Perm(StrEnum):
    # applications
    APPLICATION_VIEW_ALL = "application.view_all"
    APPLICATION_VIEW_OWN_INSTITUTION = "application.view_own_institution"
    APPLICATION_VIEW_ASSIGNED = "application.view_assigned_or_jurisdiction"
    APPLICATION_CREATE = "application.create"
    APPLICATION_EDIT_DRAFT = "application.edit_draft"
    APPLICATION_SUBMIT = "application.submit"
    APPLICATION_ASSIGN_OFFICER = "application.assign_officer"
    APPLICATION_CSV_EXPORT = "application.csv_export"
    # workflow
    WORKFLOW_ACT_SCRUTINY = "workflow.act_scrutiny"
    WORKFLOW_ACT_CLARIFY = "workflow.act_clarify"
    WORKFLOW_ACT_INSTITUTION_RESPOND = "workflow.act_institution_respond"
    WORKFLOW_ACT_EVC = "workflow.act_evc"
    WORKFLOW_ACT_SAC_REVIEW = "workflow.act_sac_review"
    WORKFLOW_ACT_DECIDE = "workflow.act_decide"
    WORKFLOW_ACT_ADMIN_VALIDATE = "workflow.act_admin_validate"
    # documents
    DOC_UPLOAD = "doc.upload"
    DOC_VIEW_ALL = "doc.view_all"
    DOC_VERIFY = "doc.verify"
    DOC_RUN_OCR = "doc.run_ocr"
    # EVC
    EVC_VIEW_ALL = "evc.view_all"
    EVC_SCHEDULE = "evc.schedule"
    EVC_RECORD_VISIT = "evc.record_visit"
    EVC_SUBMIT_REPORT = "evc.submit_report"
    # compliance
    COMPLIANCE_VIEW_ALL = "compliance.view_all"
    COMPLIANCE_VIEW_OWN = "compliance.view_own_institution"
    COMPLIANCE_SUBMIT_EVIDENCE = "compliance.submit_evidence"
    COMPLIANCE_VERIFY = "compliance.verify"
    COMPLIANCE_CREATE = "compliance.create"
    COMPLIANCE_ESCALATE = "compliance.escalate"
    # dashboards / reports / analytics
    DASH_EXECUTIVE = "dash.executive"
    DASH_OFFICER = "dash.officer"
    DASH_INSTITUTION = "dash.institution"
    DASH_COMPLIANCE = "dash.compliance"
    REPORTS_VIEW = "reports.view"
    # AI / RAG
    AI_USE = "ai.use"
    RAG_QUERY = "rag.query"
    RAG_INGEST = "rag.ingest"
    # admin / config
    USERS_MANAGE = "admin.users_manage"
    WORKFLOW_CONFIG = "admin.workflow_config"
    RULES_MANAGE = "admin.rules_manage"
    RULES_SIMULATE = "admin.rules_simulate"
    SETTINGS_MANAGE = "admin.settings_manage"
    NOTIFICATION_POLICY_MANAGE = "admin.notification_policy_manage"
    # audit
    AUDIT_VIEW_ALL = "audit.view_all"
    AUDIT_VIEW_EVENTS = "audit.view_own_scope_events"
    AUDIT_EXPORT = "audit.export"


ROLE_PERMISSIONS: dict[str, set[str]] = {
    Role.INSTITUTION.value: {
        Perm.APPLICATION_VIEW_OWN_INSTITUTION,
        Perm.APPLICATION_CREATE,
        Perm.APPLICATION_EDIT_DRAFT,
        Perm.APPLICATION_SUBMIT,
        Perm.WORKFLOW_ACT_INSTITUTION_RESPOND,
        Perm.DOC_UPLOAD,
        Perm.COMPLIANCE_VIEW_OWN,
        Perm.COMPLIANCE_SUBMIT_EVIDENCE,
        Perm.DASH_INSTITUTION,
        Perm.AI_USE,
        Perm.RAG_QUERY,
        Perm.AUDIT_VIEW_EVENTS,
        Perm.REPORTS_VIEW,
    },
    Role.SCRUTINY_OFFICER.value: {
        Perm.APPLICATION_VIEW_ASSIGNED,
        Perm.WORKFLOW_ACT_ADMIN_VALIDATE,
        Perm.WORKFLOW_ACT_SCRUTINY,
        Perm.WORKFLOW_ACT_CLARIFY,
        Perm.DOC_VIEW_ALL,
        Perm.DOC_VERIFY,
        Perm.DOC_RUN_OCR,
        Perm.DASH_OFFICER,
        Perm.AI_USE,
        Perm.RAG_QUERY,
        Perm.AUDIT_VIEW_EVENTS,
        Perm.REPORTS_VIEW,
        Perm.APPLICATION_CSV_EXPORT,
    },
    Role.EVC_COORDINATOR.value: {
        Perm.APPLICATION_VIEW_ASSIGNED,
        Perm.EVC_VIEW_ALL,
        Perm.EVC_SCHEDULE,
        Perm.EVC_RECORD_VISIT,
        Perm.EVC_SUBMIT_REPORT,
        Perm.WORKFLOW_ACT_EVC,
        Perm.DOC_VIEW_ALL,
        Perm.DASH_OFFICER,
        Perm.AI_USE,
        Perm.RAG_QUERY,
        Perm.AUDIT_VIEW_EVENTS,
        Perm.REPORTS_VIEW,
    },
    Role.EVC_MEMBER.value: {
        Perm.APPLICATION_VIEW_ASSIGNED,
        Perm.EVC_VIEW_ALL,
        Perm.EVC_RECORD_VISIT,
        Perm.DASH_OFFICER,
        Perm.RAG_QUERY,
        Perm.AUDIT_VIEW_EVENTS,
    },
    Role.REVIEW_OFFICER.value: {
        Perm.APPLICATION_VIEW_ASSIGNED,
        Perm.WORKFLOW_ACT_SAC_REVIEW,
        Perm.WORKFLOW_ACT_CLARIFY,
        Perm.DOC_VIEW_ALL,
        Perm.DASH_OFFICER,
        Perm.AI_USE,
        Perm.RAG_QUERY,
        Perm.AUDIT_VIEW_EVENTS,
        Perm.REPORTS_VIEW,
    },
    Role.COMPLIANCE_OFFICER.value: {
        Perm.APPLICATION_VIEW_ASSIGNED,
        Perm.COMPLIANCE_VIEW_ALL,
        Perm.COMPLIANCE_VERIFY,
        Perm.COMPLIANCE_CREATE,
        Perm.COMPLIANCE_ESCALATE,
        Perm.DOC_VIEW_ALL,
        Perm.DASH_OFFICER,
        Perm.DASH_COMPLIANCE,
        Perm.AI_USE,
        Perm.RAG_QUERY,
        Perm.AUDIT_VIEW_EVENTS,
        Perm.REPORTS_VIEW,
        Perm.APPLICATION_CSV_EXPORT,
    },
    Role.REGIONAL_OFFICER.value: {
        Perm.APPLICATION_VIEW_ASSIGNED,
        Perm.APPLICATION_ASSIGN_OFFICER,
        Perm.COMPLIANCE_VIEW_ALL,
        Perm.EVC_VIEW_ALL,
        Perm.DOC_VIEW_ALL,
        Perm.DASH_EXECUTIVE,
        Perm.DASH_COMPLIANCE,
        Perm.REPORTS_VIEW,
        Perm.APPLICATION_CSV_EXPORT,
        Perm.AI_USE,
        Perm.RAG_QUERY,
        Perm.RULES_SIMULATE,
        Perm.AUDIT_VIEW_EVENTS,
    },
    Role.APPROVING_AUTHORITY.value: {
        Perm.APPLICATION_VIEW_ALL,
        Perm.APPLICATION_ASSIGN_OFFICER,
        Perm.WORKFLOW_ACT_DECIDE,
        Perm.WORKFLOW_ACT_CLARIFY,
        Perm.COMPLIANCE_VIEW_ALL,
        Perm.EVC_VIEW_ALL,
        Perm.DOC_VIEW_ALL,
        Perm.DASH_EXECUTIVE,
        Perm.REPORTS_VIEW,
        Perm.APPLICATION_CSV_EXPORT,
        Perm.AI_USE,
        Perm.RAG_QUERY,
        Perm.AUDIT_VIEW_ALL,
        Perm.AUDIT_EXPORT,
    },
    Role.SYSTEM_ADMIN.value: {
        # NOTE: deliberately does NOT include WORKFLOW_ACT_DECIDE — administrators
        # must not inherit statutory approval powers.
        Perm.APPLICATION_VIEW_ALL,
        Perm.APPLICATION_ASSIGN_OFFICER,
        Perm.USERS_MANAGE,
        Perm.WORKFLOW_CONFIG,
        Perm.RULES_MANAGE,
        Perm.RULES_SIMULATE,
        Perm.SETTINGS_MANAGE,
        Perm.NOTIFICATION_POLICY_MANAGE,
        Perm.COMPLIANCE_VIEW_ALL,
        Perm.COMPLIANCE_CREATE,
        Perm.EVC_VIEW_ALL,
        Perm.DOC_VIEW_ALL,
        Perm.DOC_RUN_OCR,
        Perm.RAG_INGEST,
        Perm.DASH_EXECUTIVE,
        Perm.DASH_COMPLIANCE,
        Perm.REPORTS_VIEW,
        Perm.APPLICATION_CSV_EXPORT,
        Perm.AI_USE,
        Perm.RAG_QUERY,
        Perm.AUDIT_VIEW_ALL,
        Perm.AUDIT_VIEW_EVENTS,
        Perm.AUDIT_EXPORT,
    },
    Role.AUDITOR.value: {
        Perm.APPLICATION_VIEW_ALL,
        Perm.COMPLIANCE_VIEW_ALL,
        Perm.EVC_VIEW_ALL,
        Perm.DOC_VIEW_ALL,
        Perm.REPORTS_VIEW,
        Perm.APPLICATION_CSV_EXPORT,
        Perm.AUDIT_VIEW_ALL,
        Perm.AUDIT_EXPORT,
        Perm.RAG_QUERY,
        Perm.DASH_EXECUTIVE,
    },
}


def role_has(role: str, perm: str) -> bool:
    return perm in ROLE_PERMISSIONS.get(role, set())


def permissions_for_role(role: str) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(role, set()))
