import { describe, expect, it } from "vitest";
import { balanceSheetSide, effectiveSide } from "./ledger-display";
import { fxDifference, fxRevalDue } from "./fx-reval";
import { fitWithin } from "./media-compress";

describe("balance sheet side", () => {
  it("capital marked credit stays with liabilities/equity even if nature says assets", () => {
    expect(balanceSheetSide("assets", -1000, "credit").side).toBe("credit");
  });
  it("debit-and-credit account follows its balance sign", () => {
    expect(balanceSheetSide("balance_sheet", 50, "both").side).toBe("debit");
    expect(balanceSheetSide("balance_sheet", -50, "both").side).toBe("credit");
  });
  it("leaf inherits the side of its parent group", () => {
    type A = { id: string; parent_id: string | null; balance_side: string | null };
    const parent: A = { id: "p", parent_id: null, balance_side: "credit" };
    const leaf: A = { id: "l", parent_id: "p", balance_side: null };
    expect(effectiveSide(leaf, new Map([["p", parent], ["l", leaf]]))).toBe("credit");
  });
});

describe("FX revaluation", () => {
  it("asset in foreign currency gains when the currency rises", () => {
    expect(fxDifference(100, 1.2, 100)).toBe(20);
  });
  it("liability (credit balance) loses when the currency rises", () => {
    expect(fxDifference(-100, 1.2, -100)).toBe(-20);
  });
  it("daily mode is due once per day, monthly once per month, on-demand never", () => {
    expect(fxRevalDue("auto", "2026-10-21", "2026-10-22")).toBe(true);
    expect(fxRevalDue("auto", "2026-10-22", "2026-10-22")).toBe(false);
    expect(fxRevalDue("scheduled", "2026-10-01", "2026-10-22")).toBe(false);
    expect(fxRevalDue("scheduled", "2026-09-30", "2026-10-01")).toBe(true);
    expect(fxRevalDue("on_demand", null, "2026-10-22")).toBe(false);
    expect(fxRevalDue("on_rate_change", null, "2026-10-22")).toBe(false);
  });
});

describe("photo shrinking", () => {
  it("limits the longest edge to 1600px without upscaling", () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
