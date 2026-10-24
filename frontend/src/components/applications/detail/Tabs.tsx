"use client";

/** Application detail tabs: documents, checklist, communications, tasks,
 * compliance, EVC, AI assistance, decisions and audit. */
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckSquare,
  FileText,
  ListTodo,
  MessageSquarePlus,
  ScrollText,
  Send,
  Sparkles,
  Waypoints,
} from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import {
  CHECKLIST_META,
  DOC_STATUS_META,
  EVC_STATUS_META,
  OB_STATUS_META,
  fmtDateTime,
  fmtDate,
  timeAgo,
} from "../../../lib/format";
import { Badge, EmptyState, Field, Notice, Skeleton, StatusBadge } from "../../common/ui";
import { DocumentList, DocumentUpload } from "../../documents/DocumentPanels";
import type {
  ApplicationDetail,
  AuditEventRow,
  DocumentRow,
  EvcCaseRow,
  ObligationRow,
  TaskRow,
} from "../../../lib/types";

/* ------------------------------------------------------------------ documents */

export function DocumentsTab({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery<{ items: DocumentRow[] }>({
    queryKey: ["app-docs", app.id],
    queryFn: () => api("/documents", { query: { application_id: app.id } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-textmuted">
          {data?.items.length ?? 0} current document(s) · private storage · SHA-256 integrity
        </p>
        {can("doc.upload") && (
          <button type="button" className="btn-primary" onClick={() => setOpen((o) => !o)}>
            {open ? "Close upload form" : "Upload document"}
          </button>
        )}
      </div>

      {open && (
        <div className="card p-4">
          <DocumentUpload
            applicationId={app.id}
            onDone={() => {
              void qc.invalidateQueries({ queryKey: ["app-docs", app.id] });
              void refetch();
            }}
          />
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <Skeleton rows={4} />
        ) : (
          <DocumentList
            docs={data?.items ?? []}
            canVerify={can("doc.verify")}
            canOcr={can("doc.run_ocr") || can("doc.upload")}
            onChanged={() => {
              void qc.invalidateQueries({ queryKey: ["app-docs", app.id] });
            }}
            showApplication={false}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ checklist */

export function ChecklistTab({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const editable = can("workflow.act_scrutiny") && ["scrutiny", "re_scrutiny"].includes(app.current_stage);
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (itemId: string, status: string) => {
    setBusy(itemId);
    try {
      await api(`/applications/${app.id}/checklist/${itemId}`, { method: "PUT", json: { status } });
      toast("Checklist item updated", "success");
      await qc.invalidateQueries({ queryKey: ["app", app.id] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setBusy(null);
    }
  };

  if (!app.checklist.length) {
    return (
      <EmptyState
        title="No checklist attached to this stage"
        hint="Checklists are created from the stage template when a case enters a review stage."
      />
    );
  }

  const pending = app.checklist.filter((c) => c.required && ["pending", "deficient"].includes(c.status)).length;

  return (
    <div className="card">
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm font-semibold text-text">Scrutiny checklist</p>
        <p className="text-xs text-textmuted">
          {pending} required item(s) unresolved{pending > 0 ? " — the workflow blocks completion until they are resolved" : ""}
          {!editable && " · read-only for your role at this stage"}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {app.checklist.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-text">
                {item.label}{" "}
                {item.required && <Badge tone="neutral">required</Badge>}
              </p>
              {item.note && <p className="text-xs text-textmuted">Note: {item.note}</p>}
              {item.reviewed_at && (
                <p className="text-[11px] text-textmuted">Reviewed {fmtDateTime(item.reviewed_at)}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge meta={CHECKLIST_META} value={item.status} />
              {editable && (
                <select
                  aria-label={`Status for ${item.label}`}
                  className="input w-auto py-1 text-xs"
                  value={item.status}
                  disabled={busy === item.id}
                  onChange={(e) => update(item.id, e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="deficient">Deficient</option>
                  <option value="manual_review">Manual review</option>
                  <option value="not_applicable">Not applicable</option>
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ communications */

export function CommunicationsTab({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "institution" | "all">("institution");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await api(`/applications/${app.id}/notes`, { json: { content: content.trim(), visibility } });
      toast("Note recorded", "success");
      setContent("");
      await qc.invalidateQueries({ queryKey: ["app", app.id] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the note", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card space-y-3 p-4">
        <Field
          label="Add a communication / clarification note"
          htmlFor="note"
          hint={
            visibility === "internal"
              ? "Visible to officers only."
              : visibility === "institution"
                ? "Visible to the institution's users and officers."
                : "Visible to everyone with access to this case."
          }
        >
          <textarea id="note" className="input min-h-[90px]" value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-text" htmlFor="vis">
            Visibility
          </label>
          <select id="vis" className="input w-auto" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
            <option value="internal">Internal (officers)</option>
            <option value="institution">Institution & officers</option>
            {user?.role !== "institution" && <option value="all">Everyone with access</option>}
          </select>
          <button type="submit" className="btn-primary ml-auto" disabled={busy || !content.trim()}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden />
            {busy ? "Saving…" : "Post note"}
          </button>
        </div>
      </form>

      <div className="card">
        <div className="border-b border-line px-4 py-3 text-sm font-semibold text-text">
          Clarification & communication history
        </div>
        {app.notes.length === 0 ? (
          <EmptyState title="No communications yet" hint="Notes, clarification requests and responses appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {app.notes.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-text">{n.author_name ?? "Unknown"}</span>
                  <Badge tone={n.visibility === "internal" ? "neutral" : "info"}>{n.visibility}</Badge>
                  <span className="text-xs text-textmuted">{timeAgo(n.created_at)}</span>
                </div>
                <p className="prose-plain mt-1">{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tasks */

export function TasksTab({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();
  const { user } = useSession();

  const complete = async (taskId: string) => {
    try {
      await api(`/tasks/${taskId}/complete`, { method: "POST" });
      toast("Task completed", "success");
      await qc.invalidateQueries({ queryKey: ["app", app.id] });
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not complete the task", "error");
    }
  };

  if (!app.tasks.length) return <EmptyState title="No tasks on this case" />;
  return (
    <div className="card">
      <ul className="divide-y divide-line">
        {app.tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm text-text">{t.title}</p>
              <p className="text-xs text-textmuted">
                {t.assignee_name ?? "unassigned"} · due {fmtDate(t.due_date)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={t.status === "open" ? "info" : "success"}>{t.status}</Badge>
              {t.status === "open" && t.assignee_name === user?.name && (
                <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => complete(t.id)}>
                  <CheckSquare className="h-3.5 w-3.5" aria-hidden /> Mark done
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ compliance */

export function ComplianceTab({ app }: { app: ApplicationDetail }) {
  const qc = useQueryClient();
  const { can, user } = useSession();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ items: ObligationRow[] }>({
    queryKey: ["compliance"],
    queryFn: () => api("/compliance"),
  });
  const items = (data?.items ?? []).filter((o) => o.application_id === app.id);

  const submitEvidence = async (obId: string) => {
    setBusy(obId);
    try {
      await api(`/compliance/${obId}/submit`, { json: { note: note || "Evidence submitted from application view" } });
      toast("Evidence submitted for verification", "success");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["compliance"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Submission failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const verify = async (obId: string, decision: "verified" | "deficient" | "needs_more_info") => {
    setBusy(obId);
    try {
      await api(`/compliance/${obId}/verify-latest`, { json: { decision, comments: "Reviewed in application view" } });
      toast(`Evidence ${decision.replace("_", " ")}`, "success");
      await qc.invalidateQueries({ queryKey: ["compliance"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Verification failed", "error");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <Skeleton rows={3} />;
  if (!items.length)
    return (
      <EmptyState
        title="No compliance obligations linked to this application"
        hint="Obligations are created from workflow outcomes or manually by authorized officers."
        action={can("compliance.create") ? <Link href="/compliance" className="btn-secondary">Open compliance register</Link> : undefined}
      />
    );

  return (
    <div className="space-y-3">
      {items.map((ob) => (
        <div key={ob.id} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/compliance/${ob.id}`} className="font-semibold text-navy-600 hover:underline">
                {ob.ref_no}
              </Link>
              <p className="text-sm text-text">{ob.title}</p>
              <p className="text-xs text-textmuted">
                {ob.category} · due {fmtDate(ob.due_date)} · escalation level {ob.escalation_level}
                {ob.source_ref ? ` · source: ${ob.source_ref}` : ""}
              </p>
            </div>
            <StatusBadge meta={OB_STATUS_META} value={ob.status} />
          </div>

          {ob.submissions && (
            <p className="mt-2 rounded border border-line bg-navy-50/60 px-3 py-2 text-xs text-textmuted">
              Latest submission {fmtDateTime(ob.submissions.submitted_at)}: “{ob.submissions.note}”
              {ob.submissions.verifications.length > 0 && (
                <>
                  {" · verdict: "}
                  <strong>{ob.submissions.verifications[0].decision}</strong> by {ob.submissions.verifications[0].verified_by}
                </>
              )}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            {can("compliance.submit_evidence") && user?.institution_id && (
              <>
                <input
                  className="input max-w-md flex-1"
                  placeholder="Evidence note (select documents on the obligation page)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-label="Evidence note"
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy === ob.id}
                  onClick={() => submitEvidence(ob.id)}
                >
                  <Send className="h-4 w-4" aria-hidden /> Submit evidence
                </button>
              </>
            )}
            {can("compliance.verify") && ob.submissions && (
              <>
                <button type="button" className="btn-secondary" disabled={busy === ob.id} onClick={() => verify(ob.id, "verified")}>
                  Verify
                </button>
                <button type="button" className="btn-secondary" disabled={busy === ob.id} onClick={() => verify(ob.id, "needs_more_info")}>
                  More info
                </button>
                <button type="button" className="btn-danger" disabled={busy === ob.id} onClick={() => verify(ob.id, "deficient")}>
                  Deficient
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ EVC */

export function EvcTab({ app }: { app: ApplicationDetail }) {
  const { data, isLoading } = useQuery<{ items: EvcCaseRow[] }>({
    queryKey: ["evc"],
    queryFn: () => api("/evc"),
  });
  const evc = (data?.items ?? []).find((c) => c.application_id === app.id);

  if (isLoading) return <Skeleton rows={3} />;
  if (!evc)
    return (
      <EmptyState
        title="No EVC case for this application"
        hint="An EVC case is created automatically when the workflow transitions the case into the EVC stage."
      />
    );

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">Expert Visit Committee case</p>
          <p className="text-xs text-textmuted">
            Proposed {fmtDate(evc.proposed_date)} · confirmed {fmtDate(evc.confirmed_date)} · report due{" "}
            {fmtDate(evc.report_due_date)} · reschedules {evc.reschedule_count ?? 0}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge meta={EVC_STATUS_META} value={evc.status} />
          <Link href={`/evc/${evc.id}`} className="btn-secondary">
            <Waypoints className="h-4 w-4" aria-hidden /> Open case
          </Link>
        </div>
      </div>
      {evc.flags && evc.flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {evc.flags.map((f) => (
            <Badge key={f} tone="warning">
              {f}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ AI assistance */

export function AiTab({ app }: { app: ApplicationDetail }) {
  const [brief, setBrief] = useState<{ ok?: boolean; brief?: string; message?: string; error?: string; disclaimer?: string } | null>(null);
  const [next, setNext] = useState<{ available?: boolean; next_action?: string; rationale?: string; basis?: string } | null>(null);
  const [draft, setDraft] = useState<{ ok?: boolean; draft?: string; message?: string; review_note?: string } | null>(null);
  const [purpose, setPurpose] = useState("clarification_request");
  const [busy, setBusy] = useState<string | null>(null);

  const call = async (kind: "brief" | "next" | "draft") => {
    setBusy(kind);
    try {
      if (kind === "brief") setBrief(await api(`/ai/applications/${app.id}/brief`, { method: "POST" }));
      if (kind === "next") setNext(await api(`/ai/applications/${app.id}/next-action`, { method: "POST" }));
      if (kind === "draft")
        setDraft(await api(`/ai/applications/${app.id}/draft-communication`, { method: "POST", json: { purpose } }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI request failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Notice kind="info">
        AI features are optional assistants. Output is generated from database facts, marked as AI-generated, and never
        changes workflow state or issues decisions. Without a configured provider the platform says so instead of
        inventing content.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <Sparkles className="h-4 w-4 text-saffron" aria-hidden /> AI case brief
            </h3>
            <button type="button" className="btn-secondary" onClick={() => call("brief")} disabled={busy === "brief"}>
              <Bot className="h-4 w-4" aria-hidden /> {busy === "brief" ? "Generating…" : "Generate"}
            </button>
          </div>
          {brief?.brief && (
            <div className="mt-3 rounded border border-line bg-navy-50/60 p-3">
              <Badge tone="accent">AI-generated</Badge>
              <p className="prose-plain mt-2">{brief.brief}</p>
              <p className="mt-2 text-[11px] text-textmuted">{brief.disclaimer}</p>
            </div>
          )}
          {brief?.message && <p className="mt-3 text-sm text-textmuted">{brief.message}</p>}
          {brief?.error && <p className="mt-3 text-sm text-danger">{brief.error}</p>}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <ListTodo className="h-4 w-4 text-saffron" aria-hidden /> Next action assistant
            </h3>
            <button type="button" className="btn-secondary" onClick={() => call("next")} disabled={busy === "next"}>
              {busy === "next" ? "Checking…" : "Suggest next action"}
            </button>
          </div>
          {next && (
            <div className="mt-3 rounded border border-line bg-navy-50/60 p-3 text-sm">
              <p className="font-semibold text-text">{next.next_action}</p>
              {next.rationale && <p className="mt-1 text-textmuted">{next.rationale}</p>}
              <p className="mt-2 text-[11px] text-textmuted">
                Basis: {next.basis} · the backend independently validates that any action is permitted.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
            <FileText className="h-4 w-4 text-saffron" aria-hidden /> Draft communication
          </h3>
          <div className="flex items-center gap-2">
            <select aria-label="Draft purpose" className="input w-auto" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              <option value="clarification_request">Clarification request</option>
              <option value="reminder">Reminder</option>
              <option value="compliance_followup">Compliance follow-up</option>
              <option value="escalation_summary">Escalation summary</option>
            </select>
            <button type="button" className="btn-secondary" onClick={() => call("draft")} disabled={busy === "draft"}>
              <Send className="h-4 w-4" aria-hidden /> {busy === "draft" ? "Drafting…" : "Create draft"}
            </button>
          </div>
        </div>
        {draft?.draft && (
          <div className="mt-3 rounded border border-line bg-navy-50/60 p-3">
            <Badge tone="accent">DRAFT — human review required</Badge>
            <p className="prose-plain mt-2">{draft.draft}</p>
            <p className="mt-2 text-[11px] text-textmuted">{draft.review_note}</p>
          </div>
        )}
        {draft?.message && <p className="mt-3 text-sm text-textmuted">{draft.message}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ decisions */

export function DecisionsTab({ app }: { app: ApplicationDetail }) {
  const decisionEvents = app.audit_events.filter((e) => /decision|approve|reject|hold|withdraw/i.test(e.action));
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-text">Recorded decision</h3>
        {app.decision ? (
          <dl className="mt-2 space-y-1 text-sm">
            <div>
              <dt className="inline font-medium">Outcome: </dt>
              <dd className="inline">
                <Badge tone={app.decision === "approved" ? "success" : app.decision === "rejected" ? "danger" : "warning"}>
                  {app.decision}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Recorded: </dt>
              <dd className="inline">{fmtDateTime(app.decision_at)}</dd>
            </div>
            {app.decision_reason && (
              <div>
                <dt className="inline font-medium">Reason: </dt>
                <dd className="inline prose-plain">{app.decision_reason}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-textmuted">
            No decision recorded. Only a role with explicit authority at the decision stage can record one.
          </p>
        )}
        <p className="mt-3 rounded border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] text-textmuted">
          This prototype never generates official approval or Extension of Approval documents. Any outcome recorded
          here is a demonstration record only.
        </p>
      </div>

      <div className="card">
        <div className="border-b border-line px-4 py-3 text-sm font-semibold text-text">Decision & recommendation history</div>
        {decisionEvents.length === 0 ? (
          <EmptyState title="No decision events yet" />
        ) : (
          <ul className="divide-y divide-line">
            {decisionEvents.map((e) => (
              <li key={e.seq} className="px-4 py-3 text-sm">
                <p className="font-medium text-text">
                  #{e.seq} · {e.action}
                </p>
                <p className="text-xs text-textmuted">{fmtDateTime(e.ts)} · {e.actor_role ?? "system"}</p>
                {e.reason && <p className="mt-1 text-xs text-text">{e.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ audit */

export function AuditTab({ app }: { app: ApplicationDetail }) {
  const [showHashes, setShowHashes] = useState(false);
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text">Audit events</p>
          <p className="text-xs text-textmuted">Append-only, SHA-256 hash-chained, most recent first.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-text">
          <input type="checkbox" checked={showHashes} onChange={(e) => setShowHashes(e.target.checked)} className="h-4 w-4" />
          Show event hashes
        </label>
      </div>
      <ol className="divide-y divide-line">
        {app.audit_events.map((e) => (
          <li key={e.seq} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">#{e.seq}</Badge>
              <span className="text-sm font-medium text-text">{e.action}</span>
              <span className="text-xs text-textmuted">
                {fmtDateTime(e.ts)} · {e.actor_role ?? "system"}
              </span>
            </div>
            {e.reason && <p className="mt-1 text-xs text-text">Reason: {e.reason}</p>}
            {(e.previous_state || e.new_state) && (
              <pre className="mt-1 overflow-x-auto rounded bg-navy-50/70 p-2 text-[11px] text-textmuted">
                {JSON.stringify({ from: e.previous_state, to: e.new_state }, null, 1)}
              </pre>
            )}
          </li>
        ))}
      </ol>
      {app.audit_events.length === 0 && <EmptyState title="No audit events for this case" />}
      <div className="border-t border-line px-4 py-3">
        <Link href="/audit" className="text-xs text-navy-600 hover:underline">
          Open the full audit trail with chain verification →
        </Link>
      </div>
    </div>
  );
}
