import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBaseCurrency } from "@/lib/currencies";
import { addBillingPeriod, isContractDue } from "@/lib/service-billing";
import { CrudPage } from "@/components/CrudPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/service-ops")({
  head: () => ({
    meta: [
      { title: "تشغيل الخدمات | يوسف سوفت" },
      { name: "description", content: "أوامر الخدمة وعقود الصيانة والاشتراكات وتقرير ربحية الخدمات." },
      { property: "og:title", content: "تشغيل الخدمات | يوسف سوفت" },
      { property: "og:description", content: "أوامر الخدمة وعقود الصيانة والاشتراكات وتقرير ربحية الخدمات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServiceOps,
});

const STATUS = [
  { value: "pending", label: "قيد الانتظار" },
  { value: "in_progress", label: "جاري التنفيذ" },
  { value: "awaiting", label: "بانتظار اعتماد العميل" },
  { value: "done", label: "مكتملة" },
];
const PERIODS = [
  { value: "monthly", label: "شهري" },
  { value: "quarterly", label: "ربع سنوي" },
  { value: "yearly", label: "سنوي" },
];
const svcRef = { refTable: "products", refFilter: { key: "item_type", value: "service" } };

function ServiceOps() {
  return (
    <div className="space-y-4">
      <PageHeader title="تشغيل الخدمات" subtitle="أوامر العمل تُنشأ تلقائياً عند ترحيل فاتورة مبيع فيها خدمة داخلية؛ اكتمال أمر مرتبط بعقد يخصم زيارة من رصيده" />
      <Button asChild variant="outline" size="sm"><Link to="/recipes" search={{ kind: "service" }}>مستلزمات الخدمة (المواد التي تُسحب من المستودع عند بيعها)</Link></Button>
      <Tabs defaultValue="orders">
        <TabsList className="mb-4">
          <TabsTrigger value="orders">أوامر الخدمة</TabsTrigger>
          <TabsTrigger value="contracts">العقود والاشتراكات</TabsTrigger>
          <TabsTrigger value="profit">ربحية الخدمات</TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          <CrudPage
            table="service_orders"
            module="products"
            title="أمر خدمة"
            orderBy="created_at"
            fields={[
              { key: "product_id", label: "الخدمة", type: "ref", ...svcRef, required: true },
              { key: "partner_id", label: "الزبون", type: "ref", refTable: "partners" },
              { key: "employee_id", label: "الفني / الموظف المنفذ", type: "ref", refTable: "employees" },
              { key: "project_id", label: "المشروع", type: "ref", refTable: "projects", hideInTable: true },
              { key: "contract_id", label: "العقد", type: "ref", refTable: "service_contracts", refLabel: "title", hideInTable: true },
              { key: "status", label: "الحالة", type: "select", options: STATUS, defaultValue: "pending" },
              { key: "due_date", label: "موعد التنفيذ", type: "date" },
              { key: "est_hours", label: "ساعات مقدرة", type: "number", defaultValue: 0 },
              { key: "actual_hours", label: "ساعات فعلية", type: "number", defaultValue: 0 },
              { key: "sla_due_at", label: "موعد الالتزام SLA", hideInForm: true, render: (r: Record<string, unknown>) => slaCell(r) },
              { key: "warranty_until", label: "ضمان حتى", type: "date" },
              { key: "commission_pct", label: "عمولة المنفذ %", type: "number", defaultValue: 0, hideInTable: true },
              { key: "notes", label: "ملاحظات", type: "textarea", hideInTable: true },
            ]}
            stats={(rows) => [
              { label: "مفتوحة", value: rows.filter((r) => r.status !== "done").length, tone: "warning" },
              { label: "مكتملة", value: rows.filter((r) => r.status === "done").length, tone: "success" },
              { label: "متأخرة عن الالتزام", value: rows.filter((r) => r.status !== "done" && r.sla_due_at && new Date(String(r.sla_due_at)) < new Date()).length, tone: "danger" },
              { label: "ضمانها سارٍ", value: rows.filter((r) => r.warranty_until && String(r.warranty_until) >= new Date().toISOString().slice(0, 10)).length },
              { label: "ساعات فعلية/مقدرة", value: `${fmtNum(rows.reduce((a, r) => a + Number(r.actual_hours || 0), 0))} / ${fmtNum(rows.reduce((a, r) => a + Number(r.est_hours || 0), 0))}` },
            ]}
          />
        </TabsContent>
        <TabsContent value="contracts">
          <BillDueContracts />
          <CrudPage
            table="service_contracts"
            module="products"
            title="عقد خدمة / اشتراك"
            orderBy="end_date"
            fields={[
              { key: "title", label: "عنوان العقد", required: true },
              { key: "partner_id", label: "الزبون", type: "ref", refTable: "partners", required: true },
              { key: "product_id", label: "الخدمة", type: "ref", ...svcRef },
              { key: "start_date", label: "البداية", type: "date", required: true },
              { key: "end_date", label: "النهاية", type: "date" },
              { key: "period", label: "دورية الفوترة", type: "select", options: PERIODS, defaultValue: "monthly" },
              { key: "next_billing_date", label: "تاريخ الفاتورة القادمة", type: "date" },
              { key: "price", label: "قيمة الدورة", type: "number", defaultValue: 0 },
              { key: "quota", label: "رصيد الزيارات/الجلسات", type: "number", defaultValue: 0 },
              { key: "used", label: "المستهلك", type: "number", defaultValue: 0 },
              { key: "status", label: "الحالة", type: "select", options: [{ value: "active", label: "فعال" }, { value: "ended", label: "منتهي" }, { value: "cancelled", label: "ملغى" }], defaultValue: "active" },
              { key: "notes", label: "ملاحظات", type: "textarea", hideInTable: true },
            ]}
            stats={(rows) => {
              const soon = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
              const today = new Date().toISOString().slice(0, 10);
              const active = rows.filter((r) => r.status === "active");
              return [
                { label: "عقود فعالة", value: active.length, tone: "success" },
                { label: "تنتهي خلال 15 يوماً", value: active.filter((r) => r.end_date && r.end_date >= today && r.end_date <= soon).length, tone: "warning" },
                { label: "معدل الإلغاء", value: rows.length ? `${fmtNum((rows.filter((r) => r.status === "cancelled").length / rows.length) * 100)}%` : "0%", tone: "danger" },
              ];
            }}
          />
        </TabsContent>
        <TabsContent value="profit"><Profitability /></TabsContent>
      </Tabs>
    </div>
  );
}

function slaCell(r: Record<string, unknown>): string {
  if (!r["sla_due_at"]) return "—";
  const due = new Date(String(r["sla_due_at"]));
  const late = r["status"] !== "done" && due < new Date();
  return `${due.toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}${late ? " ⚠ متأخر" : ""}`;
}

/** Creates draft sale invoices for active subscriptions whose billing date has arrived, then moves each to its next cycle. */
function BillDueContracts() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const baseCur = useBaseCurrency();
  const today = new Date().toISOString().slice(0, 10);
  const due = useQuery({
    queryKey: ["service_contracts_due", me?.tenantId, today],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(db.from("service_contracts").select("id,title,status,next_billing_date,end_date,product_id,partner_id,price,period"), me?.tenantId).eq("status", "active").lte("next_billing_date", today);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).filter((c) => isContractDue(c, today));
    },
  });
  const bill = useMutation({
    mutationFn: async () => {
      const list = due.data ?? [];
      if (!list.length) throw new Error("لا توجد اشتراكات مستحقة الفوترة اليوم");
      const partnerIds = [...new Set(list.map((c) => c.partner_id))];
      const { data: partners, error: pErr } = await db.from("partners").select("id,currency,account_id").in("id", partnerIds);
      if (pErr) throw pErr;
      let made = 0;
      const failed: string[] = [];
      for (const c of list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (partners ?? []).find((x: any) => x.id === c.partner_id) as any;
        const cur = p?.currency || baseCur;
        let rate = 1;
        if (cur !== baseCur) {
          const { data: r } = await scope(db.from("exchange_rates").select("rate_to_usd").eq("currency", cur), me?.tenantId).lte("rate_date", today).order("rate_date", { ascending: false }).limit(1);
          rate = Number(r?.[0]?.rate_to_usd) || 0;
          if (!rate) { failed.push(`${c.title}: لا يوجد سعر صرف لـ ${cur}`); continue; }
        }
        const { data: doc, error } = await db.from("documents").insert({
          tenant_id: me!.tenantId, doc_type: "sale", doc_date: today, currency: cur, exchange_rate: rate,
          partner_id: c.partner_id, partner_account_id: p?.account_id ?? null, amount: Number(c.price), payment_mode: "credit",
          notes: `فاتورة اشتراك: ${c.title} — دورة ${c.next_billing_date}`,
        } as never).select("id,doc_no").single();
        if (error) { failed.push(`${c.title}: ${error.message}`); continue; }
        const { error: lErr } = await db.from("document_lines").insert({ tenant_id: me!.tenantId, document_id: doc.id, product_id: c.product_id, qty: 1, unit_price: Number(c.price), description: c.title } as never);
        if (lErr) { await db.from("documents").delete().eq("id", doc.id); failed.push(`${c.title}: ${lErr.message}`); continue; }
        await db.from("service_contracts").update({ next_billing_date: addBillingPeriod(c.next_billing_date, c.period), last_document_id: doc.id } as never).eq("id", c.id);
        made++;
      }
      return { made, failed };
    },
    onSuccess: ({ made, failed }) => {
      if (made) toast.success(`تم إنشاء ${made} فاتورة اشتراك كمسودة — راجعها ورحّلها من شاشة الفواتير`);
      if (failed.length) toast.error(failed.join("\n"));
      qc.invalidateQueries({ queryKey: ["service_contracts_due"] });
      qc.invalidateQueries({ queryKey: ["service_contracts"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const n = due.data?.length ?? 0;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border bg-secondary/40 p-3 text-sm">
      <span>اشتراكات مستحقة الفوترة اليوم: <b>{n}</b></span>
      <Button size="sm" disabled={!n || bill.isPending} onClick={() => bill.mutate()}>{bill.isPending ? "جارٍ الإنشاء..." : "إصدار فواتير الدورات المستحقة"}</Button>
      <span className="text-xs text-muted-foreground">تُنشأ فاتورة مبيع مسودة لكل عقد فعال حلّ موعده، ثم يُنقل موعده للدورة التالية.</span>
    </div>
  );
}

function Profitability() {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ["service_profit", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [svc, lines] = await Promise.all([
        scope(db.from("products").select("id,name,standard_cost").eq("item_type", "service").eq("is_group", false), me?.tenantId),
        scope(db.from("document_lines").select("product_id,qty,unit_price,line_discount,line_addition,documents!inner(doc_type,status,partner_id)"), me?.tenantId),
      ]);
      if (svc.error) throw svc.error;
      if (lines.error) throw lines.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = new Map<string, any>((svc.data ?? []).map((p: any) => [p.id, { ...p, qty: 0, rev: 0, buy: 0, customers: new Set() }]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const l of (lines.data ?? []) as any[]) {
        const r = map.get(l.product_id);
        const d = l.documents;
        if (!r || d?.status !== "posted") continue;
        const v = Number(l.qty) * Number(l.unit_price) - Number(l.line_discount || 0) + Number(l.line_addition || 0);
        if (d.doc_type === "sale") { r.qty += Number(l.qty); r.rev += v; if (d.partner_id) r.customers.add(d.partner_id); }
        else if (d.doc_type === "sale_return") { r.qty -= Number(l.qty); r.rev -= v; }
        else if (d.doc_type === "purchase") r.buy += v;
        else if (d.doc_type === "purchase_return") r.buy -= v;
      }
      return [...map.values()].map((r) => {
        const cost = r.buy || r.qty * Number(r.standard_cost || 0);
        return { ...r, cost, profit: r.rev - cost, margin: r.rev ? ((r.rev - cost) / r.rev) * 100 : 0 };
      }).sort((a, b) => b.profit - a.profit);
    },
  });
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>{["الخدمة", "الكمية المباعة", "الإيراد", "التكلفة (شراء أو تقديرية)", "الربح", "الهامش %", "عدد الزبائن"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr>
        </thead>
        <tbody>
          {(q.data ?? []).map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.name}</td><td className="p-2">{fmtNum(r.qty)}</td><td className="p-2">{fmtNum(r.rev)}</td>
              <td className="p-2">{fmtNum(r.cost)}</td><td className="p-2">{fmtNum(r.profit)}</td><td className="p-2">{fmtNum(r.margin)}</td><td className="p-2">{r.customers.size}</td>
            </tr>
          ))}
          {q.data?.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">لا توجد خدمات بعد</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
