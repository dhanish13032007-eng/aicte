"use client";

/**
 * Application shell: government-portal header, permission-aware sidebar,
 * mobile navigation, notifications, global search and account menu.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCircle2,
  X,
} from "lucide-react";

import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { ACADEMIC_YEARS, useAcademicYear } from "../../lib/prefs";
import { ROLE_LABELS, SEVERITY_TONE, timeAgo } from "../../lib/format";
import type { NotificationRow } from "../../lib/types";
import { Logo } from "./Logo";
import { visibleNav } from "./nav";
import { Badge, Toaster } from "../common/ui";

function useClickAway(onAway: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onAway]);
  return ref;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useClickAway(() => setOpen(false));
  const { data } = useQuery<{ unread: number; items: NotificationRow[] }>({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications", { query: { limit: 15 } }),
    refetchInterval: 45_000,
  });
  const unread = data?.unread ?? 0;

  const markRead = async (n: NotificationRow) => {
    if (n.is_read) return;
    try {
      await api(`/notifications/${n.id}/read`, { method: "POST" });
      const el = ref.current;
      if (el) {
        const badge = el.querySelector<HTMLElement>("[data-unread]");
        if (badge && unread > 0) badge.dataset.unread = String(unread - 1);
      }
    } catch {
      /* notification list refreshes on next poll */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-white/90 hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span
            data-unread={unread}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-saffron px-1 text-[10px] font-bold text-white"
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(24rem,92vw)] overflow-auto rounded-md border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-semibold text-text">Notifications</p>
            <Link href="/alerts" className="text-xs text-navy-600 hover:underline" onClick={() => setOpen(false)}>
              View all
            </Link>
          </div>
          {!data?.items?.length && <p className="px-3 py-6 text-center text-sm text-textmuted">No notifications yet.</p>}
          <ul>
            {(data?.items ?? []).map((n) => (
              <li key={n.id} className="border-b border-line/70 last:border-0">
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left hover:bg-navy-50"
                  onClick={() => {
                    void markRead(n);
                    setOpen(false);
                    if (n.link_path) window.location.href = n.link_path;
                  }}
                >
                  <div className="flex items-start gap-2">
                    <Badge tone={SEVERITY_TONE[n.severity] ?? "neutral"}>{n.severity}</Badge>
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${n.is_read ? "text-textmuted" : "font-semibold text-text"}`}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-textmuted">{n.body}</p>
                      <p className="mt-1 text-[11px] text-textmuted">{timeAgo(n.created_at)} · {n.delivery_status}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, can, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");
  const [year, setYear] = useAcademicYear();
  const [menu, setMenu] = useState<false | "help" | "account">(false);
  const helpRef = useClickAway(() => setMenu((m) => (m === "help" ? false : m)));
  const acctRef = useClickAway(() => setMenu((m) => (m === "account" ? false : m)));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  useEffect(() => setDrawer(false), [pathname]);

  const sections = useMemo(() => visibleNav(can), [can]);

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-center">
          <Logo size={44} />
          <p className="mt-3 text-sm text-textmuted">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/applications?q=${encodeURIComponent(term)}` : "/applications");
  };

  const nav = (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
      {sections.map((s) => (
        <div key={s.section} className="mb-5">
          <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-textmuted">{s.section}</p>
          <ul className="mt-1.5 space-y-0.5">
            {s.items.map((item) => {
              const active =
                pathname === item.href || (item.match ? pathname.startsWith(item.match) : false);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                      active
                        ? "bg-navy-700 font-semibold text-white"
                        : "text-text hover:bg-navy-50 hover:text-navy-700"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-saffron" : "text-navy-600/70"}`} aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="rounded-md border border-line bg-navy-50/60 p-3 text-[11px] leading-relaxed text-textmuted">
        <p className="font-semibold text-navy-700">SIH26262 Prototype</p>
        Independent demonstration platform. Not affiliated with, endorsed by, or connected to the official AICTE
        system.
        <a
          href="https://www.aicte.gov.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-navy-600 hover:underline"
        >
          Official AICTE site <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-bg">
      <Toaster />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow">
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-navy-800/60 shadow-card">
        {/* utility strip */}
        <div className="hidden bg-navy-800 text-white/80 md:block">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-1 text-[11px] lg:px-6">
            <p>
              Independent Smart India Hackathon SIH26262 prototype · Not the official AICTE website
            </p>
            <div className="flex items-center gap-4">
              <label htmlFor="ay" className="flex items-center gap-1.5">
                Academic year
                <select
                  id="ay"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="rounded border border-white/25 bg-navy-700 px-1.5 py-0.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-saffron"
                >
                  <option value="">All years</option>
                  {ACADEMIC_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <a href="https://www.aicte.gov.in/" target="_blank" rel="noopener noreferrer" className="hover:text-white">
                aicte.gov.in
              </a>
              <a
                href="https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                Approval Process Handbook
              </a>
            </div>
          </div>
        </div>

        {/* main header row */}
        <div className="bg-navy-700">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2.5 lg:px-6">
            <button
              type="button"
              className="rounded-md p-2 text-white hover:bg-white/10 md:hidden"
              aria-label="Open navigation menu"
              onClick={() => setDrawer(true)}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>

            <Link href="/dashboard" className="flex items-center gap-2.5">
              <Logo />
              <span className="leading-tight">
                <span className="block text-[15px] font-bold text-white sm:text-base">
                  AICTE Approval Operations Intelligence
                </span>
                <span className="hidden text-[11px] text-white/70 sm:block">
                  Workflow · Compliance · Alerts
                </span>
              </span>
              <span className="hidden rounded border border-saffron/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-saffron lg:inline">
                SIH26262 Prototype
              </span>
            </Link>

            <form onSubmit={submitSearch} className="ml-auto hidden max-w-md flex-1 md:flex" role="search">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-navy-700/60" aria-hidden />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search applications, institutions…"
                  aria-label="Global application search"
                  className="w-full rounded-md border border-white/20 bg-white/95 py-2 pl-8 pr-3 text-sm text-text placeholder:text-textmuted/70 focus:outline-none focus:ring-2 focus:ring-saffron"
                />
              </div>
            </form>

            <div className="ml-auto flex items-center gap-1 md:ml-0">
              <NotificationBell />

              <div className="relative" ref={helpRef}>
                <button
                  type="button"
                  aria-label="Help and documentation"
                  aria-expanded={menu === "help"}
                  onClick={() => setMenu((m) => (m === "help" ? false : "help"))}
                  className="rounded-md p-2 text-white/90 hover:bg-white/10"
                >
                  <HelpCircle className="h-5 w-5" aria-hidden />
                </button>
                {menu === "help" && (
                  <div className="absolute right-0 z-50 mt-2 w-60 rounded-md border border-line bg-white py-1 shadow-lg">
                    <Link href="/help" className="block px-3 py-2 text-sm text-text hover:bg-navy-50">
                      <HelpCircle className="mr-2 inline h-4 w-4" aria-hidden /> Help & demo guide
                    </Link>
                    <Link href="/help#accounts" className="block px-3 py-2 text-sm text-text hover:bg-navy-50">
                      <UserCircle2 className="mr-2 inline h-4 w-4" aria-hidden /> Demo accounts
                    </Link>
                    <a
                      href="/api/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 text-sm text-text hover:bg-navy-50"
                    >
                      <BookOpen className="mr-2 inline h-4 w-4" aria-hidden /> API documentation
                    </a>
                    <a
                      href="https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 text-sm text-text hover:bg-navy-50"
                    >
                      <ExternalLink className="mr-2 inline h-4 w-4" aria-hidden /> Official APH (external)
                    </a>
                  </div>
                )}
              </div>

              <div className="relative" ref={acctRef}>
                <button
                  type="button"
                  aria-expanded={menu === "account"}
                  onClick={() => setMenu((m) => (m === "account" ? false : "account"))}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-white/10"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-saffron text-xs font-bold text-white">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block max-w-[10rem] truncate text-xs font-semibold text-white">{user.name}</span>
                    <span className="block text-[10px] text-white/70">{ROLE_LABELS[user.role] ?? user.role}</span>
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-white/70 sm:block" aria-hidden />
                </button>
                {menu === "account" && (
                  <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-line bg-white py-1 shadow-lg">
                    <div className="border-b border-line px-3 py-2">
                      <p className="truncate text-sm font-semibold text-text">{user.name}</p>
                      <p className="truncate text-xs text-textmuted">{user.email}</p>
                      <p className="mt-1 text-[11px] text-textmuted">
                        {ROLE_LABELS[user.role] ?? user.role}
                        {user.region ? ` · ${user.region}` : ""}
                      </p>
                    </div>
                    <Link href="/profile" className="block px-3 py-2 text-sm text-text hover:bg-navy-50">
                      <UserCircle2 className="mr-2 inline h-4 w-4" aria-hidden /> Profile & security
                    </Link>
                    {can("admin.settings_manage") && (
                      <Link href="/settings" className="block px-3 py-2 text-sm text-text hover:bg-navy-50">
                        <Settings className="mr-2 inline h-4 w-4" aria-hidden /> System settings
                      </Link>
                    )}
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
                      onClick={async () => {
                        await logout();
                        router.replace("/login");
                      }}
                    >
                      <LogOut className="mr-2 inline h-4 w-4" aria-hidden /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="h-1 bg-saffron/90" aria-hidden />
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        {/* desktop sidebar */}
        <aside className="sticky top-[112px] hidden h-[calc(100vh-112px)] w-64 shrink-0 border-r border-line bg-white md:flex md:flex-col">
          {nav}
        </aside>

        {/* mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-navy-800/50" onClick={() => setDrawer(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 flex w-[86vw] max-w-xs flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-line bg-navy-700 px-3 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Logo size={26} /> Navigation
                </span>
                <button type="button" aria-label="Close navigation" onClick={() => setDrawer(false)} className="text-white">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              {nav}
            </div>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
