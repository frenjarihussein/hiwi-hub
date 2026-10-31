import { describe, expect, it } from "vitest";
import { buildHier } from "./FinancialStatements";

const acc = (id: string, code: string, parent: string | null, is_group = true) =>
  [id, { id, code, name: id, nature: "assets", parent_id: parent, is_group, closing_account_id: null, closing_type: null }] as const;
const byId = new Map([acc("A", "1", null), acc("B", "11", "A"), acc("x", "1101", "B", false), acc("y", "1102", "B", false)]);
const items = [{ id: "x", code: "1101", name: "x", v: 100 }, { id: "y", code: "1102", name: "y", v: 50 }];

describe("buildHier aggregation levels", () => {
  it("level 1 shows leaf accounts only", () => {
    expect(buildHier(items, byId, 1).map((r) => r.kind)).toEqual(["leaf", "leaf"]);
  });
  it("level 2 adds the direct parent with a subtotal", () => {
    const rows = buildHier(items, byId, 2);
    expect(rows.find((r) => r.kind === "sub" && r.id === "B")?.v).toBe(150);
    expect(rows.some((r) => r.id === "A")).toBe(false);
  });
  it("all levels reach the top parent", () => {
    expect(buildHier(items, byId, 0).find((r) => r.kind === "sub" && r.id === "A")?.v).toBe(150);
  });
});
