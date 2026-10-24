"use client";

/** Shared URL-driven filter state for application list pages. */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useAcademicYear } from "../lib/prefs";

export interface AppFilters {
  q: string;
  stage: string;
  status: string;
  category: string;
  academic_year: string;
  assigned: string;
  state: string;
  overdue: string;
  sort: string;
  order: "asc" | "desc";
  page: number;
}

export function useApplicationFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [prefYear] = useAcademicYear();

  const filters: AppFilters = useMemo(
    () => ({
      q: sp.get("q") ?? "",
      stage: sp.get("stage") ?? "",
      status: sp.get("status") ?? "",
      category: sp.get("category") ?? "",
      academic_year: sp.get("academic_year") ?? prefYear,
      assigned: sp.get("assigned") ?? "",
      state: sp.get("state") ?? "open",
      overdue: sp.get("overdue") ?? "",
      sort: sp.get("sort") ?? "stage_deadline",
      order: (sp.get("order") as "asc" | "desc") ?? "asc",
      page: Number(sp.get("page") ?? "1") || 1,
    }),
    [sp, prefYear],
  );

  const update = useCallback(
    (patch: Partial<AppFilters>, resetPage = true) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        const key = k === "assigned" ? "assigned_to" : k === "overdue" ? "overdue_only" : k;
        if (v === "" || v === undefined || (k === "state" && v === "open")) next.delete(key);
        else if (k === "overdue" && v) next.set(key, "true");
        else next.set(key, String(v));
      }
      if (resetPage && !("page" in patch)) next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname],
  );

  const query = useMemo(
    () => ({
      q: filters.q || undefined,
      stage: filters.stage || undefined,
      status: filters.status || undefined,
      category: filters.category || undefined,
      academic_year: filters.academic_year || undefined,
      assigned_to: filters.assigned || undefined,
      state: filters.state || undefined,
      overdue_only: filters.overdue ? true : undefined,
      sort: filters.sort,
      order: filters.order,
      page: filters.page,
      page_size: 20,
    }),
    [filters],
  );

  return { filters, update, query };
}
