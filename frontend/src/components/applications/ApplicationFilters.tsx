"use client";

/** Filter toolbar shared by the registry, scrutiny and review lists. */
import { Download, RotateCcw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, download } from "../../lib/api";
import { toast } from "../../lib/toast";
import { CATEGORY_LABELS, STAGE_LABELS } from "../../lib/format";
import type { AppFilters } from "../../hooks/useApplicationFilters";

const STATUSES = [
  "draft",
  "submitted",
  "under_scrutiny",
  "clarification_required",
  "re_scrutiny",
  "evc_pending",
  "evc_scheduled",
  "awaiting_review",
  "awaiting_decision",
  "approved",
  "rejected",
  "on_hold",
];

export function ApplicationFilters({
  filters,
  update,
  showStateToggle = true,
  canExport,
}: {
  filters: AppFilters;
  update: (patch: Partial<AppFilters>) => void;
  showStateToggle?: boolean;
  canExport?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      await download("/reports/applications.csv");
      toast("CSV export downloaded (export recorded in the audit trail).", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  };
  const [term, setTerm] = useState(filters.q);
  const { data: institutions } = useQuery({
    queryKey: ["institutions"],
    queryFn: () => api<{ id: string; name: string }[]>("/admin/institutions"),
    staleTime: 300_000,
  });

  const reset = () => {
    setTerm("");
    update({
      q: "",
      stage: "",
      status: "",
      category: "",
      academic_year: "",
      assigned: "",
      state: "",
      overdue: "",
      page: 1,
    });
  };

  return (
    <div className="border-b border-line bg-navy-50/40 px-4 py-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: term.trim() });
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="f-q" className="label">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-textmuted" aria-hidden />
            <input
              id="f-q"
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Reference, institution, title…"
              className="input pl-8"
            />
          </div>
        </div>

        <div>
          <label htmlFor="f-stage" className="label">
            Stage
          </label>
          <select id="f-stage" className="input" value={filters.stage} onChange={(e) => update({ stage: e.target.value })}>
            <option value="">All stages</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-status" className="label">
            Status
          </label>
          <select id="f-status" className="input" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-cat" className="label">
            Type
          </label>
          <select id="f-cat" className="input" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All types</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-ay" className="label">
            Academic year
          </label>
          <select id="f-ay" className="input" value={filters.academic_year} onChange={(e) => update({ academic_year: e.target.value })}>
            <option value="">All years</option>
            {["2024-25", "2025-26", "2026-27"].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-assigned" className="label">
            Officer
          </label>
          <select id="f-assigned" className="input" value={filters.assigned} onChange={(e) => update({ assigned: e.target.value })}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            {institutions?.length ? <option value="__inst__" disabled>—</option> : null}
          </select>
        </div>

        {showStateToggle && (
          <div>
            <label htmlFor="f-state" className="label">
              Lifecycle
            </label>
            <select id="f-state" className="input" value={filters.state} onChange={(e) => update({ state: e.target.value })}>
              <option value="">Open & closed</option>
              <option value="open">Open only</option>
              <option value="closed">Closed only</option>
            </select>
          </div>
        )}

        <label className="flex h-9 items-center gap-2 pb-0.5 text-sm text-text">
          <input
            type="checkbox"
            checked={filters.overdue === "1"}
            onChange={(e) => update({ overdue: e.target.checked ? "1" : "" })}
            className="h-4 w-4 accent-[#12345A]"
          />
          Overdue only
        </label>

        <div className="flex gap-2 pb-0.5">
          <button type="submit" className="btn-primary">
            Apply
          </button>
          <button type="button" className="btn-secondary" onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset
          </button>
          {canExport && (
            <button type="button" className="btn-secondary" onClick={runExport} disabled={exporting}>
              <Download className="h-4 w-4" aria-hidden /> {exporting ? "Exporting…" : "CSV"}
            </button>
          )}
        </div>
      </form>

      {filters.q && (
        <p className="mt-2 text-xs text-textmuted">
          Showing results for <strong>{filters.q}</strong>
        </p>
      )}
    </div>
  );
}
