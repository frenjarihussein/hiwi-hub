import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Settings2 } from "lucide-react";
import { usePrefs, useSavePrefs, useExtra, useSaveExtra, topUsed, DEFAULT_CHARTS, type ChartPrefs } from "@/lib/prefs";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { db, scope } from "@/lib/db";
import { moduleEnabled, useMe } from "@/lib/session";
import { fmtNum, isProfitLoss } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { NAV, QUICK_ACTIONS } from "@/components/AppShell";
import { ArrowUpLeft } from "lucide-react";
import { useDueCount } from "@/components/ExtraReports";
import { useI18n } from "@/lib/i18n";
import { BackupButtons } from "@/components/BackupButtons";
import { SmartAlerts } from "@/components/SmartAlerts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "لوحة التحكم" }, { name: "description", content: "مؤشرات مالية وتنبيهات المخزون" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  const { lang } = useI18n();

  const stats = useQuery({
    queryKey: ["dashboard", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const [accounts, partners, products, projects, cheques, lines] = await Promise.all([
        scope(db.from("accounts").select("id"), me?.tenantId),
        scope(db.from("partners").select("id"), me?.tenantId),
        scope(db.from("products").select("id, name, unit, qty_on_hand, avg_cost, reorder_level"), me?.tenantId),
        scope(db.from("projects").select("id, contract_value, completion_pct"), me?.tenantId),
        scope(db.from("cheques").select("id, amount, status, direction"), me?.tenantId),
        scope(db.from("journal_lines").select("debit, credit, accounts(nature), journal_entries(exchange_rate, entry_date)"), me?.tenantId),
      ]);

      let revenue = 0;
      let expense = 0;
      const days = 90;
      const keys = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
      const rev: Record<string, number> = {};
      const exp: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lines.data ?? []).forEach((l: any) => {
        if (!isProfitLoss(l.accounts?.nature)) return;
        const rate = Number(l.journal_entries?.exchange_rate ?? 1) || 1;
        revenue += Number(l.credit) / rate;
        expense += Number(l.debit) / rate;
        const d = l.journal_entries?.entry_date as string | undefined;
        if (d) {
          rev[d] = (rev[d] ?? 0) + Number(l.credit) / rate;
          exp[d] = (exp[d] ?? 0) + Number(l.debit) / rate;
        }
      });

      const stockValue = (products.data ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, p: any) => s + Number(p.qty_on_hand) * Number(p.avg_cost),
        0,
      );
      const lowStock = (products.data ?? []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => Number(p.qty_on_hand) <= Number(p.reorder_level),
      ).length;
      const contracts = (projects.data ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, p: any) => s + Number(p.contract_value ?? 0),
        0,
      );
      const pendingCheques = (cheques.data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any) => c.status === "pending")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((s: number, c: any) => s + Number(c.amount), 0);

      return {
        accounts: accounts.data?.length ?? 0,
        partners: partners.data?.length ?? 0,
        products: products.data?.length ?? 0,
        projects: projects.data?.length ?? 0,
        revenue,
        expense,
        dates: keys,
        revSeries: keys.map((k) => rev[k] ?? 0),
        expSeries: keys.map((k) => exp[k] ?? 0),
        netSeries: keys.map((k) => (rev[k] ?? 0) - (exp[k] ?? 0)),
        profit: revenue - expense,
        stockValue,
        lowStock,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lowItems: (products.data ?? []).filter((p: any) => Number(p.reorder_level) > 0 && Number(p.qty_on_hand) <= Number(p.reorder_level) * 1.2)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => Number(a.qty_on_hand) / Number(a.reorder_level) - Number(b.qty_on_hand) / Number(b.reorder_level)),
        contracts,
        pendingCheques,
      };
    },
  });

  const s = stats.data;
  const prefs = usePrefs(me);
  const savePrefs = useSavePrefs(me);
  const [edit, setEdit] = useState(false);
  const cards: { key: string; label: string; value: string }[] = [
    { key: "revenue", label: "الإيرادات ($)", value: fmtNum(s?.revenue) },
    { key: "expense", label: "المصاريف ($)", value: fmtNum(s?.expense) },
    { key: "profit", label: "صافي النتيجة ($)", value: fmtNum(s?.profit) },
    { key: "stockValue", label: "قيمة المخزون ($)", value: fmtNum(s?.stockValue) },
    { key: "contracts", label: "إجمالي قيمة العقود ($)", value: fmtNum(s?.contracts) },
    { key: "cheques", label: "شيكات قيد التحصيل ($)", value: fmtNum(s?.pendingCheques) },
    { key: "accounts", label: "عدد الحسابات", value: String(s?.accounts ?? 0) },
    { key: "partners", label: "عدد الزبائن والموردين", value: String(s?.partners ?? 0) },
    { key: "products", label: "عدد المواد", value: String(s?.products ?? 0) },
    { key: "projects", label: "عدد المشاريع", value: String(s?.projects ?? 0) },
    { key: "lowStock", label: "مواد تحت حد الطلب", value: String(s?.lowStock ?? 0) },
  ];
  const links = NAV.filter((n) => !n.superOnly && n.to !== "/dashboard" && (!n.module || moduleEnabled(me, n.module)));
  const DEFAULT = ["link:/documents", "link:/pos", "link:/products", "link:/partners", "link:/journal", "link:/reports", "profit", "stockValue", "cheques", "lowItems"];
  const chosen = new Set(prefs.data?.dashboard ?? DEFAULT);
  function toggle(k: string) {
    const next = new Set(chosen);
    if (next.has(k)) next.delete(k); else next.add(k);
    savePrefs.mutate({ dashboard: [...next] });
  }
  const shownLinks = links.filter((l) => chosen.has("link:" + l.to));
  const shownCards = cards.filter((c) => chosen.has(c.key));
  const extra = useExtra(me);
  const saveExtra = useSaveExtra(me);
  const charts: ChartPrefs = { ...DEFAULT_CHARTS, ...(extra.data?.charts ?? {}) };
  const setCharts = (patch: Partial<ChartPrefs>) => saveExtra.mutate({ charts: { ...charts, ...patch } });
  const mostUsed = topUsed(extra.data, 6).map((to) => links.find((l) => l.to === to)).filter(Boolean) as typeof links;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <PageHeader title={lang === "en" ? `Welcome ${me?.fullName ?? ""}` : `أهلاً ${me?.fullName ?? ""}`} subtitle={(lang === "en" ? me?.tenantNameEn || me?.tenantName : me?.tenantName) ?? "يوسف سوفت"} />
        <Button variant="outline" onClick={() => setEdit(true)}><Settings2 className="size-4" />تخصيص الواجهة</Button>
      </div>
      {me?.tenantId && (me as any)?.isTenantAdmin !== false && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <span className="text-sm font-medium">تصدير / استيراد كل البيانات:</span>
          <BackupButtons tenantId={me.tenantId} name={me.tenantName ?? ""} />
        </div>
      )}
      <DueBanner />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {QUICK_ACTIONS.filter((a) => moduleEnabled(me, a.module) && !chosen.has("noquick:" + a.label)).map((a) => (
          <Link key={a.label} to={a.to} search={a.search} className="group relative flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-pop">
            <span className="grid size-11 place-items-center rounded-xl bg-muted text-foreground transition group-hover:bg-primary group-hover:text-primary-foreground"><a.icon className="size-5" /></span>
            <span>
              <span className="block text-base font-semibold">{a.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{a.desc}</span>
            </span>
            <ArrowUpLeft className="absolute end-4 top-4 size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CHARTS.filter((c) => charts.keys.includes(c.key)).map((c) => {
          const series = (s?.[c.series] as number[] | undefined) ?? [];
          const data = series.slice(-charts.days).map((v, i, arr) => ({ d: (s?.dates ?? []).slice(-arr.length)[i]?.slice(5) ?? "", v }));
          const sum = data.reduce((a, x) => a + x.v, 0);
          return (
            <div key={c.key} className="rounded-2xl border bg-card p-5 shadow-soft">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                <p className="text-[11px] text-muted-foreground">آخر {charts.days} يوماً</p>
              </div>
              <p className="num mt-1 text-2xl font-semibold tracking-tight">{fmtNum(sum)}</p>
              <div className={"mt-3 h-32 " + c.cls}>
                <MiniChart type={charts.type} data={data} />
              </div>
            </div>
          );
        })}
      </div>
      {me?.tenantId && <SalesPurchasesChart tenantId={me.tenantId} />}
      {mostUsed.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">الأكثر استخداماً</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {mostUsed.map((l) => (
              <Link key={"m" + l.to} to={l.to} className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-3 text-sm font-medium shadow-xs transition hover:border-foreground/15 hover:bg-accent">
                <l.icon className="size-4 shrink-0 text-muted-foreground" />
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}
      {shownLinks.length > 0 && <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">اختصاراتك</h2>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {shownLinks.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-3 text-sm font-medium shadow-xs transition hover:border-foreground/15 hover:bg-accent">
            <l.icon className="size-4 shrink-0 text-muted-foreground" />
            {l.label}
          </Link>
        ))}
      </div>
      {shownCards.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shownCards.map((c) => (
            <div key={c.key} className="rounded-xl border bg-card p-4 shadow-soft">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="num mt-2 text-2xl font-bold">{c.value}</p>
            </div>
          ))}
        </div>
      )}
      <SmartAlerts />
      {chosen.has("lowItems") && !!s?.lowItems.length && (
        <div className="mt-6 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold">تنبيه: مواد وصلت أو تقترب من حد إعادة الطلب</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-right">المادة</th><th className="p-2 text-right">الرصيد</th><th className="p-2 text-right">حد الطلب</th><th className="p-2 text-right">الحالة</th></tr></thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {s.lowItems.slice(0, 8).map((p: any) => {
                const under = Number(p.qty_on_hand) <= Number(p.reorder_level);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.name}</td>
                    <td className="num p-2">{fmtNum(p.qty_on_hand)} {p.unit}</td>
                    <td className="num p-2">{fmtNum(p.reorder_level)}</td>
                    <td className={under ? "p-2 font-semibold text-destructive" : "p-2 text-muted-foreground"}>{under ? "تحت الحد" : "يقترب من الحد"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>اختر ما يظهر في واجهتك</DialogTitle></DialogHeader>
          <p className="text-sm font-semibold">بطاقات الإنشاء السريع (فواتير وسندات)</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.filter((a) => moduleEnabled(me, a.module)).map((a) => (
              <label key={a.label} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!chosen.has("noquick:" + a.label)} onCheckedChange={() => toggle("noquick:" + a.label)} />{a.label}
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold">الاختصارات</p>
          <div className="grid grid-cols-2 gap-2">
            {links.map((l) => (
              <label key={l.to} className="flex items-center gap-2 text-sm">
                <Checkbox checked={chosen.has("link:" + l.to)} onCheckedChange={() => toggle("link:" + l.to)} />{l.label}
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold">الرسوم البيانية</p>
          <div className="grid grid-cols-2 gap-2">
            {CHARTS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={charts.keys.includes(c.key)} onCheckedChange={() => setCharts({ keys: charts.keys.includes(c.key) ? charts.keys.filter((k) => k !== c.key) : [...charts.keys, c.key] })} />{c.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">نوع الرسم</p>
          <div className="flex gap-2">
            {([["line", "خطي"], ["bar", "أعمدة"], ["area", "مساحة مملوءة"]] as const).map(([k, l]) => (
              <Button key={k} size="sm" variant={charts.type === k ? "default" : "outline"} onClick={() => setCharts({ type: k })}>{l}</Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">المدة الزمنية</p>
          <div className="flex gap-2">
            {([7, 14, 30, 90] as const).map((d) => (
              <Button key={d} size="sm" variant={charts.days === d ? "default" : "outline"} onClick={() => setCharts({ days: d })}>{d} يوماً</Button>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold">المؤشرات</p>
          <div className="grid grid-cols-2 gap-2">
            {[...cards, { key: "lowItems", label: "جدول نقص المخزون" }].map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={chosen.has(c.key)} onCheckedChange={() => toggle(c.key)} />{c.label}
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CHARTS = [
  { key: "revenue", label: "الإيرادات ($)", series: "revSeries", cls: "text-success" },
  { key: "expense", label: "المصاريف ($)", series: "expSeries", cls: "text-destructive" },
  { key: "net", label: "صافي التدفق ($)", series: "netSeries", cls: "text-highlight" },
] as const;

function MiniChart({ type, data }: { type: ChartPrefs["type"]; data: { d: string; v: number }[] }) {
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
      <XAxis dataKey="d" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={16} />
      <YAxis hide />
      <Tooltip formatter={(v: number) => fmtNum(v)} labelStyle={{ color: "var(--foreground)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
    </>
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      {type === "bar" ? (
        <BarChart data={data}>{axes}<Bar dataKey="v" fill="currentColor" radius={[3, 3, 0, 0]} /></BarChart>
      ) : type === "line" ? (
        <LineChart data={data}>{axes}<Line dataKey="v" stroke="currentColor" strokeWidth={2} dot={false} /></LineChart>
      ) : (
        <AreaChart data={data}>{axes}<Area dataKey="v" stroke="currentColor" fill="currentColor" fillOpacity={0.15} strokeWidth={2} /></AreaChart>
      )}
    </ResponsiveContainer>
  );
}

function DueBanner() {
  const due = useDueCount();
  if (!due.data) return null;
  return (
    <Link to="/reports" className="mb-4 block rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
      لديك {due.data} شيك مستحق أو متأخر خلال 7 أيام — اضغط لعرض الاستحقاقات من صفحة التقارير
    </Link>
  );
}

/** Monthly sales vs purchases (last 6 months, base currency). */
function SalesPurchasesChart({ tenantId }: { tenantId: string }) {
  const q = useQuery({
    queryKey: ["dash_sales_purchases", tenantId],
    queryFn: async () => {
      const from = new Date(); from.setMonth(from.getMonth() - 5, 1);
      const start = from.toISOString().slice(0, 10);
      const { data } = await db.from("documents").select("doc_type, doc_date, amount, exchange_rate, status")
        .eq("tenant_id", tenantId).in("doc_type", ["sale", "purchase"]).gte("doc_date", start);
      const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(from); d.setMonth(from.getMonth() + i); return d.toISOString().slice(0, 7); });
      const rows = months.map((m) => ({ m: m.slice(2).replace("-", "/"), key: m, sale: 0, purchase: 0 }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).forEach((d: any) => {
        if (d.status === "cancelled") return;
        const r = rows.find((x) => x.key === String(d.doc_date).slice(0, 7));
        if (r) r[d.doc_type as "sale" | "purchase"] += Number(d.amount) / (Number(d.exchange_rate) || 1);
      });
      return rows;
    },
  });
  const rows = q.data ?? [];
  return (
    <div className="mt-4 rounded-2xl border bg-card p-5 shadow-soft">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">المبيعات مقابل المشتريات — آخر 6 أشهر</p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-highlight" />مبيعات {fmtNum(rows.reduce((a, r) => a + r.sale, 0))}</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" />مشتريات {fmtNum(rows.reduce((a, r) => a + r.purchase, 0))}</span>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="m" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v: number) => fmtNum(v)} />
            <Bar dataKey="sale" name="مبيعات" fill="var(--highlight)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="purchase" name="مشتريات" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
