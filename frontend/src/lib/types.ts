/** Shared API response types (kept intentionally loose where the backend
 * returns richer/dynamic payloads). */

export type Role =
  | "institution"
  | "scrutiny_officer"
  | "evc_coordinator"
  | "evc_member"
  | "sac_shc_reviewer"
  | "compliance_officer"
  | "regional_officer"
  | "approving_authority"
  | "system_admin"
  | "auditor";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  institution_id?: string | null;
  region?: string | null;
  is_active: boolean;
  must_change_password?: boolean;
  permissions: string[];
}

export interface Programme {
  name: string;
  level?: string;
  intake?: number | null;
}

export interface ApplicationSummary {
  id: string;
  ref_no: string;
  institution_id: string;
  institution_name?: string | null;
  academic_year: string;
  category: string;
  approval_type?: string | null;
  title: string;
  programmes: Programme[];
  requested_intake?: number | null;
  workflow_id?: string;
  workflow_version_no?: number;
  current_stage: string;
  status: string;
  state: string;
  assigned_officer?: { id: string; name: string; role: string } | null;
  submitted_at?: string | null;
  stage_started_at?: string | null;
  stage_deadline?: string | null;
  stage_return_count?: number;
  decision?: string | null;
  decision_reason?: string | null;
  decision_at?: string | null;
  created_at?: string;
  updated_at?: string;
  days_in_stage?: number;
  days_to_stage_deadline?: number | null;
}

export interface WorkflowAction {
  action: string;
  label: string;
  to_stage: string;
  requires_reason: boolean;
  allowed: boolean;
  blocked_reason?: string | null;
}

export interface ChecklistItem {
  id: string;
  key: string;
  label: string;
  required: boolean;
  status: string;
  note?: string | null;
  reviewed_at?: string | null;
}

export interface RiskFactor {
  factor: string;
  points: number;
  detail: string;
  evidence?: Record<string, unknown> | null;
}

export interface RiskResult {
  application_id: string;
  ref_no?: string;
  stage: string;
  status: string;
  risk: "Low" | "Medium" | "High" | "Critical";
  score: number;
  factors: RiskFactor[];
  next_action: string;
  computed_at: string;
  weights_version?: string;
  note?: string;
}

export interface AuditEventRow {
  seq: number;
  id?: string;
  ts?: string;
  action: string;
  actor_id?: string | null;
  actor?: string | null;
  actor_role?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  application_id?: string | null;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
  hash?: string;
  previous_hash?: string | null;
}

export interface ApplicationDetail extends ApplicationSummary {
  valid_actions: WorkflowAction[];
  checklist: ChecklistItem[];
  risk: RiskResult;
  audit_events: AuditEventRow[];
  notes: {
    id: string;
    author_id: string;
    author_name?: string | null;
    visibility: string;
    content: string;
    created_at: string;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    due_date?: string | null;
    assignee_name?: string | null;
  }[];
}

export interface OcrField {
  key?: string;
  value?: string | null;
  confidence?: number | null;
  page?: number | null;
  source?: string | null;
}

export interface OcrResult {
  status: string;
  extractor?: string;
  fields: OcrField[];
  flags?: string[];
  avg_confidence?: number | null;
  error?: string | null;
}

export interface DocumentRow {
  id: string;
  application_id?: string | null;
  institution_id: string;
  doc_type: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  version_no: number;
  replaces_id?: string | null;
  status: string;
  issue_date?: string | null;
  expiry_date?: string | null;
  is_current_version: boolean;
  uploaded_by: string;
  created_at: string;
  flags?: string[];
  ocr?: OcrResult | null;
  days_left?: number;
}

export interface EvcCaseRow {
  id: string;
  application_id: string;
  ref_no: string;
  institution: string;
  stage?: string;
  status: string;
  coordinator?: { id: string; name: string } | null;
  proposed_date?: string | null;
  confirmed_date?: string | null;
  reschedule_count?: number;
  report_due_date?: string | null;
  report_status?: string;
  flags?: string[];
  updated_at?: string;
}

export interface EvcCaseDetail extends EvcCaseRow {
  reason?: string | null;
  notes?: string | null;
  participants: {
    id: string;
    name: string;
    role: string;
    organization?: string | null;
    invited?: boolean;
    accepted?: boolean;
  }[];
  schedule_events: {
    id: string;
    event_type: string;
    planned_date?: string | null;
    reason?: string | null;
    created_at: string;
    actor?: string | null;
  }[];
  reports: {
    id: string;
    outcome: string;
    summary?: string | null;
    deficiencies?: string[];
    visit_held_on?: string | null;
    submitted_by?: string | null;
    submitted_at?: string;
  }[];
}

export interface ObligationRow {
  id: string;
  ref_no: string;
  institution_id: string;
  institution?: string | null;
  application_id?: string | null;
  application_ref?: string | null;
  title: string;
  description?: string | null;
  category: string;
  source_ref?: string | null;
  source_type?: string;
  due_date?: string | null;
  days_left?: number | null;
  status: string;
  assigned_officer?: { id: string; name: string } | null;
  required_evidence: string[];
  escalation_level: number;
  created_at: string;
  closed_at?: string | null;
  submissions?: {
    id: string;
    note?: string | null;
    evidence_document_ids: string[];
    submitted_at: string;
    verifications: {
      decision: string;
      comments?: string | null;
      created_at: string;
      verified_by?: string | null;
    }[];
  } | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  severity: string;
  title: string;
  body?: string | null;
  link_path?: string | null;
  is_read: boolean;
  channel: string;
  delivery_status: string;
  created_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  task_type: string;
  status: string;
  due_date?: string | null;
  overdue: boolean;
  created_at: string;
  completed_at?: string | null;
  assignee?: { id: string; name: string } | null;
  application?: { id: string; ref_no: string; stage: string; status: string } | null;
  obligation?: { id: string; ref_no: string; title: string; status: string } | null;
  evc_case?: { id: string; status: string } | null;
}

export interface Institution {
  id: string;
  code: string;
  name: string;
  identifier?: string | null;
  category: string;
  institution_type: string;
  state: string;
  region: string;
  contact_email?: string | null;
  is_synthetic?: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  institution?: string | null;
  region?: string | null;
  is_active: boolean;
  must_change_password?: boolean;
  created_at?: string;
  last_login_at?: string | null;
  active_sessions?: number;
}

export interface WorkflowConfig {
  id: string;
  key: string;
  name: string;
  active_version_no?: number | null;
  applicable_categories: string[];
  versions: {
    version_no: number;
    is_active: boolean;
    change_note?: string | null;
    stages: {
      key: string;
      name: string;
      target_days?: number | null;
      owner_roles: string[];
      required_doc_types: string[];
      checklist: { key: string; label: string; required: boolean }[];
    }[];
    transitions: {
      action: string;
      label: string;
      from_stage: string;
      to_stage: string;
      allowed_roles: string[];
      requires_reason: boolean;
      prerequisites: string[];
      side_effects?: string[];
    }[];
  }[];
}

export interface RegulatoryRule {
  id: string;
  rule_key: string;
  version: number;
  name: string;
  description?: string | null;
  rule_type: string;
  params: Record<string, unknown>;
  applicable_categories: string[];
  source_document_title?: string | null;
  clause?: string | null;
  page?: number | null;
  source_url?: string | null;
  verification_status?: string | null;
  status: string;
  academic_year?: string | null;
  activated_at?: string | null;
  created_by?: string | null;
}

export interface RagSource {
  id: string;
  title: string;
  authority: string;
  academic_year?: string | null;
  version?: string | null;
  publication_date?: string | null;
  source_url?: string | null;
  retrieval_date?: string | null;
  checksum?: string | null;
  status: string;
  is_ingested: boolean;
  chunks: number;
}

export interface RagCitation {
  n: number;
  title: string;
  authority: string;
  version?: string | null;
  page: number;
  section?: string | null;
  source_url?: string | null;
  status: string;
  score: number;
  score_kind: string;
  snippet: string;
}

export interface RagAnswer {
  answer: string | null;
  abstained: boolean;
  reason?: string;
  llm_available?: boolean;
  retrieval_mode?: string;
  citations: RagCitation[];
  source_count?: number;
  provider?: string;
  model?: string;
  operation_id?: string;
}

export interface BottleneckItem {
  application_id: string;
  ref_no: string;
  institution: string;
  category: string;
  extra?: number | string | null;
  stage: string;
  status: string;
  owner?: string | null;
  owner_role?: string;
  blocked_for_days?: number | null;
  stage_deadline?: string | null;
}
