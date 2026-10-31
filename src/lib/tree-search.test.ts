import { describe, expect, it } from "vitest";
import { searchTree, treeAncestors } from "./tree-search";

const rows = [{ id: "root", parent_id: null, name: "الأصول", code: "01" }, { id: "group", parent_id: "root", name: "الزبائن", code: "0101" }, { id: "leaf", parent_id: "group", name: "أحمد", code: "010101" }];
describe("tree search", () => {
  it("finds cards by name and account number", () => {
    expect(searchTree(rows, "أحمد").map((row) => row.id)).toEqual(["leaf"]);
    expect(searchTree(rows, "010101").map((row) => row.id)).toEqual(["leaf"]);
  });
  it("opens every ancestor of the result", () => expect(treeAncestors(rows, "leaf")).toEqual(["group", "root"]));
  it("stops on cyclic data", () => expect(treeAncestors([{ id: "a", name: "a", parent_id: "b" }, { id: "b", name: "b", parent_id: "a" }], "a")).toEqual(["b"]));
});