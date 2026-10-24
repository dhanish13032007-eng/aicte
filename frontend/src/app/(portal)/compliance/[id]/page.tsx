"use client";

/** Compliance obligation detail: evidence submission, verification, escalation. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronsUp, FileUp, ShieldAlert, ShieldCheck } from "lucide-react";

import { api } from "../../../../lib/api";
import { useSession } from "../../../../lib/session";
import { toast } from "../../../../lib/toast";
import { fmtDate, fmtDateTime, OB_STATUS_META } from "../../../../lib/format";
import {
  Badge,
  Card,
  ErrorState,
  Field,
  KeyValue,
  Notice,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "../../../../components/common/ui";
import type { DocumentRow, ObligationRow } from "../../../../lib/types";

function Detail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { can } = useSession();
  const qc = useQueryClient();

  const [note, setNote] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: ob, isLoading, error, refetch } = useQuery<ObligationRow>({
    queryKey: ["compliance", id],
    queryFn: async () => {
      const res = await api<{ items: ObligationRow[] }>("/compliance");
      return res.items.find((o) => o.id === id) ?? Promise.reject(new Error("Obligation not found"));
    },
  });

  const { data: docs } = useQuery<{ items: DocumentRow[] }>({
    queryKey: ["documents", ""],
    queryFn: () => api("/documents"),
  });

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok, "success");
      await qc.invalidateQueries({ queryKey: ["compliance"] });
      await refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <div className="card h-96 animate-pulse" />;
  if (error || !ob) {
    return (
      <Card>
        <ErrorState message="Obligation not found or not accessible to your account." onRetry={refetch} />
      </Card>
    );
  }

  const latest = ob.submissions;

  return (
    <div>
      <PageHeader
        title={`${ob.ref_no} — ${ob.title}`}
        description={ob.description ?? "Compliance obligation"}
        breadcrumb={[
          { label: "Overview", href: "/dashboard" },
          { label: "Compliance", href: "/compliance" },
          { label: ob.ref_no },
        ]}
        actions={
          <Link href="/compliance" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Register
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge meta={OB_STATUS_META} value={ob.status} />
        <Badge tone={ob.source_type === "official_policy" ? "info" : ob.source_type === "demonstration" ? "neutral" : "accent"}>
          source type: {ob.source_type?.replace(/_/g, " ")}
        </Badge>
        <Badge tone={ob.escalation_level ? "warning" : "neutral"}>escalation level {ob.escalation_level}</Badge>
        {(ob.days_left ?? 0) < 0 && !["verified", "closed"].includes(ob.status) && (
          <Badge tone="danger">overdue by {Math.abs(ob.days_left ?? 0)} days</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card title="Obligation details">
            <div className="p-4">
              <KeyValue
                items={[
                  { label: "Institution", value: ob.institution ?? "—" },
                  {
                    label: "Linked application",
                    value: ob.application_id ? (
                      <Link href={`/applications/${ob.application_id}`} className="link">
                        {ob.application_ref}
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  { label: "Category", value: ob.category },
                  { label: "Regulatory / policy source", value: ob.source_ref ?? "not cited" },
                  { label: "Due date", value: fmtDate(ob.due_date) },
                  { label: "Created", value: fmtDateTime(ob.created_at) },
                  { label: "Assigned reviewer", value: ob.assigned_officer?.name ?? "—" },
                  { label: "Closed", value: ob.closed_at ? fmtDateTime(ob.closed_at) : "open" },
                  { label: "Required evidence", value: ob.required_evidence.join(", ") || "not specified" },
                ]}
              />
              <p className="mt-3 rounded border border-line bg-navy-50/60 px-3 py-2 text-xs text-textmuted">
                Reminder schedule and escalation policy are configured by administrators under System Settings. Exact
                reminder intervals are operational configuration, not statutory deadlines.
              </p>
            </div>
          </Card>

          <Card title="Submission & verification history">
            {latest ? (
              <div className="space-y-3 p-4">
                <div className="rounded border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">submitted</Badge>
                    <span className="text-xs text-textmuted">{fmtDateTime(latest.submitted_at)}</span>
                  </div>
                  <p className="prose-plain mt-1">{latest.note ?? "—"}</p>
                  {latest.evidence_document_ids.length > 0 && (
                    <p className="mt-1 text-xs text-textmuted">
                      Evidence documents:{" "}
                      {latest.evidence_document_ids.map((d) => (
                        <Link key={d} href={`/documents/${d}`} className="link mr-2">
                          view
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
                {latest.verifications.length === 0 ? (
                  <p className="text-sm text-textmuted">Awaiting verification by an authorized officer.</p>
                ) : (
                  latest.verifications.map((v, i) => (
                    <div key={i} className="rounded border border-line p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={v.decision === "verified" ? "success" : v.decision === "deficient" ? "danger" : "warning"}>
                          {v.decision.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-textmuted">
                          {v.verified_by ?? "officer"} · {fmtDateTime(v.created_at)}
                        </span>
                      </div>
                      {v.comments && <p className="prose-plain mt-1">{v.comments}</p>}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="px-4 py-4 text-sm text-textmuted">
                No submission yet. The institution must submit evidence before verification can occur.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {can("compliance.submit_evidence") && (
            <Card title="Submit evidence">
              <form
                className="space-y-3 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    "submit",
                    () => api(`/compliance/${id}/submit`, { json: { note: note || "Evidence submitted", evidence_document_ids: selectedDocs } }),
                    "Evidence submitted for verification",
                  ).then(() => {
                    setNote("");
                    setSelectedDocs([]);
                  });
                }}
              >
                <Field label="Covering note" htmlFor="ev-note">
                  <textarea id="ev-note" className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <fieldset>
                  <legend className="label">Attach uploaded documents (optional)</legend>
                  <div className="max-h-40 space-y-1 overflow-auto rounded border border-line p-2">
                    {(docs?.items ?? []).slice(0, 20).map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedDocs.includes(d.id)}
                          onChange={(e) =>
                            setSelectedDocs((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))
                          }
                          className="h-3.5 w-3.5"
                        />
                        {d.name}
                      </label>
                    ))}
                    {(docs?.items ?? []).length === 0 && (
                      <p className="text-xs text-textmuted">No documents uploaded yet — add them from the application's Documents tab.</p>
                    )}
                  </div>
                </fieldset>
                <button type="submit" className="btn-primary" disabled={busy === "submit"}>
                  <FileUp className="h-4 w-4" aria-hidden /> {busy === "submit" ? "Submitting…" : "Submit evidence"}
                </button>
              </form>
            </Card>
          )}

          {can("compliance.verify") && (
            <Card title="Verification decision" description="Requires an actual submission">
              <div className="space-y-3 p-4">
                <Field label="Verification comments" htmlFor="vf-comments">
                  <textarea id="vf-comments" className="input min-h-[70px]" value={comments} onChange={(e) => setComments(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!latest || busy === "verified"}
                    onClick={() =>
                      run(
                        "verified",
                        () => api(`/compliance/${id}/verify-latest`, { json: { decision: "verified", comments } }),
                        "Evidence verified",
                      )
                    }
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden /> Verify
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!latest || busy === "info"}
                    onClick={() =>
                      run(
                        "info",
                        () => api(`/compliance/${id}/verify-latest`, { json: { decision: "needs_more_info", comments } }),
                        "More information requested",
                      )
                    }
                  >
                    More info
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={!latest || busy === "deficient"}
                    onClick={() =>
                      run(
                        "deficient",
                        () => api(`/compliance/${id}/verify-latest`, { json: { decision: "deficient", comments } }),
                        "Evidence marked deficient",
                      )
                    }
                  >
                    <ShieldAlert className="h-4 w-4" aria-hidden /> Deficient
                  </button>
                </div>
                {!latest && <p className="text-xs text-textmuted">There is nothing to verify yet.</p>}
              </div>
            </Card>
          )}

          {can("compliance.escalate") && (
            <Card title="Escalation">
              <div className="p-4">
                <button
                  type="button"
                  className="btn-danger w-full"
                  disabled={busy === "esc"}
                  onClick={() => run("esc", () => api(`/compliance/${id}/escalate`, { method: "POST", json: {} }), "Escalated; notification queued")}
                >
                  <ChevronsUp className="h-4 w-4" aria-hidden /> Escalate to the next level
                </button>
                <p className="mt-2 text-[11px] text-textmuted">
                  Escalation raises the level, records an audit event and notifies the configured escalation role.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ObligationDetailPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" />}>
      <Detail />
    </Suspense>
  );
}
