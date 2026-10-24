"use client";

/**
 * Session handling.
 *
 * Prototype limitation (documented in README/security notes): the JWT is kept
 * in localStorage so the demo works without a backend cookie domain. The
 * backend remains the only authority — every request carries the token and the
 * server re-checks permissions on each call.
 */
import { createContext, useCallback, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken, setToken } from "./api";
import type { SessionUser } from "./types";

const USER_KEY = "aops_user";

export function cacheUser(user: SessionUser | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function cachedUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export interface SessionValue {
  user: SessionUser | null;
  permissions: string[];
  can: (perm: string) => boolean;
  canAny: (...perms: string[]) => boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const hasToken = typeof window !== "undefined" && !!getToken();

  const { data, isLoading } = useQuery<SessionUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const u = await api<SessionUser>("/auth/me");
      cacheUser(u);
      return u;
    },
    enabled: hasToken,
    retry: false,
    staleTime: 60_000,
  });

  const user = data ?? cachedUser();

  const logout = useCallback(async () => {
    try {
      if (getToken()) await api("/auth/logout", { method: "POST" });
    } catch {
      /* session may already be invalid — clear locally regardless */
    }
    setToken(null);
    cacheUser(null);
    qc.clear();
  }, [qc]);

  const permissions = user?.permissions ?? [];
  const can = useCallback((perm: string) => permissions.includes(perm), [permissions]);
  const canAny = useCallback(
    (...perms: string[]) => perms.some((p) => permissions.includes(p)),
    [permissions],
  );

  return (
    <SessionContext.Provider
      value={{
        user,
        permissions,
        can,
        canAny,
        isLoading: hasToken && isLoading,
        isAuthenticated: !!user && !!getToken(),
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
