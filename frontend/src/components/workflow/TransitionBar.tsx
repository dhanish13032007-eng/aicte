"use client";

/** Workflow transition bar: renders the actions the backend says are valid for
 * the current user, blocks invalid ones with the server's reason, and collects
 * a reason whenever the configured transition requires one. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Lock } from "lucide-react";

import { api } from "../../lib/api";
import { toast } from "../../lib/toast";
import { Field, Modal } from "../common/ui";
import type { WorkflowAction } from "../../lib/types";

export function TransitionBar({ applicationId }: { applicationId: string }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<WorkflowAction | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: actions, isLoading } = useQuery<WorkflowAction[]>({
    queryKey: ["app-actions", applicationId],
    queryFn: () => api(`/applications/${applicationId}/actions`),
    staleTime: 5_000,
  });

  const execute = async () => {
    if (!pending) return;
    if (pending.requires_reason && !reason.trim()) {
      setError("A reason is required for this action.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/applications/${applicationId}/transition`, {
        json: { action: pending.action, reason: reason.trim() || null, note: note.trim() || null },
        query: { idempotency_key: crypto.randomUUID() },
      });
      toast(`Action recorded: ${pending.label}`, "success");
      setPending(null);
      setReason("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["app", applicationId] });
      await qc.invalidateQueries({ queryKey: ["apps"] });
      await qc.invalidateQueries({ queryKey: ["audit", applicationId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className="h-10 animate-pulse rounded bg-navy-50" />;

  const allowed = (actions ?? []).filter((a) => a.allowed);
  const blocked = (actions ?? []).filter((a) => !a.allowed);

  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-textmuted">
        Next valid actions for you
      </p>

      {allowed.length === 0 && (
        <p className="mt-2 text-sm text-textmuted">
          No action is available to your role at this stage. The case is waiting on the responsible stage owner.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {allowed.map((a) => (
          <button key={a.action} type="button" className="btn-primary" onClick={() => setPending(a)}>
            {a.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ))}
      </div>

      {blocked.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {blocked.map((a) => (
            <li key={a.action} className="flex items-start gap-2 text-xs text-textmuted">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                <strong className="text-text">{a.label}</strong> — {a.blocked_reason ?? "not permitted for your role"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!pending}
        title={pending?.label ?? ""}
        onClose={() => {
          setPending(null);
          setError(null);
        }}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={execute} disabled={busy}>
              {busy ? "Submitting…" : "Confirm action"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-textmuted">
            This moves the case to <strong>{pending?.to_stage}</strong>. The transition, your identity, role and
            timestamp are recorded in the append-only audit trail.
          </p>
          {error && <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
          <Field
            label="Reason"
            htmlFor="tr-reason"
            required={pending?.requires_reason}
            hint={pending?.requires_reason ? "Required by the configured workflow for this action." : "Optional."}
          >
            <textarea
              id="tr-reason"
              className="input min-h-[80px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Recorded verbatim in the audit trail"
            />
          </Field>
          <Field label="Internal note" htmlFor="tr-note" hint="Optional additional context for other officers.">
            <textarea id="tr-note" className="input min-h-[60px]" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
