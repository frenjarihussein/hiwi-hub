/**
 * Offline PIN unlock for a trusted device. The signed-in session (never the password) is encrypted
 * with AES-GCM using a key derived from the PIN by PBKDF2. Five wrong PINs wipe the vault.
 * A PIN-unlocked app runs in offline mode: nothing is sent to the server until a real online
 * session refresh succeeds.
 */
export const MAX_PIN_ATTEMPTS = 5;
export const PBKDF2_ITERATIONS = 210_000;
const VAULT_KEY = "pin-vault";

export type VaultRecord = { userId: string; email: string; salt: string; iv: string; ct: string; attempts: number; createdAt: number };
export type VaultKV = { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void>; del(key: string): Promise<void> };

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pin: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function validPin(pin: string) { return /^\d{4,8}$/.test(pin); }

export async function defaultKV(): Promise<VaultKV> {
  const { offlineStore } = await import("./offline-store");
  const v = offlineStore().values;
  return {
    get: async (k) => (await v.get(k))?.value,
    put: async (k, value) => { await v.put({ key: k, value }); },
    del: async (k) => { await v.delete(k); },
  };
}

export async function savePinVault(pin: string, session: { user: { id: string; email?: string } } & Record<string, unknown>, kv?: VaultKV, iterations?: number) {
  if (!validPin(pin)) throw new Error("الرمز يجب أن يكون من 4 إلى 8 أرقام");
  const store = kv ?? await defaultKV();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(session))));
  const rec: VaultRecord = { userId: session.user.id, email: session.user.email ?? "", salt: b64(salt), iv: b64(iv), ct: b64(ct), attempts: 0, createdAt: Date.now() };
  await store.put(VAULT_KEY, rec);
}

export async function readVault(kv?: VaultKV): Promise<VaultRecord | null> {
  const store = kv ?? await defaultKV();
  return ((await store.get(VAULT_KEY)) as VaultRecord | undefined) ?? null;
}

export async function clearPinVault(kv?: VaultKV) { await (kv ?? await defaultKV()).del(VAULT_KEY); }

export type UnlockResult =
  | { ok: true; session: { access_token: string; refresh_token: string; user: { id: string } & Record<string, unknown> } & Record<string, unknown> }
  | { ok: false; reason: "none" | "wrong" | "locked"; left: number };

export async function unlockWithPin(pin: string, kv?: VaultKV, iterations?: number): Promise<UnlockResult> {
  const store = kv ?? await defaultKV();
  const rec = await readVault(store);
  if (!rec) return { ok: false, reason: "none", left: 0 };
  if (rec.attempts >= MAX_PIN_ATTEMPTS) { await store.del(VAULT_KEY); return { ok: false, reason: "locked", left: 0 }; }
  try {
    const key = await deriveKey(pin, unb64(rec.salt), iterations);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) as BufferSource }, key, unb64(rec.ct) as BufferSource);
    await store.put(VAULT_KEY, { ...rec, attempts: 0 });
    return { ok: true, session: JSON.parse(new TextDecoder().decode(plain)) };
  } catch {
    const attempts = rec.attempts + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) { await store.del(VAULT_KEY); return { ok: false, reason: "locked", left: 0 }; }
    await store.put(VAULT_KEY, { ...rec, attempts });
    return { ok: false, reason: "wrong", left: MAX_PIN_ATTEMPTS - attempts };
  }
}

// --- PIN offline mode flag: blocks all server writes/replay until a real online session refresh.
const MODE_KEY = "pin-offline-mode";
let pinSession: { refresh_token: string; user: { id: string } } & Record<string, unknown> | null = null;
export function enterPinOfflineMode(session: NonNullable<typeof pinSession>) {
  pinSession = session;
  try { localStorage.setItem(MODE_KEY, "1"); } catch { /* ignore */ }
}
export function leavePinOfflineMode() {
  pinSession = null;
  try { localStorage.removeItem(MODE_KEY); } catch { /* ignore */ }
}
export function isPinOfflineMode() {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(MODE_KEY) === "1"; } catch { return false; }
}
export function currentPinSession() { return pinSession; }
