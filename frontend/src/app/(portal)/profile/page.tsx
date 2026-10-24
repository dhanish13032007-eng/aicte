"use client";

/** Profile & security: account details, granted permissions, password change. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";

import { api } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { toast } from "../../../lib/toast";
import { ROLE_LABELS } from "../../../lib/format";
import { Badge, Card, Field, KeyValue, Notice, PageHeader } from "../../../components/common/ui";

export default function ProfilePage() {
  const { user, permissions, logout } = useSession();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("The new password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", { method: "POST", json: { current_password: current, new_password: next } });
      toast("Password changed — all sessions were revoked, please sign in again", "success");
      setCurrent("");
      setNext("");
      setTimeout(async () => {
        await logout();
        router.replace("/login");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <PageHeader
        title="Profile & security"
        description="Your account, the permissions your role grants, and password management."
        breadcrumb={[{ label: "Overview", href: "/dashboard" }, { label: "Profile" }]}
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account">
          <div className="p-4">
            <KeyValue
              items={[
                { label: "Name", value: user.name },
                { label: "Email", value: user.email },
                { label: "Role", value: ROLE_LABELS[user.role] ?? user.role },
                { label: "Region / jurisdiction", value: user.region ?? "—" },
                { label: "Institution link", value: user.institution_id ?? "not linked" },
                { label: "Account status", value: user.is_active ? <Badge tone="success">active</Badge> : <Badge tone="danger">disabled</Badge> },
              ]}
            />
            <p className="mt-4 text-xs text-textmuted">
              Your role determines a fixed permission set. The server re-checks it on every request — hiding a menu
              item is presentation only, never the control.
            </p>
          </div>
        </Card>

        <Card title="Granted permissions" description={`${permissions.length} permission(s)`}>
          <div className="flex flex-wrap gap-1.5 p-4">
            {permissions.map((p) => (
              <Badge key={p} tone="info" title={p}>
                {p}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="Change password" description="Changing your password revokes every active session">
        <form className="max-w-md space-y-3 p-4" onSubmit={changePassword}>
          {error && <Notice kind="danger">{error}</Notice>}
          <Field label="Current password" htmlFor="cur-pw" required>
            <input id="cur-pw" type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="new-pw" required hint="Minimum 8 characters.">
            <input id="new-pw" type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <button type="submit" className="btn-primary" disabled={busy}>
            <KeyRound className="h-4 w-4" aria-hidden /> {busy ? "Updating…" : "Change password"}
          </button>
        </form>
      </Card>
    </div>
  );
}
