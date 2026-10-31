import { describe, expect, it } from "vitest";
import { chartFor, settingsMapFor } from "./coa-seed";
import { validateClosingLinks } from "./closing-rules";

describe("inventory charts and explicit closing accounts", () => {
  it("periodic inventory has purchases and opening/closing stock", () => {
    const chart = chartFor("periodic");
    expect(chart.find((a) => a.code === "5101")?.name).toBe("المشتريات");
    expect(chart.find((a) => a.code === "5105")?.name).toBe("بضاعة أول المدة");
    expect(chart.find((a) => a.code === "110301")?.name).toBe("بضاعة آخر المدة");
    expect(settingsMapFor("periodic")["purchases_account_id"]).toBe("5101");
    expect(settingsMapFor("periodic")["cogs_account_id"]).toBeUndefined();
  });
  it("perpetual inventory uses stock and cost of sales", () => {
    expect(chartFor("perpetual").find((a) => a.code === "5101")?.name).toBe("تكلفة البضاعة المباعة");
    expect(settingsMapFor("perpetual")["cogs_account_id"]).toBe("5101");
    expect(chartFor("perpetual").some((a) => a.code === "5105")).toBe(false);
  });
  it("neither chart creates closing accounts and every mapped code exists", () => {
    for (const method of ["periodic", "perpetual"]) {
      const chart = chartFor(method);
      expect(chart.some((a) => a.nature === "closing")).toBe(false);
      for (const code of Object.values(settingsMapFor(method))) expect(chart.some((a) => a.code === code)).toBe(true);
    }
  });
  it("closing links require existing leaf closing accounts", () => {
    const accounts = [{ id: "bs", nature: "closing", is_group: false }, { id: "pl", nature: "closing", is_group: false }, { id: "cash", nature: "assets", is_group: false }];
    expect(() => validateClosingLinks(accounts, { balance_sheet: "bs", profit_loss: "pl" })).not.toThrow();
    expect(() => validateClosingLinks(accounts, { balance_sheet: "cash", profit_loss: "pl" })).toThrow();
    expect(() => validateClosingLinks(accounts, { balance_sheet: "missing", profit_loss: "pl" })).toThrow();
    expect(() => validateClosingLinks(accounts, {})).toThrow();
  });
});