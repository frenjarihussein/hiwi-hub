import { describe, expect, it } from "vitest";
import { accountNature, inventoryPosting, leafOnlyField } from "./directory-rules";

describe("directory rules", () => {
  it("currency, cash-flow and monetary status belong only to leaf accounts", () => {
    for (const key of ["currency", "cash_flow_type", "is_monetary"]) expect(leafOnlyField("accounts", key)).toBe(true);
    expect(leafOnlyField("accounts", "name")).toBe(false);
  });
  it("product groups have no currency, unit or prices", () => {
    for (const key of ["currency", "unit", "initial_quantity", "purchase_price", "sale_price", "prices.1"]) expect(leafOnlyField("products", key)).toBe(true);
  });
  it("partner groups have no dealing currency", () => expect(leafOnlyField("partners", "currency")).toBe(true));
  it("closing toggle preserves existing non-closing classification", () => {
    expect(accountNature(true, "expenses")).toBe("closing");
    expect(accountNature(false, "expenses")).toBe("expenses");
    expect(accountNature(false, "closing")).toBe("assets");
  });
  it("periodic inventory posts purchases without sale cost entries", () => expect(inventoryPosting("periodic")).toEqual({ postSaleCost: false, purchaseAccount: "purchases_account_id" }));
  it("perpetual inventory posts sale cost and purchases to inventory", () => expect(inventoryPosting("perpetual")).toEqual({ postSaleCost: true, purchaseAccount: "inventory_account_id" }));
});