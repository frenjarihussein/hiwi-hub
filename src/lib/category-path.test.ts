import { describe, expect, it } from "vitest";
import { isUnderCategory } from "./category-path";

const rows = [{ id: "g", parent_id: null }, { id: "c", parent_id: "g" }, { id: "item", parent_id: "c" }, { id: "other", parent_id: null }];
describe("category descendants", () => {
  it("a grandparent category includes its grandchild items", () => expect(isUnderCategory(rows, "item", "g")).toBe(true));
  it("unrelated items are excluded", () => expect(isUnderCategory(rows, "other", "g")).toBe(false));
});
