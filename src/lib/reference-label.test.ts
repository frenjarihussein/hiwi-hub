import { describe, expect, it } from "vitest";
import { referenceCodeField, referenceLabel } from "./reference-label";

describe("coded entity references", () => {
  it("uses account codes in account choices", () => {
    expect(referenceLabel({ code: "1201001" }, "الزبون", referenceCodeField("accounts"))).toBe("1201001 - الزبون");
  });
  it("uses warehouse codes in parent choices", () => {
    expect(referenceLabel({ code: "0101" }, "المستودع الأب", referenceCodeField("warehouses"))).toBe("0101 - المستودع الأب");
  });
  it("resolves codes for every entity hierarchy", () => {
    expect(["partners", "projects", "cost_centers"].map(referenceCodeField)).toEqual(["code", "code", "code"]);
    expect(referenceCodeField("products")).toBe("sku");
  });
});