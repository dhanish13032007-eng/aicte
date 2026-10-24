/**
 * Minimal typed API client.
 *
 * All calls go through Next's /api/* rewrite (proxied to FastAPI) so no CORS
 * is needed in development. The JWT is kept in memory + localStorage ONLY as a
 * prototype convenience (documented limitation of the prototype; in production
 * a Secure httpOnly cookie should be used).
 */
const BASE = "/api";

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aops_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("aops_token", token);
  else localStorage.removeItem("aops_token");
}

export async function api<T>(
  path: string,
  opts: { method?: string; json?: unknown; form?: FormData; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(url.toString(), { method: opts.method || (body ? "POST" : "GET"), headers, body });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      detail = j.detail ?? JSON.stringify(j);
      if (Array.isArray(detail)) detail = detail.map((d: { msg?: string }) => d.msg ?? String(d)).join("; ");
    } catch {
      /* keep fallback */
    }
    throw new ApiError(res.status, detail);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : (res as unknown as T);
}

/** Authenticated file download (CSV exports) — the token must be attached,
 * so a plain <a href> would 401. */
export async function download(path: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch {
      /* keep fallback */
    }
    throw new ApiError(res.status, detail);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const name = match?.[1] || path.split("/").pop() || "download";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
