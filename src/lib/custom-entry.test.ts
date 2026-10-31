import { describe, expect, it } from "vitest";
import { buildCustomEntry } from "./custom-entry";

describe("buildCustomEntry", () => {
  it("splits the amount by percentages and stays balanced", () => {
    const l = buildCustomEntry([{ account_id: "a", side: "debit", pct: 60 }, { account_id: "b", side: "debit", pct: 40 }, { account_id: "c", side: "credit", pct: 100 }], 1000);
    expect(l.map((x) => x.debit)).toEqual([600, 400, 0]);
    expect(l[2]!.credit).toBe(1000);
  });
  it("rejects unbalanced templates", () => {
    expect(() => buildCustomEntry([{ account_id: "a", side: "debit", pct: 50 }, { account_id: "c", side: "credit", pct: 100 }], 100)).toThrow();
  });
});
