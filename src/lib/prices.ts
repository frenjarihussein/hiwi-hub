import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";

/** Names of the extra sale prices (index i → price level i+1). Services have their own independent list. */
export function usePriceNames(kind: "stock" | "service" = "stock"): string[] {
  const { data: me } = useMe();
  const col = kind === "service" ? "service_price_names" : "price_names";
  const q = useQuery({
    queryKey: ["price_names", me?.tenantId, kind],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db.from("tenant_settings").select(col) as any).eq("tenant_id", me!.tenantId).maybeSingle();
      const v = data?.[col];
      return Array.isArray(v) ? (v as unknown[]).map(String) : [];
    },
  });
  return q.data ?? [];
}

/** Sale price of a product for a customer price level; falls back to the default sale price. */
export function priceForLevel(
  product: { sale_price?: number | string | null; prices?: Record<string, unknown> | null } | null | undefined,
  level: number | null | undefined,
): number {
  if (!product) return 0;
  if (level && level > 0) {
    const v = Number(product.prices?.[String(level)]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  // Companies that define named prices hide the basic sale price; fall back to the first named price.
  return Number(product.sale_price) || Number(product.prices?.["1"]) || 0;
}

/** Discount/addition amount and percent kept in sync against a base. */
export function pctToAmount(base: number, pct: number): number {
  return Math.round(base * pct) / 100;
}
export function amountToPct(base: number, amount: number): number {
  return base ? Math.round((amount / base) * 10000) / 100 : 0;
}

/** Applies a percent change (negative = reduction) and rounds to the nearest step (0 = no rounding). */
export function repriceValue(price: number, pct: number, step: number): number {
  const v = price * (1 + pct / 100);
  if (!step) return Math.round(v * 10000) / 10000;
  return Math.round(Math.round(v / step) * step * 10000) / 10000;
}

/** Converts a base-currency amount at `rate` (units per 1 base) and rounds up/near to `step` (0 = 2 decimals). */
export function convertRounded(amount: number, rate: number, step: number): number {
  const v = amount * rate;
  if (!step) return Math.round(v * 100) / 100;
  return Math.round(v / step) * step;
}
