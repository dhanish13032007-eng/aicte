"use client";

/** Explainable delay-risk radar: deterministic factors, evidence and the
 * recommended operational next action. */
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";

import { api } from "../../../lib/api";
import { RISK_TONE, STAGE_LABELS } from "../../../lib/format";
import { Badge, Card, EmptyState, Metric, Notice, PageHeader, Skeleton } from "../../../components/common/ui";
import { BarChartCard } from "../../../components/charts/Charts";
import type { RiskResult } from "../../../lib/types";

export default function RiskRadarPage() {
  const { data, isLoading, error, refetch } = useQuery<RiskResult[]>({
    queryKey: ["risk-radar"],
    queryFn: () => api("/risk-radar"),
  });
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = data ?? [];
  const byRisk = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.risk] = (acc[r.risk] ?? 0) + 1;
    return acc;
  }, {});
  const chartData = ["Critical", "High", "Medium", "Low"].map((k) => ({ level: k, count: byRisk[k] ?? 0 }));

  return (
    <div>
      <PageHeader
        title="Delay-risk radar"
        description="A transparent, rule-based prioritization of open cases. Factors and their evidence are shown in full — this never determines the legal or regulatory merits of an application."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Delay-Risk Radar" }]}
      />

      <Notice kind="info" className="mb-4">
        Signals include stage-target consumption, deadline proximity, unresolved dependencies, repeated returns, EVC
        status, outstanding institution responses and failed background jobs. Weights are configurable system settings
        (version {rows[0]?.weights_version ?? "2024-v1"}).
      </Notice>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Critical" value={byRisk.Critical ?? 0} tone={(byRisk.Critical ?? 0) ? "danger" : "neutral"} />
        <Metric label="High" value={byRisk.High ?? 0} tone={(byRisk.High ?? 0) ? "warning" : "neutral"} />
        <Metric label="Medium" value={byRisk.Medium ?? 0} />
        <Metric label="Low" value={byRisk.Low ?? 0} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card title="Risk distribution" description="Open applications in scope">
          <div className="p-3">
            {isLoading ? <Skeleton rows={4} /> : <BarChartCard data={chartData} dataKey="count" labelKey="level" color="#C0392B" height={220} />}
          </div>
        </Card>

        <Card title="Ranked cases" description="Highest operational risk first">
          {isLoading ? (
            <Skeleton rows={6} />
          ) : error ? (
            <EmptyState title="Could not load the radar" hint={String(error)} />
          ) : rows.length === 0 ? (
            <EmptyState title="No open applications in your scope" />
          ) : (
            <ul className="divide-y divide-line">
              {rows.slice(0, 25).map((r) => (
                <li key={r.application_id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link href={`/applications/${r.application_id}`} className="font-semibold text-navy-600 hover:underline">
                        {r.ref_no}
                      </Link>
                      <p className="text-xs text-textmuted">
                        stage {STAGE_LABELS[r.stage] ?? r.stage} · {r.factors.length} signal(s) · score {r.score}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={RISK_TONE[r.risk] ?? "neutral"}>{r.risk}</Badge>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        aria-expanded={openId === r.application_id}
                        onClick={() => setOpenId(openId === r.application_id ? null : r.application_id)}
                      >
                        {openId === r.application_id ? "Hide" : "Explain"}
                      </button>
                    </div>
                  </div>
                  {openId === r.application_id && (
                    <div className="border-t border-line bg-navy-50/40 px-4 py-3">
                      <ul className="space-y-2">
                        {r.factors.map((f) => (
                          <li key={f.factor} className="text-xs">
                            <span className="font-semibold text-text">{f.factor}</span>{" "}
                            <span className="text-saffron-dark">(+{f.points})</span>
                            <p className="text-textmuted">{f.detail}</p>
                            {f.evidence && (
                              <pre className="mt-0.5 overflow-x-auto rounded bg-white p-1.5 text-[10px] text-textmuted">
                                {JSON.stringify(f.evidence)}
                              </pre>
                            )}
                          </li>
                        ))}
                        {r.factors.length === 0 && <li className="text-xs text-textmuted">No signals fired.</li>}
                      </ul>
                      <p className="mt-2 flex items-center gap-1 text-xs">
                        <Radar className="h-3.5 w-3.5 text-saffron" aria-hidden />
                        <strong>Next action:</strong> {r.next_action}
                      </p>
                      <p className="mt-1 text-[11px] text-textmuted">{r.note}</p>
                      <p className="mt-1 text-[11px] text-textmuted">Computed at {r.computed_at}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
