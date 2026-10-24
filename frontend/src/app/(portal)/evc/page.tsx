"use client";

/** EVC case queue: scheduling status, prerequisites, report tracking. */
import Link from "next/link";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Waypoints } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { EVC_STATUS_META, fmtDate, STAGE_LABELS } from "../../../lib/format";
import { Badge, Card, EmptyState, Metric, PageHeader, Skeleton, StatusBadge, Tabs } from "../../../components/common/ui";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { EvcCaseRow } from "../../../lib/types";

function EvcQueue() {
  const { can } = useSession();
  const [status, setStatus] = useState("");
  const { data, isLoading, error, refetch } = useQuery<{ total: number; items: EvcCaseRow[] }>({
    queryKey: ["evc", status],
    queryFn: () => api("/evc", { query: { status_filter: status || undefined } }),
  });

  const items = data?.items ?? [];
  const counts = items.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const upcoming = items.filter((c) => {
    if (!c.confirmed_date) return false;
    const d = new Date(c.confirmed_date).getTime();
    return d >= Date.now() && d <= Date.now() + 30 * 86_400_000;
  }).length;

  const columns: Column<EvcCaseRow>[] = [
    {
      key: "ref",
      header: "Case",
      render: (c) => (
        <div>
          <Link href={`/evc/${c.id}`} className="font-semibold text-navy-600 hover:underline">
            {c.ref_no}
          </Link>
          <p className="text-xs text-textmuted">{c.institution}</p>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Application stage",
      hideOnMobile: true,
      render: (c) => <span className="text-sm">{STAGE_LABELS[c.stage ?? ""] ?? c.stage}</span>,
    },
    { key: "status", header: "Scheduling status", render: (c) => <StatusBadge meta={EVC_STATUS_META} value={c.status} /> },
    {
      key: "dates",
      header: "Proposed / confirmed",
      render: (c) => (
        <span className="text-xs text-textmuted">
          {fmtDate(c.proposed_date)}
          <br />
          {fmtDate(c.confirmed_date)}
        </span>
      ),
    },
    {
      key: "report",
      header: "Report",
      render: (c) => (
        <div>
          <Badge tone={c.report_status === "pending" ? "warning" : "success"}>report: {c.report_status}</Badge>
          <p className="mt-1 text-[11px] text-textmuted">due {fmtDate(c.report_due_date)}</p>
        </div>
      ),
    },
    {
      key: "coord",
      header: "Coordinator",
      hideOnMobile: true,
      render: (c) => (c.coordinator ? <span className="text-sm">{c.coordinator.name}</span> : <Badge tone="neutral">unassigned</Badge>),
    },
    {
      key: "flags",
      header: "Flags",
      hideOnMobile: true,
      render: (c) =>
        c.flags && c.flags.length ? (
          <div className="flex flex-wrap gap-1">
            {c.flags.map((f) => (
              <Badge key={f} tone="warning">
                {f}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-textmuted">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="EVC management"
        description="Expert Visit Committee cases: prerequisites, proposed and confirmed dates, participants, visits and outstanding reports."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "EVC Management" }]}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ready to schedule" value={counts.ready_to_schedule ?? 0} tone={(counts.ready_to_schedule ?? 0) ? "warning" : "neutral"} href="/evc" />
        <Metric label="Scheduled" value={counts.scheduled ?? 0} />
        <Metric label="Upcoming visits (30d)" value={upcoming} icon={<CalendarClock className="h-4 w-4" />} />
        <Metric
          label="Reports pending"
          value={items.filter((c) => c.report_status === "pending").length}
          tone={items.some((c) => c.report_status === "pending") ? "warning" : "neutral"}
          icon={<Waypoints className="h-4 w-4" />}
        />
      </div>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <Tabs
            tabs={[
              { key: "", label: "All", count: items.length },
              { key: "ready_to_schedule", label: "Ready to schedule", count: counts.ready_to_schedule ?? 0 },
              { key: "scheduled", label: "Scheduled", count: counts.scheduled ?? 0 },
              { key: "in_progress", label: "Visit in progress", count: counts.in_progress ?? 0 },
              { key: "completed", label: "Completed", count: counts.completed ?? 0 },
            ]}
            active={status}
            onChange={setStatus}
          />
        </div>
        <DataTable
          caption="EVC cases"
          columns={columns}
          rows={items}
          rowKey={(c) => c.id}
          isLoading={isLoading}
          error={error ? String(error) : null}
          onRetry={refetch}
          emptyTitle="No EVC cases in this view"
          emptyHint="EVC cases are created by the workflow when a case enters the EVC stage."
        />
      </Card>

      {!can("evc.schedule") && (
        <p className="mt-3 text-xs text-textmuted">
          You can follow EVC progress; scheduling actions are limited to coordinators and are enforced server-side.
        </p>
      )}
      {items.length === 0 && !isLoading && (
        <div className="mt-4">
          <EmptyState title="Nothing to show yet" hint="Cases appear here when the workflow routes them to the EVC stage." />
        </div>
      )}
    </div>
  );
}

export default function EvcPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <EvcQueue />
    </Suspense>
  );
}
