import { describe, it, expect } from "vitest";
import { assignNumbers, nextNumber, withoutNumber, isNumberConflict } from "./offline-numbering";

describe("offline official numbering", () => {
  it("continues from the highest cached number", () => {
    expect(nextNumber([3, 11, 7])).toBe(12);
  });
  it("never reuses a number already issued offline (high-water mark)", () => {
    expect(nextNumber([5], 9)).toBe(10);
  });
  it("numbers a batch consecutively per series without duplicates", () => {
    const known = [{ tenant_id: "t", entry_no: 40 }];
    const r1 = assignNumbers("journal_entries", [{ tenant_id: "t" }], known, {});
    const r2 = assignNumbers("journal_entries", [{ tenant_id: "t" }], known, r1.highWater);
    expect(r1.rows[0]!["entry_no"]).toBe(41);
    expect(r2.rows[0]!["entry_no"]).toBe(42);
  });
  it("documents number separately per document type", () => {
    const known = [{ tenant_id: "t", doc_type: "sale", doc_no: 8 }, { tenant_id: "t", doc_type: "purchase", doc_no: 3 }];
    const r = assignNumbers("documents", [{ tenant_id: "t", doc_type: "purchase" }, { tenant_id: "t", doc_type: "sale" }], known, {});
    expect(r.rows.map((x) => x["doc_no"])).toEqual([4, 9]);
  });
  it("on a number conflict the resend lets the server assign the number", () => {
    expect(isNumberConflict(409, "23505", "")).toBe(true);
    expect(withoutNumber("journal_entries", { id: "a", entry_no: 5, _local_no: 5 })).toEqual({ id: "a" });
  });
});
