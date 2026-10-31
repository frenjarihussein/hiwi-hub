import { describe, expect, it } from "vitest";
import { summarizeClosing } from "./year-end";

describe("year-end closing summary", () => {
  it("nets revenues against expenses into profit", () => {
    const s = summarizeClosing([
      { account_id: "1", code: "4", name: "sales", kind: "pl", balance: -1000 },
      { account_id: "2", code: "5", name: "rent", kind: "pl", balance: 300 },
      { account_id: "3", code: "1", name: "cash", kind: "bs", balance: 700 },
    ]);
    expect(s).toEqual({ revenue: 1000, expense: 300, net: 700, plCount: 2, bsCount: 1 });
  });
  it("reports a loss as negative net", () => {
    expect(summarizeClosing([{ account_id: "2", code: "5", name: "rent", kind: "pl", balance: 500 }]).net).toBe(-500);
  });
});
