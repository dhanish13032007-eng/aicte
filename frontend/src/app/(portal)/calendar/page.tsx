"use client";

/** Document expiry calendar: upcoming and already-expired documents. */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, TriangleAlert } from "lucide-react";

import { api } from "../../../lib/api";
import { DOC_STATUS_META, DOC_TYPE_LABELS, fmtDate } from "../../../lib/format";
import { Badge, Card, EmptyState, Metric, PageHeader, Skeleton, StatusBadge } from "../../../components/common/ui";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { DocumentRow } from "../../../lib/types";

export default function ExpiryCalendarPage() {
  const { data, isLoading, error, refetch } = useQuery<{ items: DocumentRow[] }>({
    queryKey: ["expiry"],
    queryFn: () => api("/documents/expiry/calendar", { query: { days: 180 } }),
  });

  const items = data?.items ?? [];
  const expired = items.filter((d) => (d.days_left ?? 0) < 0);
  const soon = items.filter((d) => (d.days_left ?? 0) >= 0 && (d.days_left ?? 0) <= 30);
  const later = items.filter((d) => (d.days_left ?? 0) > 30);

  const columns: Column<DocumentRow>[] = [
    {
      key: "name",
      header: "Document",
      render: (d) => (
        <div>
          <p className="font-medium text-text">{d.name}</p>
          <p className="text-[11px] text-textmuted">{DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}</p>
        </div>
      ),
    },
    {
      key: "app",
      header: "Application",
      render: (d) =>
        d.application_id ? (
          <Link href={`/applications/${d.application_id}`} className="text-navy-600 hover:underline">
            Open record
          </Link>
        ) : (
          <span className="text-textmuted">institution-level</span>
        ),
    },
    { key: "expiry", header: "Expiry date", render: (d) => <span>{fmtDate(d.expiry_date)}</span> },
    {
      key: "left",
      header: "Validity left",
      render: (d) => {
        const dl = d.days_left ?? 0;
        return (
          <Badge tone={dl < 0 ? "danger" : dl <= 30 ? "warning" : dl <= 60 ? "info" : "neutral"}>
            {dl < 0 ? `expired ${Math.abs(dl)}d ago` : `${dl}d left`}
          </Badge>
        );
      },
    },
    { key: "status", header: "Status", render: (d) => <StatusBadge meta={DOC_STATUS_META} value={d.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Document expiry calendar"
        description="Documents with recorded expiry dates, ordered by urgency. Reminders and escalations follow the configured notification policy."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Expiry Calendar" }]}
        actions={
          <Link href="/documents" className="btn-secondary">
            Document registry
          </Link>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Metric label="Already expired" value={expired.length} tone={expired.length ? "danger" : "neutral"} icon={<TriangleAlert className="h-4 w-4" />} />
        <Metric label="Expiring ≤30 days" value={soon.length} tone={soon.length ? "warning" : "neutral"} icon={<CalendarClock className="h-4 w-4" />} />
        <Metric label="Expiring in 31–180 days" value={later.length} />
      </div>

      <Card>
        {isLoading ? (
          <Skeleton rows={6} />
        ) : error ? (
          <EmptyState title="Could not load the expiry calendar" hint={String(error)} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No documents with expiry dates in the next 180 days"
            hint="Upload a document with an issue/expiry date to track its validity."
          />
        ) : (
          <DataTable
            caption="Documents by expiry"
            columns={columns}
            rows={items}
            rowKey={(d) => d.id}
            emptyTitle="No expiring documents"
          />
        )}
      </Card>

      <p className="mt-3 text-xs text-textmuted">
        Validity calculations use the issue/expiry dates recorded on the document plus configured rules (see
        Regulatory Rules). Lease-duration requirements are configurable, source-cited rules — not a universal formula.
      </p>
    </div>
  );
}
