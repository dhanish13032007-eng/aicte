"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { api } from "../../lib/api";
import { Logo } from "../../components/layout/Logo";
import { Notice } from "../../components/common/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ message: string }>("/auth/forgot-password", { json: { email } });
      setMessage(res.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Logo />
          <p className="text-sm font-bold text-white">Password recovery</p>
        </div>
        <div className="h-1 bg-saffron" aria-hidden />
      </header>
      <main className="mx-auto max-w-xl px-4 py-12">
        <section className="card p-6">
          <h1 className="text-h2 text-navy-700">Forgot your password?</h1>
          <p className="mt-2 text-sm text-textmuted">
            This prototype has no self-service reset channel: the request is recorded for auditing and a platform
            administrator resets the account. The response is identical whether or not the address exists, so accounts
            cannot be enumerated.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="fp-email" className="label">
                Registered email address
              </label>
              <input
                id="fp-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="name@ops.local"
              />
            </div>
            <button type="submit" disabled={busy} className="btn-primary">
              <MailCheck className="h-4 w-4" aria-hidden />
              {busy ? "Submitting…" : "Submit reset request"}
            </button>
          </form>
          {message && <Notice kind="info" className="mt-4">{message}</Notice>}
          <p className="mt-5 text-sm">
            <Link href="/login" className="link">
              Back to sign in
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
