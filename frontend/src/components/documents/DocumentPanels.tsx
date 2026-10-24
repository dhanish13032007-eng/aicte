"use client";

/** Document upload form + document action table (shared by the application
 * detail, document registry and EVC views). */
import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, ScanLine, ShieldCheck, ShieldAlert, HelpCircle } from "lucide-react";

import { api } from "../../lib/api";
import { toast } from "../../lib/toast";
import { DOC_STATUS_META, DOC_TYPE_LABELS, fmtBytes, fmtDate } from "../../lib/format";
import { Badge, Field, StatusBadge } from "../common/ui";
import type { DocumentRow } from "../../lib/types";

const ACCEPTED = [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"];

export function DocumentUpload({
  applicationId,
  institutionScoped = true,
  onDone,
}: {
  applicationId?: string;
  institutionScoped?: boolean;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [docType, setDocType] = useState("declaration");
  const [name, setName] = useState("");
  const [issue, setIssue] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a file to upload (PDF or image).");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED.includes(`.${ext}`)) {
      setError(`Unsupported file type '.${ext}'. Allowed: ${ACCEPTED.join(", ")}`);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("File exceeds the 15 MB limit.");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append("doc_type", docType);
    fd.append("name", name.trim() || file.name);
    if (applicationId) fd.append("application_id", applicationId);
    if (issue) fd.append("issue_date", issue);
    if (expiry) fd.append("expiry_date", expiry);
    fd.append("file", file);
    try {
      const created = await api<DocumentRow>("/documents", { form: fd });
      toast(`Uploaded ${created.name} (v${created.version_no})`, "success");
      formRef.current?.reset();
      setFile(null);
      setName("");
      await qc.invalidateQueries({ queryKey: ["documents"] });
      if (applicationId) await qc.invalidateQueries({ queryKey: ["app-docs", applicationId] });
      onDone?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3">
      {error && <p className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Document type" htmlFor="d-type" required>
          <select id="d-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Display name" htmlFor="d-name" hint="Defaults to the file name.">
          <input id="d-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Issue date" htmlFor="d-issue">
          <input id="d-issue" type="date" className="input" value={issue} onChange={(e) => setIssue(e.target.value)} />
        </Field>
        <Field label="Expiry date" htmlFor="d-expiry" hint="Drives the expiry calendar and reminders.">
          <input id="d-expiry" type="date" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
      </div>
      <Field label="File (PDF, PNG, JPEG, TIFF · max 15 MB)" htmlFor="d-file" required>
        <input
          id="d-file"
          type="file"
          accept={ACCEPTED.join(",")}
          className="input"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>
      <p className="text-xs text-textmuted">
        Files are validated by extension, MIME type and signature, hashed (SHA-256), and stored privately — never at a
        public URL{institutionScoped ? "" : ""}.
      </p>
      <button type="submit" className="btn-primary" disabled={busy}>
        <FileUp className="h-4 w-4" aria-hidden />
        {busy ? "Uploading…" : "Upload document"}
      </button>
    </form>
  );
}

export function DocumentList({
  docs,
  canVerify,
  canOcr,
  onChanged,
  showApplication = true,
}: {
  docs: DocumentRow[];
  canVerify?: boolean;
  canOcr?: boolean;
  onChanged?: () => void;
  showApplication?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast(ok, "success");
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const download = async (id: string) => {
    const token = (await import("../../lib/api")).getToken();
    const res = await fetch(`/api/documents/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      toast(`Download refused (${res.status})`, "error");
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") || "";
    const m = /filename="([^"]+)"/.exec(cd);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = m?.[1] || "document";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (docs.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-textmuted">
        No documents on record for this application yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr>
            <th className="th">Document</th>
            <th className="th">Type</th>
            <th className="th">Validity</th>
            <th className="th">Status</th>
            <th className="th">OCR</th>
            <th className="th text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="hover:bg-navy-50/50">
              <td className="td">
                <Link href={`/documents/${d.id}`} className="font-medium text-navy-600 hover:underline">
                  {d.name}
                </Link>
                <p className="text-[11px] text-textmuted">
                  v{d.version_no} · {fmtBytes(d.size_bytes)} · sha256 {d.sha256.slice(0, 12)}…
                </p>
              </td>
              <td className="td text-textmuted">{DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}</td>
              <td className="td text-xs text-textmuted">
                {d.issue_date ? `Issued ${fmtDate(d.issue_date)}` : "Issue date n/a"}
                <br />
                {d.expiry_date ? (
                  <>
                    Expires {fmtDate(d.expiry_date)}
                    {typeof d.days_left === "number" && (
                      <span className={d.days_left < 0 ? "text-danger" : d.days_left <= 60 ? "text-warn" : ""}>
                        {" "}
                        ({d.days_left < 0 ? `${Math.abs(d.days_left)}d ago` : `${d.days_left}d left`})
                      </span>
                    )}
                  </>
                ) : (
                  "No expiry recorded"
                )}
              </td>
              <td className="td">
                <StatusBadge meta={DOC_STATUS_META} value={d.status} />
                {d.flags && d.flags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.flags.map((f) => (
                      <Badge key={f} tone="warning" title="Flagged for human review, not a fraud finding">
                        {f}
                      </Badge>
                    ))}
                  </div>
                )}
              </td>
              <td className="td text-xs text-textmuted">
                {d.ocr ? (
                  <>
                    {d.ocr.status} · conf{" "}
                    {d.ocr.avg_confidence !== null && d.ocr.avg_confidence !== undefined
                      ? `${Math.round(Number(d.ocr.avg_confidence) * 100)}%`
                      : "n/a"}
                    {d.ocr.fields?.length ? ` · ${d.ocr.fields.length} fields` : ""}
                  </>
                ) : (
                  "not extracted"
                )}
              </td>
              <td className="td">
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => download(d.id)}>
                    <Download className="h-3.5 w-3.5" aria-hidden /> Download
                  </button>
                  {canOcr && (
                    <button
                      type="button"
                      className="btn-secondary px-2 py-1 text-xs"
                      disabled={busyId === d.id}
                      onClick={() => run(d.id, () => api(`/documents/${d.id}/ocr`, { method: "POST" }), "Extraction complete")}
                    >
                      <ScanLine className="h-3.5 w-3.5" aria-hidden /> Extract
                    </button>
                  )}
                  {canVerify && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        disabled={busyId === d.id}
                        onClick={() =>
                          run(
                            d.id,
                            () =>
                              api(`/documents/${d.id}/verify`, {
                                method: "PUT",
                                json: { decision: "verified", comments: "Reviewed in portal" },
                              }),
                            "Document verified",
                          )
                        }
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verify
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        disabled={busyId === d.id}
                        onClick={() =>
                          run(
                            d.id,
                            () =>
                              api(`/documents/${d.id}/verify`, {
                                method: "PUT",
                                json: { decision: "needs_manual_review", comments: "Flagged for manual review" },
                              }),
                            "Marked for manual review",
                          )
                        }
                      >
                        <HelpCircle className="h-3.5 w-3.5" aria-hidden /> Review
                      </button>
                      <button
                        type="button"
                        className="btn-danger px-2 py-1 text-xs"
                        disabled={busyId === d.id}
                        onClick={() =>
                          run(
                            d.id,
                            () =>
                              api(`/documents/${d.id}/verify`, {
                                method: "PUT",
                                json: { decision: "deficient", comments: "Deficiency recorded by reviewer" },
                              }),
                            "Marked deficient",
                          )
                        }
                      >
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Deficient
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-2 text-[11px] text-textmuted">
        Extraction output is an aid for reviewers. It is never treated as proof of authenticity — a defect is flagged
        for an authorized human, not declared fraudulent.
      </p>
    </div>
  );
}
