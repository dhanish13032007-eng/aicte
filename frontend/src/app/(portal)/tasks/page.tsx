"use client";

/** My Tasks: the assignee's open worklist with overdue tracking. */
import Link from "next/link";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, ListTodo } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { fmtDate, timeAgo } from "../../../lib/format";
import { Badge, Card, Metric, PageHeader, Tabs } from "../../../components/common/ui";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { TaskRow } from "../../../lib/types";

function Tasks() {
  const { can, user } = useSession();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"mine" | "institution" | "all">("mine");
  const [status, setStatus] = useState<"open" | "done" | "">("open");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const effectiveScope =
    scope === "all" && !can("application.view_all") ? "mine" : scope;

  const { data, isLoading, error, refetch } = useQuery<{
    total: number;
    open: number;
    overdue: number;
    items: TaskRow[];
  }>({
    queryKey: ["tasks", effectiveScope, status, overdueOnly],
    queryFn: () =>
      api("/tasks", {
        query: {
          scope: effectiveScope,
          status_filter: status || undefined,
          overdue_only: overdueOnly || undefined,
        },
      }),
  });

  const complete = async (id: string) => {
    try {
      await api(`/tasks/${id}/complete`, { method: "POST" });
      toast("Task marked done", "success");
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not complete the task", "error");
    }
  };

  const columns: Column<TaskRow>[] = [
    {
      key: "title",
      header: "Task",
      render: (t) => (
        <div>
          <p className="font-medium text-text">{t.title}</p>
          <p className="text-[11px] text-textmuted">
            {t.task_type} · created {timeAgo(t.created_at)}
          </p>
        </div>
      ),
    },
    {
      key: "record",
      header: "Linked record",
      render: (t) =>
        t.application ? (
          <Link href={`/applications/${t.application.id}`} className="text-navy-600 hover:underline">
            {t.application.ref_no}
            <span className="block text-[11px] text-textmuted">stage {t.application.stage}</span>
          </Link>
        ) : t.obligation ? (
          <Link href={`/compliance/${t.obligation.id}`} className="text-navy-600 hover:underline">
            {t.obligation.ref_no}
          </Link>
        ) : t.evc_case ? (
          <Link href={`/evc/${t.evc_case.id}`} className="text-navy-600 hover:underline">
            EVC case
          </Link>
        ) : (
          <span className="text-textmuted">—</span>
        ),
    },
    {
      key: "due",
      header: "Due",
      render: (t) => (
        <span className={t.overdue ? "font-semibold text-danger" : ""}>
          {fmtDate(t.due_date)}
          {t.overdue && <span className="block text-[11px] text-danger">overdue</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <Badge tone={t.status === "open" ? "info" : t.status === "done" ? "success" : "neutral"}>{t.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (t) =>
        t.status === "open" ? (
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => complete(t.id)}>
            <CheckSquare className="h-3.5 w-3.5" aria-hidden /> Mark done
          </button>
        ) : (
          <span className="text-[11px] text-textmuted">completed {fmtDate(t.completed_at)}</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="My tasks"
        description="Work items assigned to you across applications, compliance obligations and EVC cases."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "My Tasks" }]}
        actions={
          <Badge tone={data?.overdue ? "danger" : "neutral"}>
            {data?.overdue ?? 0} overdue
          </Badge>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Metric label="Open tasks" value={data?.open ?? "—"} icon={<ListTodo className="h-4 w-4" />} />
        <Metric
          label="Overdue"
          value={data?.overdue ?? "—"}
          tone={data?.overdue ? "danger" : "neutral"}
          href="/tasks?status=open&overdue=1"
        />
        <Metric label="Showing" value={data?.total ?? "—"} hint={`${user?.name}`} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Tabs
            tabs={[
              { key: "open", label: "Open" },
              { key: "done", label: "Completed" },
              { key: "", label: "All" },
            ]}
            active={status}
            onChange={(k) => setStatus(k as "open" | "done" | "")}
          />
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {can("application.view_own_institution") && user?.role === "institution" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scope === "institution"}
                  onChange={(e) => setScope(e.target.checked ? "institution" : "mine")}
                  className="h-4 w-4"
                />
                Institution-wide
              </label>
            )}
            {can("application.view_all") && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scope === "all"}
                  onChange={(e) => setScope(e.target.checked ? "all" : "mine")}
                  className="h-4 w-4"
                />
                All records
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
                className="h-4 w-4"
              />
              Overdue only
            </label>
          </div>
        </div>
        <DataTable
          caption="Tasks"
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(t) => t.id}
          isLoading={isLoading}
          error={error ? String(error) : null}
          onRetry={refetch}
          emptyTitle="No tasks match this view"
          emptyHint="Tasks are created by assignments, workflow transitions, EVC reports and compliance follow-ups."
        />
      </Card>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Tasks />
    </Suspense>
  );
}
