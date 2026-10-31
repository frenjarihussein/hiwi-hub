import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBaseCurrency } from "@/lib/currencies";
import { exportCsv, printPage } from "@/lib/export";
import { fmtDate, fmtNum } from "@/lib/format";
import { orderStats, revenueByCustomer, revenueByMonth, serviceStatement, summarizeServices, type SvcInfo, type SvcLine } from "@/lib/service-reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Services, their posted invoice lines and service orders for the active company. */
export function useServiceData() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["service_report_data", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const [svc, lines, orders] = await Promise.all([
        scope(db.from("products").select("id,name,sku,unit,standard_cost,service_source,is_group,item_type"), me?.tenantId).eq("item_type", "service").order("name"),
        scope(db.from("document_lines").select("product_id,qty,unit_price,line_discount,line_addition,documents!inner(id,doc_no,doc_date,doc_type,status,exchange_rate,partner_id,partners(name))"), me?.tenantId).range(0, 99999),
        scope(db.from("service_orders").select("id,product_id,status,created_at,sla_due_at,completed_at,actual_hours,employee_id,employees(name)"), me?.tenantId).range(0, 99999),
      ]);
      if (svc.error) throw svc.error;
      if (lines.error) throw lines.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const services = ((svc.data ?? []) as any[]).filter((p) => !p.is_group) as SvcInfo[];
      const ids = new Set(services.map((s) => s.id));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svcLines: SvcLine[] = ((lines.data ?? []) as any[])
        .filter((l) => ids.has(l.product_id) && l.documents && l.documents.status === "posted")
        .map((l) => ({ ...l, doc: { ...l.documents, partner_name: l.documents.partners?.name ?? null } }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { services, lines: svcLines, orders: (orders.data ?? []) as any[] };
    },
  });
}

type Col = { key: string; label: string };

function ReportBlock({ title, subtitle, columns, rows, footer }: { title: string; subtitle?: string; columns: Col[]; rows: Record<string, string>[]; footer?: Record<string, string> | undefined }) {
  return (
    <div className="print-area rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="no-print flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportCsv(title, columns, footer ? [...rows, footer] : rows)}><Download className="size-4" /> تصدير إلى إكسل</Button>
          <Button size="sm" onClick={printPage}><Printer className="size-4" /> طباعة</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-secondary">
            <tr>{columns.map((c) => <th key={c.key} className="border px-2 py-2 text-start">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={columns.length} className="border px-2 py-6 text-center text-muted-foreground">لا توجد حركات في هذه الفترة</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>{columns.map((c) => <td key={c.key} className="num border px-2 py-1.5 whitespace-nowrap">{r[c.key] ?? ""}</td>)}</tr>
            ))}
          </tbody>
          {footer && rows.length > 0 && (
            <tfoot className="bg-muted font-bold">
              <tr>{columns.map((c) => <td key={c.key} className="num border px-2 py-2">{footer[c.key] ?? ""}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

const yearStart = () => `${new Date().getFullYear()}-01-01`;
const todayIso = () => new Date().toISOString().slice(0, 10);

/** كشف خدمة: every posted sale/return/purchase line of one service, with running totals. */
export function ServiceStatement({ initialId }: { initialId?: string | undefined }) {
  const base = useBaseCurrency();
  const data = useServiceData();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayIso());
  const [id, setId] = useState(initialId ?? "");
  const services = data.data?.services ?? [];
  const svc = services.find((s) => s.id === id);
  const rows = id ? serviceStatement(data.data?.lines ?? [], id, from, to) : [];
  const sum = svc ? summarizeServices(data.data?.lines ?? [], [svc], from, to)[0] : undefined;
  return (
    <div className="space-y-4">
      <div className="no-print grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label className="text-xs">من تاريخ</Label><Input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">إلى تاريخ</Label><Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="sm:col-span-2">
          <Label className="text-xs">اختر الخدمة</Label>
          <select aria-label="اختر الخدمة" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">—</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.sku ? `${s.sku} - ` : ""}{s.name}</option>)}
          </select>
        </div>
      </div>
      {!id ? (
        <p className="rounded-lg border bg-card p-6 text-muted-foreground">{data.isLoading ? "جارٍ التحميل..." : services.length ? "اختر الخدمة" : "لا توجد خدمات معرّفة بعد"}</p>
      ) : (
        <>
          {sum && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="عدد مرات البيع" value={fmtNum(sum.times, 0)} />
              <Stat label={`الكمية المباعة${svc?.unit ? ` (${svc.unit})` : ""}`} value={fmtNum(sum.qty)} />
              <Stat label={`صافي الإيراد (${base})`} value={fmtNum(sum.revenue)} />
              <Stat label={`صافي الربح (${base})`} value={fmtNum(sum.profit)} />
            </div>
          )}
          <ReportBlock
            title={`كشف خدمة — ${svc?.name ?? ""}`}
            subtitle={`من ${fmtDate(from)} إلى ${fmtDate(to)} — المبالغ بـ ${base}`}
            columns={[
              { key: "date", label: "التاريخ" }, { key: "docNo", label: "رقم المستند" }, { key: "type", label: "النوع" }, { key: "partner", label: "الطرف" },
              { key: "qty", label: "الكمية" }, { key: "price", label: "السعر" }, { key: "revenue", label: "الإيراد" }, { key: "cost", label: "التكلفة (شراء)" },
              { key: "runningQty", label: "الكمية المباعة التراكمية" }, { key: "runningNet", label: "الصافي التراكمي" },
            ]}
            rows={rows.map((r) => ({
              date: fmtDate(r.date), docNo: r.docNo, type: r.type, partner: r.partner, qty: fmtNum(r.qty), price: fmtNum(r.price),
              revenue: r.revenue ? fmtNum(r.revenue) : "", cost: r.cost ? fmtNum(r.cost) : "", runningQty: fmtNum(r.runningQty), runningNet: fmtNum(r.runningNet),
            }))}
            footer={sum ? { date: "الإجمالي", qty: "", revenue: fmtNum(sum.revenue), cost: fmtNum(rows.reduce((s, r) => s + r.cost, 0)), runningQty: fmtNum(sum.qty), runningNet: fmtNum(rows.at(-1)?.runningNet ?? 0) } : undefined}
          />
        </>
      )}
    </div>
  );
}

/** تقارير الخدمات: by service, by customer, by month and service-order performance. */
export function ServiceReportsPanel({ from, to }: { from: string; to: string }) {
  const base = useBaseCurrency();
  const data = useServiceData();
  const lines = data.data?.lines ?? [];
  const services = data.data?.services ?? [];
  const sum = summarizeServices(lines, services, from, to).sort((a, b) => b.revenue - a.revenue);
  const active = sum.filter((r) => r.times || r.returns || r.cost);
  const tot = sum.reduce((a, r) => ({ rev: a.rev + r.revenue, cost: a.cost + r.cost, ret: a.ret + r.returns, times: a.times + r.times }), { rev: 0, cost: 0, ret: 0, times: 0 });
  const customers = revenueByCustomer(lines, from, to);
  const months = revenueByMonth(lines, from, to);
  const orders = data.data?.orders ?? [];
  const st = orderStats(orders, from, to);
  const period = `من ${fmtDate(from)} إلى ${fmtDate(to)} — المبالغ بـ ${base}`;
  const svcName = new Map(services.map((s) => [s.id, s.name]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const group = (key: (o: any) => string) => {
    const m = new Map<string, ReturnType<typeof orderStats>>();
    const keys = new Set(orders.map(key));
    keys.forEach((k) => m.set(k, orderStats(orders.filter((o) => key(o) === k), from, to)));
    return [...m.entries()].filter(([, s]) => s.total > 0).sort((a, b) => b[1].total - a[1].total);
  };
  const orderRow = (name: string, s: ReturnType<typeof orderStats>) => ({ name, total: fmtNum(s.total, 0), open: fmtNum(s.open, 0), done: fmtNum(s.done, 0), late: fmtNum(s.late, 0), onTime: s.done ? `${fmtNum(s.onTimeRate, 0)}%` : "—", hours: s.avgHours ? fmtNum(s.avgHours) : "—" });
  const orderCols = [{ key: "name", label: "" }, { key: "total", label: "عدد الأوامر" }, { key: "open", label: "مفتوحة" }, { key: "done", label: "مكتملة" }, { key: "late", label: "متأخرة" }, { key: "onTime", label: "الإنجاز بالموعد" }, { key: "hours", label: "متوسط الساعات الفعلية" }];

  if (data.isLoading) return <p className="rounded-lg border bg-card p-6 text-muted-foreground">جارٍ التحميل...</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="عدد مرات بيع الخدمات" value={fmtNum(tot.times, 0)} />
        <Stat label="صافي إيراد الخدمات" value={fmtNum(tot.rev)} />
        <Stat label="مرتجعات الخدمات" value={fmtNum(tot.ret)} />
        <Stat label="تكلفة الخدمات" value={fmtNum(tot.cost)} />
        <Stat label="ربح الخدمات" value={fmtNum(tot.rev - tot.cost)} />
      </div>
      <Tabs defaultValue="by-service">
        <TabsList className="no-print h-auto flex-wrap">
          <TabsTrigger value="by-service">حسب الخدمة</TabsTrigger>
          <TabsTrigger value="by-customer">حسب الزبون</TabsTrigger>
          <TabsTrigger value="by-month">حسب الشهر</TabsTrigger>
          <TabsTrigger value="orders">أداء أوامر الخدمة</TabsTrigger>
          <TabsTrigger value="idle">خدمات بلا مبيعات</TabsTrigger>
        </TabsList>
        <TabsContent value="by-service">
          <ReportBlock
            title="مبيعات وربحية الخدمات"
            subtitle={`${period} — التكلفة من مشتريات الخدمة، وإن لم توجد فالكمية × الكلفة المعيارية`}
            columns={[
              { key: "sku", label: "الرمز" }, { key: "name", label: "الخدمة" }, { key: "times", label: "مرات البيع" }, { key: "qty", label: "الكمية" },
              { key: "sales", label: "المبيعات" }, { key: "returns", label: "المرتجعات" }, { key: "revenue", label: "صافي الإيراد" }, { key: "avg", label: "متوسط السعر" },
              { key: "cost", label: "التكلفة" }, { key: "profit", label: "الربح" }, { key: "margin", label: "الهامش %" }, { key: "customers", label: "الزبائن" }, { key: "last", label: "آخر بيع" },
            ]}
            rows={active.map((r) => ({
              sku: r.sku, name: r.name, times: fmtNum(r.times, 0), qty: `${fmtNum(r.qty)} ${r.unit}`, sales: fmtNum(r.sales), returns: fmtNum(r.returns),
              revenue: fmtNum(r.revenue), avg: fmtNum(r.avgPrice), cost: fmtNum(r.cost), profit: fmtNum(r.profit), margin: fmtNum(r.margin), customers: fmtNum(r.customers, 0), last: r.lastDate ? fmtDate(r.lastDate) : "—",
            }))}
            footer={{ name: "الإجمالي", times: fmtNum(tot.times, 0), returns: fmtNum(tot.ret), revenue: fmtNum(tot.rev), cost: fmtNum(tot.cost), profit: fmtNum(tot.rev - tot.cost), margin: tot.rev ? fmtNum(((tot.rev - tot.cost) / tot.rev) * 100) : "" }}
          />
        </TabsContent>
        <TabsContent value="by-customer">
          <ReportBlock
            title="إيراد الخدمات حسب الزبون"
            subtitle={period}
            columns={[{ key: "name", label: "الزبون" }, { key: "invoices", label: "عدد الفواتير" }, { key: "services", label: "عدد الخدمات المختلفة" }, { key: "revenue", label: "صافي الإيراد" }, { key: "share", label: "النسبة من الإجمالي" }]}
            rows={customers.map((c) => ({ name: c.name, invoices: fmtNum(c.invoices, 0), services: fmtNum(c.services, 0), revenue: fmtNum(c.revenue), share: tot.rev ? `${fmtNum((c.revenue / tot.rev) * 100)}%` : "—" }))}
            footer={{ name: "الإجمالي", revenue: fmtNum(customers.reduce((s, c) => s + c.revenue, 0)) }}
          />
        </TabsContent>
        <TabsContent value="by-month">
          <ReportBlock
            title="إيراد الخدمات الشهري"
            subtitle={period}
            columns={[{ key: "month", label: "الشهر" }, { key: "sales", label: "المبيعات" }, { key: "returns", label: "المرتجعات" }, { key: "revenue", label: "صافي الإيراد" }, { key: "cost", label: "مشتريات الخدمات" }]}
            rows={months.map((m) => ({ month: m.month, sales: fmtNum(m.sales), returns: fmtNum(m.returns), revenue: fmtNum(m.revenue), cost: fmtNum(m.cost) }))}
            footer={{ month: "الإجمالي", sales: fmtNum(months.reduce((s, m) => s + m.sales, 0)), returns: fmtNum(months.reduce((s, m) => s + m.returns, 0)), revenue: fmtNum(months.reduce((s, m) => s + m.revenue, 0)), cost: fmtNum(months.reduce((s, m) => s + m.cost, 0)) }}
          />
        </TabsContent>
        <TabsContent value="orders" className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="أوامر الخدمة" value={fmtNum(st.total, 0)} />
            <Stat label="مفتوحة" value={fmtNum(st.open, 0)} />
            <Stat label="متأخرة عن الالتزام" value={fmtNum(st.late, 0)} />
            <Stat label="الإنجاز بالموعد" value={st.done ? `${fmtNum(st.onTimeRate, 0)}%` : "—"} />
            <Stat label="متوسط الساعات الفعلية" value={st.avgHours ? fmtNum(st.avgHours) : "—"} />
          </div>
          <ReportBlock title="أوامر الخدمة حسب الخدمة" subtitle={`أوامر أُنشئت من ${fmtDate(from)} إلى ${fmtDate(to)}`} columns={orderCols.map((c) => (c.key === "name" ? { ...c, label: "الخدمة" } : c))} rows={group((o) => String(o.product_id ?? "")).map(([k, s]) => orderRow(svcName.get(k) ?? "—", s))} />
          <ReportBlock title="أوامر الخدمة حسب الفني" subtitle={`أوامر أُنشئت من ${fmtDate(from)} إلى ${fmtDate(to)}`} columns={orderCols.map((c) => (c.key === "name" ? { ...c, label: "الفني / الموظف" } : c))} rows={group((o) => String(o.employees?.name ?? "بدون فني")).map(([k, s]) => orderRow(k, s))} />
        </TabsContent>
        <TabsContent value="idle">
          <ReportBlock
            title="خدمات لم تُبع في الفترة"
            subtitle={`من ${fmtDate(from)} إلى ${fmtDate(to)}`}
            columns={[{ key: "sku", label: "الرمز" }, { key: "name", label: "الخدمة" }, { key: "unit", label: "الوحدة" }]}
            rows={sum.filter((r) => !r.times).map((r) => ({ sku: r.sku, name: r.name, unit: r.unit }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
