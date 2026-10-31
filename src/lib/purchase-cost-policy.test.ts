import { describe, expect, it } from "vitest";
import { chargeAccountError, costPolicy, costRules, hasAdjustments, usesCostPolicy, type ChargeAccounts } from "./purchase-cost-policy";

describe("costPolicy", () => {
  it("يقبل الخيارات الأربعة فقط ويرد غيرها إلى net", () => {
    expect(costPolicy("price")).toBe("price");
    expect(costPolicy("less_disc")).toBe("less_disc");
    expect(costPolicy("plus_add")).toBe("plus_add");
    expect(costPolicy("net")).toBe("net");
    expect(costPolicy("other")).toBe("net");
    expect(costPolicy(undefined)).toBe("net");
    expect(costPolicy(null)).toBe("net");
  });
});

describe("costRules — الخيارات الأربعة", () => {
  it("price: الكلفة هي سعر الشراء فقط", () => {
    expect(costRules("price")).toEqual({ discountInCost: false, additionInCost: false });
  });
  it("less_disc: الشراء مع الحسميات فقط", () => {
    expect(costRules("less_disc")).toEqual({ discountInCost: true, additionInCost: false });
  });
  it("plus_add: الشراء مع الإضافات فقط", () => {
    expect(costRules("plus_add")).toEqual({ discountInCost: false, additionInCost: true });
  });
  it("net: الشراء مع الحسميات والإضافات", () => {
    expect(costRules("net")).toEqual({ discountInCost: true, additionInCost: true });
  });
});

describe("hasAdjustments / usesCostPolicy", () => {
  it("الحسميات والإضافات متاحة للبيع والشراء والمردودات والإدخال", () => {
    for (const t of ["sale", "purchase", "purchase_return", "sale_return", "stock_in"]) expect(hasAdjustments(t)).toBe(true);
    expect(hasAdjustments("transfer")).toBe(false);
  });
  it("سياسة الكلفة تطبق على الشراء والمردودات والإدخال في الجرد المستمر فقط", () => {
    for (const t of ["purchase", "purchase_return", "sale_return", "stock_in"]) expect(usesCostPolicy(t, "continuous")).toBe(true);
    expect(usesCostPolicy("sale", "continuous")).toBe(false);
    expect(usesCostPolicy("purchase", "periodic")).toBe(false);
    expect(usesCostPolicy("purchase", undefined)).toBe(true);
  });
});

describe("chargeAccountError", () => {
  const disc = (over: Partial<ChargeAccounts> = {}): ChargeAccounts => ({ kind: "discount", amount: "10", account_id: "", exp_account_id: "", ...over });
  const add = (over: Partial<ChargeAccounts> = {}): ChargeAccounts => ({ kind: "add", amount: "10", account_id: "", exp_account_id: "", ...over });

  it("الإضافة تتطلب حساباً دائناً داخل الفاتورة في كل الخيارات", () => {
    for (const p of ["price", "less_disc", "plus_add", "net"]) {
      expect(chargeAccountError([add()], p, {})).toBe("حدد الحساب الدائن لكل إضافة داخل الفاتورة");
    }
    for (const p of ["plus_add", "net"]) expect(chargeAccountError([add({ account_id: "a1" })], p, {})).toBeNull();
    for (const p of ["price", "less_disc"]) expect(chargeAccountError([add({ account_id: "a1" })], p, {})).toBe("حدد حساب مصروف الإضافة المستبعدة من الكلفة");
  });

  it("الحسم المحتسب بالكلفة لا يحتاج حساباً", () => {
    for (const p of ["less_disc", "net"]) expect(chargeAccountError([disc()], p, {})).toBeNull();
  });

  it("الحسم المستبعد يحتاج حساباً من السطر أو الافتراضي", () => {
    for (const p of ["price", "plus_add"]) {
      expect(chargeAccountError([disc()], p, {})).toBe("حدد حساب الحسم المستبعد من الكلفة");
      expect(chargeAccountError([disc({ exp_account_id: "e1" })], p, {})).toBeNull();
      expect(chargeAccountError([disc()], p, { discount: "d1" })).toBeNull();
    }
  });

  it("الإضافة المستبعدة تحتاج حساب مصروف من السطر أو الافتراضي", () => {
    for (const p of ["price", "less_disc"]) {
      expect(chargeAccountError([add({ account_id: "a1" })], p, {})).toBe("حدد حساب مصروف الإضافة المستبعدة من الكلفة");
      expect(chargeAccountError([add({ account_id: "a1", exp_account_id: "e1" })], p, {})).toBeNull();
      expect(chargeAccountError([add({ account_id: "a1" })], p, { addition: "f1" })).toBeNull();
    }
  });

  it("الإضافة المحتسبة بالكلفة لا تحتاج حساب مصروف", () => {
    for (const p of ["plus_add", "net"]) expect(chargeAccountError([add({ account_id: "a1" })], p, {})).toBeNull();
  });

  it("يتجاهل الأسطر بلا مبلغ", () => {
    expect(chargeAccountError([disc({ amount: "0" }), add({ amount: "" })], "price", {})).toBeNull();
  });
});
