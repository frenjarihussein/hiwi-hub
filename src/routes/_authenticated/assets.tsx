import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CrudPage } from "@/components/CrudPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtMoney, today } from "@/lib/format";
import { db } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { useBaseCurrency, useCurrencies } from "@/lib/currencies";
import { depreciationDue, linkedAccounts, post2, rateFor } from "@/lib/auto-entries";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({ meta: [{ title: "الأصول الثابتة والاهتلاك" }, { name: "description", content: "بطاقات الأصول الثابتة وترحيل قيود الاهتلاك الدوري" }] }),
  component: AssetsPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function annualDepreciation(row: any) {
  const cost = Number(row.cost ?? 0);
  const salvage = Number(row.salvage_value ?? 0);
  const life = Number(row.useful_life_years ?? 1);
  return (cost - salvage) / (life || 1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accumulated(row: any) {
  const years = (Date.now() - new Date(row.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000);
  const value = Math.min(annualDepreciation(row) * Math.max(years, 0), Number(row.cost) - Number(row.salvage_value));
  return Math.max(value, 0);
}

function DepreciationPoster() {
  const { data: me } = useMe();
  const base = useBaseCurrency();
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!me?.tenantId) return;
    setBusy(true);
    try {
      const st = await linkedAccounts(me.tenantId);
      const { data, error } = await db.from("fixed_assets").select("*").eq("tenant_id", me.tenantId);
      if (error) throw error;
      let n = 0; const missing: string[] = [];
      for (const a of data ?? []) {
        const amt = depreciationDue(a, date);
        if (amt <= 0) continue;
        const exp = a.dep_expense_account_id ?? st.dep_expense_account_id;
        const acc = a.accum_dep_account_id ?? st.accum_dep_account_id;
        if (!exp || !acc) { missing.push(a.name); continue; }
        const d = `اهتلاك الأصل ${a.name} حتى ${date}`;
        await post2(me.tenantId, me.userId, date, d, a.currency, await rateFor(a.currency, base), exp, acc, amt);
        await db.from("fixed_assets").update({ last_dep_date: date }).eq("id", a.id);
        n++;
      }
      if (missing.length) toast.error(`حدد حساب مصروف ومجمع الاهتلاك (في الإعدادات أو البطاقة) للأصول: ${missing.join("، ")}`);
      toast.success(n ? `تم ترحيل ${n} قيد اهتلاك` : "لا يوجد اهتلاك مستحق حتى هذا التاريخ");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  if (!can(me, "assets", "create")) return null;
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
      <span>ترحيل الاهتلاك المستحق حتى تاريخ:</span>
      <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button size="sm" disabled={busy} onClick={run}>ترحيل قيد الاهتلاك الدوري</Button>
      <span className="text-xs text-muted-foreground">يُرحَّل فقط ما لم يُرحَّل سابقاً (حسب تاريخ آخر اهتلاك)</span>
    </div>
  );
}

function AssetsPage() {
  const currencies = useCurrencies().data ?? [];
  const base = useBaseCurrency();
  return (
    <>
    <DepreciationPoster />
    <CrudPage
      table="fixed_assets"
      module="assets"
      title="بطاقة الأصول الثابتة"
      subtitle="الاهتلاك السنوي والمجمّع يُحتسب آلياً بطريقة القسط الثابت"
      orderBy="name"
      ascending
      fields={[
        { key: "code", label: "الرمز" },
        { key: "name", label: "اسم الأصل", required: true },
        { key: "purchase_date", label: "تاريخ الشراء", type: "date", required: true, defaultValue: today() },
        { key: "cost", label: "الكلفة", type: "number", required: true, render: (r) => fmtMoney(r.cost, r.currency) },
        { key: "salvage_value", label: "القيمة التخريدية", type: "number", defaultValue: 0 },
        { key: "useful_life_years", label: "العمر الإنتاجي (سنوات)", type: "number", defaultValue: 5, digits: 0 },
        {
          key: "currency",
          label: "العملة",
          type: "select",
          defaultValue: base ?? "USD",
          options: currencies.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })),
        },
        { key: "account_id", label: "الحساب المرتبط في شجرة الحسابات", type: "ref", refTable: "accounts", refFilter: { key: "is_group", value: false } },
        { key: "dep_expense_account_id", label: "حساب مصروف الاهتلاك", type: "ref", refTable: "accounts", refFilter: { key: "is_group", value: false }, hideInTable: true },
        { key: "accum_dep_account_id", label: "حساب مجمع الاهتلاك", type: "ref", refTable: "accounts", refFilter: { key: "is_group", value: false }, hideInTable: true },
        { key: "last_dep_date", label: "آخر اهتلاك مُرحَّل", type: "date", hideInForm: true },
        { key: "partner_id", label: "الزبون / المورد المرتبط", type: "ref", refTable: "partners" },
        { key: "annual_dep", label: "الاهتلاك السنوي", hideInForm: true, render: (r) => fmtMoney(annualDepreciation(r), r.currency) },
        { key: "acc_dep", label: "الاهتلاك المجمّع", hideInForm: true, render: (r) => fmtMoney(accumulated(r), r.currency) },
        { key: "net_value", label: "القيمة الدفترية", hideInForm: true, render: (r) => fmtMoney(Number(r.cost) - accumulated(r), r.currency) },
        { key: "notes", label: "ملاحظات", type: "textarea", hideInTable: true },
      ]}
    />
    </>
  );
}
