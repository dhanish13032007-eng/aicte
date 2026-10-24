"use client";

/** Document detail / OCR review: extracted fields, confidence, flags, text
 * preview, verification decisions and AI checklist assistance. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, ScanLine, ShieldCheck, ShieldAlert, HelpCircle } from "lucide-react";

import { api } from "../../../../lib/api";
import { useSession } from "../../../../lib/session";
import { toast } from "../../../../lib/toast";
import { DOC_STATUS_META, DOC_TYPE_LABELS, fmtBytes, fmtDateTime, fmtDate } from "../../../../lib/format";
import {
  Badge,
  Card,
  ErrorState,
  KeyValue,
  Notice,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "../../../../components/common/ui";
import type { DocumentRow } from "../../../../lib/types";

interface OcrHistoryRow {
  id: string;
  status: string;
  extractor: string;
  fields: { key?: string; value?: string | null; confidence?: number | null; page?: number | null }[];
  flags: string[];
  avg_confidence?: number | null;
  error?: string | null;
  created_at: string;
  text_preview?: string;
}

function Detail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { can } = useSession();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [assist, setAssist] = useState<{ ok?: boolean; findings?: { requirement: string; evidence_found?: string; suggestion?: string; explanation?: string }[]; message?: string } | null>(null);
  const [aiSummary, setAiSummary] = useState<{ ok?: boolean; summary?: string; message?: string; disclaimer?: string } | null>(null);

  const { data: docs } = useQuery<{ items: DocumentRow[] }>({
    queryKey: ["documents", ""],
    queryFn: () => api("/documents"),
  });
  const doc = docs?.items.find((d) => d.id === id);

  const { data: history, isLoading, error, refetch } = useQuery<OcrHistoryRow[]>({
    queryKey: ["ocr", id],
    queryFn: () => api(`/documents/${id}/ocr-history`),
  });

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok, "success");
      await qc.invalidateQueries({ queryKey: ["ocr", id] });
      await qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={doc?.name ?? "Document"}
        description={doc ? `${DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type} · version ${doc.version_no}` : "Loading document…"}
        breadcrumb={[
          { label: "Overview", href: "/dashboard" },
          { label: "Documents", href: "/documents" },
          { label: "OCR review" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={doc?.application_id ? `/applications/${doc.application_id}` : "/documents"} className="btn-secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Link>
            {can("doc.run_ocr") || can("doc.upload") ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy === "ocr"}
                onClick={() =>
                  act("ocr", () => api(`/documents/${id}/ocr`, { method: "POST", query: { async_job: true } }), "Extraction finished")
                }
              >
                <ScanLine className="h-4 w-4" aria-hidden /> {busy === "ocr" ? "Extracting…" : "Run extraction"}
              </button>
            ) : null}
          </div>
        }
      />

      {!doc && isLoading && <Skeleton rows={6} />}
      {doc && (
        <Card className="mb-4">
          <div className="p-4">
            <KeyValue
              items={[
                { label: "Status", value: <StatusBadge meta={DOC_STATUS_META} value={doc.status} /> },
                { label: "MIME type", value: doc.mime_type },
                { label: "Size", value: fmtBytes(doc.size_bytes) },
                { label: "SHA-256", value: <code className="break-all text-[11px]">{doc.sha256}</code> },
                { label: "Issue date", value: fmtDate(doc.issue_date) },
                { label: "Expiry date", value: fmtDate(doc.expiry_date) },
                { label: "Uploaded", value: fmtDateTime(doc.created_at) },
                {
                  label: "Flags",
                  value:
                    doc.flags && doc.flags.length ? (
                      <span className="flex flex-wrap gap-1">
                        {doc.flags.map((f) => (
                          <Badge key={f} tone="warning">
                            {f}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      "none"
                    ),
                },
              ]}
            />
          </div>
        </Card>
      )}

      <Notice kind="warning" className="mb-4">
        Extraction (OCR/pdfplumber) produces candidate values with confidence scores. A low-confidence or inconsistent
        value is flagged for an authorized human reviewer — it is never treated as proof that a document is genuine or
        fraudulent.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Extraction runs" description="Most recent first">
          {isLoading ? (
            <Skeleton rows={4} />
          ) : error ? (
            <ErrorState message={String(error)} onRetry={refetch} />
          ) : !history || history.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-textmuted">
              No extraction has been run for this document yet.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {history.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "info"}>
                      {r.status}
                    </Badge>
                    <span className="text-xs text-textmuted">
                      {r.extractor} · {fmtDateTime(r.created_at)} ·{" "}
                      {r.avg_confidence !== null && r.avg_confidence !== undefined
                        ? `avg confidence ${Math.round(Number(r.avg_confidence) * 100)}%`
                        : "no confidence data"}
                    </span>
                  </div>
                  {r.error && <p className="mt-1 text-xs text-danger">{r.error}</p>}
                  {r.flags?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.flags.map((f) => (
                        <Badge key={f} tone="warning">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {r.fields?.length > 0 && (
                    <table className="mt-2 w-full">
                      <thead>
                        <tr>
                          <th className="th">Field</th>
                          <th className="th">Value</th>
                          <th className="th text-right">Conf.</th>
                          <th className="th text-right">Page</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.fields.map((f, i) => {
                          const conf = f.confidence ?? null;
                          const low = conf !== null && Number(conf) < 0.6;
                          return (
                            <tr key={i}>
                              <td className="td text-textmuted">{f.key}</td>
                              <td className="td">{f.value ?? "—"}</td>
                              <td className={`td text-right ${low ? "font-semibold text-warn" : ""}`}>
                                {conf !== null ? `${Math.round(Number(conf) * 100)}%` : "—"}
                              </td>
                              <td className="td text-right text-textmuted">{f.page ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {r.text_preview && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-navy-600">Extracted text preview</summary>
                      <pre className="mt-1 max-h-64 overflow-auto rounded bg-navy-50/70 p-2 text-[11px] text-textmuted">
                        {r.text_preview}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {can("doc.verify") && (
            <Card title="Reviewer decision">
              <div className="flex flex-wrap gap-2 p-4">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy === "v"}
                  onClick={() =>
                    act(
                      "v",
                      () =>
                        api(`/documents/${id}/verify`, {
                          method: "PUT",
                          json: { decision: "verified", comments: "Reviewed against extracted fields" },
                        }),
                      "Document verified",
                    )
                  }
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Verify
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy === "m"}
                  onClick={() =>
                    act(
                      "m",
                      () =>
                        api(`/documents/${id}/verify`, {
                          method: "PUT",
                          json: { decision: "needs_manual_review", comments: "Needs a second reviewer" },
                        }),
                      "Marked for manual review",
                    )
                  }
                >
                  <HelpCircle className="h-4 w-4" aria-hidden /> Manual review
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy === "d"}
                  onClick={() =>
                    act(
                      "d",
                      () =>
                        api(`/documents/${id}/verify`, {
                          method: "PUT",
                          json: { decision: "deficient", comments: "Deficiency recorded" },
                        }),
                      "Marked deficient",
                    )
                  }
                >
                  <ShieldAlert className="h-4 w-4" aria-hidden /> Deficient
                </button>
              </div>
            </Card>
          )}

          {can("ai.use") && (
            <Card title="AI assistance" description="Advisory only — an authorized reviewer decides">
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy === "assist"}
                    onClick={async () => {
                      setBusy("assist");
                      try {
                        setAssist(await api(`/ai/documents/${id}/checklist-assist`, { method: "POST" }));
                      } catch (e) {
                        toast(e instanceof Error ? e.message : "Request failed", "error");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    <Bot className="h-4 w-4" aria-hidden /> Checklist suggestions
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy === "sum"}
                    onClick={async () => {
                      setBusy("sum");
                      try {
                        setAiSummary(await api(`/ai/documents/${id}/summary`, { method: "POST" }));
                      } catch (e) {
                        toast(e instanceof Error ? e.message : "Request failed", "error");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Summarize document
                  </button>
                </div>

                {assist?.findings && assist.findings.length > 0 && (
                  <ul className="space-y-2">
                    {assist.findings.map((f, i) => (
                      <li key={i} className="rounded border border-line bg-navy-50/60 p-2 text-xs">
                        <Badge tone={f.suggestion === "pass" ? "success" : f.suggestion === "fail" ? "danger" : "warning"}>
                          {f.suggestion ?? "review"}
                        </Badge>
                        <p className="mt-1 font-semibold text-text">{f.requirement}</p>
                        <p className="text-textmuted">Evidence: {f.evidence_found ?? "not found"}</p>
                        {f.explanation && <p className="text-textmuted">{f.explanation}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {assist?.message && <p className="text-xs text-textmuted">{assist.message}</p>}

                {aiSummary?.summary && (
                  <div className="rounded border border-line bg-navy-50/60 p-3">
                    <Badge tone="accent">AI-generated</Badge>
                    <p className="prose-plain mt-2">{aiSummary.summary}</p>
                    <p className="mt-2 text-[11px] text-textmuted">{aiSummary.disclaimer}</p>
                  </div>
                )}
                {aiSummary?.message && <p className="text-xs text-textmuted">{aiSummary.message}</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocumentDetailPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" />}>
      <Detail />
    </Suspense>
  );
}
