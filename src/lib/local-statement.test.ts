import { describe, expect, it } from "vitest";
import { localStatementRows } from "./local-statement";
import type { PosSale } from "./pos-offline";

const sale: PosSale = { id: "invoice", voucherId: "voucher", localNo: "PC-1-1", currency: "USD", tenantId: "tenant", userId: "user", mode: "sale", date: "2026-10-21", partnerId: "customer", warehouseId: "wh", total: 100, paid: false, lines: [] };
describe("local statement estimates", () => {
  it("immediately adds a credit sale to the selected customer only", () => {
    expect(localStatementRows([sale], "customer", "USD", new Set())[0]).toMatchObject({ debit: 100, credit: 0, baseAmount: 100 });
    expect(localStatementRows([sale], "other", "USD", new Set())).toEqual([]);
  });
  it.each([["purchase", -100], ["sale_return", -100], ["purchase_return", 100]] as const)("signs %s correctly", (mode, amount) => {
    expect(localStatementRows([{ ...sale, mode }], "customer", "USD", new Set())[0]?.baseAmount).toBe(amount);
  });
  it("cash payment offsets the invoice instead of increasing debt", () => {
    const rows = localStatementRows([{ ...sale, paid: true }], "customer", "USD", new Set());
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + row.baseAmount, 0)).toBe(0);
  });
  it("shows foreign settlement with its base equivalent, not tendered cash", () => {
    const rows = localStatementRows([{ ...sale, paid: true, payCurrency: "SYP", payRate: 10000, payTendered: 1100000 }], "customer", "USD", new Set());
    expect(rows[1]).toMatchObject({ currency: "SYP", credit: 1000000, baseAmount: -100 });
  });
  it("reconciles a partially posted invoice separately from settlement", () => {
    const paid = { ...sale, paid: true };
    expect(localStatementRows([paid], "customer", "USD", new Set([sale.id])).map((row) => row.id)).toEqual([sale.voucherId]);
    expect(localStatementRows([paid], "customer", "USD", new Set([sale.id, sale.voucherId]))).toEqual([]);
  });
});