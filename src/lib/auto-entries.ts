import { db } from "@/lib/db";
import { postEntry, type EntryLine } from "@/lib/post-entry";

export type LinkKey =
  | "inventory_account_id" | "stock_shortage_account_id" | "stock_surplus_account_id"
  | "notes_receivable_account_id" | "notes_payable_account_id"
  | "dep_expense_account_id" | "accum_dep_account_id";

export async function linkedAccounts(tenantId: string): Promise<Partial<Record<LinkKey, string | null>>> {
  const { data } = await db.from("tenant_settings")
    .select("inventory_account_id,stock_shortage_account_id,stock_surplus_account_id,notes_receivable_account_id,notes_payable_account_id,dep_expense_account_id,accum_dep_account_id")
    .eq("tenant_id", tenantId).maybeSingle();
  return data ?? {};
}

/** Latest stored rate for a currency (1 for the base currency). */
export async function rateFor(cur: string, base: string | null | undefined): Promise<number> {
  if (!cur || cur === base) return 1;
  const { data } = await db.from("exchange_rates").select("rate_to_usd").eq("currency", cur).order("rate_date", { ascending: false }).limit(1);
  return Number(data?.[0]?.rate_to_usd) || 1;
}

/** Straight-line depreciation due from the last posting (or purchase) date up to `upTo`, capped at the depreciable base. */
export function depreciationDue(a: { cost: number; salvage_value: number; useful_life_years: number; purchase_date: string; last_dep_date?: string | null }, upTo: string): number {
  const cost = Number(a.cost) || 0, salvage = Number(a.salvage_value) || 0, life = Number(a.useful_life_years) || 1;
  const annual = (cost - salvage) / life;
  const days = (d1: string, d2: string) => Math.max(0, (new Date(d2).getTime() - new Date(d1).getTime()) / 86400000);
  const done = Math.min(cost - salvage, annual * days(a.purchase_date, a.last_dep_date ?? a.purchase_date) / 365.25);
  const total = Math.min(cost - salvage, annual * days(a.purchase_date, upTo) / 365.25);
  return Math.max(0, Math.round((total - done) * 100) / 100);
}

/** Debit/credit pair for a cheque status, or null when nothing should be posted. */
export function chequeLines(
  c: { direction: string; status: string; amount: number },
  acc: { notes: string; partner: string; bank: string | null },
): { debit: string; credit: string } | null {
  const inc = c.direction === "incoming";
  if (c.status === "pending") return inc ? { debit: acc.notes, credit: acc.partner } : { debit: acc.partner, credit: acc.notes };
  if (c.status === "collected") { if (!acc.bank) return null; return inc ? { debit: acc.bank, credit: acc.notes } : { debit: acc.notes, credit: acc.bank }; }
  if (c.status === "returned" || c.status === "cancelled") return inc ? { debit: acc.partner, credit: acc.notes } : { debit: acc.notes, credit: acc.partner };
  return null;
}

export async function post2(tenantId: string, userId: string | undefined, date: string, desc: string, currency: string, rate: number, debit: string, credit: string, amount: number, partnerId?: string | null) {
  const lines: EntryLine[] = [
    { account_id: debit, debit: amount, credit: 0, description: desc, partner_id: partnerId ?? null },
    { account_id: credit, debit: 0, credit: amount, description: desc, partner_id: partnerId ?? null },
  ];
  return postEntry(tenantId, userId, { entry_date: date, description: desc, currency, exchange_rate: rate }, lines);
}
