import { describe, expect, it } from "vitest";
import { applyRestQuery } from "./offline-query";

const rows = [
  { id: "1", kind: "sale", total: 50, partner_id: "a" },
  { id: "2", kind: "purchase", total: 20, partner_id: "b" },
  { id: "3", kind: "sale", total: 10, partner_id: null },
];
const q = (s: string) => applyRestQuery(rows, new URL("http://x/rest/v1/documents?" + s)).map((r) => r["id"]);

describe("offline local queries", () => {
  it("filters by eq", () => expect(q("kind=eq.sale")).toEqual(["1", "3"]));
  it("filters by in and is null", () => {
    expect(q("partner_id=in.(a,b)")).toEqual(["1", "2"]);
    expect(q("partner_id=is.null")).toEqual(["3"]);
  });
  it("orders and limits", () => expect(q("order=total.desc&limit=2")).toEqual(["1", "2"]));
  it("numeric gte", () => expect(q("total=gte.20")).toEqual(["1", "2"]));
});
