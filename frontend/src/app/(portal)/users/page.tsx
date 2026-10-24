"use client";

/** User & permission administration. */
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, ShieldCheck, RefreshCw } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { fmtDateTime, ROLE_LABELS } from "../../../lib/format";
import { Badge, Card, Field, Modal, Notice, PageHeader, Skeleton, Tabs } from "../../../components/common/ui";
import { DataTable, type Column } from "../../../components/common/DataTable";
import type { AdminUserRow, Institution } from "../../../lib/types";

function CreateUser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: roles } = useQuery<{ roles: { value: string; label: string }[] }>({
    queryKey: ["roles"],
    queryFn: () => api("/admin/roles"),
    enabled: open,
  });
  const { data: institutions } = useQuery<Institution[]>({
    queryKey: ["institutions"],
    queryFn: () => api("/admin/institutions"),
    enabled: open,
  });
  const [form, setForm] = useState({ email: "", name: "", role: "scrutiny_officer", password: "", institution_id: "", region: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!form.email.trim() || !form.name.trim() || form.password.length < 8) {
      setError("Email, name and a password of at least 8 characters are required.");
      return;
    }
    setBusy(true);
    try {
      await api("/admin/users", {
        json: {
          email: form.email.trim().toLowerCase(),
          name: form.name.trim(),
          role: form.role,
          password: form.password,
          institution_id: form.institution_id || null,
          region: form.region || null,
        },
      });
      toast("User created with a temporary password", "success");
      await qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
      setForm({ email: "", name: "", role: "scrutiny_officer", password: "", institution_id: "", region: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Create user"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Notice kind="danger">{error}</Notice>}
        <Field label="Full name" htmlFor="u-name" required>
          <input id="u-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="u-email" required>
          <input id="u-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role" htmlFor="u-role" required hint="Grants a fixed permission set, enforced server-side.">
            <select id="u-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {(roles?.roles ?? []).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Region / jurisdiction" htmlFor="u-region">
            <input id="u-region" className="input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. Northern Region" />
          </Field>
        </div>
        <Field label="Institution (institution role only)" htmlFor="u-inst">
          <select id="u-inst" className="input" value={form.institution_id} onChange={(e) => setForm({ ...form, institution_id: e.target.value })}>
            <option value="">None</option>
            {(institutions ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Temporary password" htmlFor="u-pw" required hint="The account is flagged to change its password on first use.">
          <input id="u-pw" type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function Users() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("users");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: users, isLoading, error, refetch } = useQuery<AdminUserRow[]>({
    queryKey: ["users"],
    queryFn: () => api("/admin/users"),
  });
  const { data: roles } = useQuery<{ roles: { value: string; label: string }[]; permissions_matrix: Record<string, string[]> }>({
    queryKey: ["roles"],
    queryFn: () => api("/admin/roles"),
  });

  const update = async (id: string, patch: Record<string, unknown>, ok: string) => {
    try {
      await api(`/admin/users/${id}`, { method: "PATCH", json: patch });
      toast(ok, "success");
      await qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    }
  };

  const columns: Column<AdminUserRow>[] = [
    {
      key: "name",
      header: "User",
      render: (u) => (
        <div>
          <p className="font-medium text-text">{u.name}</p>
          <p className="text-[11px] text-textmuted">{u.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Role", render: (u) => <Badge tone="info">{ROLE_LABELS[u.role] ?? u.role}</Badge> },
    { key: "scope", header: "Scope", hideOnMobile: true, render: (u) => <span className="text-xs text-textmuted">{u.institution ?? u.region ?? "—"}</span> },
    { key: "status", header: "Status", render: (u) => <Badge tone={u.is_active ? "success" : "danger"}>{u.is_active ? "active" : "disabled"}</Badge> },
    {
      key: "sessions",
      header: "Sessions",
      hideOnMobile: true,
      render: (u) => <span className="text-xs text-textmuted">{u.active_sessions ?? 0} active</span>,
    },
    { key: "last", header: "Last sign-in", hideOnMobile: true, render: (u) => <span className="text-xs text-textmuted">{fmtDateTime(u.last_login_at)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (u) => (
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => update(u.id, { is_active: !u.is_active }, u.is_active ? "Account disabled; sessions revoked" : "Account enabled")}
          >
            {u.is_active ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={async () => {
              const pw = window.prompt("Set a new temporary password (min 8 characters):");
              if (!pw) return;
              await update(u.id, { new_password: pw }, "Password reset; sessions revoked");
            }}
          >
            Reset password
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users & permissions"
        description="Accounts, roles and the permission matrix. Administrators do not inherit statutory approval powers."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Users & Permissions" }]}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
            </button>
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden /> New user
            </button>
          </>
        }
      />

      <Card>
        <div className="border-b border-line px-4 py-3">
          <Tabs
            tabs={[
              { key: "users", label: "Accounts", count: users?.length },
              { key: "matrix", label: "Permission matrix" },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === "users" && (
          <DataTable
            caption="Users"
            columns={columns}
            rows={users ?? []}
            rowKey={(u) => u.id}
            isLoading={isLoading}
            error={error ? String(error) : null}
            onRetry={refetch}
            emptyTitle="No users"
          />
        )}

        {tab === "matrix" && (
          <div className="overflow-x-auto p-4">
            {!roles && <Skeleton rows={6} />}
            {roles && (
              <>
                <p className="mb-3 flex items-center gap-1 text-xs text-textmuted">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Every permission below is checked on the server for each request; the UI only mirrors it.
                </p>
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="th">Permission</th>
                      {roles.roles.map((r) => (
                        <th key={r.value} className="th text-center" title={r.label}>
                          {r.label.split(" ")[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(new Set(Object.values(roles.permissions_matrix).flat())).sort().map((perm) => (
                      <tr key={perm}>
                        <td className="td font-mono text-xs">{perm}</td>
                        {roles.roles.map((r) => (
                          <td key={r.value} className="td text-center">
                            {roles.permissions_matrix[r.value]?.includes(perm) ? (
                              <span className="text-ok" aria-label="granted">
                                ●
                              </span>
                            ) : (
                              <span className="text-line" aria-label="not granted">
                                ○
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </Card>

      <CreateUser open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Users />
    </Suspense>
  );
}
