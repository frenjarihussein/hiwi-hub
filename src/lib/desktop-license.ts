// Offline desktop licensing: Ed25519-signed keys bound to one device fingerprint.
// Browser-safe (verify only). Signing happens server-side in desktop-license.functions.ts.

export const LICENSE_PUBLIC_KEY = "MCowBQYDK2VwAyEAuyTy1kmA821m1z0fZsR9HHhSDxKym/0HXvySPUSjlTY=";

export type LicensePayload = {
  v: 1;
  id: string; // license row id
  d: string; // device fingerprint
  c: string; // customer name
  p: string; // plan: trial | year | lifetime
  e: number | null; // expiry (ms since epoch), null = never
  i: number; // issued at (ms)
};

export const PLAN_LABEL: Record<string, string> = { trial: "تجريبي", month: "شهري", year: "سنوي", lifetime: "دائم" };

export const b64u = {
  enc(bytes: Uint8Array) {
    let s = "";
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(s: string) {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  },
};

export function encodePayload(p: LicensePayload) {
  return b64u.enc(new TextEncoder().encode(JSON.stringify(p)));
}

/** Formats "payload.sig" into readable groups for copy/paste. */
export function formatKey(raw: string) {
  return `YSL1.${raw}`;
}

export function parseKey(key: string): { body: string; sig: string; payload: LicensePayload } | null {
  if (key.length > 4096) return null;
  const k = key.replace(/\s+/g, "").replace(/^YSL1\./, "");
  const [body, sig, extra] = k.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64u.dec(body))) as LicensePayload;
    if (payload?.v !== 1 || typeof payload.id !== "string" || !payload.id
      || typeof payload.d !== "string" || !/^YS-(?:[0-9A-F]{4}-){3}[0-9A-F]{4}$/.test(payload.d)
      || typeof payload.c !== "string" || !payload.c || !Object.hasOwn(PLAN_LABEL, payload.p)
      || !Number.isFinite(payload.i) || (payload.e !== null && (!Number.isFinite(payload.e) || payload.e <= payload.i))) return null;
    return { body, sig, payload };
  } catch {
    return null;
  }
}

export type LicenseCheck =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: "invalid" | "device" | "expired" | "clock" | "revoked"; payload?: LicensePayload };

/** Verifies signature, device binding, expiry and clock rollback (lastSeen = highest time ever observed). */
export async function verifyLicense(key: string, device: string, now: number, lastSeen = 0, publicKey = LICENSE_PUBLIC_KEY): Promise<LicenseCheck> {
  const parsed = parseKey(key);
  if (!parsed) return { ok: false, reason: "invalid" };
  try {
    const pub = await crypto.subtle.importKey("spki", b64u.dec(publicKey.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("Ed25519", pub, b64u.dec(parsed.sig), new TextEncoder().encode(parsed.body));
    if (!ok) return { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const p = parsed.payload;
  if (p.d !== device) return { ok: false, reason: "device", payload: p };
  // Allow 1 day of tolerance; going further back than ever seen means the clock was turned back.
  if (lastSeen && now < lastSeen - 86_400_000) return { ok: false, reason: "clock", payload: p };
  if (now < p.i - 86_400_000) return { ok: false, reason: "clock", payload: p };
  if (p.e !== null && Math.max(now, lastSeen) > p.e) return { ok: false, reason: "expired", payload: p };
  return { ok: true, payload: p };
}

export function planExpiry(plan: string, from: number, customDays?: number): number | null {
  const day = 86_400_000;
  if (plan === "lifetime") return null;
  if (customDays && customDays > 0) return from + customDays * day;
  if (plan === "trial") return from + 14 * day;
  if (plan === "month") return from + 31 * day;
  return from + 366 * day;
}
