"use client";

/** Application registry: server-side filtering, sorting, pagination, export. */
import Link from "next/link";
import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, ExternalLink } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { useApplicationFilters } from "../../../hooks/useApplicationFilters";
import { ApplicationFilters } from "../../../components/applications/ApplicationFilters";
import { DataTable, type Column } from "../../../components/common/DataTable";
import { Badge, PageHeader, StatusBadge } from "../../../components/common/ui";
import { CATEGORY_LABELS, daysBetween, daysUntil, fmtDate, RISK_TONE, STAGE_LABELS, STATUS_META } from "../../../lib/format";
import type { ApplicationSummary } from "../../../lib/types";

function DeadlineCell({ value }: { value?: string | null }) {
  const days = daysUntil(value);
  if (days === null) return <span className="text-textmuted">—</span>;
  const tone = days < 0 ? "danger" : days <= 3 ? "warning" : "neutral";
  return (
    <span className="flex flex-col">
      <span>{fmtDate(value)}</span>
      <span className={`text-[11px] ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warn" : "text-textmuted"}`}>
        {days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
      </span>
    </span>
  );
}

function Registry() {
  const { can } = useSession();
  const { filters, update, query } = useApplicationFilters();

  const { data, isLoading, error, refetch } = useQuery<{ total: number; page: number; page_size: number; items: ApplicationSummary[] }>({
    queryKey: ["apps", query],
    queryFn: () => api("/applications", { query }),
  });

  const sortMap: Record<string, string> = {
    deadline: "stage_deadline",
    submitted: "submitted_at",
    created: "created_at",
    updated: "updated_at",
  };
  const currentSortKey =
    Object.entries(sortMap).find(([, v]) => v === filters.sort)?.[0] ?? "deadline";

  const columns: Column<ApplicationSummary>[] = [
    {
      key: "ref",
      header: "Reference",
      render: (a) => (
        <div>
          <Link href={`/applications/${a.id}`} className="font-semibold text-navy-600 hover:underline">
            {a.ref_no}
          </Link>
          <p className="mt-0.5 line-clamp-2 text-xs text-textmuted">{a.title}</p>
        </div>
      ),
    },
    {
      key: "institution",
      header: "Institution",
      render: (a) => (
        <div>
          <p className="text-sm">{a.institution_name}</p>
          <p className="text-[11px] text-textmuted">{CATEGORY_LABELS[a.category] ?? a.category}</p>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      hideOnMobile: true,
      render: (a) => (
        <div>
          <p className="text-sm">{STAGE_LABELS[a.current_stage] ?? a.current_stage}</p>
          <p className="text-[11px] text-textmuted">{a.academic_year}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (a) => <StatusBadge meta={STATUS_META} value={a.status} /> },
    {
      key: "age",
      header: "Days in stage",
      hideOnMobile: true,
      sortValue: (a) => daysBetween(a.stage_started_at) ?? 0,
      render: (a) => {
        const d = daysBetween(a.stage_started_at);
        return <span className={d !== null && d > 10 ? "font-semibold text-warn" : ""}>{d ?? "—"}</span>;
      },
    },
    {
      key: "deadline",
      header: "Stage deadline",
      sortValue: (a) => a.stage_deadline ?? "",
      render: (a) => <DeadlineCell value={a.stage_deadline} />,
    },
    {
      key: "owner",
      header: "Owner",
      hideOnMobile: true,
      render: (a) =>
        a.assigned_officer ? (
          <span className="text-sm">{a.assigned_officer.name}</span>
        ) : (
          <Badge tone="neutral">unassigned</Badge>
        ),
    },
    {
      key: "risk",
      header: "Delay risk",
      hideOnMobile: true,
      render: (a) => {
        const r = (a as ApplicationSummary & { risk?: { risk?: string } }).risk;
        return r?.risk ? <Badge tone={RISK_TONE[r.risk] ?? "neutral"}>{r.risk}</Badge> : <span className="text-textmuted">—</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Application registry"
        description="Every application you are authorized to see, with stage, ageing, deadline proximity and current owner."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Applications" }]}
        actions={
          can("application.create") ? (
            <Link href="/applications/new" className="btn-primary">
              <FilePlus2 className="h-4 w-4" aria-hidden /> New application
            </Link>
          ) : null
        }
      />

      <div className="card">
        <ApplicationFilters filters={filters} update={update} canExport={can("application.csv_export")} />
        <DataTable
          caption="Applications"
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(a) => a.id}
          isLoading={isLoading}
          error={error ? String(error) : null}
          onRetry={refetch}
          emptyTitle="No applications match these filters"
          emptyHint="Adjust the filters, or create a new application if you are an institution user."
          page={data?.page ?? filters.page}
          pageSize={data?.page_size ?? 20}
          total={data?.total ?? 0}
          onPageChange={(p) => update({ page: p }, false)}
          sort={{ key: currentSortKey, order: filters.order }}
          onSortChange={(key) => {
            const sort = sortMap[key] ?? "stage_deadline";
            update({ sort, order: filters.sort === sort && filters.order === "asc" ? "desc" : "asc" });
          }}
        />
      </div>

      <p className="mt-3 flex items-center gap-1 text-xs text-textmuted">
        <ExternalLink className="h-3 w-3" aria-hidden />
        Records are scoped server-side by role, institution, assignment and jurisdiction.
      </p>
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Registry />
    </Suspense>
  );
}
