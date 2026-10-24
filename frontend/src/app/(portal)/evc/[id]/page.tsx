"use client";

/** EVC case detail: scheduling actions, participants, visit, report. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, CalendarCheck, Users, PlayCircle, FileSignature } from "lucide-react";

import { api } from "../../../../lib/api";
import { useSession } from "../../../../lib/session";
import { toast } from "../../../../lib/toast";
import { EVC_STATUS_META, fmtDate, fmtDateTime, STAGE_LABELS, STATUS_META } from "../../../../lib/format";
import {
  Badge,
  Card,
  ErrorState,
  Field,
  KeyValue,
  Notice,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "../../../../components/common/ui";
import type { EvcCaseDetail } from "../../../../lib/types";

function Detail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { can, user } = useSession();
  const qc = useQueryClient();

  const [proposeDate, setProposeDate] = useState("");
  const [confirmDate, setConfirmDate] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [reason, setReason] = useState("");
  const [participant, setParticipant] = useState({ name: "", role: "member", organization: "" });
  const [report, setReport] = useState({ outcome: "satisfactory", summary: "", deficiencies: "", visit_held_on: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const { data: c, isLoading, error, refetch } = useQuery<EvcCaseDetail>({
    queryKey: ["evc", id],
    queryFn: () => api(`/evc/${id}`),
  });

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok, "success");
      await qc.invalidateQueries({ queryKey: ["evc", id] });
      await qc.invalidateQueries({ queryKey: ["evc"] });
      await refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <div className="card h-96 animate-pulse" />;
  if (error || !c) {
    return (
      <Card>
        <ErrorState message="EVC case not found or not accessible to your account." onRetry={refetch} />
      </Card>
    );
  }

  const canSchedule = can("evc.schedule");
  const canVisit = can("evc.record_visit");
  const canReport = can("evc.submit_report");

  return (
    <div>
      <PageHeader
        title={`EVC case — ${c.ref_no}`}
        description={c.institution}
        breadcrumb={[
          { label: "Overview", href: "/dashboard" },
          { label: "EVC Management", href: "/evc" },
          { label: c.ref_no },
        ]}
        actions={
          <Link href={`/applications/${c.application_id}`} className="btn-secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Application record
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge meta={EVC_STATUS_META} value={c.status} />
        {c.stage && <Badge tone="info">Application stage: {STAGE_LABELS[c.stage] ?? c.stage}</Badge>}
        <Badge tone={c.report_status === "pending" ? "warning" : "success"}>Report {c.report_status}</Badge>
        {!!c.reschedule_count && <Badge tone="warning">Rescheduled {c.reschedule_count}×</Badge>}
      </div>

      <Notice kind="warning" className="mb-4">
        GPS coordinates, timestamps, photographs and video metadata are supplementary evidence only. They are never
        treated as definitive proof that an inspection occurred, and no video-duration requirement is asserted unless a
        cited source confirms it.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card title="Schedule & prerequisites">
            <div className="p-4">
              <KeyValue
                items={[
                  { label: "EVC requirement", value: c.reason ?? "Created by workflow transition into the EVC stage" },
                  { label: "Coordinator", value: c.coordinator?.name ?? "unassigned" },
                  { label: "Proposed date", value: fmtDate(c.proposed_date) },
                  { label: "Confirmed date", value: fmtDate(c.confirmed_date) },
                  { label: "Report due", value: fmtDate(c.report_due_date) },
                  { label: "Notes", value: c.notes ?? "—" },
                ]}
              />

              {c.flags && c.flags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.flags.map((f) => (
                    <Badge key={f} tone="warning">
                      {f}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Field label="Propose date" htmlFor="propose" required>
                  <input id="propose" type="date" className="input" value={proposeDate} onChange={(e) => setProposeDate(e.target.value)} />
                </Field>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    disabled={!canSchedule || !proposeDate || busy === "propose"}
                    onClick={() =>
                      run("propose", () => api(`/evc/${id}/propose`, { method: "POST", json: { date: proposeDate } }), "Date proposed")
                    }
                  >
                    <CalendarPlus className="h-4 w-4" aria-hidden /> Propose
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={!canSchedule || !(confirmDate || proposeDate) || busy === "confirm"}
                    onClick={() =>
                      run(
                        "confirm",
                        () => api(`/evc/${id}/confirm`, { method: "POST", json: { date: confirmDate || proposeDate } }),
                        "Schedule confirmed",
                      )
                    }
                  >
                    <CalendarCheck className="h-4 w-4" aria-hidden /> Confirm
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="New date (reschedule)" htmlFor="rdate">
                  <input id="rdate" type="date" className="input" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
                </Field>
                <Field label="Reason (required)" htmlFor="rreason">
                  <input id="rreason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="btn-danger w-full"
                    disabled={!canSchedule || !rescheduleDate || !reason.trim() || busy === "resched"}
                    onClick={() =>
                      run(
                        "resched",
                        () =>
                          api(`/evc/${id}/reschedule`, { method: "POST", json: { date: rescheduleDate, reason: reason.trim() } }),
                        "Rescheduled with reason recorded",
                      )
                    }
                  >
                    Reschedule
                  </button>
                </div>
              </div>
              {!canSchedule && (
                <p className="mt-2 text-xs text-textmuted">Scheduling requires the EVC coordinator permission (enforced server-side).</p>
              )}
            </div>
          </Card>

          <Card title="Schedule history" description="Every proposed, confirmed and rescheduled event with its reason">
            <ol className="divide-y divide-line">
              {c.schedule_events.length === 0 && <li className="px-4 py-4 text-sm text-textmuted">No schedule events yet.</li>}
              {c.schedule_events.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">{e.event_type.replace(/_/g, " ")}</Badge>
                    <span className="text-sm text-text">{fmtDate(e.planned_date)}</span>
                    <span className="text-xs text-textmuted">
                      {fmtDateTime(e.created_at)} · {e.actor ?? "system"}
                    </span>
                  </div>
                  {e.reason && <p className="mt-1 text-xs text-textmuted">Reason: {e.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Visit reports">
            <div className="divide-y divide-line">
              {c.reports.length === 0 && (
                <p className="px-4 py-4 text-sm text-textmuted">No report submitted yet — the case is waiting on the committee.</p>
              )}
              {c.reports.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.outcome === "satisfactory" ? "success" : r.outcome === "deferred" ? "warning" : "danger"}>
                      {r.outcome.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-textmuted">
                      visit {fmtDate(r.visit_held_on)} · submitted by {r.submitted_by} on {fmtDateTime(r.submitted_at)}
                    </span>
                  </div>
                  {r.summary && <p className="prose-plain mt-1">{r.summary}</p>}
                  {r.deficiencies && r.deficiencies.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-textmuted">
                      {r.deficiencies.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Committee participants">
            <ul className="divide-y divide-line">
              {c.participants.length === 0 && <li className="px-4 py-4 text-sm text-textmuted">No participants assigned yet.</li>}
              {c.participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-text">{p.name}</p>
                    <p className="text-[11px] text-textmuted">
                      {p.role} {p.organization ? `· ${p.organization}` : ""}
                    </p>
                  </div>
                  <Badge tone={p.accepted ? "success" : "neutral"}>{p.accepted ? "accepted" : p.invited ? "invited" : "added"}</Badge>
                </li>
              ))}
            </ul>
            {canSchedule && (
              <form
                className="space-y-2 border-t border-line p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!participant.name.trim()) return;
                  run(
                    "part",
                    () =>
                      api(`/evc/${id}/participants`, {
                        method: "POST",
                        json: {
                          name: participant.name.trim(),
                          role: participant.role,
                          organization: participant.organization || null,
                        },
                      }),
                    "Participant added",
                  ).then(() => setParticipant({ name: "", role: "member", organization: "" }));
                }}
              >
                <p className="label">Add participant</p>
                <input
                  className="input"
                  placeholder="Name"
                  aria-label="Participant name"
                  value={participant.name}
                  onChange={(e) => setParticipant({ ...participant, name: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="input"
                    aria-label="Participant role"
                    value={participant.role}
                    onChange={(e) => setParticipant({ ...participant, role: e.target.value })}
                  >
                    <option value="chairperson">Chairperson</option>
                    <option value="member">Member</option>
                    <option value="coordinator">Coordinator</option>
                  </select>
                  <input
                    className="input"
                    placeholder="Organization"
                    aria-label="Participant organization"
                    value={participant.organization}
                    onChange={(e) => setParticipant({ ...participant, organization: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn-secondary" disabled={busy === "part"}>
                  <Users className="h-4 w-4" aria-hidden /> Add
                </button>
              </form>
            )}
          </Card>

          <Card title="Record visit & report">
            <div className="space-y-3 p-4">
              <button
                type="button"
                className="btn-secondary w-full"
                disabled={!canVisit || busy === "visit"}
                onClick={() => run("visit", () => api(`/evc/${id}/start-visit`, { method: "POST" }), "Visit started")}
              >
                <PlayCircle className="h-4 w-4" aria-hidden /> Record start of visit
              </button>

              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData();
                  fd.append("outcome", report.outcome);
                  fd.append("summary", report.summary);
                  fd.append("deficiencies", report.deficiencies);
                  if (report.visit_held_on) fd.append("visit_held_on", report.visit_held_on);
                  run("report", () => api(`/evc/${id}/report`, { method: "POST", form: fd }), "Report submitted");
                }}
              >
                <Field label="Outcome" htmlFor="outcome" required>
                  <select id="outcome" className="input" value={report.outcome} onChange={(e) => setReport({ ...report, outcome: e.target.value })}>
                    <option value="satisfactory">Satisfactory</option>
                    <option value="deficiencies_found">Deficiencies found</option>
                    <option value="deferred">Deferred</option>
                  </select>
                </Field>
                <Field label="Visit held on" htmlFor="vheld">
                  <input id="vheld" type="date" className="input" value={report.visit_held_on} onChange={(e) => setReport({ ...report, visit_held_on: e.target.value })} />
                </Field>
                <Field label="Summary" htmlFor="rsummary">
                  <textarea id="rsummary" className="input min-h-[80px]" value={report.summary} onChange={(e) => setReport({ ...report, summary: e.target.value })} />
                </Field>
                <Field label="Deficiencies (separate with ;)" htmlFor="rdef">
                  <input id="rdef" className="input" value={report.deficiencies} onChange={(e) => setReport({ ...report, deficiencies: e.target.value })} />
                </Field>
                <button type="submit" className="btn-primary w-full" disabled={!canReport || busy === "report"}>
                  <FileSignature className="h-4 w-4" aria-hidden /> {busy === "report" ? "Submitting…" : "Submit report"}
                </button>
              </form>

              {!canReport && (
                <p className="text-xs text-textmuted">Only committee roles may submit the EVC report (server-enforced).</p>
              )}
              <p className="text-[11px] text-textmuted">
                After the report, the configured workflow transition routes the case onward — open the application
                record to run it.
              </p>
            </div>
          </Card>

          {c.status === "completed" && (
            <Notice kind="success">Visit completed and report recorded. Linked observations flow to the next stage.</Notice>
          )}
          <p className="text-[11px] text-textmuted">Signed in as {user?.name}</p>
        </div>
      </div>
    </div>
  );
}

export default function EvcDetailPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" />}>
      <Detail />
    </Suspense>
  );
}
