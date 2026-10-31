import { describe, expect, it } from "vitest";
import { expenseError, stationPrice, stationsForUser, type PosStation } from "./pos-stations";

const st = (o: Partial<PosStation>): PosStation => ({ id: "s", tenant_id: "t", station_type: "sale", name: "x", pattern_id: null, warehouse_id: null, lock_warehouse: true, cash_account_id: null, default_partner_id: null, price_level: null, allowed_user_ids: [], allow_expenses: true, expense_account_ids: [], max_expense: 0, is_active: true, ...o });

describe("pos stations", () => {
  it("several users can share one station; others cannot open it", () => {
    const s = st({ allowed_user_ids: ["a", "b"] });
    expect(stationsForUser([s], "sale", "a", false)).toHaveLength(1);
    expect(stationsForUser([s], "sale", "b", false)).toHaveLength(1);
    expect(stationsForUser([s], "sale", "c", false)).toHaveLength(0);
    expect(stationsForUser([s], "purchase", "a", false)).toHaveLength(0);
  });
  it("drawer expense respects the max limit and allowed accounts", () => {
    const s = st({ max_expense: 5000, expense_account_ids: ["e1"] });
    expect(expenseError(s, 6000, "e1")).toMatch("الحد الأقصى");
    expect(expenseError(s, 1000, "e2")).toMatch("غير مسموح");
    expect(expenseError(s, 5000, "e1")).toBeNull();
    expect(expenseError(st({ allow_expenses: false }), 10, "e1")).toMatch("لا تسمح");
  });
  it("station price level overrides sale price", () => {
    expect(stationPrice({ sale_price: 10, last_purchase_price: 5, prices: { جملة: 8 } }, "جملة")).toBe(8);
    expect(stationPrice({ sale_price: 10, last_purchase_price: 5 }, null)).toBe(10);
  });
});
