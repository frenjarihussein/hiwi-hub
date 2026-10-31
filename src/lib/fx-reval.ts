import { db } from "@/lib/db";

export type FxRevalMode = "auto" | "scheduled" | "on_demand" | "at_close" | "on_rate_change";
export const FX_MODES: { value: FxRevalMode; label: string; hint: string }[] = [
  { value: "on_demand", label: "عند الطلب", hint: "يُنشأ القيد فقط عندما تضغط ترحيل القيد" },
  { value: "on_rate_change", label: "عند كل تغيير بالأسعار", hint: "يُرحَّل قيد الفروقات تلقائياً فور حفظ نشرة أسعار جديدة" },
  { value: "auto", label: "تلقائي يومي", hint: "يُرحَّل مرة واحدة يومياً عند فتح البرنامج بآخر الأسعار" },
  { value: "scheduled", label: "مجدول شهري", hint: "يُرحَّل مرة كل شهر عند أول فتح للبرنامج في الشهر" },
  { value: "at_close", label: "إلزامي عند الإقفال", hint: "يُرحَّل تلقائياً قبل قيد إقفال السنة ولا يتم الإقفال بدونه" },
];

/** Is a revaluation run due for this mode given the last run date (yyyy-mm-dd) and today? */
export function fxRevalDue(mode: FxRevalMode, last: string | null | undefined, today: string): boolean {
  if (mode === "auto") return !last || last < today;
  if (mode === "scheduled") return !last || last.slice(0, 7) < today.slice(0, 7);
  return false;
}

/**
 * Exchange-difference effect on an account (IAS 21): diff = foreign balance × new rate − booked base.
 * Debit-nature (asset) balance: currency up ⇒ gain; credit-nature (liability): currency up ⇒ loss.
 * Returns signed base amount: positive = gain, negative = loss.
 */
export function fxDifference(foreignBalance: number, newBasePerUnit: number, bookedBase: number): number {
  return Math.round((foreignBalance * newBasePerUnit - bookedBase) * 100) / 100;
}

/** Latest rate per currency (units per 1 base) on or before date. */
export async function latestRates(tenantId: string, date: string): Promise<Record<string, number>> {
  const { data } = await db.from("exchange_rates").select("currency,rate_to_usd,rate_date").eq("tenant_id", tenantId).lte("rate_date", date).order("rate_date", { ascending: false });
  const m: Record<string, number> = {};
  (data ?? []).forEach((r: { currency: string; rate_to_usd: number }) => { if (!m[r.currency] && Number(r.rate_to_usd) > 0) m[r.currency] = Number(r.rate_to_usd); });
  return m;
}

/** Posts the revaluation entry at latest rates and records the run date. Returns number of revalued accounts. */
export async function postFxRevaluation(tenantId: string, date: string): Promise<number> {
  const rates = await latestRates(tenantId, date);
  if (!Object.keys(rates).length) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc("revalue_fx_balances", { _date: date, _rates: rates, _post: true });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from("tenant_settings") as any).update({ fx_reval_last: date }).eq("tenant_id", tenantId);
  return (data ?? []).length;
}
