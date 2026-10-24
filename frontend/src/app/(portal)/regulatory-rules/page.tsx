"use client";

/** Regulatory rule registry, status control and simulation. */
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Plus } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { Badge, Card, Field, Modal, Notice, PageHeader, Skeleton } from "../../../components/common/ui";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { RegulatoryRule } from "../../../lib/types";

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  under_review: "warning",
  active: "success",
  retired: "neutral",
};

function CreateRule({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    rule_key: "",
    name: "",
    description: "",
    rule_type: "doc_validity",
    params: "{}",
    applicable_categories: "new_approval",
    source_document_title: "",
    clause: "",
    page: "",
    source_url: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(form.params || "{}");
    } catch {
      setError("Parameters must be valid JSON.");
      return;
    }
    setBusy(true);
    try {
      await api("/admin/rules", {
        json: {
          rule_key: form.rule_key.trim(),
          name: form.name.trim(),
          description: form.description || null,
          rule_type: form.rule_type,
          params,
          applicable_categories: form.applicable_categories.split(",").map((s) => s.trim()).filter(Boolean),
          source_document_title: form.source_document_title || null,
          clause: form.clause || null,
          page: form.page ? Number(form.page) : null,
          source_url: form.source_url || null,
        },
      });
      toast("Rule version created (status: draft)", "success");
      await qc.invalidateQueries({ queryKey: ["rules"] });
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
      title="Create regulatory rule version"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create rule"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Notice kind="danger">{error}</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rule key" htmlFor="r-key" required hint="Logical identifier; new versions reuse it.">
            <input id="r-key" className="input" value={form.rule_key} onChange={(e) => setForm({ ...form, rule_key: e.target.value })} />
          </Field>
          <Field label="Name" htmlFor="r-name" required>
            <input id="r-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" htmlFor="r-desc">
          <textarea id="r-desc" className="input min-h-[60px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rule type" htmlFor="r-type" required>
            <select id="r-type" className="input" value={form.rule_type} onChange={(e) => setForm({ ...form, rule_type: e.target.value })}>
              <option value="doc_validity">Document validity thresholds</option>
              <option value="lease_duration_min">Minimum remaining lease validity</option>
              <option value="intake_ceiling">Requested intake ceiling</option>
            </select>
          </Field>
          <Field label="Applicable categories (comma separated)" htmlFor="r-cat">
            <input id="r-cat" className="input" value={form.applicable_categories} onChange={(e) => setForm({ ...form, applicable_categories: e.target.value })} />
          </Field>
        </div>
        <Field label="Parameters (JSON)" htmlFor="r-params" required hint='e.g. {"warn_days": 60, "grace_days": 30}'>
          <textarea id="r-params" className="input font-mono min-h-[60px]" value={form.params} onChange={(e) => setForm({ ...form, params: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Source document" htmlFor="r-src">
            <input id="r-src" className="input" value={form.source_document_title} onChange={(e) => setForm({ ...form, source_document_title: e.target.value })} />
          </Field>
          <Field label="Clause / section" htmlFor="r-clause">
            <input id="r-clause" className="input" value={form.clause} onChange={(e) => setForm({ ...form, clause: e.target.value })} />
          </Field>
          <Field label="Page" htmlFor="r-page">
            <input id="r-page" type="number" className="input" value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} />
          </Field>
        </div>
        <Field label="Source URL" htmlFor="r-url">
          <input id="r-url" className="input" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function Rules() {
  const qc = useQueryClient();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [simRule, setSimRule] = useState<RegulatoryRule | null>(null);
  const [simInputs, setSimInputs] = useState("{}");
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<RegulatoryRule[]>({
    queryKey: ["rules"],
    queryFn: () => api("/admin/rules"),
  });

  const transition = async (rule: RegulatoryRule, status: string) => {
    try {
      await api(`/admin/rules/${rule.id}/status`, { json: { status, note: `changed to ${status} in portal` } });
      toast(`Rule ${rule.rule_key} → ${status}`, "success");
      await qc.invalidateQueries({ queryKey: ["rules"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Status change failed", "error");
    }
  };

  const columns: Column<RegulatoryRule>[] = [
    {
      key: "rule",
      header: "Rule",
      render: (r) => (
        <div>
          <p className="font-medium text-text">{r.name}</p>
          <p className="text-[11px] text-textmuted">
            {r.rule_key} · v{r.version} · {r.rule_type}
          </p>
        </div>
      ),
    },
    {
      key: "params",
      header: "Parameters",
      hideOnMobile: true,
      render: (r) => <code className="text-[11px] text-textmuted">{JSON.stringify(r.params)}</code>,
    },
    {
      key: "source",
      header: "Source",
      render: (r) => (
        <div className="text-xs">
          <p className="text-text">{r.source_document_title ?? "not cited"}</p>
          <p className="text-textmuted">
            {r.clause ? `${r.clause}` : ""}
            {r.page ? ` · p.${r.page}` : ""}
          </p>
          {r.source_url && (
            <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-navy-600 hover:underline">
              link
            </a>
          )}
        </div>
      ),
    },
    { key: "verify", header: "Verification", hideOnMobile: true, render: (r) => <Badge tone={r.verification_status === "needs_verification" ? "warning" : "neutral"}>{(r.verification_status ?? "").replace(/_/g, " ") || "—"}</Badge> },
    { key: "status", header: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status.replace(/_/g, " ")}</Badge> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {can("admin.rules_simulate") && (
            <button
              type="button"
              className="btn-secondary px-2 py-1 text-xs"
              onClick={() => {
                setSimRule(r);
                setSimResult(null);
                setSimInputs(
                  r.rule_type === "doc_validity"
                    ? '{"expiry_date": "2026-03-31", "today": "2026-01-01"}'
                    : r.rule_type === "lease_duration_min"
                      ? '{"remaining_lease_days": 900, "course_years": 4}'
                      : '{"requested_intake": 180}',
                );
              }}
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Simulate
            </button>
          )}
          {can("admin.rules_manage") && r.status !== "retired" && (
            <select
              aria-label={`Change status for ${r.name}`}
              className="input w-auto py-1 text-xs"
              value={r.status}
              disabled={busy === r.id}
              onChange={async (e) => {
                setBusy(r.id);
                await transition(r, e.target.value);
                setBusy(null);
              }}
            >
              <option value="draft">draft</option>
              <option value="under_review">under review</option>
              <option value="active">active</option>
              <option value="retired">retired</option>
            </select>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Regulatory rules"
        description="Versioned, citable configuration rules with draft → review → active → retired status control and a simulation sandbox."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Regulatory Rules" }]}
        actions={
          can("admin.rules_manage") ? (
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New rule
            </button>
          ) : null
        }
      />

      <Notice kind="warning" className="mb-4">
        Rule parameters in this prototype are demonstration values pending verification against the applicable
        Approval Process Handbook. Where the correct interpretation is uncertain, leave the rule in{" "}
        <em>draft / under review</em> and flag it for authorized verification. Retiring or changing a rule never
        rewrites applications already processed under an earlier version.
      </Notice>

      <Card>
        <DataTable
          caption="Regulatory rules"
          columns={columns}
          rows={data ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? String(error) : null}
          onRetry={refetch}
          emptyTitle="No rules configured"
        />
      </Card>

      <CreateRule open={createOpen} onClose={() => setCreateOpen(false)} />

      <Modal
        open={!!simRule}
        title={`Simulate — ${simRule?.name ?? ""}`}
        onClose={() => setSimRule(null)}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setSimRule(null)}>
              Close
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                if (!simRule) return;
                try {
                  const inputs = JSON.parse(simInputs);
                  setSimResult(await api(`/admin/rules/${simRule.id}/simulate`, { json: { inputs } }));
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Simulation failed", "error");
                }
              }}
            >
              Run simulation
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-textmuted">
            Evaluate this rule against hypothetical inputs <strong>without</strong> activating it or touching any
            application record.
          </p>
          <Field label="Inputs (JSON)" htmlFor="sim-inputs">
            <textarea id="sim-inputs" className="input font-mono min-h-[100px]" value={simInputs} onChange={(e) => setSimInputs(e.target.value)} />
          </Field>
          {simResult && (
            <pre className="overflow-x-auto rounded border border-line bg-navy-50/60 p-3 text-xs">{JSON.stringify(simResult, null, 2)}</pre>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default function RegulatoryRulesPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Rules />
    </Suspense>
  );
}
