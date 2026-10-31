import { describe, expect, it } from "vitest";
import { accountSubtree } from "./account-scope";

describe("linked ledger account selection", () => {
  const accounts = [
    { id: "root", parent_id: null },
    { id: "group", parent_id: "root" },
    { id: "leaf", parent_id: "group" },
    { id: "other", parent_id: null },
  ];
  it("includes every account beneath the selected ledger parent", () => {
    expect([...accountSubtree(accounts, "root")]).toEqual(["root", "group", "leaf"]);
  });
  it("excludes accounts outside the selected parent's hierarchy", () => {
    expect([...accountSubtree(accounts, "group")]).toEqual(["group", "leaf"]);
  });
  it("does not depend on entity codes or code prefixes", () => {
    const coded = accounts.map((account) => ({ ...account, code: "UNRELATED" }));
    expect([...accountSubtree(coded, "root")]).toEqual(["root", "group", "leaf"]);
  });
});