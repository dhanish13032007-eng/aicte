"use client";

/** Shared presentational building blocks used across every portal page. */
import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Info, X } from "lucide-react";
import { dismissToast, subscribe, type ToastItem } from "../../lib/toast";
import { toneClass, type Tone } from "../../lib/format";

export function Card({
  children,
  className = "",
  title,
  description,
  actions,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="text-h3 text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-textmuted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-5">
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-textmuted">
          {breadcrumb.map((b, i) => (
            <span key={b.label} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {b.href ? (
                <Link href={b.href} className="hover:text-navy-600 hover:underline">
                  {b.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-text">
                  {b.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 text-text">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-textmuted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span className={`badge whitespace-nowrap ${toneClass(tone)}`} title={title}>
      {children}
    </span>
  );
}

export function StatusBadge({ meta, value }: { meta: Record<string, { label: string; tone: Tone }>; value: string }) {
  const m = meta[value] ?? { label: value.replace(/_/g, " "), tone: "neutral" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function Metric({
  label,
  value,
  hint,
  href,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-textmuted">{label}</span>
        {icon && <span className="text-navy-600/60">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold text-text">{value}</div>
      {hint && <div className="mt-1 text-xs text-textmuted">{hint}</div>}
    </>
  );
  const cls = `card block px-4 py-3 transition-colors hover:border-navy-600/40 ${
    href ? "cursor-pointer" : ""
  } ${tone === "danger" ? "border-danger/40" : tone === "warning" ? "border-warn/40" : ""}`;
  return href ? (
    <Link href={href} className={cls} aria-label={`${label}: ${String(value)}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Inbox className="mb-3 h-8 w-8 text-textmuted/60" aria-hidden />
      <p className="text-sm font-semibold text-text">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-textmuted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="h-7 w-7 text-danger" aria-hidden />
      <p className="max-w-xl text-sm text-text">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-navy-100/70" style={{ width: `${90 - i * 8}%` }} />
      ))}
    </div>
  );
}

export function Notice({
  kind = "info",
  children,
  className = "",
}: {
  kind?: "info" | "success" | "warning" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info/30 bg-info/5 text-info",
    success: "border-ok/30 bg-ok/5 text-ok",
    warning: "border-warn/30 bg-warn/5 text-warn",
    danger: "border-danger/30 bg-danger/5 text-danger",
  } as const;
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${tones[kind]} ${className}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="text-text">{children}</div>
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribe(setItems), []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(24rem,90vw)] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-card ${
            t.kind === "success"
              ? "border-ok/40 bg-white text-ok"
              : t.kind === "error"
                ? "border-danger/40 bg-white text-danger"
                : "border-info/40 bg-white text-info"
          }`}
        >
          {t.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : t.kind === "error" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span className="text-text">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="ml-auto text-textmuted hover:text-text"
            onClick={() => dismissToast(t.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-800/40 px-4 py-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-md border border-line bg-white shadow-lg`}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-h3 text-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="text-textmuted hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="px-4 py-4 text-sm text-text">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-textmuted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            active === t.key
              ? "border-saffron text-navy-700"
              : "border-transparent text-textmuted hover:text-navy-600"
          }`}
        >
          {t.label}
          {typeof t.count === "number" && (
            <span className="ml-1.5 rounded-full bg-navy-100 px-1.5 py-0.5 text-[11px] text-navy-700">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="border-b border-line/60 pb-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-textmuted">{i.label}</dt>
          <dd className="mt-0.5 text-sm text-text">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
