import { z } from "zod";

const rate = z.number().finite().min(0).max(100);
const money = z.number().finite().min(0);
const brackets = z.array(z.object({ up_to: money.nullable(), rate })).superRefine((rows, ctx) => {
  let previous = 0;
  rows.forEach((row, i) => {
    if (row.up_to === null ? i !== rows.length - 1 : row.up_to <= previous) {
      ctx.addIssue({ code: "custom", message: "حدود الشرائح يجب أن تكون تصاعدية؛ الشريحة المفتوحة تكون الأخيرة" });
    }
    previous = row.up_to ?? previous;
  });
});
const incomeRule = z.object({
  enabled: z.boolean(), mode: z.enum(["flat", "brackets"]), rate, exempt: money,
  brackets, payable_account_id: z.string(),
}).superRefine((rule, ctx) => {
  if (rule.enabled && rule.mode === "brackets" && (!rule.brackets.length || rule.brackets.at(-1)?.up_to !== null)) {
    ctx.addIssue({ code: "custom", message: "أضف شريحة أخيرة بدون حد أعلى" });
  }
});
export const taxSettingsSchema = z.object({
  country: z.string(), effective_date: z.string().refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), "تاريخ السريان غير صحيح"),
  vat: z.object({ enabled: z.boolean(), rate, input_account_id: z.string(), output_account_id: z.string() }),
  corporate: incomeRule,
  local: z.object({ enabled: z.boolean(), rate, basis: z.enum(["tax", "taxable_income"]), payable_account_id: z.string() }),
  payroll: incomeRule,
});
export type TaxSettings = z.infer<typeof taxSettingsSchema>;
export type IncomeTaxRule = TaxSettings["corporate"];
export function emptyTaxSettings(): TaxSettings {
  const rule: IncomeTaxRule = { enabled: false, mode: "brackets", rate: 0, exempt: 0, brackets: [], payable_account_id: "" };
  return { country: "", effective_date: "", vat: { enabled: false, rate: 0, input_account_id: "", output_account_id: "" }, corporate: { ...rule, mode: "flat" }, local: { enabled: false, rate: 0, basis: "tax", payable_account_id: "" }, payroll: { ...rule } };
}
export function readTaxSettings(value: unknown): TaxSettings {
  const parsed = taxSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyTaxSettings();
}
export function validateTaxSettings(value: unknown): TaxSettings {
  const parsed = taxSettingsSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "إعدادات الضرائب غير صحيحة");
  return parsed.data;
}
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Bracket ceilings refer to taxable income after exemption, not the original income. */
export function incomeTax(income: number, rule: IncomeTaxRule): number {
  if (!rule.enabled) return 0;
  const taxable = Math.max(0, income - rule.exempt);
  if (rule.mode === "flat") return round(taxable * rule.rate / 100);
  let total = 0, lower = 0;
  for (const bracket of rule.brackets) {
    const upper = bracket.up_to ?? Infinity;
    total += Math.max(0, Math.min(taxable, upper) - lower) * bracket.rate / 100;
    lower = upper;
  }
  return round(total);
}
export function corporateTaxes(income: number, config: TaxSettings) {
  const corporate = incomeTax(income, config.corporate);
  const localBase = config.local.basis === "tax" ? corporate : Math.max(0, income - config.corporate.exempt);
  const local = config.local.enabled && config.corporate.enabled ? round(localBase * config.local.rate / 100) : 0;
  return { corporate, local, total: round(corporate + local) };
}
export function taxActive(config: TaxSettings, date: string): boolean {
  return !config.effective_date || date >= config.effective_date;
}