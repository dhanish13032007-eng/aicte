"use client";

/** Scrutiny / SAC-SHC workbench: case queue on the left, the selected case's
 * checklist, documents, notes and valid transitions on the right. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import Link from "next/link";

import { api } from "../../lib/api";
import { daysBetween, daysUntil, fmtDate, STAGE_LABELS, STATUS_META } from "../../lib/format";
import { Badge, EmptyState, ErrorState, Skeleton, StatusBadge } from "../common/ui";
import { DataTable, type Column } from "../common/DataTable";
import { TransitionBar } from "../workflow/TransitionBar";
import { ChecklistTab, CommunicationsTab, DocumentsTab } from "../applications/detail/Tabs";
import type { ApplicationDetail, ApplicationSummary } from "../../lib/types";

export function ScrutinyWorkbench({
  stages,
  emptyTitle,
  emptyHint,
  tabLabels = ["Checklist", "Documents", "Communications"],
}: {
  stages: string[];
  emptyTitle: string;
  emptyHint?: string;
  tabLabels?: string[];
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{ total: number; items: ApplicationSummary[] }>({
    queryKey: ["apps", "workbench", stages.join(",")],
    queryFn: () =>        Promise.all(
        stages.map((stage) =>
          api<{ total: number; items: ApplicationSummary[] }>("/applications", {
            query: { stage, state: "open", page_size: 50 },
          }),
        ),
      ).then((results) => ({
        total: results.reduce((s, r) => s + r.total, 0),
        items: results.flatMap((r) => r.items),
      })),
  });

  useEffect(() => {
    if (!selected && data && data.items.length > 0) setSelected(data.items[0].id);
  }, [data, selected]);

  const { data: detail, isLoading: loadingDetail } = useQuery<ApplicationDetail>({
    queryKey: ["app", selected],
    queryFn: () => api(`/applications/${selected}`),
    enabled: !!selected,
  });

  const [panel, setPanel] = useState(tabLabels[0]);
  useEffect(() => setPanel(tabLabels[0]), [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: Column<ApplicationSummary>[] = [
    {
      key: "ref",
      header: "Case",
      render: (a) => (
        <div>
          <button
            type="button"
            onClick={() => setSelected(a.id)}
            className={`text-left font-semibold hover:underline ${selected === a.id ? "text-saffron-dark" : "text-navy-600"}`}
          >
            {a.ref_no}
          </button>
          <p className="line-clamp-2 text-xs text-textmuted">{a.title}</p>
        </div>
      ),
    },
    { key: "inst", header: "Institution", hideOnMobile: true, render: (a) => <span className="text-sm">{a.institution_name}</span> },
    { key: "status", header: "Status", render: (a) => <StatusBadge meta={STATUS_META} value={a.status} /> },
    {
      key: "age",
      header: "Days in stage",
      render: (a) => {
        const d = daysBetween(a.stage_started_at);
        return <span className={d !== null && d > 10 ? "font-semibold text-warn" : ""}>{d ?? "—"}</span>;
      },
    },
    {
      key: "deadline",
      header: "Deadline",
      hideOnMobile: true,
      render: (a) => {
        const dl = daysUntil(a.stage_deadline);
        return (
          <span className={dl !== null && dl < 0 ? "text-danger" : "text-textmuted"}>{fmtDate(a.stage_deadline)}</span>
        );
      },
    },
    {
      key: "open",
      header: "",
      render: (a) => (
        <Link href={`/applications/${a.id}`} className="text-xs text-navy-600 hover:underline" title="Open full record">
          Full record <ExternalLink className="inline h-3 w-3" aria-hidden />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-text">Case queue</p>
            <p className="text-xs text-textmuted">
              {stages.map((s) => STAGE_LABELS[s] ?? s).join(" · ")}
              {data ? ` — ${data.total} open case(s)` : ""}
            </p>
          </div>
          <Badge tone="neutral">assigned + jurisdiction scope</Badge>
        </div>
        <DataTable
          caption="Case queue"
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(a) => a.id}
          isLoading={isLoading}
          error={error ? String(error) : null}
          onRetry={refetch}
          emptyTitle={emptyTitle}
          emptyHint={emptyHint}
        />
      </div>

      {selected && detail && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/applications/${detail.id}`} className="text-h3 text-navy-600 hover:underline">
                    {detail.ref_no}
                  </Link>
                  <p className="text-sm text-textmuted">
                    {detail.institution_name} · {STAGE_LABELS[detail.current_stage] ?? detail.current_stage}
                  </p>
                </div>
                <StatusBadge meta={STATUS_META} value={detail.status} />
              </div>
              <div className="mt-3">
                <TransitionBar applicationId={detail.id} />
              </div>
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-text">Reviewer guidance</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-textmuted">
                <li>Mark each checklist item verified, deficient or needing manual review — with a note where useful.</li>
                <li>Returning a case requires a reason; it is recorded in the audit trail and notified to the institution.</li>
                <li>OCR/AI findings are review aids only. Verification is a human decision.</li>
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
              {tabLabels.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={panel === t}
                  onClick={() => setPanel(t)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                    panel === t ? "border-saffron text-navy-700" : "border-transparent text-textmuted hover:text-navy-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div>
              {loadingDetail && <Skeleton rows={5} />}
              {panel === "Checklist" && <ChecklistTab app={detail} />}
              {panel === "Documents" && <DocumentsTab app={detail} />}
              {panel === "Communications" && <CommunicationsTab app={detail} />}
            </div>
          </div>
        </div>
      )}

      {selected && loadingDetail && <Skeleton rows={5} />}

      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <div className="card">
          <EmptyState
            title={emptyTitle}
            hint={emptyHint}
            action={
              <span className="inline-flex items-center gap-1 text-xs text-textmuted">
                <ClipboardCheck className="h-4 w-4" aria-hidden /> Cases appear here as soon as the workflow routes
                them to this stage.
              </span>
            }
          />
        </div>
      )}
    </div>
  );
}
