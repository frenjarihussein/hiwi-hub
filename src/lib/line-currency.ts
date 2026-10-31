/** Original-currency amount of a journal line: line currency (fc_amount) wins over the entry currency. Signed debit-positive. */
export function lineOriginal(l: { debit: number; credit: number; line_currency?: string | null; fc_amount?: number | null }, entryCurrency: string | null | undefined): { cur: string; amount: number } {
  const net = Number(l.debit) - Number(l.credit);
  const fc = Math.abs(Number(l.fc_amount) || 0);
  if (l.line_currency && fc) return { cur: l.line_currency, amount: net >= 0 ? fc : -fc };
  return { cur: String(entryCurrency ?? ""), amount: net };
}
