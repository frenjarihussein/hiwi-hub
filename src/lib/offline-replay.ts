import { supabase } from "@/integrations/supabase/client";
import { offlineChanged, offlineKey, offlineStore, type PendingWrite } from "./offline-store";
import { draftPath, parseDraftExport } from "./offline-drafts";
import { isNumberConflict, serverBody, withoutNumber, NUMBER_FIELDS } from "./offline-numbering";
import { isPinOfflineMode } from "./pin-vault";

const baseUrl = () => import.meta.env['VITE_SUPABASE_URL'];
const receiptKey = (scope: string, id: string) => `draft-result:${scope}:${id}`;

/** Persistent claim + receipt: never replay concurrently or import locally completed work. */
export async function sendDraft(w: PendingWrite): Promise<void> {
  if (!navigator.onLine) throw new Error("لا يوجد اتصال بالإنترنت");
  if (isPinOfflineMode()) throw new Error("فُتح البرنامج بالرمز السري؛ سجّل الدخول بكلمة المرور مع الإنترنت قبل رفع العمليات");
  if (w.scope !== offlineKey()) throw new Error("هذه المسودة تخص شركة أو فرعاً أو مستخدماً آخر");
  const url = draftPath(w, baseUrl());
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("سجّل الدخول أولاً");
  if (data.session?.user.id !== JSON.parse(w.scope)[0] || w.scope !== offlineKey()) throw new Error("تغير المستخدم أو الشركة؛ أُوقف الإرسال");
  const store = offlineStore();
  const claimed = await store.transaction("rw", store.writes, store.values, async () => {
    if (await store.values.get(receiptKey(w.scope, w.id))) return false;
    const current = await store.writes.get(w.id);
    if (!current || current.scope !== offlineKey() || current.state === "sending") return false;
    await store.writes.update(w.id, { state: "sending", error: "" });
    return true;
  });
  if (!claimed) throw new Error("العملية منفذة أو قيد الإرسال؛ لن تُكرر");
  offlineChanged();
  const headers = new Headers(w.headers.filter(([key]) => ["prefer", "accept"].includes(key.toLowerCase())));
  headers.set("apikey", import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  try {
    let body = w.body;
    let res = await fetch(url, { method: w.method, headers, body: JSON.stringify(serverBody(body)) });
    // Older drafts may carry client-added columns the table lacks (e.g. created_at/id on user_prefs): drop and retry.
    for (let i = 0; i < 3 && !res.ok && res.status === 400; i++) {
      const err = await res.clone().json().catch(() => null);
      const col = err?.code === "PGRST204" ? /'([^']+)' column/.exec(err?.message ?? "")?.[1] : undefined;
      if (!col) break;
      body = dropColumn(body, col);
      res = await fetch(url, { method: w.method, headers, body: JSON.stringify(serverBody(body)) });
    }
    if (!res.ok && w.method === "POST" && NUMBER_FIELDS[w.table]) {
      const err = await res.clone().json().catch(() => null);
      if (isNumberConflict(res.status, err?.code, err?.message)) {
        // The row was not inserted (unique number taken): the server trigger issues the official number.
        headers.set("prefer", "return=representation");
        res = await fetch(url, { method: "POST", headers, body: JSON.stringify(serverBody(withoutNumber(w.table, body))) });
        if (res.ok) {
          const field = NUMBER_FIELDS[w.table]!.field;
          const saved = (await res.clone().json().catch(() => [])) as Record<string, unknown>[];
          const local = (Array.isArray(w.body) ? w.body : [w.body]) as Record<string, unknown>[];
          await store.values.put({ key: `num-map:${w.scope}:${w.id}`, value: local.map((r, i) => ({ id: r["id"], local: r[field], official: saved[i]?.[field] ?? null })) });
        }
      }
    }
    if (!res.ok) {
      const msg = await res.json().then((j) => j?.message).catch(() => null);
      await store.writes.update(w.id, { state: "review", error: msg || `HTTP ${res.status}` });
      throw new Error(msg || "رفض الخادم العملية");
    }
    await store.transaction("rw", store.writes, store.values, async () => {
      await store.values.put({ key: receiptKey(w.scope, w.id), value: { status: "sent", at: Date.now() } });
      await store.writes.delete(w.id);
    });
  } catch (error) {
    // A lost response can mean the server committed: leave the claim locked, never auto-retry.
    const row = await store.writes.get(w.id);
    if (row?.state === "sending") await store.writes.update(w.id, { error: "انقطع الرد؛ تحقق من السجل في البرنامج قبل أي إعادة إدخال. لن تُرسل هذه العملية مرة أخرى تلقائياً." });
    throw error;
  } finally { offlineChanged(); }
}

export function dropColumn(body: unknown, col: string): unknown {
  const strip = (r: unknown) => { if (!r || typeof r !== "object") return r; const { [col]: _x, ...rest } = r as Record<string, unknown>; return rest; };
  return Array.isArray(body) ? body.map(strip) : strip(body);
}

export async function sendAllDrafts(automatic = false) {
  const scope = offlineKey();
  if (!scope) return { sent: 0, failed: 0 };
  const rows = await offlineStore().writes.where("scope").equals(scope).sortBy("createdAt");
  let sent = 0, failed = 0;
  for (const w of rows) {
    if (!navigator.onLine || offlineKey() !== scope) break;
    if (w.state === "sending") break;
    void automatic;
    try { await sendDraft(w); sent++; } catch { failed++; break; }
  }
  return { sent, failed };
}

export async function importDrafts(value: unknown) {
  const scope = offlineKey();
  if (!scope) throw new Error("سجّل الدخول وحدد الشركة أولاً");
  const rows = parseDraftExport(value, scope, baseUrl());
  const store = offlineStore();
  let imported = 0;
  await store.transaction("rw", store.writes, store.values, async () => {
    for (const row of rows) {
      if (await store.writes.get(row.id) || await store.values.get(receiptKey(scope, row.id))) continue;
      await store.writes.add(row); imported++;
    }
  });
  offlineChanged();
  return imported;
}

export async function discardDraft(id: string) {
  const store = offlineStore();
  await store.transaction("rw", store.writes, store.values, async () => {
    const row = await store.writes.get(id);
    if (!row || row.scope !== offlineKey()) return;
    await store.values.put({ key: receiptKey(row.scope, id), value: { status: "discarded", at: Date.now() } });
    await store.writes.delete(id);
  });
  offlineChanged();
}