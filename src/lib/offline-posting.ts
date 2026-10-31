/**
 * Local ESTIMATE of what server posting (post_document) will produce, used only for offline reports
 * on the bound single device. The server's post_document stays authoritative when the queue uploads.
 */
type Row = Record<string, unknown>;
export type EstLine = { account_id: string; debit: number; credit: number; partner_id?: string | null; description: string };
export type EstMove = { product_id: string; warehouse_id: string; direction: "in" | "out"; qty: number; unit_cost: number };

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const id = (v: unknown) => (typeof v === "string" && v ? v : null);

export function docTotal(doc: Row, lines: Row[]): number {
  const amount = n(doc["amount"]);
  if (amount > 0) return amount;
  const sum = lines.reduce((s, l) => s + n(l["qty"]) * n(l["unit_price"]) - n(l["line_discount"]) + n(l["line_addition"]), 0);
  return Math.max(0, sum - n(doc["discount_amount"]) + n(doc["freight_amount"]));
}

export function estimatePosting(doc: Row, lines: Row[], settings: Row): { lines: EstLine[]; moves: EstMove[] } {
  const t = String(doc["doc_type"] ?? "");
  const total = docTotal(doc, lines);
  const override = (settings["doc_type_accounts"] as Row | null)?.[t];
  const cash = id(doc["cash_account_id"]) ?? id(settings["cash_account_id"]);
  const cashMode = doc["payment_mode"] === "cash";
  const customer = cashMode ? cash : id(doc["partner_account_id"]) ?? id(settings["customers_account_id"]);
  const supplier = cashMode ? cash : id(doc["partner_account_id"]) ?? id(settings["suppliers_account_id"]);
  const sales = id(override) ?? id(settings["sales_account_id"]);
  const purchases = id(override) ?? id(settings["purchases_account_id"]) ?? id(settings["inventory_account_id"]);
  const partner = id(doc["partner_id"]);
  const desc = `تقدير محلي: ${t} ${doc["doc_no"] ?? ""}`.trim();
  const pair = (dr: string | null, cr: string | null): EstLine[] =>
    !dr || !cr || total <= 0 ? [] : [
      { account_id: dr, debit: total, credit: 0, partner_id: partner, description: desc },
      { account_id: cr, debit: 0, credit: total, partner_id: partner, description: desc },
    ];
  const journal =
    t === "sale" ? pair(customer, sales) :
    t === "sale_return" ? pair(sales, customer) :
    t === "purchase" ? pair(purchases, supplier) :
    t === "purchase_return" ? pair(supplier, purchases) :
    t === "receipt" ? pair(cash, id(doc["partner_account_id"]) ?? id(doc["account_id"]) ?? id(settings["customers_account_id"])) :
    t === "payment" ? pair(id(doc["partner_account_id"]) ?? id(doc["account_id"]) ?? id(settings["suppliers_account_id"]), cash) : [];

  const dirIn = ["purchase", "sale_return", "stock_in", "opening_inventory"].includes(t);
  const dirOut = ["sale", "purchase_return", "stock_out"].includes(t);
  const moves: EstMove[] = [];
  for (const l of lines) {
    const p = id(l["product_id"]), qty = n(l["qty"]);
    if (!p || qty <= 0) continue;
    const wh = id(l["warehouse_id"]) ?? id(doc["warehouse_id"]);
    const cost = n(l["unit_price"]);
    if (t === "transfer") {
      const to = id(doc["to_warehouse_id"]);
      if (wh && to) moves.push({ product_id: p, warehouse_id: wh, direction: "out", qty, unit_cost: cost }, { product_id: p, warehouse_id: to, direction: "in", qty, unit_cost: cost });
    } else if (wh && (dirIn || dirOut)) moves.push({ product_id: p, warehouse_id: wh, direction: dirIn ? "in" : "out", qty, unit_cost: cost });
  }
  return { lines: journal, moves };
}

/** Per-account debit/credit totals and net balance (debit − credit). */
export function localBalances(lines: { account_id: unknown; debit: unknown; credit: unknown }[]) {
  const m = new Map<string, { debit: number; credit: number; balance: number }>();
  for (const l of lines) {
    const k = String(l.account_id ?? "");
    if (!k) continue;
    const cur = m.get(k) ?? { debit: 0, credit: 0, balance: 0 };
    cur.debit += n(l.debit); cur.credit += n(l.credit); cur.balance = cur.debit - cur.credit;
    m.set(k, cur);
  }
  return m;
}

/** Quantity on hand per product/warehouse from stock moves. */
export function localStock(moves: { product_id: unknown; warehouse_id: unknown; direction: unknown; qty: unknown }[]) {
  const m = new Map<string, number>();
  for (const x of moves) {
    const k = `${x.product_id}|${x.warehouse_id}`;
    m.set(k, (m.get(k) ?? 0) + (x.direction === "out" ? -n(x.qty) : n(x.qty)));
  }
  return m;
}
