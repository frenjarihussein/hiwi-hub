import { fmtNum } from "./format";
import { lineOriginal } from "./line-currency";

export function balanceLabel(value: number, symbol: string): string {
  return `${fmtNum(Math.abs(value))} ${symbol} ${Math.abs(value) < 0.005 ? "متعادل" : value > 0 ? "مدين" : "دائن"}`;
}

export function parenthesizedAmount(value: number): string {
  return value < -0.005 ? `(${fmtNum(Math.abs(value))})` : fmtNum(Math.abs(value));
}

export type BalanceSide = "debit" | "credit" | "both";
/** Explicit account side (or inherited from an ancestor) wins over the generic nature; "both" follows the sign. */
export function balanceSheetSide(nature: string, balance: number, side?: BalanceSide | null) {
  const creditNormal = side === "credit" ? true : side === "debit" ? false : side === "both" ? balance < 0 : ["liabilities", "equity", "revenues"].includes(nature);
  return { side: creditNormal ? "credit" as const : "debit" as const, amount: creditNormal ? -balance : balance };
}

export type LedgerLine = {
  debit: number; credit: number; line_currency?: string | null; fc_amount?: number | null;
  journal_entries?: { currency?: string | null; exchange_rate?: number | null } | null;
};
export function ledgerAmounts(line: LedgerLine, base: string, accountCurrency?: string, rates: Record<string, number> = {}) {
  const original = lineOriginal(line, line.journal_entries?.currency ?? base);
  const entryRate = Number(line.journal_entries?.exchange_rate) || 1;
  const debitBase = Number(line.debit) / entryRate;
  const creditBase = Number(line.credit) / entryRate;
  const target = accountCurrency || original.cur;
  const rate = target === base ? 1 : rates[target];
  const exact = target === original.cur;
  return {
    currency: original.cur, original: original.amount, debitBase, creditBase,
    debit: exact ? Math.max(original.amount, 0) : rate ? debitBase * rate : undefined,
    credit: exact ? Math.max(-original.amount, 0) : rate ? creditBase * rate : undefined,
  };
}

export function ledgerDescription(line: string | null | undefined, entry: string | null | undefined, fallback: boolean) {
  return line?.trim() || (fallback ? entry?.trim() : "") || "—";
}
export function effectiveSide<A extends { id: string; parent_id: string | null; balance_side?: string | null }>(acc: A | undefined, byId: Map<string, A>): BalanceSide | null {
  const seen = new Set<string>();
  let cur = acc;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.balance_side === "debit" || cur.balance_side === "credit" || cur.balance_side === "both") return cur.balance_side;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}
