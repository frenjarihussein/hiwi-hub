import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";

export type Currency = { code: string; name: string; symbol: string | null; is_active?: boolean; gain_account_id?: string | null; loss_account_id?: string | null };

const BASE: Currency[] = [
  { code: "USD", name: "دولار أمريكي", symbol: "$" },
  { code: "SYP", name: "ليرة سورية", symbol: "ل.س" },
];

/** Built-in currencies plus the ones the company added in settings. */
export function useCurrencies(definedOnly = false) {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["currencies", me?.tenantId, definedOnly],
    enabled: !!me,
    queryFn: async (): Promise<Currency[]> => {
      const { data, error } = await db.from("currencies").select("code,name,symbol,is_active,gain_account_id,loss_account_id").order("code");
      if (error) throw error;
      if (definedOnly) return data ?? [];
      const out: Currency[] = BASE.map((b) => ({ ...b, is_active: true }));
      (data ?? []).forEach((c: Currency) => {
        const i = out.findIndex((x) => x.code === c.code);
        if (i >= 0) out[i] = { ...c, name: out[i]?.name ?? c.name }; else out.push(c);
      });
      return out;
    },
  });
}

export function CurrencyOptions() {
  const { data } = useCurrencies();
  return (
    <>
      {(data ?? BASE).filter((c) => c.is_active !== false).map((c) => (
        <option key={c.code} value={c.code}>
          {c.name} {c.symbol ? `(${c.symbol})` : `(${c.code})`}
        </option>
      ))}
    </>
  );
}

/** The company's base (reporting) currency; exchange rates are units of a currency per 1 base unit. */
export function useBaseCurrency(): string {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ["base-currency", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data } = await db.from("tenant_settings").select("base_currency").eq("tenant_id", me!.tenantId).maybeSingle();
      return (data?.base_currency as string) || "USD";
    },
  });
  return q.data ?? "USD";
}

/** Latest exchange rate per currency (units per 1 base unit); base currency = 1. */
export function useLatestRates() {
  const { data: me } = useMe();
  const base = useBaseCurrency();
  const q = useQuery({
    queryKey: ["latest-rates", me?.tenantId, base],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data } = await db.from("exchange_rates").select("currency,rate_to_usd,rate_date").eq("tenant_id", me!.tenantId).order("rate_date", { ascending: false });
      const out: Record<string, number> = { [base]: 1 };
      (data ?? []).forEach((r: { currency: string; rate_to_usd: number }) => { if (!(r.currency in out) && Number(r.rate_to_usd) > 0) out[r.currency] = Number(r.rate_to_usd); });
      return out;
    },
  });
  return q.data ?? { [base]: 1 };
}

/** Converts per-currency balances to the base currency at today's rates; missing rates are reported. */
export function toBaseAtRates(bal: Record<string, number>, rates: Record<string, number>) {
  let total = 0;
  const missing: string[] = [];
  for (const [c, v] of Object.entries(bal)) {
    const r = rates[c];
    if (r && r > 0) total += v / r; else if (Math.abs(v) > 0.005) missing.push(c);
  }
  return { total, missing };
}

/** Company base currency for non-hook code (falls back to USD only when unset). */
export async function baseCurrencyOf(tenantId: string): Promise<string> {
  const { data } = await db.from("tenant_settings").select("base_currency").eq("tenant_id", tenantId).maybeSingle();
  return (data?.base_currency as string) || "USD";
}

/** Common world currencies offered when choosing a base currency or adding a currency. */
export const WORLD_CURRENCIES: Currency[] = [
  { code: "USD", name: "دولار أمريكي", symbol: "$" },
  { code: "SYP", name: "ليرة سورية", symbol: "ل.س" },
  { code: "EUR", name: "يورو", symbol: "€" },
  { code: "GBP", name: "جنيه إسترليني", symbol: "£" },
  { code: "TRY", name: "ليرة تركية", symbol: "₺" },
  { code: "SAR", name: "ريال سعودي", symbol: "ر.س" },
  { code: "AED", name: "درهم إماراتي", symbol: "د.إ" },
  { code: "QAR", name: "ريال قطري", symbol: "ر.ق" },
  { code: "KWD", name: "دينار كويتي", symbol: "د.ك" },
  { code: "BHD", name: "دينار بحريني", symbol: "د.ب" },
  { code: "OMR", name: "ريال عماني", symbol: "ر.ع" },
  { code: "JOD", name: "دينار أردني", symbol: "د.أ" },
  { code: "LBP", name: "ليرة لبنانية", symbol: "ل.ل" },
  { code: "IQD", name: "دينار عراقي", symbol: "د.ع" },
  { code: "EGP", name: "جنيه مصري", symbol: "ج.م" },
  { code: "LYD", name: "دينار ليبي", symbol: "د.ل" },
  { code: "TND", name: "دينار تونسي", symbol: "د.ت" },
  { code: "DZD", name: "دينار جزائري", symbol: "د.ج" },
  { code: "MAD", name: "درهم مغربي", symbol: "د.م" },
  { code: "SDG", name: "جنيه سوداني", symbol: "ج.س" },
  { code: "YER", name: "ريال يمني", symbol: "ر.ي" },
  { code: "CHF", name: "فرنك سويسري", symbol: "CHF" },
  { code: "CAD", name: "دولار كندي", symbol: "C$" },
  { code: "AUD", name: "دولار أسترالي", symbol: "A$" },
  { code: "JPY", name: "ين ياباني", symbol: "¥" },
  { code: "CNY", name: "يوان صيني", symbol: "¥" },
  { code: "RUB", name: "روبل روسي", symbol: "₽" },
  { code: "SEK", name: "كرونة سويدية", symbol: "kr" },
  { code: "IRR", name: "ريال إيراني", symbol: "﷼" },
];
