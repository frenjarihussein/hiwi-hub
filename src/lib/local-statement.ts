import type { PosSale } from "./pos-offline";

export type LocalStatementRow = {
  id: string; invoiceId: string; number: string; date: string; kind: PosSale["mode"] | "receipt" | "payment";
  currency: string; debit: number; credit: number; baseAmount: number;
};

/** Estimates only; a posted invoice and its settlement are reconciled separately. */
export function localStatementRows(sales: PosSale[], partnerId: string, base: string, postedDocumentIds: ReadonlySet<string>): LocalStatementRow[] {
  const rows: LocalStatementRow[] = [];
  for (const sale of sales) {
    if (sale.partnerId !== partnerId || !Number.isFinite(sale.total) || sale.total < 0) continue;
    const sign = sale.mode === "sale" || sale.mode === "purchase_return" ? 1 : -1;
    const currency = sale.currency || base;
    const number = sale.localNo || sale.id;
    if (!postedDocumentIds.has(sale.id)) rows.push({ id: sale.id, invoiceId: sale.id, number, date: sale.date, kind: sale.mode, currency, debit: sign > 0 ? sale.total : 0, credit: sign < 0 ? sale.total : 0, baseAmount: sign * sale.total });
    if (sale.paid && !postedDocumentIds.has(sale.voucherId)) {
      const foreign = sale.payCurrency && sale.payCurrency !== currency;
      const rate = foreign ? sale.payRate : 1;
      if (!rate || !Number.isFinite(rate) || rate <= 0) continue;
      const amount = foreign ? Math.round(sale.total * rate * 100) / 100 : sale.total;
      rows.push({ id: sale.voucherId, invoiceId: sale.id, number, date: sale.date, kind: sign > 0 ? "receipt" : "payment", currency: sale.payCurrency || currency, debit: sign < 0 ? amount : 0, credit: sign > 0 ? amount : 0, baseAmount: -sign * amount / rate });
    }
  }
  return rows;
}