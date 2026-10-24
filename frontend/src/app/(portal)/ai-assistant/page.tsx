"use client";

/** AI document & case assistant: pick a document or application and request a
 * grounded summary, checklist suggestions, a case brief or a draft message. */
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, FileText, Sparkles, Workflow } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { DOC_STATUS_META, STAGE_LABELS, STATUS_META, timeAgo } from "../../../lib/format";
import { Badge, Card, EmptyState, Field, Notice, PageHeader, Skeleton, StatusBadge } from "../../../components/common/ui";
import type { ApplicationSummary, DocumentRow } from "../../../lib/types";

export default function AiAssistantPage() {
  const { can } = useSession();
  const [docId, setDocId] = useState("");
  const [appId, setAppId] = useState("");
  const [purpose, setPurpose] = useState("clarification_request");
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<Record<string, unknown> | null>(null);

  const { data: docs, isLoading: loadingDocs } = useQuery<{ items: DocumentRow[] }>({
    queryKey: ["documents", ""],
    queryFn: () => api("/documents"),
  });
  const { data: apps, isLoading: loadingApps } = useQuery<{ items: ApplicationSummary[] }>({
    queryKey: ["apps", "assistant", { page_size: 50, state: "open" }],
    queryFn: () => api("/applications", { query: { page_size: 50 } }),
  });

  const { data: status } = useQuery<{ configured: boolean; model?: string; note: string }>({
    queryKey: ["ai-status"],
    queryFn: () => api("/ai/status"),
  });

  const call = async (kind: string, path: string, json?: unknown) => {
    setBusy(kind);
    setOut(null);
    try {
      const res = await api<Record<string, unknown>>(path, { method: "POST", json });
      setOut(res);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Request failed", "error");
    } finally {
      setBusy(null);
    }
  };

  if (!can("ai.use")) {
    return (
      <Card>
        <EmptyState title="AI features are not enabled for your role" hint="Ask an administrator if you believe this is incorrect." />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="AI document assistant"
        description="Grounded summaries, checklist suggestions, case briefs and communication drafts — generated from records you are authorized to see."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "AI Document Assistant" }]}
        actions={<Badge tone={status?.configured ? "success" : "warning"}>{status?.configured ? `model: ${status.model ?? "configured"}` : "AI not configured"}</Badge>}
      />

      <Notice kind="warning" className="mb-4">
        AI output is untrusted and advisory. It never changes workflow state, never issues a decision, and never
        bypasses permissions. {status?.note}
        {!status?.configured &&
          " Until a provider is configured, these actions return a clear 'not configured' message instead of fabricated content."}
      </Notice>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Document analysis" description="Summaries and checklist suggestions from extracted text">
          <div className="space-y-3 p-4">
            <Field label="Document" htmlFor="ai-doc" required>
              <select id="ai-doc" className="input" value={docId} onChange={(e) => setDocId(e.target.value)}>
                <option value="">Select a document…</option>
                {(docs?.items ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {DOC_STATUS_META[d.status]?.label ?? d.status}
                  </option>
                ))}
              </select>
            </Field>
            {loadingDocs && <Skeleton rows={2} />}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!docId || busy === "summary"}
                onClick={() => call("summary", `/ai/documents/${docId}/summary`)}
              >
                <Sparkles className="h-4 w-4" aria-hidden /> {busy === "summary" ? "Working…" : "Summarize document"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!docId || busy === "checklist"}
                onClick={() => call("checklist", `/ai/documents/${docId}/checklist-assist`)}
              >
                <FileText className="h-4 w-4" aria-hidden /> {busy === "checklist" ? "Working…" : "Checklist suggestions"}
              </button>
              {docId && (
                <Link href={`/documents/${docId}`} className="btn-secondary">
                  Open extraction details
                </Link>
              )}
            </div>
          </div>
        </Card>

        <Card title="Case brief & next action" description="Evidence-grounded brief built from database facts">
          <div className="space-y-3 p-4">
            <Field label="Application" htmlFor="ai-app" required>
              <select id="ai-app" className="input" value={appId} onChange={(e) => setAppId(e.target.value)}>
                <option value="">Select an application…</option>
                {(apps?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ref_no} — {STAGE_LABELS[a.current_stage] ?? a.current_stage}
                  </option>
                ))}
              </select>
            </Field>
            {loadingApps && <Skeleton rows={2} />}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={!appId || busy === "brief"} onClick={() => call("brief", `/ai/applications/${appId}/brief`)}>
                <Bot className="h-4 w-4" aria-hidden /> {busy === "brief" ? "Generating…" : "Generate case brief"}
              </button>
              <button type="button" className="btn-secondary" disabled={!appId || busy === "next"} onClick={() => call("next", `/ai/applications/${appId}/next-action`)}>
                <Workflow className="h-4 w-4" aria-hidden /> {busy === "next" ? "Checking…" : "Suggest next action"}
              </button>
              <div className="flex items-center gap-2">
                <select aria-label="Draft purpose" className="input w-auto" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  <option value="clarification_request">Clarification request</option>
                  <option value="reminder">Reminder</option>
                  <option value="compliance_followup">Compliance follow-up</option>
                  <option value="escalation_summary">Escalation summary</option>
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!appId || busy === "draft"}
                  onClick={() => call("draft", `/ai/applications/${appId}/draft-communication`, { purpose })}
                >
                  Draft message
                </button>
              </div>
            </div>
            {appId && (
              <Link href={`/applications/${appId}`} className="text-xs text-navy-600 hover:underline">
                Open the application record →
              </Link>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="Result" description="Marked output with its provenance">
        {!out && <EmptyState title="No request yet" hint="Choose a document or an application and run an action above." />}
        {out && (
          <div className="space-y-3 p-4">
            {typeof out.message === "string" && <Notice kind="warning">{out.message}</Notice>}
            {typeof out.error === "string" && <Notice kind="danger">{out.error}</Notice>}
            {typeof out.disclaimer === "string" && <p className="text-xs text-textmuted">{out.disclaimer}</p>}
            {typeof out.review_note === "string" && <p className="text-xs text-textmuted">{out.review_note}</p>}

            {typeof out.summary === "string" && (
              <div className="rounded border border-line bg-navy-50/60 p-3">
                <Badge tone="accent">AI-generated</Badge>
                <p className="prose-plain mt-2">{out.summary}</p>
              </div>
            )}
            {typeof out.brief === "string" && (
              <div className="rounded border border-line bg-navy-50/60 p-3">
                <Badge tone="accent">AI-generated case brief</Badge>
                <p className="prose-plain mt-2">{out.brief}</p>
              </div>
            )}
            {typeof out.draft === "string" && (
              <div className="rounded border border-line bg-navy-50/60 p-3">
                <Badge tone="accent">DRAFT — review before sending</Badge>
                <p className="prose-plain mt-2">{out.draft}</p>
              </div>
            )}
            {typeof out.next_action === "string" && (
              <div className="rounded border border-line bg-white p-3">
                <p className="text-sm font-semibold text-text">{out.next_action}</p>
                {typeof out.rationale === "string" && <p className="mt-1 text-sm text-textmuted">{out.rationale}</p>}
                {typeof out.basis === "string" && <p className="mt-1 text-[11px] text-textmuted">Basis: {out.basis}</p>}
              </div>
            )}
            {Array.isArray(out.findings) && out.findings.length > 0 && (
              <ul className="space-y-2">
                {(out.findings as { requirement: string; evidence_found?: string; suggestion?: string; explanation?: string }[]).map(
                  (f, i) => (
                    <li key={i} className="rounded border border-line p-3 text-sm">
                      <Badge tone={f.suggestion === "pass" ? "success" : f.suggestion === "fail" ? "danger" : "warning"}>
                        {f.suggestion ?? "review"}
                      </Badge>
                      <p className="mt-1 font-semibold text-text">{f.requirement}</p>
                      <p className="text-textmuted">Evidence: {f.evidence_found ?? "not found"}</p>
                      {f.explanation && <p className="text-textmuted">{f.explanation}</p>}
                    </li>
                  ),
                )}
              </ul>
            )}
            {typeof out.operation_id === "string" && (
              <p className="text-[11px] text-textmuted">
                Operation {String(out.operation_id)} recorded (provider/model/version stored for traceability).
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
