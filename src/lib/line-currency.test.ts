import { describe, expect, it } from "vitest";
import { lineOriginal } from "./line-currency";

describe("lineOriginal", () => {
  it("uses the line foreign amount for a debit line", () => {
    expect(lineOriginal({ debit: 100, credit: 0, line_currency: "EUR", fc_amount: 90 }, "USD")).toEqual({ cur: "EUR", amount: 90 });
  });
  it("makes the foreign amount negative for a credit line", () => {
    expect(lineOriginal({ debit: 0, credit: 100, line_currency: "TRY", fc_amount: 3400 }, "USD")).toEqual({ cur: "TRY", amount: -3400 });
  });
  it("falls back to the entry currency", () => {
    expect(lineOriginal({ debit: 0, credit: 50 }, "SYP")).toEqual({ cur: "SYP", amount: -50 });
  });
});
