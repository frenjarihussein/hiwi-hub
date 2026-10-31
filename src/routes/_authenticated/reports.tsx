import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useBaseCurrency, useCurrencies } from "@/lib/currencies";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { exportCsv, printPage } from "@/lib/export";
import { fmtDate, fmtNum } from "@/lib/format";
import { lineOriginal } from "@/lib/line-currency";
import { PageHeader } from "@/components/PageHeader";
import { LocalEstimateBanner } from "@/components/LocalEstimateBanner";
import { PrintBrand } from "@/components/PrintBrand";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Printer } from "lucide-react";
import { StockValuationReport } from "@/components/StockValuationReport";
import { ServiceReportsPanel } from "@/components/ServiceReports";
import { useFx, ReportFxContext, CashFlowStatement, FinalAccounts, FinancialPosition, IncomeStatement, ManufacturingCostStatement } from "@/components/FinancialStatements";
import { AgingReport, DueAlertsReport, ProjectProfitReport } from "@/components/ExtraReports";

const TAB_LABELS: Record<string, string> = {
  tb: "ميزان المراجعة", final: "الحسابات الختامية", is: "قائمة الدخل", bs: "قائمة المركز المالي", mfg: "قائمة التكاليف الصناعية",
  cf: "التدفقات النقدية", pp: "ربحية المشاريع", aging: "أعمار الذمم", due: "الاستحقاقات", stock: "بضاعة المستودعات", svc: "تقارير الخدمات",
};

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s["tab"] === "string" ? { tab: s["tab"] } : {}),
  head: () => ({
    meta: [
      { title: "التقارير المالية | يوسف سوفت" },
      { name: "description", content: "ميزان المراجعة وقائمة الدخل وربحية المشاريع وأعمار الذمم وتنبيهات الاستحقاق" },
      { property: "og:title", content: "التقارير المالية | يوسف سوفت" },
      { property: "og:description", content: "تقارير مالية لحظية وربحية المشاريع وأعمار الذمم" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = { id?: string; currency?: string | null; code: string; name: string; nature: string; debit: number; credit: number; balance: number; orig?: Record<string, number> };

function useLedger(from: string, to: string) {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["ledger", me?.tenantId, me?.isAuditor, from, to],
    enabled: !!me,
    refetchInterval: 5000,
    refetchOnWindowFocus: "always",
    staleTime: 0,
    queryFn: async (): Promise<Row[]> => {
      let q = db
        .from("journal_lines")
        .select(`debit, credit, line_currency, fc_amount, accounts(id,code,name,nature,currency), ${me?.isAuditor ? "journal_entries!inner" : "journal_entries"}(entry_date,currency,exchange_rate,audited)`);
      if (me?.isAuditor) q = q.eq("journal_entries.audited", true);
      if (me?.tenantId) q = q.eq("tenant_id", me.tenantId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, Row>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).forEach((l: any) => {
        const a = l.accounts;
        if (!a) return;
        const d = String(l.journal_entries?.entry_date ?? "");
        if (d && (d < from || d > to)) return;
        const rate = Number(l.journal_entries?.exchange_rate ?? 1) || 1;
        const key = a.code;
        const row: Row = map.get(key) ?? { id: a.id, currency: a.currency, code: a.code, name: a.name, nature: a.nature, debit: 0, credit: 0, balance: 0 };
        row.debit += Number(l.debit) / rate;
        row.credit += Number(l.credit) / rate;
        row.balance = row.debit - row.credit;
        // Original-currency balance per currency (line currency wins over the entry currency).
        const o = lineOriginal(l, l.journal_entries?.currency);
        if (o.cur) { row.orig = row.orig ?? {}; row.orig[o.cur] = (row.orig[o.cur] ?? 0) + o.amount; }
        map.set(key, row);
      });
      return [...map.values()].sort((x, y) => x.code.localeCompare(y.code));
    },
  });
}

function ReportTable({ title, rows, showBoth, fxDetail }: { title: string; rows: Row[]; showBoth?: boolean; fxDetail?: boolean }) {
  const fx = useFx();
  const base = useBaseCurrency();
  const curList = useCurrencies().data ?? [];
  const curSym = (c: string) => curList.find((x) => x.code === c)?.symbol || c;
  const [detail, setDetail] = useState(true);
  const showDetail = !!fxDetail && detail;
  const origText = (r: Row) => Object.entries(r.orig ?? {}).filter(([c, v]) => c !== base && Math.abs(v) > 0.005).map(([c, v]) => `${fmtNum(v)} ${curSym(c)}`).join(" · ") || "—";
  const fxTotals: Record<string, number> = {};
  rows.forEach((r) => Object.entries(r.orig ?? {}).forEach(([c, v]) => { if (c !== base) fxTotals[c] = (fxTotals[c] ?? 0) + v; }));
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const totalBalD = rows.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0);
  const totalBalC = rows.reduce((s, r) => s + (r.balance < 0 ? -r.balance : 0), 0);
  const byCur: Record<string, { d: number; c: number; bd: number; bc: number }> = {};
  rows.forEach((r) => {
    const k = r.currency || base;
    const g = (byCur[k] ??= { d: 0, c: 0, bd: 0, bc: 0 });
    g.d += r.debit; g.c += r.credit;
    if (r.balance > 0) g.bd += r.balance; else g.bc -= r.balance;
  });
  return (
    <div className="print-area rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <div className="no-print flex gap-2">
          {fxDetail && (
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} />
              تفصيل العملات الأجنبية
            </label>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportCsv(
                title,
                [
                  { key: "code", label: "الرمز" },
                  { key: "name", label: "الحساب" },
                  { key: "debit", label: "مدين" },
                  { key: "credit", label: "دائن" },
                  { key: "currency", label: "العملة" },
                  { key: "bd", label: "رصيد مدين" },
                  { key: "bc", label: "رصيد دائن" },
                  ...(showDetail ? [{ key: "orig", label: "الرصيد بالعملات الأجنبية" }] : []),
                ],
                rows.map((r) => ({
                  code: r.code,
                  name: r.name,
                  debit: fmtNum(r.debit),
                  credit: fmtNum(r.credit),
                  currency: r.currency || base,
                  bd: r.balance > 0 ? fmtNum(r.balance) : "",
                  bc: r.balance < 0 ? fmtNum(-r.balance) : "",
                  orig: origText(r),
                })),
              )
            }
          >
            <Download className="size-4" />
            تصدير إلى إكسل
          </Button>
          <Button size="sm" onClick={printPage}>
            <Printer className="size-4" />
            طباعة
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="border px-2 py-2 text-right">الرمز</th>
              <th className="border px-2 py-2 text-right">الحساب</th>
              <th className="border px-2 py-2 text-right">العملة</th>
              {showBoth && <th className="border px-2 py-2 text-right">مجموع مدين ({fx.symbol})</th>}
              {showBoth && <th className="border px-2 py-2 text-right">مجموع دائن ({fx.symbol})</th>}
              <th className="border px-2 py-2 text-right">رصيد مدين ({fx.symbol})</th>
              <th className="border px-2 py-2 text-right">رصيد دائن ({fx.symbol})</th>
              {showDetail && <th className="border px-2 py-2 text-right">الرصيد بعملته الأصلية</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="border px-2 py-6 text-center text-muted-foreground">
                  لا توجد بيانات
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.code} className="hover:bg-muted/40">
                <td className="border px-2 py-2">{r.code}</td>
                <td className="border px-2 py-2">
                  {r.id ? <Link to="/ledgers" search={{ tab: "account", id: r.id } as never} className="text-primary underline-offset-2 hover:underline">{r.name}</Link> : r.name}
                </td>
                <td className="border px-2 py-2">{r.currency || base}</td>
                {showBoth && <td className="num border px-2 py-2">{fmtNum(r.debit)}</td>}
                {showBoth && <td className="num border px-2 py-2">{fmtNum(r.credit)}</td>}
                <td className="num border px-2 py-2">{r.balance > 0.005 ? fmtNum(r.balance) : ""}</td>
                <td className="num border px-2 py-2">{r.balance < -0.005 ? fmtNum(-r.balance) : ""}</td>
                {showDetail && <td className="border px-2 py-2 text-xs">{origText(r)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted font-bold">
            {Object.entries(byCur).length > 1 && Object.entries(byCur).map(([c, v]) => (
              <tr key={c} className="font-medium">
                <td className="border px-2 py-2 text-left" colSpan={3}>حسابات {curSym(c)} (معادل {fx.symbol})</td>
                {showBoth && <td className="num border px-2 py-2 whitespace-nowrap">{fmtNum(v.d)} {fx.symbol}</td>}
                {showBoth && <td className="num border px-2 py-2 whitespace-nowrap">{fmtNum(v.c)} {fx.symbol}</td>}
                <td className="num border px-2 py-2 whitespace-nowrap">{fmtNum(v.bd)} {fx.symbol}</td>
                <td className="num border px-2 py-2 whitespace-nowrap">{fmtNum(v.bc)} {fx.symbol}</td>
                {showDetail && <td className="border px-2 py-2 text-xs">{c !== base && fxTotals[c] !== undefined ? <span className="whitespace-nowrap"><span dir="ltr" className="num">{fmtNum(fxTotals[c]!)}</span> {curSym(c)}</span> : ""}</td>}
              </tr>
            ))}
            <tr>
              <td className="border px-2 py-2 text-left" colSpan={3}>
                الإجمالي
              </td>
              {showBoth && <td className="num border px-2 py-2 whitespace-nowrap">{fmtNum(totalDebit)} {fx.symbol}</td>}
              {showBoth && <td className="num border px-2 py-2 whitespace-nowrap">{fmtNum(totalCredit)} {fx.symbol}</td>}
              <td className="num border px-2 py-2 whitespace-nowrap">{fmtNum(totalBalD)} {fx.symbol}</td>
              <td className="num border px-2 py-2 whitespace-nowrap">{fmtNum(totalBalC)} {fx.symbol}</td>
              {showDetail && <td className="border px-2 py-2 text-xs">{Object.entries(fxTotals).length ? Object.entries(fxTotals).map(([c, v]) => <div key={c} className="whitespace-nowrap"><span dir="ltr" className="num">{fmtNum(v)}</span> {curSym(c)}</div>) : "—"}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ReportsPage() {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState("code-asc");
  const ledgerRaw = useLedger(from, to);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = search.tab ?? "tb";
  const { data: me } = useMe();
  const curList = useCurrencies();
  const [fxCode, setFxCode] = useState("USD");
  const [fxRate, setFxRate] = useState("1");
  const [reval, setReval] = useState(false);
  // Latest rate of every currency on or before the period end (units per 1 USD).
  const rates = useQuery({
    queryKey: ["fx_rates_asof", me?.tenantId, to],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data } = await db.from("exchange_rates").select("currency,rate_to_usd,rate_date").eq("tenant_id", me!.tenantId!).lte("rate_date", to).order("rate_date", { ascending: false });
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: { currency: string; rate_to_usd: number }) => { if (m[r.currency] === undefined) m[r.currency] = Number(r.rate_to_usd); });
      return m;
    },
  });
  useEffect(() => { setFxRate(fxCode === "USD" ? "1" : String(rates.data?.[fxCode] ?? "")); }, [fxCode, rates.data]);
  const fxSym = curList.data?.find((c) => c.code === fxCode)?.symbol || fxCode;
  const fxValue = { code: fxCode, symbol: fxSym, rate: Number(fxRate) > 0 ? Number(fxRate) : 1, reval, rates: rates.data ?? {} };
  const noRates = Object.keys(rates.data ?? {}).length === 0;
  // Trial balance follows the selected display currency too.
  const ledger = { ...ledgerRaw, data: (ledgerRaw.data ?? []).map((r) => ({ ...r, debit: r.debit * fxValue.rate, credit: r.credit * fxValue.rate, balance: r.balance * fxValue.rate })) };
  const rows = (() => {
    const rs = ledger.data ?? [];
    const [key, dir] = sort.split("-");
    const m = dir === "desc" ? -1 : 1;
    return [...rs].sort((a, b) => {
      if (key === "code") return m * a.code.localeCompare(b.code);
      if (key === "name") return m * a.name.localeCompare(b.name, "ar");
      if (key === "debit") return m * (a.debit - b.debit);
      if (key === "credit") return m * (a.credit - b.credit);
      return m * (a.balance - b.balance);
    });
  })();

  return (
    <div>
      <PageHeader
        title="التقارير المالية"
        subtitle="تُحتسب الأرصدة من قيود اليومية بسعر صرف كل قيد، وتُعرض بالعملة وسعر الصرف المختارين مع إمكانية إعادة التقييم"
      />
      <LocalEstimateBanner />
      <div className="no-print mb-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">عملة العرض</Label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={fxCode} onChange={(e) => setFxCode(e.target.value)}>
              {[...new Set(["USD", ...(curList.data ?? []).map((c) => c.code)])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">سعر الصرف (لكل 1$)</Label>
            <Input type="number" className="mt-1" value={fxRate} disabled={fxCode === "USD"} onChange={(e) => setFxRate(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
          <Switch checked={reval} onCheckedChange={setReval} />
          إعادة تقييم الحسابات بالعملات الأجنبية بسعر صرف تاريخ نهاية الفترة وحساب فروقات الصرف (في الحسابات الختامية والقوائم)
        </label>
        {(noRates || (fxCode !== "USD" && !(Number(fxRate) > 0))) && (
          <p className="text-xs text-destructive sm:col-span-2 lg:col-span-4">
            لا توجد أسعار صرف محفوظة حتى تاريخ نهاية الفترة — أضف أسعار الصرف من صفحة «أسعار الصرف» (أو اكتب السعر يدوياً) لكي تُحوَّل التقارير وتظهر الفروقات.
          </p>
        )}
      </div>
      <ReportFxContext.Provider value={fxValue}>
      <PrintBrand title={TAB_LABELS[tab] ?? "تقرير مالي"} period={`من ${fmtDate(from)} إلى ${fmtDate(to)}`} currency={fxCode === "USD" ? fxCode : `${fxCode} (سعر الصرف ${fxValue.rate})`}>
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v }, replace: true })}>
        <TabsList className="no-print mb-4 h-auto flex-wrap">
          <TabsTrigger value="tb">ميزان المراجعة</TabsTrigger>
          <TabsTrigger value="final">الحسابات الختامية</TabsTrigger>
          <TabsTrigger value="is">قائمة الدخل</TabsTrigger>
          <TabsTrigger value="bs">قائمة المركز المالي</TabsTrigger>
          <TabsTrigger value="mfg">قائمة التكاليف الصناعية</TabsTrigger>
          <TabsTrigger value="cf">التدفقات النقدية</TabsTrigger>
          <TabsTrigger value="pp">ربحية المشاريع</TabsTrigger>
          <TabsTrigger value="aging">أعمار الذمم</TabsTrigger>
          <TabsTrigger value="due">الاستحقاقات</TabsTrigger>
          <TabsTrigger value="stock">بضاعة المستودعات</TabsTrigger>
          <TabsTrigger value="svc">تقارير الخدمات</TabsTrigger>
        </TabsList>

        <TabsContent value="tb">
          <ReportTable title="ميزان المراجعة" rows={rows} showBoth fxDetail />
        </TabsContent>
        <TabsContent value="final"><FinalAccounts from={from} to={to} /></TabsContent>
        <TabsContent value="is"><IncomeStatement from={from} to={to} /></TabsContent>
        <TabsContent value="bs"><FinancialPosition from={from} to={to} /></TabsContent>
        <TabsContent value="mfg"><ManufacturingCostStatement from={from} to={to} /></TabsContent>
        <TabsContent value="cf"><CashFlowStatement from={from} to={to} /></TabsContent>
        <TabsContent value="pp">
          <ProjectProfitReport from={from} to={to} />
        </TabsContent>
        <TabsContent value="aging">
          <AgingReport />
          <div className="mt-6"><AgingReport kind="supplier" /></div>
        </TabsContent>
        <TabsContent value="due">
          <DueAlertsReport />
        </TabsContent>
        <TabsContent value="stock">
          <StockValuationReport />
        </TabsContent>
        <TabsContent value="svc">
          <ServiceReportsPanel from={from} to={to} />
        </TabsContent>
      </Tabs>
      </PrintBrand>
      </ReportFxContext.Provider>
    </div>
  );
}
