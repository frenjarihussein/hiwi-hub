import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { corporateTaxes, emptyTaxSettings, readTaxSettings, validateTaxSettings, type IncomeTaxRule, type TaxSettings } from "@/lib/taxes";
import { fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AccountPicker } from "@/components/AccountPicker";

type Account = { id: string; code: string; name: string };
export function TaxSettingsFields({ value, onChange, disabled = false, accounts = [] }: { value: TaxSettings; onChange: (value: TaxSettings) => void; disabled?: boolean; accounts?: Account[] }) {
  const numeric = (label: string, n: number, onValue: (n: number) => void, max?: number) => <div className="min-w-0 space-y-1"><Label>{label}</Label><Input aria-label={label} type="number" min={0} max={max} step="any" disabled={disabled} value={n} onChange={(e) => onValue(Number(e.target.value))} /></div>;
  const account = (label: string, id: string, onValue: (id: string) => void) => accounts.length ? <div className="min-w-0 space-y-1"><Label>{label}</Label><AccountPicker accounts={accounts} value={id} onChange={onValue} disabled={disabled} /></div> : null;
  const ruleFields = (key: "corporate" | "payroll", title: string) => {
    const rule = value[key];
    const set = (patch: Partial<IncomeTaxRule>) => onChange({ ...value, [key]: { ...rule, ...patch } });
    return <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3><Switch aria-label={title} disabled={disabled} checked={rule.enabled} onCheckedChange={(enabled) => set({ enabled })} /></div>
      {rule.enabled && <>
        <div className="grid gap-3 sm:grid-cols-2">
          {key === "corporate" && <div className="space-y-1"><Label>طريقة احتساب ضريبة الدخل</Label><select aria-label="طريقة احتساب ضريبة الدخل" className="h-10 w-full rounded-md border bg-background px-2 text-sm" disabled={disabled} value={rule.mode} onChange={(e) => set({ mode: e.target.value === "flat" ? "flat" : "brackets" })}><option value="flat">نسبة ثابتة</option><option value="brackets">شرائح تصاعدية</option></select></div>}
          {numeric(key === "payroll" ? "الحد المعفى الشهري للراتب" : "الحد المعفى للدخل السنوي", rule.exempt, (exempt) => set({ exempt }))}
          {rule.mode === "flat" && numeric("نسبة ضريبة الدخل %", rule.rate, (rate) => set({ rate }), 100)}
          {account(`حساب ضريبة ${key === "payroll" ? "الرواتب" : "الدخل"} المستحقة`, rule.payable_account_id, (payable_account_id) => set({ payable_account_id }))}
        </div>
        {rule.mode === "brackets" && <div className="space-y-2">
          <Label>شرائح الدخل الخاضع بعد طرح الإعفاء {key === "payroll" ? "(شهري)" : "(سنوي)"}</Label>
          {rule.brackets.map((row, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div className="space-y-1"><Label>حتى مبلغ</Label><Input aria-label={`${title} حد الشريحة ${i + 1}`} type="number" min={0} placeholder="بدون حد أعلى" disabled={disabled} value={row.up_to ?? ""} onChange={(e) => set({ brackets: rule.brackets.map((r, j) => j === i ? { ...r, up_to: e.target.value === "" ? null : Number(e.target.value) } : r) })} /></div>
            {numeric(`نسبة الشريحة ${i + 1} %`, row.rate, (rate) => set({ brackets: rule.brackets.map((r, j) => j === i ? { ...r, rate } : r) }), 100)}
            <Button aria-label="حذف الشريحة" title="حذف الشريحة" size="icon" variant="outline" disabled={disabled} onClick={() => set({ brackets: rule.brackets.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
          </div>)}
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => set({ brackets: [...rule.brackets, { up_to: null, rate: 0 }] })}><Plus className="size-4" />شريحة</Button>
        </div>}
      </>}
    </section>;
  };
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>الدولة / النظام الضريبي</Label><Input aria-label="الدولة / النظام الضريبي" disabled={disabled} value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })} /></div><div className="space-y-1"><Label>تاريخ سريان الإعدادات</Label><Input aria-label="تاريخ سريان الإعدادات" type="date" disabled={disabled} value={value.effective_date} onChange={(e) => onChange({ ...value, effective_date: e.target.value })} /></div></div>
    <section className="space-y-3 border-t pt-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">ضريبة القيمة المضافة</h3><Switch aria-label="ضريبة القيمة المضافة" disabled={disabled} checked={value.vat.enabled} onCheckedChange={(enabled) => onChange({ ...value, vat: { ...value.vat, enabled } })} /></div>{value.vat.enabled && <div className="grid gap-3 sm:grid-cols-2">{numeric("نسبة القيمة المضافة %", value.vat.rate, (rate) => onChange({ ...value, vat: { ...value.vat, rate } }), 100)}{account("حساب ضريبة المبيعات", value.vat.output_account_id, (output_account_id) => onChange({ ...value, vat: { ...value.vat, output_account_id } }))}{account("حساب ضريبة المشتريات", value.vat.input_account_id, (input_account_id) => onChange({ ...value, vat: { ...value.vat, input_account_id } }))}</div>}</section>
    {ruleFields("corporate", "ضريبة الدخل / الشركات")}
    {value.corporate.enabled && <section className="space-y-3 border-t pt-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">رسم الإدارة المحلية</h3><Switch aria-label="رسم الإدارة المحلية" disabled={disabled} checked={value.local.enabled} onCheckedChange={(enabled) => onChange({ ...value, local: { ...value.local, enabled } })} /></div>{value.local.enabled && <div className="grid gap-3 sm:grid-cols-2">{numeric("نسبة رسم الإدارة المحلية %", value.local.rate, (rate) => onChange({ ...value, local: { ...value.local, rate } }), 100)}<div className="space-y-1"><Label>أساس الرسم</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" disabled={disabled} value={value.local.basis} onChange={(e) => onChange({ ...value, local: { ...value.local, basis: e.target.value === "tax" ? "tax" : "taxable_income" } })}><option value="tax">قيمة ضريبة الدخل</option><option value="taxable_income">الدخل الخاضع بعد الإعفاء</option></select></div>{account("حساب رسم الإدارة المحلية", value.local.payable_account_id, (payable_account_id) => onChange({ ...value, local: { ...value.local, payable_account_id } }))}</div>}</section>}
    {ruleFields("payroll", "ضريبة الرواتب والأجور")}
  </div>;
}

export function TaxSettingsCard({ editable }: { editable: boolean }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [value, setValue] = useState(emptyTaxSettings);
  const [income, setIncome] = useState(0);
  const q = useQuery({ queryKey: ["tax_settings", me?.tenantId], enabled: !!me?.tenantId, queryFn: async () => {
    if (!me?.tenantId) throw new Error("اختر الشركة أولاً");
    const { data, error } = await db.from("tenant_settings").select("tax_settings").eq("tenant_id", me.tenantId).maybeSingle();
    if (error) throw error;
    return readTaxSettings(data?.tax_settings);
  } });
  const accounts = useQuery({ queryKey: ["tax_accounts", me?.tenantId], enabled: !!me?.tenantId, queryFn: async () => {
    const { data, error } = await scope(db.from("accounts").select("id,code,name").eq("is_group", false).neq("nature", "closing"), me?.tenantId).order("code");
    if (error) throw error;
    return data ?? [];
  } });
  useEffect(() => { if (q.data) setValue(q.data); }, [q.data]);
  const save = useMutation({ mutationFn: async () => {
    if (!me?.tenantId || !editable) throw new Error("غير مصرح");
    const config = validateTaxSettings(value);
    const { error } = await db.from("tenant_settings").upsert({ tenant_id: me.tenantId, tax_settings: config }, { onConflict: "tenant_id" });
    if (error) throw error;
  }, onSuccess: () => { toast.success("تم حفظ إعدادات الضرائب"); qc.invalidateQueries({ queryKey: ["tax_settings"] }); qc.invalidateQueries({ queryKey: ["payroll"] }); }, onError: (e: Error) => toast.error(e.message) });
  const estimate = corporateTaxes(income, value);
  return <div className="max-w-3xl space-y-5"><h2 className="text-xl font-semibold">الضرائب</h2>{q.isError ? <p className="text-destructive">{q.error.message}</p> : <TaxSettingsFields value={value} onChange={setValue} disabled={!editable || !q.isSuccess || save.isPending} accounts={accounts.data ?? []} />}
    {editable && <Button disabled={!q.isSuccess || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "جارٍ الحفظ..." : "حفظ إعدادات الضرائب"}</Button>}
    {value.corporate.enabled && <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">تقدير ضريبة الدخل السنوي</h3><div className="space-y-1"><Label>الدخل السنوي قبل الإعفاء</Label><Input type="number" min={0} value={income} onChange={(e) => setIncome(Number(e.target.value))} /></div><dl className="grid grid-cols-2 gap-2 text-sm"><dt>ضريبة الدخل</dt><dd className="num">{fmtNum(estimate.corporate)}</dd><dt>رسم الإدارة المحلية</dt><dd className="num">{fmtNum(estimate.local)}</dd><dt className="font-semibold">الإجمالي التقديري</dt><dd className="num font-semibold">{fmtNum(estimate.total)}</dd></dl></section>}
  </div>;
}