import { describe, expect, it } from "vitest";
import { chequeLines, depreciationDue } from "./auto-entries";

const acc = { notes: "N", partner: "P", bank: "B" };

describe("cheque entries", () => {
  it("incoming registration: notes receivable from customer", () => expect(chequeLines({ direction: "incoming", status: "pending", amount: 1 }, acc)).toEqual({ debit: "N", credit: "P" }));
  it("incoming collection: bank from notes", () => expect(chequeLines({ direction: "incoming", status: "collected", amount: 1 }, acc)).toEqual({ debit: "B", credit: "N" }));
  it("incoming return puts debt back on customer", () => expect(chequeLines({ direction: "incoming", status: "returned", amount: 1 }, acc)).toEqual({ debit: "P", credit: "N" }));
  it("outgoing is mirrored", () => expect(chequeLines({ direction: "outgoing", status: "collected", amount: 1 }, acc)).toEqual({ debit: "N", credit: "B" }));
});

describe("depreciation", () => {
  const a = { cost: 1100, salvage_value: 100, useful_life_years: 1, purchase_date: "2025-01-01" };
  it("never exceeds depreciable base", () => expect(depreciationDue(a, "2030-01-01")).toBe(1000));
  it("nothing due again after posting", () => expect(depreciationDue({ ...a, last_dep_date: "2030-01-01" }, "2030-01-01")).toBe(0));
});
