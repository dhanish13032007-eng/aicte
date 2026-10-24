"use client";

/** Compliance & undertakings register. */
import Link from "next/link";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldAlert } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { fmtDate, OB_STATUS_META } from "../../../lib/format";
import { Badge, Card, Field, Metric, Modal, Notice, PageHeader, Skeleton, StatusBadge, Tabs } from "../../../components/common/ui";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { Institution, ObligationRow } from "../../../lib/types";

function CreateObligation({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { data: institutions } = useQuery<Institution[]>({
    queryKey: ["institutions"],
    queryFn: () => api("/admin/institutions"),
    enabled: open,
  });
  const [form, setForm] = useState({
    institution_id: "",
    title: "",
    description: "",
    category: "undertaking",
    due_date: "",
    source_ref: "",
    source_type: "internal_target",
    required_evidence: "declaration",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!form.institution_id || !form.title.trim() || !form.due_date) {
      setError("Institution, title and due date are required.");
      return;
    }
    setBusy(true);
    try {
      await api("/compliance", {
        json: {
          institution_id: form.institution_id,
          title: form.title.trim(),
          description: form.description || null,
          category: form.category,
          due_date: new Date(`${form.due_date}T12:00:00`).toISOString(),
          source_ref: form.source_ref || null,
          source_type: form.source_type,
          required_evidence: form.required_evidence
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      toast("Obligation created", "success");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Create compliance obligation"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create obligation"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Notice kind="danger">{error}</Notice>}
        <Field label="Institution" htmlFor="ob-inst" required>
          <select id="ob-inst" className="input" value={form.institution_id} onChange={(e) => setForm({ ...form, institution_id: e.target.value })}>
            <option value="">Select…</option>
            {(institutions ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" htmlFor="ob-title" required>
          <input id="ob-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor="ob-desc">
          <textarea id="ob-desc" className="input min-h-[70px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="ob-cat">
            <select id="ob-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="undertaking">Undertaking</option>
              <option value="fire_safety_renewal">Fire safety renewal</option>
              <option value="building_safety">Building safety</option>
              <option value="faculty">Faculty</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Due date" htmlFor="ob-due" required>
            <input id="ob-due" type="date" className="input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </Field>
        </div>
        <Field
          label="Source reference"
          htmlFor="ob-src"
          hint="Cite the clause/policy this obligation derives from, or mark it as an internal/demonstration target."
        >
          <input id="ob-src" className="input" value={form.source_ref} onChange={(e) => setForm({ ...form, source_ref: e.target.value })} placeholder="e.g. APD-OP-07 (internal target)" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source type" htmlFor="ob-srctype">
            <select id="ob-srctype" className="input" value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
              <option value="internal_target">Internal operational target</option>
              <option value="official_policy">Official policy (cited)</option>
              <option value="demonstration">Demonstration / synthetic</option>
            </select>
          </Field>
          <Field label="Required evidence (comma separated)" htmlFor="ob-ev">
            <input id="ob-ev" className="input" value={form.required_evidence} onChange={(e) => setForm({ ...form, required_evidence: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function Compliance() {
  const { can } = useSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{ total: number; items: ObligationRow[] }>({
    queryKey: ["compliance", status, overdueOnly],
    queryFn: () => api("/compliance", { query: { status_filter: status || undefined, overdue_only: overdueOnly || undefined } }),
  });

  const items = data?.items ?? [];
  const overdue = items.filter((o) => (o.days_left ?? 1) < 0 && !["verified", "closed", "waived"].includes(o.status));
  const dueSoon = items.filter((o) => (o.days_left ?? 0) >= 0 && (o.days_left ?? 0) <= 7);

  const escalate = async (id: string) => {
    try {
      await api(`/compliance/${id}/escalate`, { method: "POST", json: {} });
      toast("Escalation recorded and notification queued", "success");
      await qc.invalidateQueries({ queryKey: ["compliance"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Escalation failed", "error");
    }
  };

  const columns: Column<ObligationRow>[] = [
    {
      key: "ref",
      header: "Obligation",
      render: (o) => (
        <div>
          <Link href={`/compliance/${o.id}`} className="font-semibold text-navy-600 hover:underline">
            {o.ref_no}
          </Link>
          <p className="text-xs text-textmuted">{o.title}</p>
        </div>
      ),
    },
    { key: "inst", header: "Institution", hideOnMobile: true, render: (o) => <span className="text-sm">{o.institution}</span> },
    {
      key: "cat",
      header: "Category / source",
      hideOnMobile: true,
      render: (o) => (
        <div>
          <p className="text-sm">{o.category}</p>
          <p className="text-[11px] text-textmuted">{o.source_ref ?? "no source cited"}</p>
        </div>
      ),
    },
    {
      key: "due",
      header: "Due",
      render: (o) => (
        <span className={(o.days_left ?? 0) < 0 ? "font-semibold text-danger" : ""}>
          {fmtDate(o.due_date)}
          <span className="block text-[11px] text-textmuted">
            {o.days_left === null || o.days_left === undefined
              ? "no due date"
              : o.days_left < 0
                ? `${Math.abs(o.days_left)}d overdue`
                : `in ${o.days_left}d`}
          </span>
        </span>
      ),
    },
    { key: "status", header: "Status", render: (o) => <StatusBadge meta={OB_STATUS_META} value={o.status} /> },
    {
      key: "esc",
      header: "Escalation",
      hideOnMobile: true,
      render: (o) =>
        can("compliance.escalate") && !["verified", "closed"].includes(o.status) ? (
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => escalate(o.id)}>
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Level {o.escalation_level}
          </button>
        ) : (
          <Badge tone={o.escalation_level ? "warning" : "neutral"}>level {o.escalation_level}</Badge>
        ),
    },
    {
      key: "app",
      header: "Application",
      hideOnMobile: true,
      render: (o) =>
        o.application_id ? (
          <Link href={`/applications/${o.application_id}`} className="text-navy-600 hover:underline">
            {o.application_ref ?? "open"}
          </Link>
        ) : (
          <span className="text-textmuted">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Compliance & undertakings"
        description="Obligations with cited sources, evidence submissions, authorized verification, reminders and escalation levels."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Compliance & Undertakings" }]}
        actions={
          can("compliance.create") ? (
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New obligation
            </button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total in view" value={data?.total ?? "—"} href="/compliance" />
        <Metric label="Overdue" value={overdue.length} tone={overdue.length ? "danger" : "neutral"} href="/compliance" />
        <Metric label="Due within 7 days" value={dueSoon.length} tone={dueSoon.length ? "warning" : "neutral"} />
        <Metric label="Verified / closed" value={items.filter((o) => ["verified", "closed"].includes(o.status)).length} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Tabs
            tabs={[
              { key: "", label: "All" },
              { key: "pending_submission", label: "Pending submission" },
              { key: "submitted", label: "Submitted" },
              { key: "under_verification", label: "Under verification" },
              { key: "verified", label: "Verified" },
            ]}
            active={status}
            onChange={setStatus}
          />
          <label className="flex items-center gap-2 pt-2 text-sm text-text">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="h-4 w-4" />
            Overdue only
          </label>
        </div>
        <DataTable
          caption="Compliance obligations"
          columns={columns}
          rows={items}
          rowKey={(o) => o.id}
          isLoading={isLoading}
          error={error ? String(error) : null}
          onRetry={refetch}
          emptyTitle="No obligations match this filter"
          emptyHint="Obligations are created from workflow outcomes or manually by authorized officers."
        />
      </Card>

      <Notice kind="info" className="mt-4">
        An obligation is never marked compliant automatically: uploaded evidence must be reviewed and verified by an
        authorized officer, and every verdict is recorded.
      </Notice>

      <CreateObligation
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ["compliance"] });
          void refetch();
        }}
      />
      {isLoading && <Skeleton rows={2} />}
    </div>
  );
}

export default function CompliancePage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Compliance />
    </Suspense>
  );
}
