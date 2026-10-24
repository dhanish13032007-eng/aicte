"use client";

/** System settings: escalation policies, system settings, RAG source registry. */
import { Suspense, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw, Save, Upload } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { fmtDate } from "../../../lib/format";
import { Badge, Card, Field, Notice, PageHeader, Skeleton, Tabs } from "../../../components/common/ui";
import type { RagSource } from "../../../lib/types";

function EscalationPolicies() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery<{ key: string; name: string; config: Record<string, unknown>; is_active: boolean }[]>({
    queryKey: ["escalation-policies"],
    queryFn: () => api("/admin/escalation-policies"),
  });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (key: string) => {
    const raw = edits[key];
    if (raw === undefined) return;
    setBusy(key);
    try {
      const config = JSON.parse(raw);
      await api("/admin/escalation-policies", { method: "PUT", json: { key, config } });
      toast("Escalation policy updated (audit-logged)", "success");
      await qc.invalidateQueries({ queryKey: ["escalation-policies"] });
      await refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Invalid configuration", "error");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <Skeleton rows={4} />;
  return (
    <div className="space-y-4">
      <Notice kind="warning">
        These intervals are internal operational configuration, not statutory deadlines. Any T-60/T-30/T-15 style
        schedule is illustrative unless an official source confirms it.
      </Notice>
      {(data ?? []).map((p) => (
        <div key={p.key} className="rounded border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">{p.name}</p>
            <Badge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "active" : "inactive"}</Badge>
          </div>
          <textarea
            className="input font-mono mt-2 min-h-[80px]"
            aria-label={`Configuration for ${p.name}`}
            value={edits[p.key] ?? JSON.stringify(p.config, null, 2)}
            onChange={(e) => setEdits({ ...edits, [p.key]: e.target.value })}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const next = { ...edits };
                delete next[p.key];
                setEdits(next);
              }}
            >
              Reset
            </button>
            <button type="button" className="btn-primary" disabled={busy === p.key || edits[p.key] === undefined} onClick={() => save(p.key)}>
              <Save className="h-4 w-4" aria-hidden /> {busy === p.key ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SystemSettings() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery<{ key: string; value: unknown; description?: string | null }[]>({
    queryKey: ["settings"],
    queryFn: () => api("/admin/settings"),
  });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (key: string) => {
    setBusy(key);
    try {
      const value = JSON.parse(edits[key]);
      await api("/admin/settings", { method: "PUT", json: { key, value } });
      toast("Setting saved (audit-logged)", "success");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Invalid JSON", "error");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <Skeleton rows={4} />;
  return (
    <div className="space-y-4">
      <Notice kind="info">
        Risk weights, default academic year and the demo notice live here. Changing risk weights changes
        prioritization only — never the legal merits of an application.
      </Notice>
      {(data ?? []).map((s) => (
        <div key={s.key} className="rounded border border-line p-3">
          <p className="text-sm font-semibold text-text">{s.key}</p>
          {s.description && <p className="text-xs text-textmuted">{s.description}</p>}
          <textarea
            className="input font-mono mt-2 min-h-[70px]"
            aria-label={`Value for ${s.key}`}
            value={edits[s.key] ?? JSON.stringify(s.value, null, 2)}
            onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })}
          />
          <div className="mt-2 flex justify-end">
            <button type="button" className="btn-primary" disabled={busy === s.key || edits[s.key] === undefined} onClick={() => save(s.key)}>
              <Save className="h-4 w-4" aria-hidden /> {busy === s.key ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ))}
      {!data?.length && <p className="text-sm text-textmuted">No settings configured.</p>}
    </div>
  );
}

function RagSources() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ title: "", authority: "AICTE", academic_year: "", version: "", publication_date: "", source_url: "" });
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery<RagSource[]>({
    queryKey: ["rag-sources"],
    queryFn: () => api("/admin/rag/documents"),
  });

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!form.title.trim() || !file) {
      toast("A title and a source file are required", "error");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append("title", form.title.trim());
    fd.append("authority", form.authority);
    if (form.academic_year) fd.append("academic_year", form.academic_year);
    if (form.version) fd.append("version", form.version);
    if (form.publication_date) fd.append("publication_date", form.publication_date);
    if (form.source_url) fd.append("source_url", form.source_url);
    fd.append("file", file);
    try {
      const res = await api<{ chunks: number; embedded?: boolean; retrieval_mode?: string; error?: string }>("/admin/rag/documents", {
        method: "POST",
        form: fd,
      });
      toast(
        res.error
          ? `Registered, but ingestion reported: ${res.error}`
          : `Registered and ingested ${res.chunks} chunk(s) (${res.retrieval_mode ?? "n/a"})`,
        res.error ? "error" : "success",
      );
      await qc.invalidateQueries({ queryKey: ["rag-sources"] });
      await refetch();
      setForm({ title: "", authority: "AICTE", academic_year: "", version: "", publication_date: "", source_url: "" });
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      toast(err instanceof Error ? err.message : "Registration failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Notice kind="info">
        Register official public sources (e.g. the applicable Approval Process Handbook). The registry stores title,
        authority, effective period, source URL, retrieval date and a SHA-256 checksum so an outdated handbook is never
        silently treated as current.
      </Notice>

      <form onSubmit={register} className="grid gap-3 rounded border border-line p-3 sm:grid-cols-3">
        <Field label="Title" htmlFor="rag-title" required>
          <input id="rag-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Authority" htmlFor="rag-auth">
          <input id="rag-auth" className="input" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} />
        </Field>
        <Field label="Academic year / effective period" htmlFor="rag-year">
          <input id="rag-year" className="input" placeholder="2024-27" value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} />
        </Field>
        <Field label="Version" htmlFor="rag-ver">
          <input id="rag-ver" className="input" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
        </Field>
        <Field label="Publication date" htmlFor="rag-pub">
          <input id="rag-pub" type="date" className="input" value={form.publication_date} onChange={(e) => setForm({ ...form, publication_date: e.target.value })} />
        </Field>
        <Field label="Source URL" htmlFor="rag-url">
          <input id="rag-url" className="input" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
        </Field>
        <Field label="Source file (PDF)" htmlFor="rag-file" required>
          <input id="rag-file" ref={fileRef} type="file" accept=".pdf" className="input" />
        </Field>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            <Upload className="h-4 w-4" aria-hidden /> {busy ? "Registering…" : "Register & ingest"}
          </button>
        </div>
      </form>

      {isLoading && <Skeleton rows={3} />}
      <ul className="space-y-2">
        {(data ?? []).map((s) => (
          <li key={s.id} className="rounded border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text">{s.title}</p>
              <Badge tone={s.is_ingested ? "success" : "neutral"}>{s.is_ingested ? `${s.chunks} chunks` : "not ingested"}</Badge>
            </div>
            <p className="text-xs text-textmuted">
              {s.authority} · {s.academic_year ?? "—"} · v{s.version ?? "—"} · published {fmtDate(s.publication_date)} · retrieved{" "}
              {fmtDate(s.retrieval_date)}
            </p>
            <div className="mt-1 flex items-center gap-2">
              {!s.is_ingested && (
                <button
                  type="button"
                  className="btn-secondary px-2 py-0.5 text-xs"
                  onClick={async () => {
                    try {
                      const r = await api<{ chunks: number }>(`/admin/rag/documents/${s.id}/ingest`, { method: "POST" });
                      toast(`Ingested ${r.chunks} chunk(s)`, "success");
                      await refetch();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Ingestion failed", "error");
                    }
                  }}
                >
                  <Database className="h-3 w-3" aria-hidden /> Re-ingest
                </button>
              )}
              {s.checksum && <code className="text-[10px] text-textmuted">sha256 {s.checksum.slice(0, 20)}…</code>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Settings() {
  const { can } = useSession();
  const [tab, setTab] = useState("policies");

  if (!can("admin.settings_manage") && !can("admin.notification_policy_manage")) {
    return (
      <Card>
        <div className="p-6 text-sm text-textmuted">System settings require an administrative permission.</div>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="System settings"
        description="Escalation policies, operational settings and the regulatory source registry."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "System Settings" }]}
        actions={
          <span className="inline-flex items-center gap-1 text-xs text-textmuted">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> changes are audit-logged
          </span>
        }
      />

      <Card>
        <div className="border-b border-line px-4 py-3">
          <Tabs
            tabs={[
              { key: "policies", label: "Escalation policies" },
              { key: "settings", label: "System values" },
              { key: "rag", label: "RAG sources" },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>
        <div className="p-4">
          {tab === "policies" && <EscalationPolicies />}
          {tab === "settings" && <SystemSettings />}
          {tab === "rag" && <RagSources />}
        </div>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Settings />
    </Suspense>
  );
}
