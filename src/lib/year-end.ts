export type PreviewRow = { account_id: string; code: string; name: string; kind: "pl" | "bs"; balance: number };

/** Summarises the year-end preview: balance = debit − credit, so revenues are negative and expenses positive. */
export function summarizeClosing(rows: PreviewRow[]) {
  let revenue = 0, expense = 0, plCount = 0, bsCount = 0;
  for (const r of rows) {
    const b = Number(r.balance) || 0;
    if (r.kind === "pl") { plCount++; if (b < 0) revenue += -b; else expense += b; }
    else bsCount++;
  }
  return { revenue, expense, net: revenue - expense, plCount, bsCount };
}
