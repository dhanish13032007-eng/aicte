"use client";

/** Alerts & escalations: notification history with delivery status plus the
 * operational escalation queue (overdue cases/obligations). */
import Link from "next/link";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, TriangleAlert } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { fmtDateTime, SEVERITY_TONE, timeAgo } from "../../../lib/format";
import { Badge, Card, EmptyState, Metric, Notice, PageHeader, Skeleton, Tabs } from "../../../components/common/ui";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { ApplicationSummary, NotificationRow, ObligationRow } from "../../../lib/types";

function Alerts() {
  const { can } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState("notifications");

  const { data: notifs, isLoading, error, refetch } = useQuery<{ unread: number; items: NotificationRow[] }>({
    queryKey: ["notifications", "full"],
    queryFn: () => api("/notifications", { query: { limit: 100 } }),
  });

  const { data: overdueApps } = useQuery<{ total: number; items: ApplicationSummary[] }>({
    queryKey: ["apps", "overdue"],
    queryFn: () => api("/applications", { query: { overdue_only: true, state: "open", page_size: 50 } }),
  });

  const { data: overdueObs } = useQuery<{ items: ObligationRow[] }>({
    queryKey: ["compliance", "overdue"],
    queryFn: () => api("/compliance", { query: { overdue_only: true } }),
  });

  const { data: policies } = useQuery<{ key: string; name: string; config: Record<string, unknown>; is_active: boolean }[]>({
    queryKey: ["escalation-policies"],
    queryFn: () => api("/admin/escalation-policies"),
    retry: false,
  });

  const markRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not mark as read", "error");
    }
  };

  const notifColumns: Column<NotificationRow>[] = [
    {
      key: "title",
      header: "Notification",
      render: (n) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[n.severity] ?? "neutral"}>{n.severity}</Badge>
            <span className={`text-sm ${n.is_read ? "text-textmuted" : "font-semibold text-text"}`}>{n.title}</span>
          </div>
          <p className="mt-0.5 text-xs text-textmuted">{n.body}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", hideOnMobile: true, render: (n) => <span className="text-xs text-textmuted">{n.type}</span> },
    {
      key: "delivery",
      header: "Channel / delivery",
      render: (n) => (
        <div className="text-xs text-textmuted">
          <Badge tone={n.delivery_status === "sent" ? "success" : n.delivery_status === "failed" ? "danger" : "info"}>
            {n.delivery_status}
          </Badge>
          <span className="ml-1">{n.channel}</span>
        </div>
      ),
    },
    { key: "time", header: "When", render: (n) => <span className="text-xs text-textmuted">{timeAgo(n.created_at)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (n) => (
        <div className="flex justify-end gap-2">
          {n.link_path && (
            <Link href={n.link_path} className="btn-secondary px-2 py-1 text-xs">
              Open
            </Link>
          )}
          {!n.is_read && (
            <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => markRead(n.id)}>
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Read
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Alerts & escalations"
        description="Notification history with delivery records, plus the operational queue of overdue cases and obligations."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Alerts & Escalations" }]}
        actions={<Badge tone={notifs?.unread ? "accent" : "neutral"}>{notifs?.unread ?? 0} unread</Badge>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Metric label="Unread notifications" value={notifs?.unread ?? "—"} icon={<BellRing className="h-4 w-4" />} />
        <Metric
          label="Overdue applications"
          value={overdueApps?.total ?? "—"}
          tone={(overdueApps?.total ?? 0) ? "danger" : "neutral"}
          href="/applications?overdue=1"
          icon={<TriangleAlert className="h-4 w-4" />}
        />
        <Metric
          label="Overdue obligations"
          value={overdueObs?.items.length ?? "—"}
          tone={(overdueObs?.items.length ?? 0) ? "danger" : "neutral"}
          href="/compliance"
        />
      </div>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <Tabs
            tabs={[
              { key: "notifications", label: "Notification history", count: notifs?.items.length },
              { key: "escalations", label: "Escalation queue", count: (overdueApps?.total ?? 0) + (overdueObs?.items.length ?? 0) },
              { key: "policies", label: "Escalation policies" },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === "notifications" && (
          <DataTable
            caption="Notifications"
            columns={notifColumns}
            rows={notifs?.items ?? []}
            rowKey={(n) => n.id}
            isLoading={isLoading}
            error={error ? String(error) : null}
            onRetry={refetch}
            emptyTitle="No notifications"
            emptyHint="Assignments, stage changes, deadlines and escalations notify the responsible users here."
          />
        )}

        {tab === "escalations" && (
          <div className="p-4">
            <Notice kind="warning">
              The escalation queue lists factual blocker states — overdue stage targets and overdue obligations — with
              their owners. It does not attribute blame; use the dependency analysis page for the full picture.
            </Notice>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded border border-line">
                <p className="border-b border-line bg-navy-50/60 px-3 py-2 text-sm font-semibold">Overdue applications</p>
                <ul className="divide-y divide-line">
                  {(overdueApps?.items ?? []).slice(0, 10).map((a) => (
                    <li key={a.id}>
                      <Link href={`/applications/${a.id}`} className="flex items-center justify-between px-3 py-2 hover:bg-navy-50">
                        <span className="text-sm">{a.ref_no}</span>
                        <span className="text-xs text-textmuted">{a.assigned_officer?.name ?? "unassigned"}</span>
                      </Link>
                    </li>
                  ))}
                  {(!overdueApps || overdueApps.items.length === 0) && (
                    <li className="px-3 py-4 text-sm text-textmuted">No overdue stage targets.</li>
                  )}
                </ul>
              </div>
              <div className="rounded border border-line">
                <p className="border-b border-line bg-navy-50/60 px-3 py-2 text-sm font-semibold">Overdue obligations</p>
                <ul className="divide-y divide-line">
                  {(overdueObs?.items ?? []).map((o) => (
                    <li key={o.id}>
                      <Link href={`/compliance/${o.id}`} className="flex items-center justify-between px-3 py-2 hover:bg-navy-50">
                        <span className="text-sm">{o.ref_no}</span>
                        <span className="text-xs text-danger">level {o.escalation_level}</span>
                      </Link>
                    </li>
                  ))}
                  {(!overdueObs || overdueObs.items.length === 0) && (
                    <li className="px-3 py-4 text-sm text-textmuted">No overdue obligations.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {tab === "policies" && (
          <div className="p-4">
            {policies === undefined && <Skeleton rows={3} />}
            {policies && (
              <>
                <Notice kind="info">
                  Reminder intervals and escalation paths are configuration, not statutory deadlines. Administrators can
                  edit them under System Settings; changes are audit-logged.
                </Notice>
                <ul className="mt-4 space-y-3">
                  {policies.map((p) => (
                    <li key={p.key} className="rounded border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-text">{p.name}</p>
                        <Badge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "active" : "inactive"}</Badge>
                      </div>
                      <pre className="mt-2 overflow-x-auto rounded bg-navy-50/70 p-2 text-[11px] text-textmuted">
                        {JSON.stringify(p.config, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
                {can("admin.notification_policy_manage") && (
                  <p className="mt-3 text-xs text-textmuted">
                    Edit these under{" "}
                    <Link href="/settings" className="link">
                      System Settings → escalation policies
                    </Link>
                    .
                  </p>
                )}
              </>
            )}
            {policies && policies.length === 0 && <EmptyState title="No escalation policies configured" />}
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-textmuted">
        Notification records are stored with idempotency keys so retries never duplicate a message. Email runs in
        console/simulation mode unless SMTP is configured — simulated deliveries are labelled.
      </p>
    </div>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Alerts />
    </Suspense>
  );
}
