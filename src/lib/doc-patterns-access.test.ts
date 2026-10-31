import { describe, expect, it } from "vitest";
import { patternAllowsUser } from "./doc-patterns";

describe("pattern user access", () => {
  it("empty list allows everyone", () => expect(patternAllowsUser({ allowed_user_ids: [] }, "u1")).toBe(true));
  it("blocks users not listed", () => expect(patternAllowsUser({ allowed_user_ids: ["u2"] }, "u1")).toBe(false));
  it("allows listed users", () => expect(patternAllowsUser({ allowed_user_ids: ["u1"] }, "u1")).toBe(true));
  it("admin bypasses the list", () => expect(patternAllowsUser({ allowed_user_ids: ["u2"] }, "u1", true)).toBe(true));
});

import { patternAllowsWarehouse, primaryAllowed } from "./doc-patterns";
describe("pattern warehouses and primary access", () => {
  it("empty warehouse list allows all", () => expect(patternAllowsWarehouse({ warehouse_ids: [] }, "w1")).toBe(true));
  it("restricts to chosen warehouses", () => expect(patternAllowsWarehouse({ warehouse_ids: ["w2"] }, "w1")).toBe(false));
  it("denied user cannot use primary sale", () => expect(primaryAllowed({ u1: ["sale"] }, "u1", "sale")).toBe(false));
  it("admin bypasses primary denial", () => expect(primaryAllowed({ u1: ["sale"] }, "u1", "sale", true)).toBe(true));
});
