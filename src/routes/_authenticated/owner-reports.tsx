import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportCsv, printPage } from "@/lib/export";
import { fmtNum } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/owner-reports")({
  head: () => ({
    meta: [
      { title: "تقارير مدير النظام | يوسف سوفت" },
      { name: "description", content: "ميزان مراجعة وقائمة دخل وميزانية لشركة البرمجيات." },
      { property: "og:title", content: "تقارير مدير النظام | يوسف سوفت" },
      { property: "og:description", content: "التقارير المالية الداخلية لشركة البرمجيات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnerReports,
});

type Row = { code: string; name: string; type: "asset" | "revenue" | "expense"; debit: number; credit: number };

function OwnerReports() {
  const { data: me } = useMe();
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState("code-asc");
  const sortRows = (rs: Row[]) => {
    const [key, dir] = sort.split("-");
    const m = dir === "desc" ? -1 : 1;
    return [...rs].sort((a, b) => {
      if (key === "code") return m * a.code.localeCompare(b.code);
      if (key === "name") return m * a.name.localeCompare(b.name, "ar");
      if (key === "debit") return m * (a.debit - b.debit);
      if (key === "credit") return m * (a.credit - b.credit);
      return m * (a.debit - a.credit - (b.debit - b.credit));
    });
  };
  const q = useQuery({
    queryKey: ["owner-reports", from, to],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => {
      const [subs, pays, fin] = await Promise.all([
        db.from("subscription_history").select("amount,start_date").gte("start_date", from).lte("start_date", to),
        db.from("tenant_payments").select("amount,pay_date").gte("pay_date", from).lte("pay_date", to),
        db.from("owner_finance_entries").select("kind,amount,entry_date").gte("entry_date", from).lte("entry_date", to),
      ]);
      const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const invoiced = sum(subs.data as { amount: number }[]);
      const received = sum(pays.data as { amount: number }[]);
      const f = (fin.data ?? []) as { kind: string; amount: number }[];
      const salaries = sum(f.filter((r) => r.kind === "salary"));
      const expenses = sum(f.filter((r) => r.kind !== "salary"));
      const rows: Row[] = [
        { code: "101", name: "الصندوق والبنك", type: "asset", debit: received, credit: salaries + expenses },
        { code: "102", name: "ذمم الشركات المشتركة", type: "asset", debit: invoiced, credit: received },
        { code: "401", name: "إيرادات الاشتراكات", type: "revenue", debit: 0, credit: invoiced },
        { code: "501", name: "الرواتب", type: "expense", debit: salaries, credit: 0 },
        { code: "502", name: "المصروفات والدفعات", type: "expense", debit: expenses, credit: 0 },
      ];
      return { rows, invoiced, salaries, expenses };
    },
  });
  if (me && !me.isSuperAdmin) return <p className="text-muted-foreground">هذه الصفحة مخصصة لمدير النظام فقط.</p>;
  const rows = sortRows(q.data?.rows ?? []);
  const net = (q.data?.invoiced ?? 0) - (q.data?.salaries ?? 0) - (q.data?.expenses ?? 0);
  const bal = (r: Row) => r.debit - r.credit;
  const assets = rows.filter((r) => r.type === "asset");
  const totalAssets = assets.reduce((s, r) => s + bal(r), 0);

  const table = (title: string, cols: string[], body: (string | number)[][], foot?: (string | number)[]) => (
    <div className="print-area rounded-lg border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="no-print flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportCsv(title, cols.map((c, i) => ({ key: String(i), label: c })), body.map((r) => Object.fromEntries(r.map((v, i) => [String(i), v]))))}><Download className="size-4" />تصدير إلى إكسل</Button>
          <Button size="sm" onClick={printPage}><Printer className="size-4" />طباعة</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-secondary"><tr>{cols.map((c) => <th key={c} className="border px-2 py-2 text-right">{c}</th>)}</tr></thead>
          <tbody>{body.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="num border px-2 py-2 text-right">{v}</td>)}</tr>)}</tbody>
          {foot && <tfoot className="bg-muted font-bold"><tr>{foot.map((v, j) => <td key={j} className="num border px-2 py-2 text-right">{v}</td>)}</tr></tfoot>}
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="تقارير شركة البرمجيات" subtitle="محسوبة من فواتير الاشتراكات والمقبوضات والرواتب والمصروفات الداخلية" />
      <div className="no-print mb-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label className="text-xs">من تاريخ</Label><Input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">إلى تاريخ</Label><Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <Label className="text-xs">الترتيب</Label>
          <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="code-asc">الرمز — تصاعدي</option>
            <option value="code-desc">الرمز — تنازلي</option>
            <option value="name-asc">الاسم — أ ب ت</option>
            <option value="name-desc">الاسم — ت ب أ</option>
            <option value="debit-desc">مدين — الأكبر أولاً</option>
            <option value="debit-asc">مدين — الأصغر أولاً</option>
            <option value="credit-desc">دائن — الأكبر أولاً</option>
            <option value="credit-asc">دائن — الأصغر أولاً</option>
            <option value="balance-desc">الرصيد — الأكبر أولاً</option>
            <option value="balance-asc">الرصيد — الأصغر أولاً</option>
          </select>
        </div>
      </div>
      <Tabs defaultValue="tb">
        <TabsList className="no-print mb-4 h-auto flex-wrap">
          <TabsTrigger value="tb">ميزان المراجعة</TabsTrigger>
          <TabsTrigger value="is">قائمة الدخل</TabsTrigger>
          <TabsTrigger value="bs">الميزانية العمومية</TabsTrigger>
        </TabsList>
        <TabsContent value="tb">
          {table("ميزان المراجعة", ["الرمز", "الحساب", "مدين", "دائن", "الرصيد"],
            rows.map((r) => [r.code, r.name, fmtNum(r.debit), fmtNum(r.credit), fmtNum(bal(r))]),
            ["", "الإجمالي", fmtNum(rows.reduce((s, r) => s + r.debit, 0)), fmtNum(rows.reduce((s, r) => s + r.credit, 0)), ""])}
        </TabsContent>
        <TabsContent value="is">
          {table("قائمة الدخل", ["البند", "المبلغ"], [
            ["إيرادات الاشتراكات", fmtNum(q.data?.invoiced)],
            ["الرواتب", fmtNum(-(q.data?.salaries ?? 0))],
            ["المصروفات والدفعات", fmtNum(-(q.data?.expenses ?? 0))],
          ], [net >= 0 ? "صافي الربح" : "صافي الخسارة", fmtNum(net)])}
        </TabsContent>
        <TabsContent value="bs">
          {table("الميزانية العمومية", ["البند", "المبلغ"], [
            ...assets.map((r) => [r.name, fmtNum(bal(r))]),
            ["إجمالي الأصول", fmtNum(totalAssets)],
            ["حقوق الملكية — نتيجة الفترة", fmtNum(net)],
          ], ["إجمالي الخصوم وحقوق الملكية", fmtNum(net)])}
        </TabsContent>
      </Tabs>
    </div>
  );
}
