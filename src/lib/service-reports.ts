/* Pure calculations behind the service statement and service reports.
   Only posted documents count; amounts are converted to the base currency
   by dividing by the document exchange rate (same rule as the other reports). */

export type SvcLine = {
  product_id: string;
  qty: number | string;
  unit_price: number | string;
  line_discount?: number | string | null;
  line_addition?: number | string | null;
  doc: {
    id: string;
    doc_no?: string | number | null;
    doc_date: string;
    doc_type: string;
    status: string;
    exchange_rate?: number | string | null;
    partner_id?: string | null;
    partner_name?: string | null;
  };
};

export type SvcInfo = { id: string; name: string; sku?: string | null; unit?: string | null; standard_cost?: number | string | null; service_source?: string | null };

const SALES = new Set(["sale", "pos_sale"]);
export const SERVICE_DOC_LABELS: Record<string, string> = {
  sale: "فاتورة بيع", pos_sale: "بيع نقطة بيع", sale_return: "مرتجع بيع", purchase: "فاتورة شراء", purchase_return: "مرتجع شراء",
};

/** Net line value in the base currency (qty × price − discount + addition, ÷ rate). */
export function baseValue(l: SvcLine): number {
  const v = Number(l.qty) * Number(l.unit_price) - Number(l.line_discount || 0) + Number(l.line_addition || 0);
  return v / (Number(l.doc.exchange_rate) || 1);
}

/** Effect of one line: signed revenue/cost and signed quantity sold. */
export function lineEffect(l: SvcLine): { revenue: number; cost: number; qty: number; kind: "sale" | "return" | "purchase" | "purchase_return" | null } {
  const v = baseValue(l), q = Number(l.qty) || 0, t = l.doc.doc_type;
  if (SALES.has(t)) return { revenue: v, cost: 0, qty: q, kind: "sale" };
  if (t === "sale_return") return { revenue: -v, cost: 0, qty: -q, kind: "return" };
  if (t === "purchase") return { revenue: 0, cost: v, qty: 0, kind: "purchase" };
  if (t === "purchase_return") return { revenue: 0, cost: -v, qty: 0, kind: "purchase_return" };
  return { revenue: 0, cost: 0, qty: 0, kind: null };
}

export function inPeriod(l: SvcLine, from: string, to: string): boolean {
  return l.doc.status === "posted" && l.doc.doc_date >= from && l.doc.doc_date <= to && lineEffect(l).kind !== null;
}

export type SvcSummary = {
  id: string; name: string; sku: string; unit: string;
  times: number; qty: number; sales: number; returns: number; revenue: number;
  cost: number; profit: number; margin: number; customers: number; avgPrice: number; lastDate: string;
};

/** One row per service. Cost = purchases of the service, else sold qty × standard cost. */
export function summarizeServices(lines: SvcLine[], services: SvcInfo[], from: string, to: string): SvcSummary[] {
  const acc = new Map<string, { times: number; qty: number; sales: number; returns: number; buy: number; customers: Set<string>; last: string }>();
  for (const s of services) acc.set(s.id, { times: 0, qty: 0, sales: 0, returns: 0, buy: 0, customers: new Set(), last: "" });
  for (const l of lines) {
    const a = acc.get(l.product_id);
    if (!a || !inPeriod(l, from, to)) continue;
    const e = lineEffect(l);
    a.qty += e.qty;
    if (e.kind === "sale") { a.times += 1; a.sales += e.revenue; if (l.doc.partner_id) a.customers.add(l.doc.partner_id); }
    else if (e.kind === "return") a.returns += -e.revenue;
    else a.buy += e.cost;
    if (l.doc.doc_date > a.last) a.last = l.doc.doc_date;
  }
  return services.map((s) => {
    const a = acc.get(s.id)!;
    const revenue = a.sales - a.returns;
    const cost = a.buy || a.qty * (Number(s.standard_cost) || 0);
    const profit = revenue - cost;
    return {
      id: s.id, name: s.name, sku: s.sku ?? "", unit: s.unit ?? "",
      times: a.times, qty: a.qty, sales: a.sales, returns: a.returns, revenue, cost, profit,
      margin: revenue ? (profit / revenue) * 100 : 0, customers: a.customers.size,
      avgPrice: a.qty ? revenue / a.qty : 0, lastDate: a.last,
    };
  });
}

export type CustomerRow = { partner_id: string; name: string; invoices: number; services: number; revenue: number };

/** Net service revenue per customer in the period, largest first. */
export function revenueByCustomer(lines: SvcLine[], from: string, to: string): CustomerRow[] {
  const m = new Map<string, { name: string; docs: Set<string>; svcs: Set<string>; revenue: number }>();
  for (const l of lines) {
    if (!inPeriod(l, from, to)) continue;
    const e = lineEffect(l);
    if (e.kind !== "sale" && e.kind !== "return") continue;
    const k = l.doc.partner_id ?? "";
    const r = m.get(k) ?? { name: l.doc.partner_name ?? "بدون زبون", docs: new Set(), svcs: new Set(), revenue: 0 };
    if (e.kind === "sale") { r.docs.add(l.doc.id); r.svcs.add(l.product_id); }
    r.revenue += e.revenue;
    m.set(k, r);
  }
  return [...m.entries()].map(([k, r]) => ({ partner_id: k, name: r.name, invoices: r.docs.size, services: r.svcs.size, revenue: r.revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type MonthRow = { month: string; sales: number; returns: number; revenue: number; cost: number };

/** Monthly service sales/returns/purchases (YYYY-MM), oldest first. */
export function revenueByMonth(lines: SvcLine[], from: string, to: string): MonthRow[] {
  const m = new Map<string, MonthRow>();
  for (const l of lines) {
    if (!inPeriod(l, from, to)) continue;
    const e = lineEffect(l), k = l.doc.doc_date.slice(0, 7);
    const r = m.get(k) ?? { month: k, sales: 0, returns: 0, revenue: 0, cost: 0 };
    if (e.kind === "sale") r.sales += e.revenue;
    if (e.kind === "return") r.returns += -e.revenue;
    r.revenue += e.revenue;
    r.cost += e.cost;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type StatementRow = { date: string; docNo: string; type: string; partner: string; qty: number; price: number; revenue: number; cost: number; runningQty: number; runningNet: number };

/** Chronological statement of one service with running sold quantity and running net (revenue − purchases). */
export function serviceStatement(lines: SvcLine[], productId: string, from: string, to: string): StatementRow[] {
  let q = 0, net = 0;
  return lines
    .filter((l) => l.product_id === productId && inPeriod(l, from, to))
    .sort((a, b) => a.doc.doc_date.localeCompare(b.doc.doc_date) || String(a.doc.doc_no ?? "").localeCompare(String(b.doc.doc_no ?? ""), undefined, { numeric: true }))
    .map((l) => {
      const e = lineEffect(l);
      q += e.qty;
      net += e.revenue - e.cost;
      return {
        date: l.doc.doc_date, docNo: String(l.doc.doc_no ?? "—"), type: SERVICE_DOC_LABELS[l.doc.doc_type] ?? l.doc.doc_type,
        partner: l.doc.partner_name ?? "—", qty: Number(l.qty) || 0, price: Number(l.unit_price) || 0,
        revenue: e.revenue, cost: e.cost, runningQty: q, runningNet: net,
      };
    });
}

export type OrderStats = { total: number; open: number; done: number; late: number; onTimeRate: number; avgHours: number };

/** Service order performance in the period (by created_at): open/done/late, on-time completion and average actual hours. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function orderStats(orders: any[], from: string, to: string, now = new Date()): OrderStats {
  const rows = orders.filter((o) => { const d = String(o.created_at ?? "").slice(0, 10); return d >= from && d <= to; });
  const done = rows.filter((o) => o.status === "done");
  const late = rows.filter((o) => o.status !== "done" && o.sla_due_at && new Date(o.sla_due_at) < now).length;
  const timed = done.filter((o) => o.sla_due_at && o.completed_at);
  const onTime = timed.filter((o) => new Date(o.completed_at) <= new Date(o.sla_due_at)).length;
  const hrs = done.filter((o) => Number(o.actual_hours) > 0);
  return {
    total: rows.length, open: rows.length - done.length, done: done.length, late,
    onTimeRate: timed.length ? (onTime / timed.length) * 100 : 0,
    avgHours: hrs.length ? hrs.reduce((s, o) => s + Number(o.actual_hours), 0) / hrs.length : 0,
  };
}
