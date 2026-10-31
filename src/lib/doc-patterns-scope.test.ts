import { describe, expect, it } from "vitest";
import { expandPartnerScope, fieldAppliesTo, patternAllowsCurrency } from "./doc-patterns";

describe("pattern scope", () => {
  it("destination warehouse only applies to transfers", () => {
    expect(fieldAppliesTo("to_warehouse_id", "purchase")).toBe(false);
    expect(fieldAppliesTo("to_warehouse_id", "transfer")).toBe(true);
  });
  it("selecting a category adds its customers and their accounts", () => {
    const partners = [{ id: "g", is_group: true }, { id: "c1", parent_id: "g", account_id: "a1" }, { id: "c2", parent_id: null, account_id: "a2" }];
    expect(expandPartnerScope(["g"], [], partners, new Map())).toEqual({ partnerIds: ["c1"], accountIds: ["a1"] });
  });
  it("empty currency list allows every currency", () => {
    expect(patternAllowsCurrency({ currency_codes: [] }, "USD")).toBe(true);
    expect(patternAllowsCurrency({ currency_codes: ["SYP"] }, "USD")).toBe(false);
  });
});
