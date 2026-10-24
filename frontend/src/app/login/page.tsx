"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { api, setToken } from "../../lib/api";
import { cacheUser } from "../../lib/session";
import { Logo } from "../../components/layout/Logo";
import { Notice } from "../../components/common/ui";
import type { SessionUser } from "../../lib/types";

const DEMO_ACCOUNTS = [
  { email: "admin@ops.local", label: "System administrator" },
  { email: "office.sunrise@ops.local", label: "Institution applicant" },
  { email: "scrutiny@ops.local", label: "Scrutiny officer" },
  { email: "evc@ops.local", label: "EVC coordinator" },
  { email: "compliance@ops.local", label: "Compliance officer" },
  { email: "approver@ops.local", label: "Approving authority" },
  { email: "auditor@ops.local", label: "Auditor (read-only)" },
];

const DEMO_PASSWORD = "Demo@12345";

interface FormState {
  email: string;
  password: string;
}

function SignInForm({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (next: FormState) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ access_token: string; user: SessionUser }>("/auth/login", {
        json: { email: form.email.trim().toLowerCase(), password: form.password },
      });
      setToken(res.access_token);
      cacheUser(res.user);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice kind="danger">{error}</Notice>}
      <div>
        <label htmlFor="email" className="label">
          Official email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          className="input"
          placeholder="name@ops.local"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => onChange({ ...form, password: e.target.value })}
            className="input pr-10"
            placeholder="••••••••"
          />
          <button
            type="button"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-2 text-textmuted hover:text-text"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <button type="submit" disabled={busy} className="btn-primary w-full">
        <LogIn className="h-4 w-4" aria-hidden />
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="link">
          Forgot password?
        </Link>
        <Link href="/" className="link">
          Back to overview
        </Link>
      </div>
    </form>
  );
}

/** Keeps useSearchParams inside a Suspense boundary (Next.js requirement). */
function FormBoundary(props: { form: FormState; onChange: (next: FormState) => void }) {
  return <SignInForm {...props} />;
}

export default function LoginPage() {
  const [form, setForm] = useState<FormState>({ email: "", password: "" });

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Logo />
          <div className="leading-tight text-white">
            <p className="text-sm font-bold">AICTE Approval Operations Intelligence</p>
            <p className="text-[11px] text-white/70">SIH26262 prototype — independent demonstration</p>
          </div>
        </div>
        <div className="h-1 bg-saffron" aria-hidden />
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10 lg:grid-cols-2">
        <section className="card p-6">
          <h1 className="text-h2 text-navy-700">Sign in to the portal</h1>
          <p className="mt-1 text-sm text-textmuted">
            Prototype environment — do not use real personal or institutional credentials.
          </p>
          <div className="mt-5">
            <Suspense fallback={<div className="h-64 animate-pulse rounded bg-navy-50" />}>
              <FormBoundary form={form} onChange={setForm} />
            </Suspense>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-h3 text-text">Local demo accounts</h2>
          <p className="mt-1 text-sm text-textmuted">
            All seeded accounts share the password <strong className="text-text">{DEMO_PASSWORD}</strong>. Select one
            to fill the sign-in form.
          </p>
          <ul className="mt-4 space-y-2">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 text-left hover:border-navy-600/50 hover:bg-navy-50"
                  onClick={() => setForm({ email: a.email, password: DEMO_PASSWORD })}
                >
                  <span className="text-sm font-medium text-text">{a.label}</span>
                  <span className="truncate text-xs text-textmuted">{a.email}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-md border border-warn/30 bg-warn/5 p-3 text-xs text-textmuted">
            Password change, session revocation, per-endpoint permission checks and audit logging are all active in
            this demonstration.
          </p>
        </section>
      </main>
    </div>
  );
}
