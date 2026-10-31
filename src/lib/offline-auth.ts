/**
 * Lets a user who was verified online keep using the app when the internet drops,
 * including reopening the installed app. Only the auth "who am I" and token-refresh
 * calls are answered locally, only for the same user, and only within 24h of the last
 * online verification. Nothing reaches the server offline, and every server request
 * is re-validated (RLS) once the connection returns.
 */
export const OFFLINE_AUTH_MAX_AGE = 24 * 60 * 60 * 1000;
const KEY = "offline_auth_user:";
import { currentPinSession, leavePinOfflineMode } from "./pin-vault";

export function isAuthEndpoint(url: string, base: string) {
  try {
    const target = new URL(url, window.location.origin), allowed = new URL(base);
    return target.origin === allowed.origin && target.pathname.startsWith(`${allowed.pathname.replace(/\/$/, "")}/auth/v1/`);
  } catch { return false; }
}

type Saved = { user: { id: string } & Record<string, unknown>; savedAt: number };

export function jwtSub(token: string | null | undefined): string | null {
  try {
    const part = token?.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.sub === "string" ? json.sub : null;
  } catch { return null; }
}

export function usableSaved(saved: Saved | null, userId: string | null, now = Date.now()) {
  if (!saved || !userId || saved.user?.id !== userId) return null;
  if (now < saved.savedAt || now - saved.savedAt > OFFLINE_AUTH_MAX_AGE) return null;
  return saved.user;
}

function read(userId: string): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY + userId) || "null"); } catch { return null; }
}
export function rememberVerifiedUser(user: Saved["user"]) {
  try { localStorage.setItem(KEY + user.id, JSON.stringify({ user, savedAt: Date.now() })); } catch { /* quota */ }
}
export function forgetOfflineAuth() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(KEY)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

let installed = false;
export function installOfflineAuth(onReconnect?: () => void) {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const network = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isAuthEndpoint(url, import.meta.env['VITE_SUPABASE_URL'])) return network(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isUser = /\/auth\/v1\/user(\?|$)/.test(url) && method === "GET";
    const isRefresh = /\/auth\/v1\/token\?grant_type=refresh_token/.test(url);
    const isLogout = /\/auth\/v1\/logout/.test(url);
    if (isLogout) forgetOfflineAuth();
    if (!isUser && !isRefresh) return network(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
    let body: { refresh_token?: string } = {};
    if (isRefresh && typeof init?.body === "string") { try { body = JSON.parse(init.body); } catch { /* ignore */ } }

    const offlineAnswer = () => {
      if (isUser) {
        const user = usableSaved(read(jwtSub(bearer) ?? ""), jwtSub(bearer));
        return user ? json(user) : null;
      }
      // Refresh offline: keep the same tokens locally; the real refresh happens on reconnect.
      const stored = Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).map((k) => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } }).find((s) => s?.refresh_token && s.refresh_token === body.refresh_token);
      const pin = currentPinSession();
      const src = stored ?? (pin && pin.refresh_token === body.refresh_token ? pin : null);
      const user = src ? usableSaved(read(String(src.user?.id ?? "")), String(src.user?.id ?? "") || null) : null;
      if (!src || !user) return null;
      return json({ ...src, user, expires_in: 600, expires_at: Math.floor(Date.now() / 1000) + 600 });
    };

    if (!navigator.onLine) return offlineAnswer() ?? network(input, init);
    try {
      const res = await network(input, init);
      if (res.ok) {
        // Commit the verified identity before getUser resolves and route navigation begins.
        const d = await res.clone().json().catch(() => null);
        const u = isUser ? d : d?.user;
        if (u?.id) { rememberVerifiedUser(u); leavePinOfflineMode(); }
      } else if (res.status === 401 || res.status === 403) {
        forgetOfflineAuth();
      } else if (res.status === 408 || res.status >= 500) {
        // A gateway may return a network failure as HTTP instead of throwing fetch.
        const local = offlineAnswer();
        if (local) return local;
      }
      return res;
    } catch (error) {
      const local = offlineAnswer();
      if (local) return local;
      throw error;
    }
  };
  if (onReconnect) window.addEventListener("online", onReconnect);
}
