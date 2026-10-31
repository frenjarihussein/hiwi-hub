import { describe, expect, it } from "vitest";
import { orderStats, revenueByCustomer, revenueByMonth, serviceStatement, summarizeServices, type SvcLine } from "./service-reports";

const L = (doc_type: string, qty: number, price: number, date: string, extra: Partial<SvcLine["doc"]> = {}, product_id = "s1"): SvcLine => ({
  product_id, qty, unit_price: price,
  doc: { id: `${doc_type}-${date}-${qty}`, doc_no: 1, doc_date: date, doc_type, status: "posted", exchange_rate: 1, partner_id: "c1", partner_name: "زبون", ...extra },
});
const svc = [{ id: "s1", name: "صيانة", standard_cost: 20 }];

describe("service reports", () => {
  it("sales minus returns give net revenue", () => {
    const r = summarizeServices([L("sale", 2, 100, "2026-01-05"), L("sale_return", 1, 100, "2026-01-06")], svc, "2026-01-01", "2026-12-31")[0]!;
    expect(r.revenue).toBe(100);
    expect(r.qty).toBe(1);
  });
  it("draft invoices are ignored", () => {
    const r = summarizeServices([L("sale", 2, 100, "2026-01-05", { status: "draft" })], svc, "2026-01-01", "2026-12-31")[0]!;
    expect(r.revenue).toBe(0);
  });
  it("lines outside the period are ignored", () => {
    const r = summarizeServices([L("sale", 2, 100, "2025-12-31")], svc, "2026-01-01", "2026-12-31")[0]!;
    expect(r.times).toBe(0);
  });
  it("foreign currency is divided by the exchange rate", () => {
    const r = summarizeServices([L("sale", 1, 15000, "2026-02-01", { exchange_rate: 15000 })], svc, "2026-01-01", "2026-12-31")[0]!;
    expect(r.revenue).toBe(1);
  });
  it("without purchases the cost is sold qty × standard cost", () => {
    const r = summarizeServices([L("sale", 3, 100, "2026-01-05")], svc, "2026-01-01", "2026-12-31")[0]!;
    expect(r.cost).toBe(60);
    expect(r.profit).toBe(240);
  });
  it("purchases of the service replace the standard cost", () => {
    const r = summarizeServices([L("sale", 3, 100, "2026-01-05"), L("purchase", 1, 50, "2026-01-04")], svc, "2026-01-01", "2026-12-31")[0]!;
    expect(r.cost).toBe(50);
  });
  it("line discount reduces the value", () => {
    const r = summarizeServices([{ ...L("sale", 1, 100, "2026-01-05"), line_discount: 10 }], svc, "2026-01-01", "2026-12-31")[0]!;
    expect(r.revenue).toBe(90);
  });
  it("customers are ranked by net revenue", () => {
    const rows = revenueByCustomer([L("sale", 1, 50, "2026-01-05", { partner_id: "a", partner_name: "أ" }), L("sale", 1, 80, "2026-01-05", { partner_id: "b", partner_name: "ب" })], "2026-01-01", "2026-12-31");
    expect(rows.map((r) => r.partner_id)).toEqual(["b", "a"]);
  });
  it("months are grouped by YYYY-MM", () => {
    const rows = revenueByMonth([L("sale", 1, 50, "2026-01-05"), L("sale", 1, 30, "2026-01-20"), L("sale", 1, 10, "2026-02-01")], "2026-01-01", "2026-12-31");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.revenue).toBe(80);
  });
  it("statement keeps a running net in date order", () => {
    const rows = serviceStatement([L("sale", 1, 100, "2026-03-01"), L("purchase", 1, 30, "2026-02-01")], "s1", "2026-01-01", "2026-12-31");
    expect(rows.map((r) => r.runningNet)).toEqual([-30, 70]);
  });
  it("late orders are open orders past their response time", () => {
    const s = orderStats([{ created_at: "2026-03-01", status: "pending", sla_due_at: "2026-03-02" }, { created_at: "2026-03-01", status: "done", sla_due_at: "2026-03-02", completed_at: "2026-03-01" }], "2026-01-01", "2026-12-31", new Date("2026-04-01"));
    expect(s.late).toBe(1);
    expect(s.onTimeRate).toBe(100);
  });
});
