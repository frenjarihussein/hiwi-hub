/** Pure helpers for the stocktake report: category filtering, per-warehouse quantities, zero filtering and value totals. */
export type StProduct = { id: string; parent_id: string | null; is_group: boolean; avg_cost: number };
export type StRow = { id: string; book: Record<string, number>; actual: Record<string, number | null>; bookQty: number; actualQty: number | null; cost: number; bookValue: number; actualValue: number | null; diffQty: number | null; diffValue: number | null };

/** Products under any selected category (by ancestor walk). Empty selection = all. */
export function inCategories(all: StProduct[], selected: string[]) {
  if (!selected.length) return all.filter((p) => !p.is_group);
  const byId = new Map(all.map((p) => [p.id, p]));
  const sel = new Set(selected);
  return all.filter((p) => {
    if (p.is_group) return false;
    let cur = p.parent_id;
    for (let i = 0; cur && i < 50; i++) { if (sel.has(cur)) return true; cur = byId.get(cur)?.parent_id ?? null; }
    return false;
  });
}

export function buildRows(products: StProduct[], warehouses: string[], bal: Record<string, number>, counts: Record<string, string> = {}, withActual = false, hideZero = false): StRow[] {
  const rows = products.map((p) => {
    const book: Record<string, number> = {};
    const actual: Record<string, number | null> = {};
    let bookQty = 0; let actualQty: number | null = null;
    for (const w of warehouses) {
      const b = bal[`${w}|${p.id}`] ?? 0; book[w] = b; bookQty += b;
      const c = withActual ? counts[p.id] : undefined;
      const a = c === undefined || c === "" ? null : Number(c);
      actual[w] = a; if (a !== null) actualQty = (actualQty ?? 0) + a;
    }
    const cost = Number(p.avg_cost) || 0;
    const diffQty = actualQty === null ? null : actualQty - bookQty;
    return { id: p.id, book, actual, bookQty, actualQty, cost, bookValue: bookQty * cost, actualValue: actualQty === null ? null : actualQty * cost, diffQty, diffValue: diffQty === null ? null : diffQty * cost };
  });
  return hideZero ? rows.filter((r) => Math.abs(r.bookQty) > 1e-9 || (r.actualQty !== null && Math.abs(r.actualQty) > 1e-9)) : rows;
}

export function totals(rows: StRow[]) {
  return rows.reduce((t, r) => ({ book: t.book + r.bookValue, actual: t.actual + (r.actualValue ?? r.bookValue), diff: t.diff + (r.diffValue ?? 0) }), { book: 0, actual: 0, diff: 0 });
}
