/** Custom (free) entry patterns: user-defined journal templates stored as doc_patterns rows. */
export const CUSTOM_ENTRY_TYPE = "custom_entry";
export type CustomLine = { account_id: string; side: "debit" | "credit"; pct: number; note?: string };

/** Builds balanced entry lines from a template and an amount; throws when the template is incomplete or unbalanced. */
export function buildCustomEntry(tpl: CustomLine[], amount: number) {
  if (!(amount > 0)) throw new Error("أدخل مبلغاً صحيحاً");
  if (tpl.length < 2) throw new Error("القيد يحتاج طرفين على الأقل");
  if (tpl.some((l) => !l.account_id)) throw new Error("اختر حساب كل طرف");
  const sum = (s: string) => tpl.filter((l) => l.side === s).reduce((a, l) => a + Number(l.pct || 0), 0);
  if (Math.abs(sum("debit") - 100) > 0.001 || Math.abs(sum("credit") - 100) > 0.001) throw new Error("مجموع نسب المدين ومجموع نسب الدائن يجب أن يساوي كل منهما 100%");
  const r = (n: number) => Math.round(n * 100) / 100;
  const lines = tpl.map((l) => { const v = r((amount * l.pct) / 100); return { account_id: l.account_id, debit: l.side === "debit" ? v : 0, credit: l.side === "credit" ? v : 0 }; });
  for (const side of ["debit", "credit"] as const) {
    const diff = r(amount - lines.reduce((a, l) => a + l[side], 0));
    const last = [...lines].reverse().find((l) => l[side] > 0);
    if (last && diff) last[side] = r(last[side] + diff);
  }
  return lines;
}
