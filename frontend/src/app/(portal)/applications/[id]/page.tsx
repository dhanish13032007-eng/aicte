"use client";

/** Application detail: overview, institution, workflow timeline and the
 * document/checklist/compliance/EVC/AI/audit tabs. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Layers, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";

import { api } from "../../../../lib/api";
import { useSession } from "../../../../lib/session";
import { toast } from "../../../../lib/toast";
import {
  CATEGORY_LABELS,
  CHECKLIST_META,
  daysBetween,
  daysUntil,
  fmtDate,
  fmtDateTime,
  RISK_TONE,
  STAGE_LABELS,
  STATUS_META,
} from "../../../../lib/format";
import {
  Badge,
  Card,
  ErrorState,
  KeyValue,
  Notice,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
} from "../../../../components/common/ui";
import { TransitionBar } from "../../../../components/workflow/TransitionBar";
import {
  AiTab,
  AuditTab,
  ChecklistTab,
  CommunicationsTab,
  ComplianceTab,
  DecisionsTab,
  DocumentsTab,
  EvcTab,
  TasksTab,
} from "../../../../components/applications/detail/Tabs";
import type { ApplicationDetail, Institution } from "../../../../lib/types";

const STAGES = [
  "draft",
  "intake_validation",
  "scrutiny",
  "clarification",
  "re_scrutiny",
  "evc",
  "sac_review",
  "decision",
  "closed",
];

function AssignOfficer({ appId, current }: { appId: string; current?: { id: string; name: string } | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: officers } = useQuery<{ id: string; name: string; role_label: string; region?: string | null }[]>({
    queryKey: ["officers"],
    queryFn: () => api("/admin/officers"),
    enabled: !!current || true,
    retry: false,
  });
  const [selected, setSelected] = useState("");

  if (officers === undefined) return null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="assign-officer" className="label">
          Assign officer
        </label>
        <select id="assign-officer" className="input w-auto" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select officer…</option>
          {officers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} — {o.role_label}
              {o.region ? ` (${o.region})` : ""}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn-secondary"
        disabled={!selected || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/applications/${appId}/assign`, { method: "POST", json: { officer_id: selected } });
            toast("Officer assigned; task and notification created", "success");
            await qc.invalidateQueries({ queryKey: ["app", appId] });
          } catch (e) {
            toast(e instanceof Error ? e.message : "Assignment failed", "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <UserCheck className="h-4 w-4" aria-hidden />
        {busy ? "Assigning…" : "Assign"}
      </button>
      {current && <p className="text-xs text-textmuted">Currently: {current.name}</p>}
    </div>
  );
}

function Detail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, can } = useSession();
  const [tab, setTab] = useState("overview");

  const { data: app, isLoading, error, refetch } = useQuery<ApplicationDetail>({
    queryKey: ["app", id],
    queryFn: () => api(`/applications/${id}`),
  });

  const { data: institutions } = useQuery<Institution[]>({
    queryKey: ["institutions"],
    queryFn: () => api("/admin/institutions"),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="card">
        <Skeleton rows={8} />
      </div>
    );
  }
  if (error || !app) {
    return (
      <Card>
        <ErrorState
          message={
            (error as { status?: number })?.status === 403
              ? "You are not authorized to view this application (record-level access is enforced server-side)."
              : "Application not found or not accessible to your account."
          }
          onRetry={refetch}
        />
      </Card>
    );
  }

  const institution = institutions?.find((i) => i.id === app.institution_id);
  const daysInStage = daysBetween(app.stage_started_at);
  const daysLeft = daysUntil(app.stage_deadline);
  const overdue = daysLeft !== null && daysLeft < 0;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "institution", label: "Institution" },
    { key: "timeline", label: "Workflow timeline" },
    { key: "documents", label: "Documents", count: undefined },
    { key: "checklist", label: "Scrutiny checklist", count: app.checklist.length },
    { key: "evc", label: "EVC" },
    { key: "compliance", label: "Compliance" },
    { key: "communications", label: "Communications", count: app.notes.length },
    { key: "tasks", label: "Tasks", count: app.tasks.length },
    { key: "ai", label: "AI summary" },
    { key: "decisions", label: "Decisions" },
    { key: "audit", label: "Audit events", count: app.audit_events.length },
  ];

  const workflowEvents = [...app.audit_events]
    .filter((e) => e.action.startsWith("workflow.") || e.action.startsWith("application."))
    .sort((a, b) => a.seq - b.seq);

  return (
    <div>
      <PageHeader
        title={app.ref_no}
        description={app.title}
        breadcrumb={[
          { label: "Overview", href: "/dashboard" },
          { label: "Applications", href: "/applications" },
          { label: app.ref_no },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
            </button>
            {can("application.edit_draft") && ["draft", "clarification"].includes(app.current_stage) && (
              <Badge tone="info">Editable at this stage</Badge>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge meta={STATUS_META} value={app.status} />
        <Badge tone="info">Stage: {STAGE_LABELS[app.current_stage] ?? app.current_stage}</Badge>
        <Badge tone={app.risk.risk ? RISK_TONE[app.risk.risk] : "neutral"}>
          Delay risk: {app.risk.risk} ({app.risk.score})
        </Badge>
        {app.assigned_officer ? (
          <Badge tone="neutral">Owner: {app.assigned_officer.name}</Badge>
        ) : (
          <Badge tone="warning">Unassigned</Badge>
        )}
        {overdue && <Badge tone="danger">Stage target exceeded by {Math.abs(daysLeft!)}d</Badge>}
        {app.state === "closed" && <Badge tone="neutral">Closed</Badge>}
      </div>

      {app.status === "clarification_required" && (
        <Notice kind="warning" className="mb-4">
          This case is waiting for an institution response. Officers can still review documents; the institution must
          submit the clarification for the case to proceed.
        </Notice>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="mt-4 space-y-4">
        {tab === "overview" && (
          <>
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Card title="Case overview">
                <div className="p-4">
                  <KeyValue
                    items={[
                      { label: "Reference", value: app.ref_no },
                      { label: "Institution", value: app.institution_name ?? "—" },
                      { label: "Category", value: CATEGORY_LABELS[app.category] ?? app.category },
                      { label: "Approval / extension type", value: app.approval_type || "—" },
                      { label: "Academic year", value: app.academic_year },
                      { label: "Workflow version", value: `v${app.workflow_version_no}` },
                      { label: "Submitted", value: fmtDateTime(app.submitted_at) },
                      { label: "Current owner", value: app.assigned_officer?.name ?? "unassigned" },
                      { label: "Stage entered", value: fmtDate(app.stage_started_at) },
                      { label: "Days in current stage", value: daysInStage ?? "—" },
                      {
                        label: "Stage deadline (internal target)",
                        value: (
                          <span className={overdue ? "font-semibold text-danger" : ""}>
                            {fmtDate(app.stage_deadline)}
                            {daysLeft !== null && ` (${daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`})`}
                          </span>
                        ),
                      },
                      { label: "Times returned", value: app.stage_return_count ?? 0 },
                      { label: "Last action", value: fmtDateTime(app.updated_at) },
                    ]}
                  />
                  <div className="mt-4">
                    <p className="label">Programmes & requested intake</p>
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Programme</th>
                          <th className="th">Level</th>
                          <th className="th text-right">Intake</th>
                        </tr>
                      </thead>
                      <tbody>
                        {app.programmes.map((p, i) => (
                          <tr key={i}>
                            <td className="td">{p.name}</td>
                            <td className="td text-textmuted">{p.level}</td>
                            <td className="td text-right">{p.intake ?? "—"}</td>
                          </tr>
                        ))}
                        {app.programmes.length === 0 && (
                          <tr>
                            <td className="td" colSpan={3}>
                              No programmes recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>

              <div className="space-y-4">
                <Card title="Delay-risk explanation" description="Deterministic signals with evidence — operational prioritization only">
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text">Category</span>
                      <Badge tone={RISK_TONE[app.risk.risk] ?? "neutral"}>{app.risk.risk}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text">Score</span>
                      <span className="text-sm font-semibold">{app.risk.score}</span>
                    </div>
                    <ul className="space-y-2 border-t border-line pt-3">
                      {app.risk.factors.length === 0 && <li className="text-sm text-textmuted">No risk signals fired.</li>}
                      {app.risk.factors.map((f) => (
                        <li key={f.factor} className="text-xs">
                          <span className="font-semibold text-text">{f.factor}</span>{" "}
                          <span className="text-saffron-dark">(+{f.points})</span>
                          <p className="text-textmuted">{f.detail}</p>
                          {f.evidence && (
                            <pre className="mt-0.5 overflow-x-auto rounded bg-navy-50/70 p-1.5 text-[10px] text-textmuted">
                              {JSON.stringify(f.evidence)}
                            </pre>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="rounded border border-line bg-navy-50/60 p-2 text-xs">
                      <span className="font-semibold text-text">Recommended next action: </span>
                      {app.risk.next_action}
                    </div>
                    <p className="text-[11px] leading-relaxed text-textmuted">{app.risk.note}</p>
                  </div>
                </Card>

                {can("application.assign_officer") && (
                  <Card title="Assignment">
                    <div className="p-4">
                      <AssignOfficer appId={app.id} current={app.assigned_officer} />
                    </div>
                  </Card>
                )}
              </div>
            </div>

            <TransitionBar applicationId={app.id} />
          </>
        )}

        {tab === "institution" && (
          <Card title="Institution information">
            {institution ? (
              <div className="p-4">
                <KeyValue
                  items={[
                    { label: "Name", value: institution.name },
                    { label: "Code", value: institution.code },
                    { label: "PID / identifier", value: institution.identifier ?? "—" },
                    { label: "Category", value: institution.category.replace(/_/g, " ") },
                    { label: "Type", value: institution.institution_type },
                    { label: "State", value: institution.state },
                    { label: "Region / jurisdiction", value: institution.region },
                    { label: "Contact", value: institution.contact_email ?? "—" },
                    {
                      label: "Data provenance",
                      value: institution.is_synthetic ? "Synthetic demo record" : "User-registered record",
                    },
                  ]}
                />
              </div>
            ) : (
              <Skeleton rows={4} />
            )}
          </Card>
        )}

        {tab === "timeline" && (
          <Card title="Workflow timeline" description="Stage entries and material case events, oldest first">
            <ol className="relative ml-4 space-y-5 border-l border-line p-4">
              {workflowEvents.length === 0 && <li className="text-sm text-textmuted">No workflow events recorded yet.</li>}
              {workflowEvents.map((e) => (
                <li key={e.seq} className="relative pl-4">
                  <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-white bg-navy-700" aria-hidden />
                  <p className="text-sm font-semibold text-text">{e.action.replace(/^workflow\./, "")}</p>
                  <p className="text-xs text-textmuted">
                    {fmtDateTime(e.ts)} · {e.actor ?? "system"} · {e.actor_role ?? ""}
                  </p>
                  {e.reason && <p className="mt-0.5 text-xs text-text">Reason: {e.reason}</p>}
                  {e.new_state && (
                    <p className="mt-0.5 text-xs text-textmuted">
                      {(() => {
                        const ns = e.new_state as { stage?: string; status?: string };
                        return [ns.stage && `stage → ${ns.stage}`, ns.status && `status → ${ns.status}`]
                          .filter(Boolean)
                          .join(" · ");
                      })()}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        )}

        {tab === "documents" && <DocumentsTab app={app} />}
        {tab === "checklist" && <ChecklistTab app={app} />}
        {tab === "evc" && <EvcTab app={app} />}
        {tab === "compliance" && <ComplianceTab app={app} />}
        {tab === "communications" && <CommunicationsTab app={app} />}
        {tab === "tasks" && <TasksTab app={app} />}
        {tab === "ai" && <AiTab app={app} />}
        {tab === "decisions" && <DecisionsTab app={app} />}
        {tab === "audit" && <AuditTab app={app} />}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-textmuted">
        <Link href="/applications" className="inline-flex items-center gap-1 text-navy-600 hover:underline">
          <ArrowLeft className="h-3 w-3" aria-hidden /> Back to registry
        </Link>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Every action on this page is authorized server-side and
          recorded in the audit trail.
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3" aria-hidden /> Stage deadlines are internal operational targets.
        </span>
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3 w-3" aria-hidden /> Workflow v{app.workflow_version_no} · checklist items{" "}
          {app.checklist.length}
        </span>
      </div>
    </div>
  );
}

export default function ApplicationDetailPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" />}>
      <Detail />
    </Suspense>
  );
}
