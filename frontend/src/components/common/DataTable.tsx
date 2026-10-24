"use client";

/** Reusable accessible data table: sorting, pagination, responsive layout. */
import type React from "react";
import { ChevronLeft, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "./ui";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | null;
  className?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  emptyTitle = "No records found",
  emptyHint,
  page,
  pageSize,
  total,
  onPageChange,
  sort,
  onSortChange,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  sort?: { key: string; order: "asc" | "desc" };
  onSortChange?: (key: string) => void;
  caption?: string;
}) {
  const totalPages = pageSize && total ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={`th ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className ?? ""}`}
                    aria-sort={active ? (sort?.order === "asc" ? "ascending" : "descending") : "none"}
                  >
                    {c.sortValue && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(c.key)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-navy-600"
                      >
                        {c.header}
                        {active ? (
                          sort?.order === "asc" ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-60" aria-hidden />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="td" colSpan={columns.length}>
                    <div className="h-4 animate-pulse rounded bg-navy-100/70" />
                  </td>
                </tr>
              ))}
            {!isLoading &&
              rows.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-navy-50/60">
                  {columns.map((c) => (
                    <td key={c.key} className={`td ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className ?? ""}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!isLoading && error && <ErrorState message={error} onRetry={onRetry} />}
      {!isLoading && !error && rows.length === 0 && <EmptyState title={emptyTitle} hint={emptyHint} />}

      {onPageChange && pageSize !== undefined && total !== undefined && total > pageSize && (
        <nav className="flex items-center justify-between border-t border-line px-4 py-3" aria-label="Pagination">
          <p className="text-xs text-textmuted">
            Page {page} of {totalPages} · {total} records
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={(page ?? 1) <= 1}
              onClick={() => onPageChange((page ?? 1) - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={(page ?? 1) >= totalPages}
              onClick={() => onPageChange((page ?? 1) + 1)}
            >
              Next <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
