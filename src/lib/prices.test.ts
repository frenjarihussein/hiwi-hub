import { describe, expect, it } from "vitest";
import { amountToPct, pctToAmount, priceForLevel } from "./prices";
import { suggestCode, validateCode } from "./coding";

describe("price levels", () => {
  it("uses the customer's chosen price level", () => {
    expect(priceForLevel({ sale_price: 10, prices: { "2": 8 } }, 2)).toBe(8);
  });
  it("falls back to the default sale price", () => {
    expect(priceForLevel({ sale_price: 10, prices: {} }, 1)).toBe(10);
  });
});

describe("percent or amount", () => {
  it("10% of 200 is 20", () => expect(pctToAmount(200, 10)).toBe(20));
  it("20 of 200 is 10%", () => expect(amountToPct(200, 20)).toBe(10));
});

describe("custom code length", () => {
  it("leaf code fills to the chosen length", () => {
    expect(suggestCode("0101", [], false, 8)).toBe("01010001");
    expect(validateCode("01010001", "0101", false, 8)).toBeNull();
    expect(validateCode("010100001", "0101", false, 8)).not.toBeNull();
  });
});

import { fixFor } from "./error-actions";
describe("error fix links", () => {
  it("missing account mapping points to settings", () => {
    expect(fixFor("أكمل الربط المحاسبي في الإعدادات (يوجد حساب غير محدد)")?.to).toBe("/doc-patterns");
  });
});

import { repriceValue as rv } from "./prices";
describe("repriceValue", () => {
  it("raises 10% and rounds to 5", () => expect(rv(1234, 10, 5)).toBe(1355));
  it("reduces 20% without rounding", () => expect(rv(100, -20, 0)).toBe(80));
});

import { convertRounded } from "./prices";
describe("convertRounded", () => {
  it("converts and rounds to nearest 500", () => { expect(convertRounded(1.3, 13000, 500)).toBe(17000); });
  it("no step keeps 2 decimals", () => { expect(convertRounded(1.333, 3, 0)).toBe(4); });
});

import { priceForLevel as pfl } from "./prices";
describe("named-price fallback", () => {
  it("uses the first named price when the basic sale price is hidden", () => {
    expect(pfl({ sale_price: 0, prices: { "1": 7 } }, 0)).toBe(7);
  });
});
