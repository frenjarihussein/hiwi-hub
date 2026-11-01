// Shared rules for pre-generated desktop activation codes (browser/worker safe).
export const ACTIVATION_CODE = /^YSA(-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}){4}$/;
export const DEVICE_ID = /^YS-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I confusion

export function newActivationCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(20);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `YSA-${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10, 15)}-${chars.slice(15, 20)}`;
}

export function normalizeCode(c: unknown) {
  return String(c ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export const MAX_BATCH = 200;
export function clampBatch(n: unknown) {
  const v = Math.floor(Number(n) || 0);
  if (v < 1 || v > MAX_BATCH) throw new Error(`عدد المفاتيح يجب أن يكون بين 1 و ${MAX_BATCH}`);
  return v;
}

export type DeviceSpecs = { hostname: string; user: string; os: string; cpu: string; cores: number; ram_gb: number; arch: string };

/** Untrusted specs from the device: keep short strings and sane numbers only. */
export function cleanSpecs(s: unknown): DeviceSpecs {
  const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
  const str = (v: unknown, n = 120) => String(v ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, n);
  const num = (v: unknown, max: number) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 10) / 10 : 0; };
  return { hostname: str(o["hostname"], 80), user: str(o["user"], 80), os: str(o["os"]), cpu: str(o["cpu"]), cores: num(o["cores"], 1024), ram_gb: num(o["ram_gb"], 4096), arch: str(o["arch"], 20) };
}
