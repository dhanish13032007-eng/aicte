"use client";

/** Audit trail viewer with hash-chain verification and CSV export. */
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, Link2, RefreshCw, ShieldAlert } from "lucide-react";

import { api, download } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { fmtDateTime } from "../../../lib/format";
import { Badge, Card, Field, Notice, PageHeader, Skeleton, Tabs } from "../../../components/common/ui";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { AuditEventRow } from "../../../lib/types";

function Audit() {
  const { can } = useSession();
  const [tab, setTab] = useState<"events" | "verify">("events");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [limit, setLimit] = useState(100);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{ items: AuditEventRow[] }>({
    queryKey: ["audit", action, actor, limit],
    queryFn: () => api("/audit", { query: { action: action || undefined, user_id: actor || undefined, limit } }),
  });

  const { data: verification, isFetching: verifying, refetch: runVerify } = useQuery<{
    valid: boolean;
    total: number;
    first_broken_seq: number | null;
    issues: { seq: number; issue: string }[];
  }>({
    queryKey: ["audit-verify"],
    queryFn: () => api("/audit/verify"),
    enabled: false,
    retry: false,
  });

  const columns: Column<AuditEventRow>[] = [
    {
      key: "seq",
      header: "Seq",
      render: (e) => <Badge tone="neutral">#{e.seq}</Badge>,
    },
    {
      key: "event",
      header: "Event",
      render: (e) => (
        <button
          type="button"
          className="text-left"
          onClick={() => setExpanded(expanded === e.seq ? null : e.seq)}
          aria-expanded={expanded === e.seq}
        >
          <p className="font-medium text-navy-600 hover:underline">{e.action}</p>
          <p className="text-[11px] text-textmuted">
            {e.entity_type ?? "—"}
            {e.application_id ? " · application" : ""}
            {expanded === e.seq ? " · click to collapse" : " · click to expand"}
          </p>
        </button>
      ),
    },
    { key: "actor", header: "Actor", render: (e) => <span className="text-sm">{e.actor ?? "anonymous/system"}</span> },
    { key: "role", header: "Role", hideOnMobile: true, render: (e) => <span className="text-xs text-textmuted">{e.actor_role ?? "—"}</span> },
    { key: "ts", header: "Timestamp (UTC)", render: (e) => <span className="text-xs">{fmtDateTime(e.ts)}</span> },
    {
      key: "hash",
      header: "Integrity",
      hideOnMobile: true,
      render: (e) => (
        <span className="flex items-center gap-1 text-[11px] text-textmuted" title={e.hash ?? ""}>
          <Link2 className="h-3 w-3" aria-hidden />
          {(e.hash ?? "").slice(0, 10)}…
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Append-only record of authentication, workflow, document, compliance and configuration events with SHA-256 chaining."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Audit Trail" }]}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
            </button>
            {can("audit.export") && (
              <button
                type="button"
                className="btn-secondary"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await download("/reports/audit.csv");
                    toast("Audit CSV downloaded (export event recorded)", "success");
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "Export failed", "error");
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                <Download className="h-4 w-4" aria-hidden /> {exporting ? "Exporting…" : "CSV"}
              </button>
            )}
          </>
        }
      />

      <Card>
        <div className="border-b border-line px-4 py-3">
          <Tabs
            tabs={[
              { key: "events", label: "Events", count: data?.items.length },
              { key: "verify", label: "Chain verification" },
            ]}
            active={tab}
            onChange={(k) => setTab(k as "events" | "verify")}
          />
        </div>

        {tab === "events" && (
          <>
            <div className="flex flex-wrap items-end gap-3 border-b border-line bg-navy-50/40 px-4 py-3">
              <Field label="Action contains" htmlFor="a-action">
                <input id="a-action" className="input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. workflow" />
              </Field>
              <Field label="Actor user id" htmlFor="a-actor">
                <input id="a-actor" className="input" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="user id" />
              </Field>
              <Field label="Limit" htmlFor="a-limit">
                <select id="a-limit" className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                  {[50, 100, 200, 500].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="button" className="btn-primary" onClick={() => refetch()}>
                Apply
              </button>
            </div>

            <DataTable
              caption="Audit events"
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(e) => e.id ?? String(e.seq)}
              isLoading={isLoading}
              error={error ? String(error) : null}
              onRetry={refetch}
              emptyTitle="No audit events match these filters"
            />

            {expanded !== null && (
              <div className="border-t border-line bg-navy-50/40 px-4 py-3">
                {(() => {
                  const e = data?.items.find((x) => x.seq === expanded);
                  if (!e) return null;
                  return (
                    <div className="space-y-2 text-xs">
                      <p className="font-semibold text-text">
                        #{e.seq} · {e.action} · {fmtDateTime(e.ts)}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-textmuted">Actor</p>
                          <p>
                            {e.actor ?? "anonymous"} ({e.actor_role ?? "—"})
                          </p>
                        </div>
                        <div>
                          <p className="text-textmuted">Entity</p>
                          <p>
                            {e.entity_type}/{e.entity_id}
                          </p>
                        </div>
                      </div>
                      {e.reason && (
                        <div>
                          <p className="text-textmuted">Reason</p>
                          <p>{e.reason}</p>
                        </div>
                      )}
                      {(e.previous_state || e.new_state) && (
                        <pre className="overflow-x-auto rounded bg-white p-2 text-[11px]">
                          {JSON.stringify({ from: e.previous_state, to: e.new_state }, null, 2)}
                        </pre>
                      )}
                      <div>
                        <p className="text-textmuted">Hash</p>
                        <code className="break-all">{e.hash}</code>
                      </div>
                      <div>
                        <p className="text-textmuted">Previous hash</p>
                        <code className="break-all">{e.previous_hash ?? "genesis"}</code>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {tab === "verify" && (
          <div className="space-y-4 p-4">
            <Notice kind="info">
              Verification recomputes each event's SHA-256 from its canonical serialization and checks the previous-hash
              linkage. Chaining <em>detects</em> alteration; it does not by itself make the database immutable —
              production deployments should add signed checkpoints and external storage of the chain head.
            </Notice>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-primary"
                disabled={verifying}
                onClick={async () => {
                  const r = await runVerify();
                  const v = r.data;
                  if (v?.valid) toast(`Chain verified across ${v.total} events`, "success");
                  else toast(`Verification problem: ${v?.issues?.[0]?.issue ?? "unknown"}`, "error");
                }}
              >
                <ShieldAlert className="h-4 w-4" aria-hidden /> {verifying ? "Verifying…" : "Verify chain now"}
              </button>
              {verification?.valid && (
                <p className="flex items-center gap-1 text-sm text-ok">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Chain intact across {verification.total} event(s).
                </p>
              )}
              {verification && !verification.valid && (
                <p className="text-sm text-danger">
                  Alteration detected at sequence {verification.first_broken_seq ?? "?"} —{" "}
                  {verification.issues?.[0]?.issue ?? "hash mismatch"}
                </p>
              )}
              {!can("audit.view_all") && (
                <span className="text-xs text-textmuted">(Full-chain verification requires audit.view_all.)</span>
              )}
            </div>
            {!can("audit.view_all") && <Skeleton rows={3} />}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Audit />
    </Suspense>
  );
}
