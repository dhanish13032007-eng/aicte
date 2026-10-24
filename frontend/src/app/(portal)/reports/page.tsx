"use client";

/** Reports & analytics: database-backed charts, filtered record tables,
 * CSV exports and a printable view. */
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, RefreshCw } from "lucide-react";

import { api, download } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { CATEGORY_LABELS, fmtDate, STAGE_LABELS, STATUS_META } from "../../../lib/format";
import { Badge, Card, Notice, PageHeader, Skeleton, StatusBadge } from "../../../components/common/ui";
import { BarChartCard, HorizontalBarChart, PieChartCard, TrendLineChart } from "../../../components/charts/Charts";
import { DataTable, type Column } from "../../../components/common/DataTable";
import { ApplicationFilters } from "../../../components/applications/ApplicationFilters";
import { useApplicationFilters } from "../../../hooks/useApplicationFilters";
import type { ApplicationSummary } from "../../../lib/types";

interface Summary {
  executive: {
    active_applications: number;
    pending_applications: number;
    applications_by_stage: { stage: string; count: number }[];
    stage_deadlines: { overdue: number; approaching_3d: number };
    avg_days_to_close: number | null;
    compliance: { open: number; overdue: number };
    documents: { nearing_expiry_60d: number; expired: number };
    data_provenance: string;
  };
  ageing: { bucket: string; count: number }[];
  workload: { officer: string; role: string; open_applications: number }[];
  compliance: { total: number; by_status: { status: string; count: number }[]; overdue: number; verified: number; due_7d: number };
  monthly: { month: string; submitted: number }[];
  generated_at: string;
  data_provenance: string;
}

function Reports() {
  const { can } = useSession();
  const { filters, update, query } = useApplicationFilters();
  const [exporting, setExporting] = useState<string | null>(null);

  const { data: summary, isLoading, error, refetch, dataUpdatedAt } = useQuery<Summary>({
    queryKey: ["reports", "summary"],
    queryFn: () => api("/reports/summary"),
  });

  const { data: records } = useQuery<{ total: number; page: number; page_size: number; items: ApplicationSummary[] }>({
    queryKey: ["apps", "report-table", query],
    queryFn: () => api("/applications", { query: { ...query, page_size: 50 } }),
  });

  const runExport = async (kind: "applications" | "audit") => {
    setExporting(kind);
    try {
      await download(kind === "applications" ? "/reports/applications.csv" : "/reports/audit.csv");
      toast("Export downloaded; the export event is recorded in the audit trail.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(null);
    }
  };

  const columns: Column<ApplicationSummary>[] = [
    { key: "ref", header: "Reference", render: (a) => <span className="font-medium">{a.ref_no}</span> },
    { key: "inst", header: "Institution", render: (a) => <span className="text-sm">{a.institution_name}</span> },
    { key: "cat", header: "Type", hideOnMobile: true, render: (a) => <span className="text-xs">{CATEGORY_LABELS[a.category] ?? a.category}</span> },
    { key: "stage", header: "Stage", render: (a) => <span className="text-sm">{STAGE_LABELS[a.current_stage] ?? a.current_stage}</span> },
    { key: "status", header: "Status", render: (a) => <StatusBadge meta={STATUS_META} value={a.status} /> },
    { key: "ay", header: "Year", hideOnMobile: true, render: (a) => <span className="text-xs text-textmuted">{a.academic_year}</span> },
    { key: "deadline", header: "Deadline", hideOnMobile: true, render: (a) => <span className="text-xs">{fmtDate(a.stage_deadline)}</span> },
  ];

  const appliedFilters = [
    filters.q && `search="${filters.q}"`,
    filters.stage && `stage=${filters.stage}`,
    filters.status && `status=${filters.status}`,
    filters.category && `type=${filters.category}`,
    filters.academic_year && `year=${filters.academic_year}`,
    filters.overdue && "overdue only",
    filters.state && `lifecycle=${filters.state}`,
  ].filter(Boolean);

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        description="Stage distribution, ageing, workload, compliance status and processing trends — computed from the database."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Reports & Analytics" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
            </button>
            <button type="button" className="btn-secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print
            </button>
            {can("application.csv_export") && (
              <button type="button" className="btn-secondary" onClick={() => runExport("applications")} disabled={exporting === "applications"}>
                <Download className="h-4 w-4" aria-hidden /> {exporting === "applications" ? "Exporting…" : "Applications CSV"}
              </button>
            )}
            {can("audit.export") && (
              <button type="button" className="btn-secondary" onClick={() => runExport("audit")} disabled={exporting === "audit"}>
                <Download className="h-4 w-4" aria-hidden /> {exporting === "audit" ? "Exporting…" : "Audit CSV"}
              </button>
            )}
          </div>
        }
      />

      <Notice kind="info" className="mb-4">
        <strong>Generated:</strong> {summary ? new Date(dataUpdatedAt).toLocaleString("en-IN") : "—"} ·{" "}
        <strong>Data:</strong> {summary?.data_provenance ?? "live database"} · Charts below cover every record in your
        scope; the filters apply to the record table and exports. All seeded institutions are synthetic demonstration
        data — this report contains no live AICTE records.
      </Notice>

      {isLoading && <Skeleton rows={8} />}
      {error && <Card><Notice kind="danger">Could not load the report summary: {String(error)}</Notice></Card>}

      {summary && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Applications by stage">
              <div className="p-3">
                <PieChartCard data={summary.executive.applications_by_stage.map((s) => ({ stage: STAGE_LABELS[s.stage] ?? s.stage, count: s.count }))} dataKey="count" labelKey="stage" />
              </div>
            </Card>
            <Card title="Ageing distribution" description="Days since submission (open cases)">
              <div className="p-3">
                <BarChartCard data={summary.ageing} dataKey="count" labelKey="bucket" color="#1D4F91" />
              </div>
            </Card>
            <Card title="Monthly submissions">
              <div className="p-3">
                <TrendLineChart data={summary.monthly} xKey="month" yKey="submitted" />
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Officer workload" description="Open applications per assigned officer">
              <div className="p-3">
                {summary.workload.length ? (
                  <HorizontalBarChart data={summary.workload} dataKey="open_applications" labelKey="officer" height={300} />
                ) : (
                  <p className="p-4 text-sm text-textmuted">No assigned cases.</p>
                )}
              </div>
            </Card>
            <Card title="Compliance status">
              <div className="p-3">
                <PieChartCard
                  data={summary.compliance.by_status.map((s) => ({ status: s.status.replace(/_/g, " "), count: s.count }))}
                  dataKey="count"
                  labelKey="status"
                />
              </div>
            </Card>
            <Card title="Key figures">
              <dl className="divide-y divide-line">
                {[
                  ["Active applications", summary.executive.active_applications],
                  ["Pending processing", summary.executive.pending_applications],
                  ["Stage targets overdue", summary.executive.stage_deadlines.overdue],
                  ["Due within 3 days", summary.executive.stage_deadlines.approaching_3d],
                  ["Avg days to close", summary.executive.avg_days_to_close ?? "—"],
                  ["Open obligations", summary.compliance.total],
                  ["Obligations overdue", summary.compliance.overdue],
                  ["Documents expiring ≤60d", summary.executive.documents.nearing_expiry_60d],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <dt className="text-textmuted">{label}</dt>
                    <dd className="font-semibold text-text">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </>
      )}

      <Card className="mt-4">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-h3 text-text">Filtered record table</h2>
          <p className="text-xs text-textmuted">
            Applied filters: {appliedFilters.length ? appliedFilters.join(" · ") : "none (all records in scope)"}
          </p>
        </div>
        <ApplicationFilters filters={filters} update={update} canExport={can("application.csv_export")} />
        <DataTable
          caption="Report records"
          columns={columns}
          rows={records?.items ?? []}
          rowKey={(a) => a.id}
          isLoading={!records}
          emptyTitle="No records match these filters"
          page={records?.page ?? 1}
          pageSize={records?.page_size ?? 50}
          total={records?.total ?? 0}
          onPageChange={(p) => update({ page: p }, false)}
        />
        <div className="border-t border-line px-4 py-2">
          <Badge tone="neutral">showing up to 50 rows on screen — CSV export includes every authorized record</Badge>
        </div>
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" />}>
      <Reports />
    </Suspense>
  );
}
