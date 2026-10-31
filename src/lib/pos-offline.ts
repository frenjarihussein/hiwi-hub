import { baseCurrencyOf } from "@/lib/currencies";
import { db } from "@/lib/db";
import { today } from "@/lib/format";
import { getOfflineScope, offlineKey } from "@/lib/offline-store";

/** A POS sale captured on the device, synced to the server later if offline. */
export type PosSale = {
  id: string; // client-generated document id → retries never create duplicates
  voucherId: string;
  tenantId: string;
  mode: "sale" | "purchase" | "sale_return" | "purchase_return";
  date: string;
  localNo?: string;
  /** Base currency captured at creation, not a later company setting. */
  currency?: string;
  partnerId: string | null;
  warehouseId: string;
  paid: boolean;
  total: number;
  userId?: string;
  branchId?: string | null;
  /** Optional: cash taken in another currency (rate = units per 1 base). */
  payCurrency?: string;
  payRate?: number;
  payTendered?: number;
  /** Extra split-tender payments in other currencies; the main payment covers the remainder. amount is in that currency. */
  extraPayments?: { id: string; currency: string; rate: number; amount: number; cashAccountId?: string | null }[];
  lines: { product_id: string; qty: number; unit_price: number }[];
  /** Station-provided pattern and drawer account. */
  patternId?: string | null;
  cashAccountId?: string | null;
};

const QKEY = "pos_offline_queue";
const listeners = new Set<() => void>();

export function readQueue(): PosSale[] {
  const key = offlineKey();
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(`${QKEY}:${key}`) || "[]"); } catch { return []; }
}
function writeQueue(q: PosSale[]) {
  const key = offlineKey();
  if (!key) throw new Error("يلزم تسجيل الدخول قبل حفظ فاتورة على الجهاز");
  localStorage.setItem(`${QKEY}:${key}`, JSON.stringify(q));
  listeners.forEach((l) => l());
  window.dispatchEvent(new Event("offline-data-changed"));
}
export function subscribeQueue(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function enqueue(s: PosSale) {
  const scope = getOfflineScope();
  if (!scope || s.userId !== scope.userId || s.tenantId !== scope.tenantId || (s.branchId ?? null) !== scope.branchId) throw new Error("الفاتورة لا تخص المستخدم والشركة والفرع الحاليين");
  writeQueue([...readQueue().filter(x => x.id !== s.id), s]);
}

export function newSale(p: Omit<PosSale, "id" | "voucherId" | "date">): PosSale {
  const id = crypto.randomUUID();
  const deviceKey = "pos_device_id";
  let device = localStorage.getItem(deviceKey);
  if (!device) { device = crypto.randomUUID(); localStorage.setItem(deviceKey, device); }
  const prefix = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "MOB" : "PC";
  return { ...p, localNo: `${prefix}-${device.slice(0, 8)}-${id}`, branchId: getOfflineScope()?.branchId ?? null, id, voucherId: crypto.randomUUID(), date: today() };
}

/** True when the failure is "no internet" rather than a real data error. */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const m = String((e as Error)?.message ?? e);
  return /Failed to fetch|NetworkError|Load failed|network|fetch/i.test(m);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isDup = (err: any) => err?.code === "23505";

/** Idempotent: safe to call again for a sale that was partly sent. */
export async function pushSale(s: PosSale): Promise<{ doc_no?: string | number | null }> {
  const scope = getOfflineScope();
  if (!scope || s.userId !== scope.userId || s.tenantId !== scope.tenantId || (s.branchId ?? null) !== scope.branchId) throw new Error("اختر شركة وفرع ومستخدم الفاتورة قبل إرسالها");
  const notes = ({ sale: "بيع نقطة البيع", purchase: "شراء نقطة البيع", sale_return: "مرتجع بيع نقطة البيع", purchase_return: "مرتجع شراء نقطة البيع" } as const)[s.mode];
  const base = s.currency || await baseCurrencyOf(s.tenantId);
  const ins = await db.from("documents").insert({
    id: s.id, tenant_id: s.tenantId, doc_type: s.mode, doc_date: s.date, currency: base, exchange_rate: 1,
    partner_id: s.partnerId, warehouse_id: s.warehouseId, amount: 0, notes, created_by: s.userId ?? null, branch_id: s.branchId ?? null,
    ...(s.patternId ? { pattern_id: s.patternId } : {}), ...(s.cashAccountId ? { cash_account_id: s.cashAccountId } : {}),
  } as never);
  if (ins.error && !isDup(ins.error)) throw ins.error;
  const { data: doc, error: rErr } = await db.from("documents").select("id,doc_no,status").eq("id", s.id).single();
  if (rErr) throw rErr;
  if (doc.status !== "posted") {
    const { count } = await db.from("document_lines").select("id", { count: "exact", head: true }).eq("document_id", s.id);
    if (!count) {
      const { error } = await db.from("document_lines").insert(s.lines.map((l) => ({ ...l, tenant_id: s.tenantId, document_id: s.id })));
      if (error) throw error;
    }
    const { error: pErr } = await db.rpc("post_document", { _id: s.id });
    if (pErr) throw new Error("حُفظت الفاتورة كمسودة ولم تُرحّل: " + pErr.message);
  }
  const extras = s.paid ? (s.extraPayments ?? []).filter((x) => x.amount > 0 && x.rate > 0) : [];
  const extraBase = extras.reduce((t, x) => t + x.amount / x.rate, 0);
  const mainBase = Math.max(0, Math.round((s.total - extraBase) * 10000) / 10000);
  const vType = s.mode === "sale" || s.mode === "purchase_return" ? "receipt" : "payment";
  for (const x of extras) {
    const v = await db.from("documents").insert({
      id: x.id, tenant_id: s.tenantId, doc_type: vType, doc_date: s.date, currency: x.currency as never, exchange_rate: x.rate, partner_id: s.partnerId, settles_document_id: s.id,
      amount: Math.round(x.amount * 100) / 100, pay_currency: x.currency, pay_amount: x.amount,
      notes: `دفع نقدي بـ${x.currency} (دفع متعدد العملات) - نقطة البيع`, created_by: s.userId ?? null, branch_id: s.branchId ?? null,
      ...((x.cashAccountId || s.cashAccountId) ? { cash_account_id: x.cashAccountId || s.cashAccountId } : {}),
    } as never);
    if (v.error && !isDup(v.error)) throw v.error;
    const { data: vd } = await db.from("documents").select("status").eq("id", x.id).single();
    if (vd && vd.status !== "posted") {
      const { error } = await db.rpc("post_document", { _id: x.id });
      if (error) throw new Error("تعذّر ترحيل دفعة " + x.currency + ": " + error.message);
    }
  }
  if (s.paid && mainBase > 0.0001) {
    const v = await db.from("documents").insert({
      id: s.voucherId, tenant_id: s.tenantId, doc_type: s.mode === "sale" || s.mode === "purchase_return" ? "receipt" : "payment", doc_date: s.date,
      currency: (s.payCurrency || base) as never, exchange_rate: s.payCurrency && s.payRate ? s.payRate : 1, partner_id: s.partnerId, settles_document_id: s.id,
      amount: s.payCurrency && s.payRate ? Math.round(mainBase * s.payRate * 100) / 100 : mainBase,
      pay_currency: s.payCurrency ?? null, pay_amount: s.payTendered ?? null,
      notes: s.payCurrency && s.payCurrency !== base ? `دفع نقدي بـ${s.payCurrency} - نقطة البيع` : "دفع نقدي - نقطة البيع", created_by: s.userId ?? null, branch_id: s.branchId ?? null,
      ...(s.cashAccountId ? { cash_account_id: s.cashAccountId } : {}),
    } as never);
    if (v.error && !isDup(v.error)) throw v.error;
    const { data: vd } = await db.from("documents").select("status").eq("id", s.voucherId).single();
    if (vd && vd.status !== "posted") {
      const { error } = await db.rpc("post_document", { _id: s.voucherId });
      if (error) throw new Error("تعذّر ترحيل نقد الفاتورة: " + error.message);
    }
  }
  return doc;
}

let syncing = false;
/** Sends every waiting sale, oldest first. Stops at the first network failure. */
export async function syncQueue(): Promise<{ sent: number; failed: string[] }> {
  if (syncing) return { sent: 0, failed: [] };
  syncing = true;
  let sent = 0;
  const failed: string[] = [];
  try {
    for (const s of readQueue()) {
      try {
        await pushSale(s);
        writeQueue(readQueue().filter((x) => x.id !== s.id));
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        failed.push((e as Error).message);
        break;
      }
    }
  } finally { syncing = false; }
  return { sent, failed };
}

// Reference data cache (products, warehouses, partners) for offline use
export const refsKey = (t?: string | null) => `pos_refs_cache_${t ?? ""}:${offlineKey() ?? "signed-out"}`;
export function loadRefs<T>(t?: string | null): T | undefined {
  try { const v = localStorage.getItem(refsKey(t)); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
}
export function saveRefs(t: string | null | undefined, v: unknown) {
  try { localStorage.setItem(refsKey(t), JSON.stringify(v)); } catch { /* storage full */ }
}
