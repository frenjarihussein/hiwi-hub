import { describe, expect, it } from "vitest";
import { balanceLabel, balanceSheetSide, ledgerAmounts, ledgerDescription, parenthesizedAmount } from "./ledger-display";

describe("account statement rules", () => {
  it("shows credit balances as absolute values with a credit label", () => {
    expect(balanceLabel(-125, "$" )).toBe("125.00 $ دائن");
    expect(balanceLabel(125, "$" )).toBe("125.00 $ مدين");
  });
  it("uses the entry description only when enabled and the line is blank", () => {
    expect(ledgerDescription(" ", "تسديد", true)).toBe("تسديد");
    expect(ledgerDescription("", "تسديد", false)).toBe("—");
    expect(ledgerDescription("دفعة", "تسديد", true)).toBe("دفعة");
  });
  it("uses exact foreign line amounts alongside base amounts", () => {
    expect(ledgerAmounts({ debit: 0, credit: 100, line_currency: "SYP", fc_amount: 1500000, journal_entries: { currency: "USD", exchange_rate: 1 } }, "USD", "SYP")).toMatchObject({ credit: 1500000, creditBase: 100 });
  });
  it("converts entry currency and selected equivalent without inventing missing rates", () => {
    const l = { debit: 200, credit: 0, journal_entries: { currency: "EUR", exchange_rate: 2 } };
    expect(ledgerAmounts(l, "USD", "SYP", { SYP: 15000 }).debit).toBe(1500000);
    expect(ledgerAmounts(l, "USD", "SYP").debit).toBeUndefined();
  });
});

describe("balance sheet nature sides", () => {
  it("keeps credit assets on the assets side in parentheses", () => {
    expect(balanceSheetSide("assets", -100)).toEqual({ side: "debit", amount: -100 });
    expect(parenthesizedAmount(-100)).toBe("(100.00)");
  });
  it("keeps debit liabilities and equity on their own side", () => {
    expect(balanceSheetSide("liabilities", 75)).toEqual({ side: "credit", amount: -75 });
    expect(balanceSheetSide("equity", 50)).toEqual({ side: "credit", amount: -50 });
  });
});