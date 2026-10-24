"use client";

import { SessionProvider } from "../../lib/session";
import { AppShell } from "../../components/layout/AppShell";

/** Authenticated portal: session context + application shell. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
