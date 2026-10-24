"use client";

/** Create a draft application (institution users create for their own
 * institution; authorized officers may create on behalf of a jurisdiction). */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, Plus, Trash2 } from "lucide-react";

import { api } from "../../../../lib/api";
import { useSession } from "../../../../lib/session";
import { toast } from "../../../../lib/toast";
import { Card, Field, Notice, PageHeader } from "../../../../components/common/ui";
import type { Institution, Programme } from "../../../../lib/types";

function NewApplicationForm() {
  const router = useRouter();
  const { user, can } = useSession();
  const { data: institutions, isLoading: loadingInst } = useQuery<Institution[]>({
    queryKey: ["institutions"],
    queryFn: () => api("/admin/institutions"),
  });

  const defaultInst = user?.institution_id ?? "";
  const [institutionId, setInstitutionId] = useState(defaultInst);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("new_approval");
  const [approvalType, setApprovalType] = useState("");
  const [academicYear, setAcademicYear] = useState("2024-25");
  const [programmes, setProgrammes] = useState<Programme[]>([
    { name: "Computer Science & Engineering", level: "undergraduate", intake: 120 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setProg = (i: number, patch: Partial<Programme>) =>
    setProgrammes((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!institutionId) {
      setError("Select an institution.");
      return;
    }
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    if (programmes.filter((p) => p.name.trim()).length === 0) {
      setError("Add at least one programme.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ id: string; ref_no: string }>("/applications", {
        json: {
          institution_id: institutionId,
          academic_year: academicYear,
          category,
          approval_type: approvalType || null,
          title: title.trim(),
          programmes: programmes
            .filter((p) => p.name.trim())
            .map((p) => ({ name: p.name.trim(), level: p.level || "undergraduate", intake: p.intake ?? null })),
        },
        query: { idempotency_key: crypto.randomUUID() },
      });
      toast(`Draft ${res.ref_no} created`, "success");
      router.push(`/applications/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed");
      setBusy(false);
    }
  };

  if (!can("application.create")) {
    return (
      <Card>
        <div className="p-6 text-sm text-textmuted">
          Your role cannot create applications.{" "}
          <Link href="/applications" className="link">
            Back to registry
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        title="New application"
        description="Creates a draft. Nothing is sent anywhere until you submit it from the application page."
        breadcrumb={[
          { label: "Overview", href: "/dashboard" },
          { label: "Applications", href: "/applications" },
          { label: "New" },
        ]}
        actions={
          <Link href="/applications" className="btn-secondary">
            Cancel
          </Link>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice kind="danger">{error}</Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Application details">
          <div className="space-y-4 p-4">
            <Field label="Institution" htmlFor="inst" required hint="Institution users can only select their own institution.">
              <select
                id="inst"
                className="input"
                value={institutionId}
                onChange={(e) => setInstitutionId(e.target.value)}
                required
                disabled={loadingInst || user?.role === "institution"}
              >
                <option value="">Select…</option>
                {(institutions ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Application title" htmlFor="title" required>
              <input
                id="title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. New approval — B.Tech (CSE, ECE)"
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Application category" htmlFor="cat" required hint="Selects the applicable versioned workflow.">
                <select id="cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="new_approval">New approval</option>
                  <option value="extension_of_approval">Extension of approval</option>
                </select>
              </Field>
              <Field label="Academic year" htmlFor="ay" required>
                <select id="ay" className="input" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                  {["2024-25", "2025-26", "2026-27"].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Approval / extension type" htmlFor="atype" hint="Optional free-form subtype, e.g. 'fresh EoA for 2025-26'.">
              <input id="atype" className="input" value={approvalType} onChange={(e) => setApprovalType(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Programmes & intake" description="Requested intake per programme; the total is stored on the application.">
          <div className="space-y-3 p-4">
            {programmes.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_10rem_7rem_auto]">
                <div>
                  <label className="label" htmlFor={`prog-${i}`}>
                    Programme name
                  </label>
                  <input
                    id={`prog-${i}`}
                    className="input"
                    value={p.name}
                    onChange={(e) => setProg(i, { name: e.target.value })}
                    placeholder="e.g. Electronics & Communication"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`lvl-${i}`}>
                    Level
                  </label>
                  <select id={`lvl-${i}`} className="input" value={p.level ?? "undergraduate"} onChange={(e) => setProg(i, { level: e.target.value })}>
                    <option value="undergraduate">Undergraduate</option>
                    <option value="postgraduate">Postgraduate</option>
                    <option value="diploma">Diploma</option>
                    <option value="doctoral">Doctoral</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`int-${i}`}>
                    Intake
                  </label>
                  <input
                    id={`int-${i}`}
                    type="number"
                    min={0}
                    className="input"
                    value={p.intake ?? ""}
                    onChange={(e) => setProg(i, { intake: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    aria-label={`Remove programme ${i + 1}`}
                    className="btn-danger"
                    onClick={() => setProgrammes((ps) => ps.filter((_, idx) => idx !== i))}
                    disabled={programmes.length === 1}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setProgrammes((ps) => [...ps, { name: "", level: "undergraduate", intake: null }])}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add programme
            </button>
            <p className="text-xs text-textmuted">
              Total requested intake:{" "}
              <strong>{programmes.reduce((s, p) => s + (p.intake || 0), 0)}</strong>
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-3">
        <p className="text-xs text-textmuted">
          Draft creation is idempotent: retrying the same request will not create duplicates.
        </p>
        <button type="submit" className="btn-primary" disabled={busy}>
          <FilePlus2 className="h-4 w-4" aria-hidden />
          {busy ? "Creating…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}

export default function NewApplicationPage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" />}>
      <NewApplicationForm />
    </Suspense>
  );
}
