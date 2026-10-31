import { describe, it, expect } from "vitest";
import { estimatePosting, localBalances, localStock } from "./offline-posting";

const settings = { customers_account_id: "AR", suppliers_account_id: "AP", sales_account_id: "SALES", purchases_account_id: "PUR", cash_account_id: "CASH" };

describe("local offline posting", () => {
  it("credit sale debits the customer and credits sales, and takes stock out", () => {
    const r = estimatePosting({ doc_type: "sale", warehouse_id: "W" }, [{ product_id: "P", qty: 2, unit_price: 50 }], settings);
    expect(localBalances(r.lines).get("AR")!.balance).toBe(100);
    expect(localBalances(r.lines).get("SALES")!.balance).toBe(-100);
    expect(localStock(r.moves).get("P|W")).toBe(-2);
  });
  it("cash purchase credits the cash box and adds stock", () => {
    const r = estimatePosting({ doc_type: "purchase", payment_mode: "cash", warehouse_id: "W", amount: 300 }, [{ product_id: "P", qty: 3, unit_price: 100 }], settings);
    expect(localBalances(r.lines).get("CASH")!.balance).toBe(-300);
    expect(localBalances(r.lines).get("PUR")!.balance).toBe(300);
    expect(localStock(r.moves).get("P|W")).toBe(3);
  });
  it("receipt voucher debits cash and credits the partner", () => {
    const r = estimatePosting({ doc_type: "receipt", partner_account_id: "C1", amount: 70 }, [], settings);
    expect(localBalances(r.lines).get("CASH")!.balance).toBe(70);
    expect(localBalances(r.lines).get("C1")!.balance).toBe(-70);
  });
  it("warehouse transfer moves quantity between warehouses only", () => {
    const r = estimatePosting({ doc_type: "transfer", warehouse_id: "A", to_warehouse_id: "B" }, [{ product_id: "P", qty: 4 }], settings);
    expect(r.lines).toEqual([]);
    expect(localStock(r.moves).get("P|A")).toBe(-4);
    expect(localStock(r.moves).get("P|B")).toBe(4);
  });
  it("balances sum debit minus credit across lines", () => {
    const m = localBalances([{ account_id: "X", debit: 10, credit: 0 }, { account_id: "X", debit: 0, credit: 4 }]);
    expect(m.get("X")).toEqual({ debit: 10, credit: 4, balance: 6 });
  });
});
