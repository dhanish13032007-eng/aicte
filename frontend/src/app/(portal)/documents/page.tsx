"use client";

/** Document registry with status filters, OCR/verification actions and upload. */
import Link from "next/link";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ScanLine } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { useSearchParams } from "next/navigation";
import { DOC_STATUS_META } from "../../../lib/format";
import { Card, EmptyState, PageHeader, Notice, Skeleton } from "../../../components/common/ui";
import { DocumentList, DocumentUpload } from "../../../components/documents/DocumentPanels";
import type { DocumentRow } from "../../../lib/types";

const STATUSES = Object.keys(DOC_STATUS_META);

function Documents() {
  const sp = useSearchParams();
  const { can, user } = useSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [showUpload, setShowUpload] = useState(false);
  const canVerify = can("doc.verify");
  const canOcr = can("doc.run_ocr") || can("doc.upload");

  const { data, isLoading, error, refetch } = useQuery<{ total: number; items: DocumentRow[] }>({
    queryKey: ["documents", status],
    queryFn: () => api("/documents", { query: { status_filter: status || undefined } }),
  });

  return (
    <div>
      <PageHeader
        title="Document registry"
        description="Private document store with integrity hashes, extraction results, verification decisions and expiry tracking."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Document Registry" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/calendar" className="btn-secondary">
              Expiry calendar
            </Link>
            {user?.role === "institution" && (
              <button type="button" className="btn-primary" onClick={() => setShowUpload((s) => !s)}>
                {showUpload ? "Close upload" : "Upload document"}
              </button>
            )}
          </div>
        }
      />

      <Notice kind="info" className="mb-4">
        Documents are stored privately and served only after a record-level authorization check. Extraction output
        (OCR) is a review aid — it never establishes authenticity on its own.
      </Notice>

      {showUpload && user?.role === "institution" && (
        <Card className="mb-4">
          <div className="p-4">
            <DocumentUpload onDone={() => void refetch()} />
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label htmlFor="doc-status" className="text-sm font-medium text-text">
            Status
          </label>
          <select
            id="doc-status"
            className="input w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {DOC_STATUS_META[s].label}
              </option>
            ))}
          </select>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-textmuted">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {data?.total ?? 0} current document(s)
          </span>
        </div>

        {isLoading ? (
          <Skeleton rows={6} />
        ) : error ? (
          <EmptyState title="Could not load documents" hint={String(error)} />
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="No documents match this filter"
            hint="Documents uploaded against your institution's applications appear here."
          />
        ) : (
          <DocumentList
            docs={data?.items ?? []}
            canVerify={canVerify}
            canOcr={canOcr}
            onChanged={() => {
              void qc.invalidateQueries({ queryKey: ["documents"] });
            }}
          />
        )}
      </Card>

      <p className="mt-3 flex items-center gap-1 text-xs text-textmuted">
        <ScanLine className="h-3.5 w-3.5" aria-hidden />
        Open a document from its application page to review extracted fields, confidence scores and the text preview.
      </p>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Documents />
    </Suspense>
  );
}
