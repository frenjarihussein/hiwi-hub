import { describe, expect, it } from "vitest";
import { missingLineWarehouse, MULTI_WAREHOUSE, resolvedWarehouse, warehouseMode } from "./document-warehouses";
describe("per-line warehouses", () => {
  it("preserves overrides when a document also has a header warehouse", () => {
    expect(warehouseMode("main", [{ warehouse_id: "branch" }])).toBe(MULTI_WAREHOUSE);
    expect(resolvedWarehouse("main", { warehouse_id: "branch" })).toBe("branch");
  });
  it("uses the header only when the line has no warehouse", () => {
    expect(resolvedWarehouse("main", {})).toBe("main");
    expect(resolvedWarehouse(MULTI_WAREHOUSE, {})).toBeNull();
  });
  it("requires a warehouse for each positive product line in multi mode", () => {
    expect(missingLineWarehouse(MULTI_WAREHOUSE, [{ product_id: "p", qty: "1" }])).toBe(true);
    expect(missingLineWarehouse(MULTI_WAREHOUSE, [{ product_id: "p", qty: "1", wh: "branch" }])).toBe(false);
  });
});