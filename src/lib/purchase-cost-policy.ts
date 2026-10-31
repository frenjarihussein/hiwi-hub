export type CostPolicy = "price" | "less_disc" | "plus_add" | "net";
export function costPolicy(value: unknown): CostPolicy {
  return value === "price" || value === "less_disc" || value === "plus_add" ? value : "net";
}
export function costRules(value: unknown) {
  const policy = costPolicy(value);
  return { discountInCost: policy === "less_disc" || policy === "net", additionInCost: policy === "plus_add" || policy === "net" };
}
export const hasAdjustments = (type: string) => ["sale", "purchase", "purchase_return", "sale_return", "stock_in"].includes(type);
export const usesCostPolicy = (type: string, method?: string | null) => method !== "periodic" && ["purchase", "purchase_return", "sale_return", "stock_in"].includes(type);
export type ChargeAccounts = { account_id?: string | null | undefined; exp_account_id?: string | null | undefined; kind: "discount" | "add"; amount: string | number };
export function chargeAccountError(charges: ChargeAccounts[], policy: unknown, defaults: { discount?: string | null; addition?: string | null }): string | null {
  const rules = costRules(policy);
  for (const charge of charges) {
    if (!(Number(charge.amount) > 0)) continue;
    if (charge.kind === "add" && !charge.account_id) return "حدد الحساب الدائن لكل إضافة داخل الفاتورة";
    const included = charge.kind === "discount" ? rules.discountInCost : rules.additionInCost;
    const fallback = charge.kind === "discount" ? defaults.discount : defaults.addition;
    if (!included && !(charge.exp_account_id || fallback)) return charge.kind === "discount" ? "حدد حساب الحسم المستبعد من الكلفة" : "حدد حساب مصروف الإضافة المستبعدة من الكلفة";
  }
  return null;
}