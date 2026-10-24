"use client";

/** Role-specific dashboard: every number comes from a live backend query. */
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  CalendarClock,
  ClipboardList,
  FileWarning,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Send,
  Users,
} from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { useAcademicYear } from "../../../lib/prefs";
import { fmtDate, ROLE_LABELS, STATUS_META, STAGE_LABELS, timeAgo } from "../../../lib/format";
import { Badge, Card, EmptyState, ErrorState, Metric, PageHeader, Skeleton, StatusBadge } from "../../../components/common/ui";
import { BarChartCard, HorizontalBarChart, PieChartCard, TrendLineChart } from "../../../components/charts/Charts";
import type { ApplicationSummary, NotificationRow } from "../../../lib/types";

interface ExecDash {
  active_applications: number;
  pending_applications: number;
  applications_by_stage: { stage: string; count: number }[];
  stage_deadlines: { overdue: number; approaching_3d: number };
  applications_awaiting_decision: number;
  applications_awaiting_clarification: number;
  avg_days_to_close: number | null;
  evc: { pending_scheduling: number; awaiting_report: number };
  compliance: { open: number; overdue: number };
  documents: { nearing_expiry_60d: number; expired: number };
  data_provenance: string;
}

interface OfficerDash {
  assigned_applications: number;
  awaiting_review: number;
  open_tasks: number;
  overdue_tasks: number;
  tasks_due_7d: number;
  clarification_required: number;
}

interface InstitutionDash {
  applications_total: number;
  applications_open: number;
  awaiting_my_action: number;
  outstanding_obligations: number;
  obligations_overdue: number;
  documents_needing_attention: number;
  documents_expiring_soon: number;
}

interface ComplianceDash {
  total: number;
  by_status: { status: string; count: number }[];
  overdue: number;
  verified: number;
  due_7d: number;
}

interface EvcDash {
  by_status: Record<string, number>;
  upcoming_visits: number;
  rescheduled: number;
  pending_reports: number;
}

function ChartCard({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <Card title={title} description={hint}>
      <div className="px-3 py-4">{children}</div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, can, canAny } = useSession();
  const [year] = useAcademicYear();

  const isExec = can("dash.executive");
  const isInstitution = user?.role === "institution";
  const isCompliance = can("dash.compliance");
  const isEvc = user?.role === "evc_coordinator" || user?.role === "evc_member";

  const exec = useQuery<ExecDash>({
    queryKey: ["dash", "executive"],
    queryFn: () => api("/dashboards/executive"),
    enabled: isExec,
  });
  const officer = useQuery<OfficerDash>({
    queryKey: ["dash", "officer"],
    queryFn: () => api("/dashboards/officer"),
    enabled: !isInstitution,
  });
  const inst = useQuery<InstitutionDash>({
    queryKey: ["dash", "institution"],
    queryFn: () => api("/dashboards/institution"),
    enabled: isInstitution,
  });
  const compliance = useQuery<ComplianceDash>({
    queryKey: ["dash", "compliance"],
    queryFn: () => api("/dashboards/compliance"),
    enabled: isCompliance,
  });
  const evc = useQuery<EvcDash>({
    queryKey: ["dash", "evc"],
    queryFn: () => api("/dashboards/evc"),
    enabled: isEvc,
  });

  const ageing = useQuery({
    queryKey: ["analytics", "ageing"],
    queryFn: () => api<{ bucket: string; count: number }[]>("/analytics/ageing"),
    enabled: can("reports.view"),
  });
  const workload = useQuery({
    queryKey: ["analytics", "workload"],
    queryFn: () =>
      api<{ officer: string; role: string; open_applications: number }[]>("/analytics/workload"),
    enabled: can("reports.view"),
  });
  const monthly = useQuery({
    queryKey: ["analytics", "monthly"],
    queryFn: () => api<{ month: string; submitted: number }[]>("/analytics/monthly"),
    enabled: can("reports.view"),
  });

  const upcoming = useQuery<{ total: number; items: ApplicationSummary[] }>({
    queryKey: ["apps", "upcoming", year],
    queryFn: () =>
      api("/applications", {
        query: { sort: "stage_deadline", order: "asc", page_size: 8, state: "open", academic_year: year || undefined },
      }),
  });

  const notifs = useQuery<{ unread: number; items: NotificationRow[] }>({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications", { query: { limit: 6 } }),
  });

  const stageData = useMemo(
    () =>
      (exec.data?.applications_by_stage ?? []).map((s) => ({
        stage: STAGE_LABELS[s.stage] ?? s.stage,
        count: s.count,
      })),
    [exec.data],
  );

  if (!user) return <Skeleton rows={6} />;

  return (
    <div>
      <PageHeader
        title={`Overview — ${ROLE_LABELS[user.role] ?? user.role}`}
        description={
          isInstitution
            ? "Your institution's applications, pending actions, obligations and document alerts."
            : "Database-backed operational metrics across applications, EVC, compliance and document validity."
        }
        actions={
          <Link href="/applications" className="btn-secondary">
            Open registry
          </Link>
        }
      />

      {/* --- institution dashboard ------------------------------------ */}
      {isInstitution && (
        <>
          {inst.isLoading && <Skeleton rows={3} />}
          {inst.error && <Card><ErrorState message={String(inst.error)} onRetry={inst.refetch} /></Card>}
          {inst.data && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Applications (total)" value={inst.data.applications_total} href="/applications" icon={<ClipboardList className="h-4 w-4" />} />
              <Metric label="Open applications" value={inst.data.applications_open} href="/applications?state=open" />
              <Metric
                label="Awaiting my action"
                value={inst.data.awaiting_my_action}
                href="/applications?stage=clarification"
                tone={inst.data.awaiting_my_action ? "warning" : "neutral"}
                icon={<Send className="h-4 w-4" />}
              />
              <Metric
                label="Outstanding obligations"
                value={inst.data.outstanding_obligations}
                href="/compliance"
                tone={inst.data.obligations_overdue ? "danger" : "neutral"}
                hint={inst.data.obligations_overdue ? `${inst.data.obligations_overdue} overdue` : "none overdue"}
                icon={<ShieldIcon />}
              />
              <Metric
                label="Documents needing attention"
                value={inst.data.documents_needing_attention}
                href="/documents?status=needs_manual_review"
                tone={inst.data.documents_needing_attention ? "warning" : "neutral"}
                icon={<FileWarning className="h-4 w-4" />}
              />
              <Metric
                label="Documents expiring ≤60 days"
                value={inst.data.documents_expiring_soon}
                href="/calendar"
                tone={inst.data.documents_expiring_soon ? "warning" : "neutral"}
                icon={<CalendarClock className="h-4 w-4" />}
              />
            </div>
          )}
        </>
      )}

      {/* --- executive dashboard -------------------------------------- */}
      {isExec && (
        <>
          {exec.isLoading && <Skeleton rows={3} />}
          {exec.error && <Card><ErrorState message={String(exec.error)} onRetry={exec.refetch} /></Card>}
          {exec.data && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Active applications" value={exec.data.active_applications} href="/applications?state=open" icon={<LayoutDashboard className="h-4 w-4" />} />
              <Metric label="Pending processing" value={exec.data.pending_applications} href="/applications?state=open" />
              <Metric
                label="Stage targets overdue"
                value={exec.data.stage_deadlines.overdue}
                href="/applications?overdue=1"
                tone={exec.data.stage_deadlines.overdue ? "danger" : "neutral"}
                hint={`${exec.data.stage_deadlines.approaching_3d} due within 3 days`}
                icon={<AlertOctagon className="h-4 w-4" />}
              />
              <Metric label="Awaiting authorized decision" value={exec.data.applications_awaiting_decision} href="/applications?status=awaiting_decision" />
              <Metric label="Awaiting clarification" value={exec.data.applications_awaiting_clarification} href="/applications?stage=clarification" />
              <Metric label="EVC awaiting scheduling" value={exec.data.evc.pending_scheduling} href="/evc?status=ready_to_schedule" icon={<Users className="h-4 w-4" />} />
              <Metric label="EVC reports pending" value={exec.data.evc.awaiting_report} href="/evc?status=awaiting_report" />
              <Metric
                label="Compliance overdue"
                value={exec.data.compliance.overdue}
                href="/compliance?overdue=1"
                tone={exec.data.compliance.overdue ? "danger" : "neutral"}
                hint={`${exec.data.compliance.open} open obligations`}
              />
              <Metric label="Documents expiring ≤60d" value={exec.data.documents.nearing_expiry_60d} href="/calendar" />
              <Metric label="Documents expired" value={exec.data.documents.expired} href="/calendar" tone={exec.data.documents.expired ? "danger" : "neutral"} />
              <Metric
                label="Avg days to close"
                value={exec.data.avg_days_to_close ?? "—"}
                hint="Closed applications, database-computed"
              />
              <Metric label="Data provenance" value="Live DB" hint={exec.data.data_provenance} />
            </div>
          )}
        </>
      )}

      {/* --- officer dashboard ---------------------------------------- */}
      {!isInstitution && officer.data && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Assigned to me" value={officer.data.assigned_applications} href="/applications?assigned=me" icon={<Inbox className="h-4 w-4" />} />
          <Metric label="Awaiting my review" value={officer.data.awaiting_review} href="/scrutiny" />
          <Metric label="Open tasks" value={officer.data.open_tasks} href="/tasks" icon={<ListTodo className="h-4 w-4" />} />
          <Metric
            label="Overdue tasks"
            value={officer.data.overdue_tasks}
            href="/tasks?overdue=1"
            tone={officer.data.overdue_tasks ? "danger" : "neutral"}
            icon={<AlertOctagon className="h-4 w-4" />}
          />
          <Metric label="Due in 7 days" value={officer.data.tasks_due_7d} href="/tasks" />
          <Metric label="Returned for clarification" value={officer.data.clarification_required} href="/applications?status=clarification_required" />
        </div>
      )}

      {/* --- compliance dashboard -------------------------------------- */}
      {isCompliance && compliance.data && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total obligations" value={compliance.data.total} href="/compliance" />
          <Metric label="Overdue" value={compliance.data.overdue} href="/compliance?overdue=1" tone={compliance.data.overdue ? "danger" : "neutral"} />
          <Metric label="Due in 7 days" value={compliance.data.due_7d} href="/compliance" tone="warning" />
          <Metric label="Verified" value={compliance.data.verified} href="/compliance?status=verified" />
        </div>
      )}

      {/* --- EVC dashboard --------------------------------------------- */}
      {isEvc && evc.data && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Ready to schedule" value={evc.data.by_status.ready_to_schedule ?? 0} href="/evc?status=ready_to_schedule" tone="warning" />
          <Metric label="Scheduled" value={evc.data.by_status.scheduled ?? 0} href="/evc?status=scheduled" />
          <Metric label="Upcoming visits (30d)" value={evc.data.upcoming_visits} href="/evc" icon={<CalendarClock className="h-4 w-4" />} />
          <Metric label="Reports pending" value={evc.data.pending_reports} href="/evc?status=awaiting_report" tone={evc.data.pending_reports ? "warning" : "neutral"} />
        </div>
      )}

      {/* --- charts ----------------------------------------------------- */}
      {can("reports.view") && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {stageData.length > 0 && (
            <ChartCard title="Applications by workflow stage" hint="Counts grouped by current stage">
              <PieChartCard data={stageData} dataKey="count" labelKey="stage" />
            </ChartCard>
          )}
          {ageing.data && ageing.data.length > 0 && (
            <ChartCard title="Application ageing distribution" hint="Days since submission, open applications">
              <BarChartCard data={ageing.data} dataKey="count" labelKey="bucket" color="#1D4F91" />
            </ChartCard>
          )}
          {workload.data && workload.data.length > 0 && (
            <ChartCard title="Officer workload" hint="Open applications per assigned officer">
              <HorizontalBarChart data={workload.data} dataKey="open_applications" labelKey="officer" height={300} />
            </ChartCard>
          )}
          {monthly.data && monthly.data.length > 0 && (
            <ChartCard title="Monthly submissions" hint="Applications submitted per calendar month">
              <TrendLineChart data={monthly.data} xKey="month" yKey="submitted" />
            </ChartCard>
          )}
        </div>
      )}

      {/* --- deadlines + notifications ---------------------------------- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card
          title="Upcoming stage deadlines"
          description="Internal operational targets (not statutory deadlines)"
          actions={
            <Link href="/applications?sort=stage_deadline&order=asc" className="text-xs text-navy-600 hover:underline">
              View all
            </Link>
          }
        >
          {upcoming.isLoading && <Skeleton rows={5} />}
          {upcoming.error && <ErrorState message={String(upcoming.error)} onRetry={upcoming.refetch} />}
          {upcoming.data && upcoming.data.items.length === 0 && <EmptyState title="No open applications with deadlines" />}
          {upcoming.data && upcoming.data.items.length > 0 && (
            <ul className="divide-y divide-line">
              {upcoming.data.items.map((a) => (
                <li key={a.id}>
                  <Link href={`/applications/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-navy-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{a.ref_no}</p>
                      <p className="truncate text-xs text-textmuted">{a.institution_name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge meta={STATUS_META} value={a.status} />
                      <span className="w-20 text-right text-xs text-textmuted">{fmtDate(a.stage_deadline)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent notifications"
          description="In-app delivery records with status"
          actions={
            <Link href="/alerts" className="text-xs text-navy-600 hover:underline">
              Open alerts
            </Link>
          }
        >
          {notifs.isLoading && <Skeleton rows={4} />}
          {notifs.error && <ErrorState message={String(notifs.error)} onRetry={notifs.refetch} />}
          {notifs.data && notifs.data.items.length === 0 && <EmptyState title="No notifications yet" />}
          {notifs.data && notifs.data.items.length > 0 && (
            <ul className="divide-y divide-line">
              {notifs.data.items.map((n) => (
                <li key={n.id} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <Badge tone={n.severity === "critical" ? "danger" : n.severity === "warning" ? "warning" : "info"}>
                      {n.severity}
                    </Badge>
                    <div className="min-w-0">
                      <p className={`text-sm ${n.is_read ? "text-textmuted" : "font-semibold text-text"}`}>{n.title}</p>
                      <p className="text-[11px] text-textmuted">
                        {timeAgo(n.created_at)} · {n.channel} · {n.delivery_status}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {!isExec && !isInstitution && !officer.data && officer.isLoading && <Skeleton rows={3} />}
      {officer.error && !isInstitution && (
        <Card className="mt-4">
          <ErrorState message="Could not load the officer dashboard." onRetry={officer.refetch} />
        </Card>
      )}
      <p className="mt-6 text-xs text-textmuted">
        Signed in as {user.email} · {ROLE_LABELS[user.role] ?? user.role}
        {user.region ? ` · ${user.region}` : ""} · permissions checked server-side on every request.
        {canAny("audit.view_all") ? " Audit access: full." : ""}
      </p>
    </div>
  );
}

function ShieldIcon() {
  return <ClipboardList className="h-4 w-4" aria-hidden />;
}
