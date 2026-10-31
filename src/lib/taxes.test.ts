import { describe, expect, it } from "vitest";
import { corporateTaxes, emptyTaxSettings, incomeTax, taxActive, validateTaxSettings } from "./taxes";
describe("configured taxes (illustrative inputs, not statutory rates)", () => {
  it("subtracts the exemption before a fixed rate", () => {
    const rule = { ...emptyTaxSettings().corporate, enabled: true, rate: 10, exempt: 100 };
    expect(incomeTax(1100, rule)).toBe(100);
    expect(incomeTax(90, rule)).toBe(0);
  });
  it("applies marginal payroll brackets only to each slice", () => {
    const rule = { ...emptyTaxSettings().payroll, enabled: true, exempt: 100, brackets: [{ up_to: 1000, rate: 10 }, { up_to: null, rate: 20 }] };
    expect(incomeTax(2100, rule)).toBe(300);
  });
  it("calculates local administration charges on the selected base", () => {
    const config = emptyTaxSettings();
    config.corporate = { ...config.corporate, enabled: true, rate: 10 };
    config.local = { ...config.local, enabled: true, rate: 5 };
    expect(corporateTaxes(1000, config)).toEqual({ corporate: 100, local: 5, total: 105 });
    config.local.basis = "taxable_income";
    expect(corporateTaxes(1000, config).local).toBe(50);
  });
  it("rejects unordered and unbounded-incomplete brackets", () => {
    const config = emptyTaxSettings();
    config.payroll = { ...config.payroll, enabled: true, brackets: [{ up_to: 1000, rate: 10 }] };
    expect(() => validateTaxSettings(config)).toThrow();
    config.payroll.brackets = [{ up_to: 1000, rate: 10 }, { up_to: 500, rate: 20 }, { up_to: null, rate: 30 }];
    expect(() => validateTaxSettings(config)).toThrow();
  });
  it("does not activate future settings", () => {
    const config = { ...emptyTaxSettings(), effective_date: "2026-11-01" };
    expect(taxActive(config, "2026-10-31")).toBe(false);
    expect(taxActive(config, "2026-11-01")).toBe(true);
  });
});