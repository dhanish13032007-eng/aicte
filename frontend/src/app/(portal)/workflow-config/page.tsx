"use client";

/** Workflow configuration: versioned stages, transitions and activation. */
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Trash2, Rocket } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { ROLE_LABELS } from "../../../lib/format";
import { Badge, Card, Field, Notice, PageHeader, Skeleton, Tabs } from "../../../components/common/ui";
import type { WorkflowConfig } from "../../../lib/types";

interface StageDraft {
  key: string;
  name: string;
  target_days: number | null;
  owner_roles: string;
  required_doc_types: string;
  checklist: { key: string; label: string; required: boolean }[];
}

interface TransitionDraft {
  action: string;
  label: string;
  from_stage: string;
  to_stage: string;
  allowed_roles: string;
  requires_reason: boolean;
  prerequisites: string[];
}

const PREREQS = ["mandatory_fields_complete", "required_docs_present", "checklist_complete", "evc_report_present"];
const ALL_ROLES = Object.keys(ROLE_LABELS);

function VersionForm({ workflowId, onDone }: { workflowId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [changeNote, setChangeNote] = useState("");
  const [stages, setStages] = useState<StageDraft[]>([
    { key: "draft", name: "Draft (Institution)", target_days: null, owner_roles: "institution", required_doc_types: "declaration", checklist: [] },
    { key: "scrutiny", name: "Scrutiny", target_days: 10, owner_roles: "scrutiny_officer", required_doc_types: "", checklist: [{ key: "declaration", label: "Institution declaration verified", required: true }] },
    { key: "decision", name: "Authorized Decision", target_days: 5, owner_roles: "approving_authority", required_doc_types: "", checklist: [] },
    { key: "closed", name: "Closed", target_days: null, owner_roles: "", required_doc_types: "", checklist: [] },
  ]);
  const [transitions, setTransitions] = useState<TransitionDraft[]>([
    { action: "submit", label: "Submit application", from_stage: "draft", to_stage: "scrutiny", allowed_roles: "institution", requires_reason: false, prerequisites: ["mandatory_fields_complete"] },
    { action: "approve", label: "Record approval decision", from_stage: "scrutiny", to_stage: "closed", allowed_roles: "approving_authority", requires_reason: false, prerequisites: ["checklist_complete"] },
    { action: "reject", label: "Record rejection decision", from_stage: "scrutiny", to_stage: "closed", allowed_roles: "approving_authority", requires_reason: true, prerequisites: [] },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStage = (i: number, patch: Partial<StageDraft>) => setStages((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const setTr = (i: number, patch: Partial<TransitionDraft>) => setTransitions((t) => t.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    setError(null);
    try {
      const payload = {
        change_note: changeNote || "version created in portal",
        stages: stages.map((s) => ({
          key: s.key.trim(),
          name: s.name.trim(),
          target_days: s.target_days,
          owner_roles: s.owner_roles.split(",").map((r) => r.trim()).filter(Boolean),
          required_doc_types: s.required_doc_types.split(",").map((d) => d.trim()).filter(Boolean),
          checklist: s.checklist,
        })),
        transitions: transitions.map((t) => ({
          action: t.action.trim(),
          label: t.label.trim(),
          from_stage: t.from_stage.trim(),
          to_stage: t.to_stage.trim(),
          allowed_roles: t.allowed_roles.split(",").map((r) => r.trim()).filter(Boolean),
          requires_reason: t.requires_reason,
          prerequisites: t.prerequisites,
        })),
      };
      setBusy(true);
      const res = await api<{ version_no: number }>(`/admin/workflows/${workflowId}/versions`, { json: payload });
      toast(`Version ${res.version_no} created (existing applications keep their version)`, "success");
      await qc.invalidateQueries({ queryKey: ["workflows"] });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Version creation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Notice kind="danger">{error}</Notice>}
      <Field label="Change note" htmlFor="cv-note" required hint="Recorded in the audit trail with the new version.">
        <input id="cv-note" className="input" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">Stages</p>
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => setStages((s) => [...s, { key: "", name: "", target_days: 5, owner_roles: "", required_doc_types: "", checklist: [] }])}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add stage
          </button>
        </div>
        <div className="space-y-2">
          {stages.map((s, i) => (
            <div key={i} className="grid gap-2 rounded border border-line p-2 sm:grid-cols-4">
              <input className="input" placeholder="key" aria-label="Stage key" value={s.key} onChange={(e) => setStage(i, { key: e.target.value })} />
              <input className="input" placeholder="name" aria-label="Stage name" value={s.name} onChange={(e) => setStage(i, { name: e.target.value })} />
              <input
                className="input"
                type="number"
                placeholder="target days"
                aria-label="Target days"
                value={s.target_days ?? ""}
                onChange={(e) => setStage(i, { target_days: e.target.value === "" ? null : Number(e.target.value) })}
              />
              <input className="input" placeholder="owner roles (csv)" aria-label="Owner roles" value={s.owner_roles} onChange={(e) => setStage(i, { owner_roles: e.target.value })} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">Transitions</p>
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() =>
              setTransitions((t) => [
                ...t,
                { action: "", label: "", from_stage: "", to_stage: "", allowed_roles: "", requires_reason: false, prerequisites: [] },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add transition
          </button>
        </div>
        <div className="space-y-3">
          {transitions.map((t, i) => (
            <div key={i} className="rounded border border-line p-3">
              <div className="grid gap-2 sm:grid-cols-5">
                <input className="input" placeholder="action key" aria-label="Action key" value={t.action} onChange={(e) => setTr(i, { action: e.target.value })} />
                <input className="input" placeholder="label" aria-label="Action label" value={t.label} onChange={(e) => setTr(i, { label: e.target.value })} />
                <input className="input" placeholder="from stage" aria-label="From stage" value={t.from_stage} onChange={(e) => setTr(i, { from_stage: e.target.value })} />
                <input className="input" placeholder="to stage" aria-label="To stage" value={t.to_stage} onChange={(e) => setTr(i, { to_stage: e.target.value })} />
                <input className="input" placeholder="allowed roles (csv)" aria-label="Allowed roles" value={t.allowed_roles} onChange={(e) => setTr(i, { allowed_roles: e.target.value })} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={t.requires_reason} onChange={(e) => setTr(i, { requires_reason: e.target.checked })} className="h-3.5 w-3.5" />
                  requires reason
                </label>
                {PREREQS.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={t.prerequisites.includes(p)}
                      onChange={(e) =>
                        setTr(i, {
                          prerequisites: e.target.checked ? [...t.prerequisites, p] : t.prerequisites.filter((x) => x !== p),
                        })
                      }
                      className="h-3.5 w-3.5"
                    />
                    {p.replace(/_/g, " ")}
                  </label>
                ))}
                <button
                  type="button"
                  className="ml-auto text-danger"
                  aria-label="Remove transition"
                  onClick={() => setTransitions((ts) => ts.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create new version"}
        </button>
      </div>
    </div>
  );
}

function Config() {
  const qc = useQueryClient();
  const { can } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<WorkflowConfig[]>({
    queryKey: ["workflows"],
    queryFn: () => api("/admin/workflows"),
  });

  const activate = async (workflowId: string, version: number) => {
    try {
      await api(`/admin/workflows/${workflowId}/versions/${version}/activate`, { method: "POST" });
      toast(`Version ${version} activated for new applications`, "success");
      await qc.invalidateQueries({ queryKey: ["workflows"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Activation failed", "error");
    }
  };

  const wf = data?.find((w) => w.id === selected) ?? data?.[0] ?? null;
  const activeVersion = wf?.versions.find((v) => v.is_active) ?? wf?.versions[0];

  if (!can("admin.workflow_config")) {
    return (
      <Card>
        <div className="p-6 text-sm text-textmuted">
          Workflow configuration requires the administrator permission. Rules and stages are still visible to
          authorized roles elsewhere in the portal.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label htmlFor="wf" className="text-sm font-medium">
            Workflow definition
          </label>
          <select id="wf" className="input w-auto" value={wf?.id ?? ""} onChange={(e) => setSelected(e.target.value)}>
            {(data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.key})
              </option>
            ))}
          </select>
          <Badge tone="info">categories: {wf?.applicable_categories.join(", ") ?? "—"}</Badge>
          <button type="button" className="btn-primary ml-auto" onClick={() => setOpenForm((o) => !o)}>
            {openForm ? "Close editor" : "New version"}
          </button>
        </div>

        {isLoading && <Skeleton rows={6} />}
        {error && <div className="p-4 text-sm text-danger">{String(error)}</div>}

        {openForm && wf && (
          <div className="border-b border-line p-4">
            <Notice kind="warning" className="mb-3">
              New versions apply to new applications only. Applications already in flight keep the version they were
              created under, so historical outcomes are never rewritten.
            </Notice>
            <VersionForm
              workflowId={wf.id}
              onDone={() => {
                setOpenForm(false);
                void refetch();
              }}
            />
          </div>
        )}

        {wf && (
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Versions</p>
              {wf.versions.map((v) => (
                <span key={v.version_no} className="inline-flex items-center gap-1">
                  <Badge tone={v.is_active ? "success" : "neutral"}>
                    v{v.version_no} {v.is_active ? "· active" : ""}
                  </Badge>
                  {!v.is_active && (
                    <button type="button" className="btn-secondary px-2 py-0.5 text-[11px]" onClick={() => activate(wf.id, v.version_no)}>
                      <Rocket className="h-3 w-3" aria-hidden /> Activate
                    </button>
                  )}
                </span>
              ))}
            </div>

            {activeVersion && (
              <>
                <p className="label">Stages of v{activeVersion.version_no}</p>
                <ol className="mb-4 flex flex-wrap gap-1.5">
                  {activeVersion.stages.map((s) => (
                    <li key={s.key} className="rounded border border-line bg-white px-2 py-1 text-xs">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-textmuted"> · {s.key}</span>
                      {s.target_days !== null && <span className="text-textmuted"> · {s.target_days}d target</span>}
                    </li>
                  ))}
                </ol>

                <p className="label">Transitions</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px]">
                    <thead>
                      <tr>
                        <th className="th">Action</th>
                        <th className="th">From → To</th>
                        <th className="th">Allowed roles</th>
                        <th className="th">Prerequisites</th>
                        <th className="th">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeVersion.transitions.map((t) => (
                        <tr key={t.action}>
                          <td className="td">
                            <p className="font-medium">{t.label}</p>
                            <p className="text-[11px] text-textmuted">{t.action}</p>
                          </td>
                          <td className="td text-xs">
                            {t.from_stage} → {t.to_stage}
                          </td>
                          <td className="td text-xs">{t.allowed_roles.join(", ")}</td>
                          <td className="td text-xs text-textmuted">{t.prerequisites.join(", ") || "—"}</td>
                          <td className="td">{t.requires_reason ? <Badge tone="warning">required</Badge> : <span className="text-textmuted">optional</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function WorkflowConfigPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Config />
    </Suspense>
  );
}
