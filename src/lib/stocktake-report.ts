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

export type CostMove = { product_id: string; direction: string; qty: number | string; unit_cost: number | string | null; move_date?: string | null; created_at?: string | null };
/** Moving weighted-average cost per product, replayed only from the stock moves that still exist (deleted invoices no longer affect it). */
export function costFromMoves(moves: CostMove[]): Record<string, number> {
  const sorted = [...moves].sort((a, b) => String(a.move_date ?? "").localeCompare(String(b.move_date ?? "")) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const st: Record<string, { q: number; c: number }> = {};
  for (const m of sorted) {
    const s = (st[m.product_id] ??= { q: 0, c: 0 });
    const q = Number(m.qty) || 0;
    if (m.direction === "in") {
      const u = Number(m.unit_cost) || 0;
      const base = Math.max(s.q, 0);
      s.c = base + q > 0 ? (base * s.c + q * u) / (base + q) : u;
      s.q += q;
    } else s.q -= q;
  }
  return Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Math.round(v.c * 10000) / 10000]));
}
