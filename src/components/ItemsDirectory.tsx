import { usePriceNames } from "@/lib/prices";
import { Link } from "@tanstack/react-router";
import { CrudPage, type CrudField } from "@/components/CrudPage";
import { Button } from "@/components/ui/button";
import { fmtNum } from "@/lib/format";
import { Barcode, FileBarChart, Printer, ScrollText } from "lucide-react";
import { useState } from "react";
import { ProductSalesReport } from "@/components/ProductSalesReport";
import { EntityTree } from "@/components/EntityTree";
import { unitOptions, useUnits } from "@/lib/units";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepricingCard } from "@/components/RepricingCard";
import { can, useMe } from "@/lib/session";
import { generateEan13, printStickers } from "@/lib/barcode";
import { useBaseCurrency, useCurrencies } from "@/lib/currencies";

/** Pricing rule per price level: fixed value or cost/purchase price + percent, optionally auto-updated. */
function ruleFields(k: string, label: string) {
  const on = (f: Record<string, unknown>) => !!f[`price_rules.${k}_mode`] && f[`price_rules.${k}_mode`] !== "fixed";
  return [
    {
      key: `price_rules.${k}_mode`,
      label: `طريقة ${label}`,
      type: "select" as const,
      hideInTable: true,
      defaultValue: "fixed",
      options: [
        { value: "fixed", label: "قيمة ثابتة" },
        { value: "cost", label: "الكلفة + نسبة" },
        { value: "purchase", label: "سعر الشراء + نسبة" },
      ],
    },
    { key: `price_rules.${k}_pct`, label: `نسبة ${label} %`, type: "number" as const, hideInTable: true, showIf: on },
    { key: `price_rules.${k}_auto`, label: `تحديث ${label} تلقائياً عند تغيّر الكلفة/سعر الشراء`, type: "checkbox" as const, hideInTable: true, showIf: on },
  ];
}

/** One directory screen for either stock items or services; each kind has its own tree. */
export function ItemsDirectory({ kind }: { kind: "stock" | "service" }) {
  const svc = kind === "service";
  const noun = svc ? "الخدمات" : "المواد";
  const priceNames = usePriceNames(kind);
  const units = useUnits(kind);
  const curs = useCurrencies(true).data;
  const baseCur = useBaseCurrency();
  const qc = useQueryClient();
  const { data: me } = useMe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [report, setReport] = useState<any>(null);
  return (
    <>
    <ProductSalesReport product={report} onClose={() => setReport(null)} />
    {svc && (
      <div className="mb-3 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><Link to="/recipes" search={{ kind: "service" }}>مستلزمات الخدمات (مواد تُسحب من المستودع عند البيع)</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/service-ops">أوامر الخدمة والعقود والاشتراكات</Link></Button>
      </div>
    )}
    <Tabs defaultValue="tree" className="w-full">
    <TabsList className="mb-4">
      <TabsTrigger value="tree">شجرة {noun}</TabsTrigger>
      <TabsTrigger value="list">بطاقات {noun}</TabsTrigger>
      {!svc && <TabsTrigger value="reprice">تسعير جديد</TabsTrigger>}
    </TabsList>
    {!svc && <TabsContent value="reprice"><RepricingCard editable={can(me, "products", "edit")} /></TabsContent>}
    <TabsContent value="tree" forceMount className="data-[state=inactive]:hidden">
     <EntityTree large table="products" module="products" rowFilter={{ key: "item_type", values: [kind] }} title={svc ? "شجرة الخدمات (تصنيفات الخدمات والخدمات)" : "شجرة المواد المستودعية (التصنيفات والمواد)"} codeField="sku" buildInsert={() => ({ unit: svc ? "خدمة" : "قطعة", is_active: true, item_type: kind })} />
    </TabsContent>
    <TabsContent value="list" forceMount className="data-[state=inactive]:hidden">
    <CrudPage
      wideForm
      table="products"
      module="products"
      rowFilter={{ key: "item_type", value: kind }}
      title={svc ? "بطاقة خدمة" : "بطاقة مادة"}
      subtitle={svc ? "الخدمات لا ترتبط بمستودع؛ تُربط بحساب من دليل الحسابات أو بمركز كلفة. اضغط أيقونة التقرير لعرض مبيعاتها وفواتيرها" : "التكلفة الوسطية المرجّحة وآخر سعر شراء تُحتسب آلياً من حركات المخزون. البطاقات ذات الحركات لا تُحذف بل تُجمّد"}
      orderBy="name"
      ascending
      stats={(rows) => svc ? [
        { label: "عدد الخدمات", value: rows.filter((r) => !r.is_group).length, tone: "success" },
        { label: "مولدة داخلياً", value: rows.filter((r) => !r.is_group && r.service_source !== "purchased").length, tone: "warning" },
        { label: "مشتراة", value: rows.filter((r) => !r.is_group && r.service_source === "purchased").length, tone: "danger" },
      ] : [
        { label: "قيمة المخزون (بالتكلفة)", value: fmtNum(rows.reduce((a, r) => a + Number(r.qty_on_hand || 0) * Number(r.avg_cost || 0), 0)), tone: "success" },
        { label: "مواد تحت حد الطلب", value: rows.filter((r) => Number(r.reorder_level) > 0 && Number(r.qty_on_hand) <= Number(r.reorder_level)).length, tone: "warning" },
        { label: "مواد رصيدها صفر", value: rows.filter((r) => Number(r.qty_on_hand) <= 0).length, tone: "danger" },
      ]}
      extraRowAction={(row) => (
        <>
          <Button size="icon" variant="ghost" title={svc ? "تقرير مبيعات ومشتريات الخدمة" : "تقرير مبيعات المادة"} onClick={() => setReport(row)}>
            <FileBarChart className="size-4" />
          </Button>
          <Button asChild size="icon" variant="ghost" title={svc ? "حركة الخدمة" : "أستاذ المادة"}>
            <Link to="/ledgers" search={{ tab: "product", id: row.id }}>
              <ScrollText className="size-4" />
            </Link>
          </Button>
          <Button size="icon" variant="ghost" title="توليد باركود" disabled={!!row.barcode} onClick={async () => {
            const { error } = await db.from("products").update({ barcode: generateEan13() }).eq("id", row.id);
            if (error) toast.error(error.message); else { toast.success("تم توليد الباركود"); qc.invalidateQueries({ queryKey: ["products"] }); }
          }}>
            <Barcode className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="طباعة ملصقات" onClick={() => {
            const n = Number(window.prompt("عدد الملصقات", "10"));
            if (n > 0) printStickers(row, n).catch((e) => toast.error(e.message));
          }}>
            <Printer className="size-4" />
          </Button>
        </>
      )}
      importColumns={[
        { key: "sku", label: "رمز المادة", required: true, example: "P-001" },
        { key: "barcode", label: "الباركود", example: "" },
        { key: "name", label: "اسم المادة", required: true, example: "إسمنت" },
        { key: "unit", label: "الوحدة", required: true, example: "طن" },
        { key: "category_name", label: "البطاقة الأب (التجميعية)", example: "مواد بناء" },
        { key: "warehouse_name", label: "المستودع", example: "المستودع الرئيسي" },
        { key: "reorder_level", label: "حد إعادة الطلب", type: "number", example: "0" },
      ]}
      importLookups={[
        { key: "category_name", target: "parent_id", table: "products", matchOn: ["name", "sku"] },
        { key: "warehouse_name", target: "default_warehouse_id", table: "warehouses", matchOn: ["name", "code"] },
      ]}
      fields={([
        { key: "is_group", label: svc ? "تصنيف خدمات (تجميعي)" : "بطاقة تجميعية", type: "checkbox", defaultValue: false },
        { key: "sku", label: svc ? "رمز الخدمة" : "رمز المادة", required: true },
        ...(svc ? [] : [{ key: "barcode", label: "الباركود", type: "barcode" as const }]),
        { key: "name", label: svc ? "اسم الخدمة" : "اسم المادة", required: true },
        { key: "name_en", label: "الاسم بالإنكليزية", hideInTable: true },
        { key: "unit", label: "الوحدة", type: "select", options: unitOptions(units.data, kind), defaultValue: svc ? "خدمة" : "قطعة", required: true },
        {
          key: "parent_id",
          label: svc ? "تصنيف الخدمة الأب" : "البطاقة الأب (التجميعية)",
          type: "ref",
          refTable: "products",
          refFilter: { key: "is_group", value: true },
          refExtraSelect: "item_type",
          refMatch: (_f: Record<string, unknown>, r: Record<string, unknown>) => (r["item_type"] ?? "stock") === kind,
        },
        ...(svc ? [
          { key: "service_source", label: "مصدر الخدمة", type: "select" as const, defaultValue: "internal", required: true, options: [{ value: "internal", label: "مولدة داخلياً" }, { value: "purchased", label: "مشتراة من طرف خارجي" }], render: (r: Record<string, unknown>) => (r["service_source"] === "purchased" ? "مشتراة" : "داخلية") },
          { key: "account_link_mode", label: "ربط الخدمة بدليل الحسابات", type: "select" as const, defaultValue: "none", hideInTable: true, fullRow: true, options: [{ value: "none", label: "لا يوجد ربط" }, { value: "existing", label: "نعم — لها حساب موجود، أختاره" }, { value: "new", label: "ليس لها حساب — أنشئ (مبيعات اسم الخدمة) تحت حساب أب" }] },
          { key: "service_account_id", label: "حساب الخدمة", type: "ref" as const, refTable: "accounts", refFilter: { key: "is_group", value: false }, hideInTable: true, showIf: (f: Record<string, unknown>) => f["account_link_mode"] === "existing" },
          { key: "service_account_parent_id", label: "الحساب الأب الذي يتفرع منه حساب المبيعات", type: "ref" as const, refTable: "accounts", hideInTable: true, showIf: (f: Record<string, unknown>) => f["account_link_mode"] === "new" },
          { key: "cost_center_link_mode", label: "ربط الخدمة بمركز كلفة", type: "select" as const, defaultValue: "none", hideInTable: true, fullRow: true, options: [{ value: "none", label: "لا يوجد ربط" }, { value: "existing", label: "نعم — لها مركز كلفة موجود، أختاره" }, { value: "new", label: "ليس لها مركز — أنشئ مركزاً باسم الخدمة تحت مركز أب" }] },
          { key: "cost_center_id", label: "مركز الكلفة", type: "ref" as const, refTable: "cost_centers", refFilter: { key: "is_group", value: false }, hideInTable: true, showIf: (f: Record<string, unknown>) => f["cost_center_link_mode"] === "existing" },
          { key: "cost_center_parent_id", label: "مركز الكلفة الأب", type: "ref" as const, refTable: "cost_centers", hideInTable: true, showIf: (f: Record<string, unknown>) => f["cost_center_link_mode"] === "new" },
          { key: "service_expense_account_id", label: "حساب مصروف/تكلفة الخدمة المشتراة (لفواتير الشراء)", type: "ref" as const, refTable: "accounts", refFilter: { key: "is_group", value: false }, hideInTable: true, fullRow: true, showIf: (f: Record<string, unknown>) => f["service_source"] === "purchased" },
          { key: "standard_cost", label: "التكلفة التقديرية للوحدة", type: "number" as const, defaultValue: 0, digits: 4, hideInTable: true },
          { key: "min_price", label: "الحد الأدنى لسعر البيع", type: "number" as const, defaultValue: 0, hideInTable: true },
          { key: "duration_hours", label: "مدة التنفيذ المتوقعة (ساعة)", type: "number" as const, defaultValue: 0, hideInTable: true },
          { key: "billing_period", label: "طبيعة الفوترة", type: "select" as const, defaultValue: "once", hideInTable: true, options: [{ value: "once", label: "مرة واحدة" }, { value: "monthly", label: "اشتراك شهري" }, { value: "quarterly", label: "اشتراك ربع سنوي" }, { value: "yearly", label: "اشتراك سنوي" }] },
          { key: "sla_hours", label: "مهلة الالتزام بالتنفيذ SLA (ساعة، 0 = بدون)", type: "number" as const, defaultValue: 0, hideInTable: true },
          { key: "warranty_days", label: "مدة الضمان بعد التنفيذ (يوم، 0 = بدون)", type: "number" as const, defaultValue: 0, hideInTable: true },
        ] : [
          { key: "default_warehouse_id", label: "المستودع", type: "ref" as const, refTable: "warehouses", refFilter: { key: "is_group", value: false } },
          { key: "reorder_level", label: "حد إعادة الطلب", type: "number" as const, defaultValue: 0 },
        ]),
        { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
        ...(svc ? [] : [{ key: "qty_on_hand", label: "الرصيد الحالي", type: "number" as const, hideInForm: true, render: (r: Record<string, unknown>) => fmtNum(r["qty_on_hand"] as number) }]),
        { key: "currency", label: "العملة", type: "select", defaultValue: baseCur, hideInTable: true, options: (curs ?? []).filter((x) => x.is_active !== false).map((x) => ({ value: x.code, label: `${x.name} (${x.code})` })) },
        { key: "purchase_price", label: svc ? "كلفة / سعر شراء الخدمة" : "سعر الشراء (أساسي)", type: "number", defaultValue: 0, digits: 4, showIf: (f: Record<string, unknown>) => !svc || f["service_source"] === "purchased" },
        ...(priceNames.length ? [] : [{ key: "sale_price", label: "سعر البيع الأساسي", type: "number", defaultValue: 0, digits: 4, showIf: (f: Record<string, unknown>) => !f["price_rules.sale_mode"] || f["price_rules.sale_mode"] === "fixed" } as CrudField,
        ...ruleFields("sale", "سعر البيع الأساسي")]),
        ...priceNames.flatMap((n, i) => [
          { key: `prices.${i + 1}`, label: `سعر ${n}`, type: "number" as const, hideInTable: true, fullRow: true, showIf: (f: Record<string, unknown>) => !f[`price_rules.${i + 1}_mode`] || f[`price_rules.${i + 1}_mode`] === "fixed" },
          ...ruleFields(String(i + 1), `سعر ${n}`),
        ]),
        ...(svc ? [] : [
          { key: "avg_cost", label: "التكلفة الوسطية", type: "number" as const, hideInForm: true, digits: 4 },
          { key: "last_purchase_price", label: "آخر سعر شراء", type: "number" as const, hideInForm: true, digits: 4 },
        ]),
      ] as CrudField[]).map((field) => {
        const f: CrudField = field;
        return ["unit", "currency", "barcode", "default_warehouse_id", "reorder_level", "purchase_price", "sale_price", "service_account_id", "account_link_mode", "service_account_parent_id", "cost_center_link_mode", "cost_center_id", "cost_center_parent_id", "service_source", "service_expense_account_id", "standard_cost", "min_price", "duration_hours", "billing_period", "sla_hours", "warranty_days"].includes(f.key) || f.key.startsWith("price_rules.") || f.key.startsWith("prices.") ? { ...f, showIf: (form: Record<string, unknown>) => !form["is_group"] && (!f.showIf || f.showIf(form)) } : f;
      })}
    />
    </TabsContent>
    </Tabs>
    </>
  );
}
