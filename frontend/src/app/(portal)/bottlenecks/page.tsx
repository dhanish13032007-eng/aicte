"use client";

/** Workflow dependency / bottleneck analysis: where delays originate. */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";

import { api } from "../../../lib/api";
import { STAGE_LABELS, STATUS_META, fmtDate } from "../../../lib/format";
import { Badge, Card, EmptyState, Notice, PageHeader, Skeleton, StatusBadge } from "../../../components/common/ui";
import { HorizontalBarChart } from "../../../components/charts/Charts";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { BottleneckItem } from "../../../lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  institution_action_pending: "Institution action pending",
  officer_review_pending: "Officer review pending",
  document_verification_pending: "Document verification pending",
  evc_scheduling_pending: "EVC scheduling pending",
  evc_report_pending: "EVC report pending",
  review_stage_pending: "Subsequent review pending",
  authorized_decision_pending: "Authorized decision pending",
  technical_processing_failure: "Technical processing failure",
  workflow_in_progress: "Workflow in progress",
};

const STAGE_FLOW = ["draft", "intake_validation", "scrutiny", "clarification", "re_scrutiny", "evc", "sac_review", "decision", "closed"];

export default function BottlenecksPage() {
  const { data, isLoading, error, refetch } = useQuery<{
    summary: Record<string, number>;
    items: BottleneckItem[];
    note: string;
  }>({
    queryKey: ["bottlenecks"],
    queryFn: () => api("/bottlenecks"),
  });

  const summary = Object.entries(data?.summary ?? {}).map(([k, v]) => ({
    category: CATEGORY_LABELS[k] ?? k,
    count: v,
  }));

  const columns: Column<BottleneckItem>[] = [
    {
      key: "ref",
      header: "Case",
      render: (i) => (
        <div>
          <Link href={`/applications/${i.application_id}`} className="font-semibold text-navy-600 hover:underline">
            {i.ref_no}
          </Link>
          <p className="text-xs text-textmuted">{i.institution}</p>
        </div>
      ),
    },
    {
      key: "blocker",
      header: "Current blocker",
      render: (i) => (
        <div>
          <Badge tone={i.category === "technical_processing_failure" ? "danger" : i.category === "workflow_in_progress" ? "neutral" : "warning"}>
            {CATEGORY_LABELS[i.category] ?? i.category}
          </Badge>
          {i.extra !== null && i.extra !== undefined && <p className="mt-1 text-[11px] text-textmuted">detail: {String(i.extra)}</p>}
        </div>
      ),
    },
    { key: "stage", header: "Stage", hideOnMobile: true, render: (i) => <span className="text-sm">{STAGE_LABELS[i.stage] ?? i.stage}</span> },
    { key: "status", header: "Status", render: (i) => <StatusBadge meta={STATUS_META} value={i.status} /> },
    {
      key: "owner",
      header: "Responsible owner",
      render: (i) => (
        <div>
          <p className="text-sm">{i.owner ?? "institution (response pending)"}</p>
          <p className="text-[11px] text-textmuted">{(i.owner_role ?? "").replace(/_/g, " ")}</p>
        </div>
      ),
    },
    {
      key: "blocked",
      header: "Blocked for",
      render: (i) => (
        <span className={(i.blocked_for_days ?? 0) > 10 ? "font-semibold text-warn" : ""}>
          {i.blocked_for_days ?? "—"} days
        </span>
      ),
    },
    { key: "deadline", header: "Stage deadline", hideOnMobile: true, render: (i) => <span className="text-xs text-textmuted">{fmtDate(i.stage_deadline)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Workflow dependency analysis"
        description="Where delayed cases are actually stuck: the current blocker, how long it has persisted, the owner and the dependent stage."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Dependency Analysis" }]}
      />

      <Notice kind="info" className="mb-4">
        {data?.note ?? "Categories describe factual stage and dependency states — they are not blame assignments."} Confirmed
        facts (stage, owner, timestamps) are distinguished from inferred explanations (suggested next action).
      </Notice>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Blockers by category" description="Open applications in your scope">
          <div className="p-3">
            {isLoading ? <Skeleton rows={4} /> : summary.length ? <HorizontalBarChart data={summary} dataKey="count" labelKey="category" height={300} color="#B7791F" /> : <EmptyState title="No delayed cases" />}
          </div>
        </Card>

        <Card title="Workflow path" description="Current stage distribution of delayed cases">
          <div className="p-4">
            <ol className="flex flex-wrap items-center gap-1.5">
              {STAGE_FLOW.map((s, idx) => {
                const count = (data?.items ?? []).filter((i) => i.stage === s).length;
                return (
                  <li key={s} className="flex items-center gap-1.5">
                    <span
                      className={`rounded border px-2 py-1 text-[11px] ${
                        count > 0 ? "border-saffron bg-saffron/10 font-semibold text-saffron-dark" : "border-line bg-white text-textmuted"
                      }`}
                      title={`${count} delayed case(s) at this stage`}
                    >
                      {STAGE_LABELS[s] ?? s}
                      {count > 0 && ` · ${count}`}
                    </span>
                    {idx < STAGE_FLOW.length - 1 && <GitBranch className="h-3 w-3 text-textmuted" aria-hidden />}
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 text-xs text-textmuted">
              The diagram reflects live stage occupancy for delayed cases only. Transitions between stages are defined
              by the configured workflow version, not by this page.
            </p>
          </div>
        </Card>
      </div>

      <Card title="Delayed cases">
        <DataTable
          caption="Delayed cases by blocker"
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(i) => i.application_id}
          isLoading={isLoading}
          error={error ? String(error) : null}
          onRetry={refetch}
          emptyTitle="No delayed cases in your scope"
          emptyHint="Cases appear here when they are open and blocked by a dependency or an elapsed stage target."
        />
      </Card>
    </div>
  );
}
