import { describe, it, expect } from "vitest";
import { sheetTotals } from "./CashSheet";
describe("cash sheet totals", () => {
  it("receipts add, payments subtract from opening", () => {
    expect(sheetTotals(100, [{ dir: "in", amount: "50" }, { dir: "out", amount: "30" }, { dir: "in", amount: "" }])).toEqual({ inn: 50, out: 30, net: 20, closing: 120 });
  });
});
