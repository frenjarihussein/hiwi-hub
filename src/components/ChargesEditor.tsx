import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { amountToPct, pctToAmount } from "@/lib/prices";
import { AccountPicker } from "@/components/AccountPicker";
import { costRules } from "@/lib/purchase-cost-policy";

const CHARGE_WORDS = /حسم|خصم|إضاف|اضاف|حسومات|مسموحات|نقل|شحن/;
/** Discount/addition accounts first, then the rest in their original order. */
export function sortChargeAccounts<T extends { name: string }>(accounts: T[]): T[] {
  const hit = accounts.filter((a) => CHARGE_WORDS.test(a.name));
  return [...hit, ...accounts.filter((a) => !CHARGE_WORDS.test(a.name))];
}

export type Charge = { kind: "add" | "discount"; account_id: string; exp_account_id?: string; pct: string; amount: string; note: string };

export const newCharge = (kind: Charge["kind"]): Charge => ({ kind, account_id: "", pct: "", amount: "", note: "" });

/** Sum of additions minus discounts. */
export function chargesNet(charges: Charge[]): number {
  return charges.reduce((s, c) => s + (c.kind === "add" ? 1 : -1) * (Number(c.amount) || 0), 0);
}

/** Recomputes amounts of percent-based charges when the invoice base changes. */
export function rebaseCharges(charges: Charge[], base: number): Charge[] {
  return charges.map((c) => (c.pct !== "" && Number(c.pct) ? { ...c, amount: String(pctToAmount(base, Number(c.pct))) } : c));
}

/** Invoice-level additions and discounts: account, percent ↔ amount and a note per row. */
export function ChargesEditor({
  charges,
  onChange,
  base,
  accounts,
  policy,
  defaults,
}: {
  charges: Charge[];
  onChange: (c: Charge[]) => void;
  base: number;
  accounts: { id: string; code: string; name: string }[];
  policy?: string;
  defaults?: { discount?: string | null; addition?: string | null };
}) {
  const set = (i: number, patch: Partial<Charge>) => onChange(charges.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="mt-3 space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>الإضافات والحسميات على الفاتورة</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onChange([...charges, newCharge("add")])}>
            <Plus className="size-4" /> إضافة
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange([...charges, newCharge("discount")])}>
            <Plus className="size-4" /> حسم
          </Button>
        </div>
      </div>
      {charges.length === 0 && <p className="text-xs text-muted-foreground">لا توجد إضافات أو حسميات.</p>}
      {charges.map((c, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 border-t pt-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={c.kind} onChange={(e) => set(i, { kind: e.target.value as Charge["kind"] })}>
            <option value="add">إضافة</option>
            <option value="discount">حسم</option>
          </select>
          {policy === undefined ? <AccountPicker accounts={sortChargeAccounts(accounts)} value={c.account_id} onChange={(id) => set(i, { account_id: id })} /> : <>
            {c.kind === "add" && <div className="space-y-1"><Label>الحساب الدائن للإضافة *</Label><AccountPicker accounts={accounts} value={c.account_id} onChange={(id) => set(i, { account_id: id })} /></div>}
            {!(c.kind === "discount" ? costRules(policy).discountInCost : costRules(policy).additionInCost) && <div className="space-y-1"><Label>{c.kind === "discount" ? "حساب الحسم" : "حساب مصروف الإضافة"}</Label><AccountPicker accounts={sortChargeAccounts(accounts)} value={c.exp_account_id || (c.kind === "discount" ? defaults?.discount : defaults?.addition) || ""} onChange={(id) => set(i, { exp_account_id: id })} /></div>}
          </>}
          <Input type="number" placeholder="%" value={c.pct} onChange={(e) => set(i, { pct: e.target.value, amount: e.target.value === "" ? c.amount : String(pctToAmount(base, Number(e.target.value) || 0)) })} />
          <Input type="number" placeholder="المبلغ" value={c.amount} onChange={(e) => set(i, { amount: e.target.value, pct: String(amountToPct(base, Number(e.target.value) || 0)) })} />
          <Input placeholder="البيان (مثال: مصاريف نقل)" value={c.note} onChange={(e) => set(i, { note: e.target.value })} />
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(charges.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Line discount or addition: percent ↔ amount against the line gross. */
export function LineAdjust({ amount, gross, onAmount }: { amount: string; gross: number; onAmount: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      <Input className="w-16" type="number" placeholder="%" value={gross && Number(amount) ? String(amountToPct(gross, Number(amount))) : ""} onChange={(e) => onAmount(String(pctToAmount(gross, Number(e.target.value) || 0)))} />
      <Input className="w-24" type="number" placeholder="مبلغ" value={amount} onChange={(e) => onAmount(e.target.value)} />
    </div>
  );
}
