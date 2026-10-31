import { describe, expect, it } from "vitest";
import { buildRows, inCategories, totals } from "./stocktake-report";

const P = [
  { id: "g1", parent_id: null, is_group: true, avg_cost: 0 },
  { id: "g2", parent_id: "g1", is_group: true, avg_cost: 0 },
  { id: "a", parent_id: "g2", is_group: false, avg_cost: 10 },
  { id: "b", parent_id: null, is_group: false, avg_cost: 5 },
];

describe("stocktake report", () => {
  it("filters by nested category", () => expect(inCategories(P, ["g1"]).map((p) => p.id)).toEqual(["a"]));
  it("all categories when none selected", () => expect(inCategories(P, []).map((p) => p.id)).toEqual(["a", "b"]));
  it("sums book quantity per warehouse", () => {
    const r = buildRows(inCategories(P, []), ["w1", "w2"], { "w1|a": 3, "w2|a": 2 });
    expect(r[0]!.bookQty).toBe(5); expect(r[0]!.bookValue).toBe(50);
  });
  it("hides zero items", () => expect(buildRows(inCategories(P, []), ["w1"], { "w1|a": 3 }, {}, false, true).map((r) => r.id)).toEqual(["a"]));
  it("computes actual difference and totals", () => {
    const r = buildRows(inCategories(P, []), ["w1"], { "w1|a": 3, "w1|b": 4 }, { a: "1" }, true);
    expect(r[0]!.diffQty).toBe(-2);
    expect(totals(r)).toEqual({ book: 50, actual: 30, diff: -20 });
  });
});
