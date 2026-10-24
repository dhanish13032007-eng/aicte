"use client";

/** Sidebar navigation model. Visibility mirrors backend permissions — the
 * server still enforces every one of them; hiding is only presentation. */
import type { ComponentType } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  BookOpenText,
  CalendarClock,
  ClipboardCheck,
  FileStack,
  FileText,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Scale,
  Settings2,
  ShieldAlert,
  Users,
  Waypoints,
  CalendarRange,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  perms?: string[];
  /** substring of the pathname treated as "active" */
  match?: string;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    section: "Operations",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Applications", href: "/applications", icon: FileStack, match: "/applications" },
      { label: "My Tasks", href: "/tasks", icon: ListChecks },
      {
        label: "Scrutiny & Re-scrutiny",
        href: "/scrutiny",
        icon: ClipboardCheck,
        perms: ["workflow.act_scrutiny", "workflow.act_admin_validate", "application.view_all"],
      },
      {
        label: "SAC/SHC Cases",
        href: "/review",
        icon: Scale,
        perms: ["workflow.act_sac_review", "application.view_all"],
      },
      { label: "EVC Management", href: "/evc", icon: Waypoints, perms: ["evc.view_all", "application.view_all"], match: "/evc" },
      {
        label: "Compliance & Undertakings",
        href: "/compliance",
        icon: ShieldAlert,
        perms: ["compliance.view_all", "compliance.view_own_institution"],
        match: "/compliance",
      },
      {
        label: "Document Registry",
        href: "/documents",
        icon: FileText,
        perms: ["doc.view_all", "doc.upload", "application.view_all"],
        match: "/documents",
      },
      {
        label: "Expiry Calendar",
        href: "/calendar",
        icon: CalendarClock,
        perms: ["doc.view_all", "doc.upload", "application.view_all"],
      },
      { label: "Alerts & Escalations", href: "/alerts", icon: AlertTriangle },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { label: "Reports & Analytics", href: "/reports", icon: BarChart3, perms: ["reports.view"] },
      { label: "Delay-Risk Radar", href: "/risk", icon: CalendarRange },
      { label: "Dependency Analysis", href: "/bottlenecks", icon: GitBranch },
      { label: "AI Document Assistant", href: "/ai-assistant", icon: Bot, perms: ["ai.use"] },
      { label: "AICTE Handbook Assistant", href: "/handbook-assistant", icon: BookOpenText, perms: ["rag.query"] },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Workflow Configuration", href: "/workflow-config", icon: GitBranch, perms: ["admin.workflow_config"] },
      { label: "Regulatory Rules", href: "/regulatory-rules", icon: Scale, match: "/regulatory-rules" },
      { label: "Users & Permissions", href: "/users", icon: Users, perms: ["admin.users_manage"] },
      { label: "Audit Trail", href: "/audit", icon: ClipboardCheck, perms: ["audit.view_all", "audit.view_own_scope_events"] },
      { label: "System Settings", href: "/settings", icon: Settings2, perms: ["admin.settings_manage", "admin.notification_policy_manage"] },
    ],
  },
];

export function visibleNav(can: (perm: string) => boolean): NavSection[] {
  return NAV.map((s) => ({
    section: s.section,
    items: s.items.filter((i) => !i.perms || i.perms.some(can)),
  })).filter((s) => s.items.length > 0);
}
