export type PosStation = {
  id: string;
  tenant_id: string;
  station_type: "sale" | "purchase";
  name: string;
  pattern_id: string | null;
  warehouse_id: string | null;
  lock_warehouse: boolean;
  cash_account_id: string | null;
  default_partner_id: string | null;
  price_level: string | null;
  allowed_user_ids: string[];
  allow_expenses: boolean;
  expense_account_ids: string[];
  max_expense: number;
  is_active: boolean;
  partner_ids?: string[];
  partner_group_ids?: string[];
  lock_partner?: boolean;
  cash_account_ids?: string[];
  lock_price_level?: boolean;
};

/** Stations of this type the user may open (empty user list = everyone; admins see all). */
export function stationsForUser(all: PosStation[], type: "sale" | "purchase", userId: string | undefined, isAdmin: boolean): PosStation[] {
  return all.filter((s) => s.is_active && s.station_type === type && (isAdmin || !s.allowed_user_ids?.length || (!!userId && s.allowed_user_ids.includes(userId))));
}

/** Validates a drawer expense against station rules; returns an Arabic error or null. */
export function expenseError(s: PosStation, amount: number, accountId: string): string | null {
  if (!s.allow_expenses) return "هذه النقطة لا تسمح بصرف مصاريف من الدرج";
  if (!(amount > 0)) return "أدخل مبلغاً صحيحاً";
  if (!accountId) return "اختر حساب المصروف";
  if (s.expense_account_ids?.length && !s.expense_account_ids.includes(accountId)) return "حساب المصروف غير مسموح في هذه النقطة";
  if (Number(s.max_expense) > 0 && amount > Number(s.max_expense)) return `المبلغ يتجاوز الحد الأقصى للمصروف (${s.max_expense})`;
  return null;
}

/** Product price for the station: named level first, then sale price. */
export function stationPrice(p: { sale_price: number; last_purchase_price: number; prices?: Record<string, number> | null }, level: string | null): number {
  const named = level ? Number(p.prices?.[level]) : 0;
  return named > 0 ? named : Number(p.sale_price) || Number(p.prices?.["1"]) || Number(p.last_purchase_price) || 0;
}

/** Partners visible at the station: explicit ids or group subtrees; empty scope = all. */
export function stationPartners<T extends { id: string; parent_id?: string | null }>(s: Pick<PosStation, "partner_ids" | "partner_group_ids" | "default_partner_id"> | undefined, all: T[], allRaw: T[] = all): T[] {
  const ids = s?.partner_ids ?? [], groups = s?.partner_group_ids ?? [];
  if (!ids.length && !groups.length) return all;
  const byId = new Map(allRaw.map((x) => [x.id, x]));
  const inGroup = (x: T) => { let p = x.parent_id, n = 0; while (p && n++ < 50) { if (groups.includes(p)) return true; p = byId.get(p)?.parent_id ?? null; } return false; };
  return all.filter((x) => ids.includes(x.id) || inGroup(x) || x.id === s?.default_partner_id);
}
