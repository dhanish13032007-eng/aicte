/** Display helpers: labels and badge colours for backend enums. */

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtBytes(n: number): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function daysBetween(from: string | null | undefined, to = new Date().toISOString()): number | null {
  if (!from) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

/** Days until a future timestamp (negative = overdue). */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return "—";
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return `${days} d ago`;
  return fmtDate(value);
}

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-300",
  info: "bg-info/10 text-info border-info/30",
  success: "bg-ok/10 text-ok border-ok/30",
  warning: "bg-warn/10 text-warn border-warn/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  accent: "bg-saffron/10 text-saffron-dark border-saffron/40",
};

export function toneClass(tone: Tone): string {
  return TONES[tone] ?? TONES.neutral;
}

export const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  intake_validation: "Intake Validation",
  scrutiny: "Scrutiny",
  clarification: "Clarification",
  re_scrutiny: "Re-scrutiny",
  evc: "Expert Visit Committee",
  sac_review: "SAC/SHC Review",
  decision: "Authorized Decision",
  closed: "Closed",
};

export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  awaiting_scrutiny: { label: "Awaiting Scrutiny", tone: "info" },
  under_scrutiny: { label: "Under Scrutiny", tone: "info" },
  clarification_required: { label: "Clarification Required", tone: "warning" },
  re_scrutiny: { label: "Re-scrutiny", tone: "info" },
  evc_pending: { label: "EVC Pending", tone: "warning" },
  evc_scheduled: { label: "EVC Scheduled", tone: "info" },
  evc_in_progress: { label: "EVC In Progress", tone: "info" },
  awaiting_evc_report: { label: "Awaiting EVC Report", tone: "warning" },
  awaiting_review: { label: "Awaiting Further Review", tone: "info" },
  awaiting_decision: { label: "Awaiting Authorized Decision", tone: "accent" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  on_hold: { label: "On Hold", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
};

export const DOC_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  uploaded: { label: "Uploaded", tone: "neutral" },
  ocr_pending: { label: "OCR Pending", tone: "info" },
  ocr_completed: { label: "OCR Completed", tone: "info" },
  needs_manual_review: { label: "Needs Manual Review", tone: "warning" },
  verification_pending: { label: "Verification Pending", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  deficient: { label: "Deficient", tone: "danger" },
  replaced: { label: "Replaced", tone: "neutral" },
  expired: { label: "Expired", tone: "danger" },
};

export const OB_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: "Not Started", tone: "neutral" },
  pending_submission: { label: "Pending Submission", tone: "warning" },
  submitted: { label: "Submitted", tone: "info" },
  under_verification: { label: "Under Verification", tone: "info" },
  additional_info_required: { label: "Additional Information Required", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },
  closed: { label: "Closed", tone: "neutral" },
  waived: { label: "Waived (authorized)", tone: "neutral" },
};

export const EVC_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ready_to_schedule: { label: "Ready to Schedule", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "info" },
  in_progress: { label: "Visit In Progress", tone: "info" },
  awaiting_report: { label: "Awaiting Report", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const RISK_TONE: Record<string, Tone> = {
  Low: "success",
  Medium: "info",
  High: "warning",
  Critical: "danger",
};

export const CHECKLIST_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "neutral" },
  verified: { label: "Verified", tone: "success" },
  deficient: { label: "Deficient", tone: "danger" },
  manual_review: { label: "Manual Review", tone: "warning" },
  not_applicable: { label: "Not Applicable", tone: "neutral" },
};

export const ROLE_LABELS: Record<string, string> = {
  institution: "Institution Applicant",
  scrutiny_officer: "Scrutiny Officer",
  evc_coordinator: "EVC Coordinator",
  evc_member: "EVC Member",
  sac_shc_reviewer: "SAC/SHC Review Officer",
  compliance_officer: "Compliance Officer",
  regional_officer: "Regional / Department Officer",
  approving_authority: "Senior Authority / Approving Officer",
  system_admin: "System Administrator",
  auditor: "Auditor / Read-only Reviewer",
};

export const CATEGORY_LABELS: Record<string, string> = {
  new_approval: "New Approval",
  extension_of_approval: "Extension of Approval",
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  land_document: "Land ownership / lease record",
  lease_deed: "Lease deed",
  building_safety: "Building / occupancy certificate",
  fire_safety: "Fire & safety certificate",
  affidavit: "Affidavit",
  declaration: "Institution declaration",
  intake_undertaking: "Intake undertaking",
  compliance_report: "Compliance report",
  evc_report: "EVC report",
  other: "Other",
};

export const SEVERITY_TONE: Record<string, Tone> = {
  info: "info",
  warning: "warning",
  critical: "danger",
  success: "success",
};

export { type Tone };
