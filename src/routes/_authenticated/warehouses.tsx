import { createFileRoute, Link } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { EntityTree } from "@/components/EntityTree";
import { StockValuationReport } from "@/components/StockValuationReport";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText } from "lucide-react";
import { today } from "@/lib/format";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_authenticated/warehouses")({ component: WarehousesPage, head: () => pageHead("المستودعات", "شجرة المستودعات وتصنيفاتها وحساباتها المرتبطة وحركات المواد وتقييم المخزون في يوسف سوفت.") });

function WarehousesPage() {
  return (
    <Tabs defaultValue="tree">
      <TabsList className="mb-4 flex-wrap">
        <TabsTrigger value="tree">شجرة المستودعات والبطاقات</TabsTrigger>
        <TabsTrigger value="moves">أرصدة المستودعات وحركات المواد</TabsTrigger>
        <TabsTrigger value="valuation">تقييم المخزون وبضاعة آخر المدة</TabsTrigger>
      </TabsList>
      <TabsContent value="tree">
    <EntityTree large table="warehouses" module="warehouses" title="شجرة المستودعات الكاملة (التصنيفات والمستودعات)" buildInsert={() => ({ is_active: true })} />
    <CrudPage
      table="warehouses"
      module="warehouses"
      maxColumns={8}
      title="المستودعات"
      subtitle="المستودع الرئيسي يجمع مستودعات فرعية، والحركات والفواتير تكون على المستودعات الفرعية فقط. اضغط أيقونة الكشف لعرض كشف حساب المستودع"
      orderBy="name"
      ascending
      extraRowAction={(row) => (
        <Button asChild size="icon" variant="ghost" title="كشف حساب المستودع">
          <Link to="/ledgers" search={{ tab: "warehouse", id: row.id }}>
            <FileText className="size-4" />
          </Link>
        </Button>
      )}
      fields={[
        { key: "is_group", label: "بطاقة تجميعية", type: "checkbox", defaultValue: false },
        { key: "code", label: "الرمز" },
        { key: "parent_id", label: "البطاقة الأب (التجميعية)", type: "ref", refTable: "warehouses", refFilter: { key: "is_group", value: true }, refExtraSelect: "account_id" },
        { key: "name", label: "اسم المستودع", required: true },
        { key: "name_en", label: "الاسم بالإنكليزية", hideInTable: true },
        { key: "location", label: "الموقع" },
        { key: "account_id", label: "الحساب المرتبط", type: "ref", refTable: "accounts", refExtraSelect: "is_group", refMatch: (f, r) => !!r["is_group"] === !!f["is_group"], refAccountScope: { entityParent: "parent_id" } },
        { key: "allow_negative", label: "السماح بالإخراج بالسالب", type: "checkbox", defaultValue: false },
        { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
      ]}
    />
      </TabsContent>
      <TabsContent value="moves">
        <CrudPage
          table="stock_moves"
          module="stock"
          title="حركات المواد"
          subtitle="فلتر حسب المادة أو المستودع من أعلى الجدول"
          orderBy="move_date"
          dateKey="move_date"
          facetKeys={["direction", "warehouse_id", "product_id"]}
          fields={[
            { key: "move_date", label: "التاريخ", type: "date", required: true, defaultValue: today() },
            { key: "product_id", label: "المادة", type: "ref", refTable: "products", required: true },
            { key: "warehouse_id", label: "المستودع", type: "ref", refTable: "warehouses", required: true },
            { key: "direction", label: "نوع الحركة", type: "select", required: true, defaultValue: "in", options: [{ value: "in", label: "إدخال" }, { value: "out", label: "إخراج" }] },
            { key: "qty", label: "الكمية", type: "number", required: true, digits: 4 },
            { key: "unit_cost", label: "سعر الوحدة", type: "number", defaultValue: 0, digits: 4 },
            { key: "reference", label: "المرجع" },
          ]}
        />
      </TabsContent>
      <TabsContent value="valuation"><StockValuationReport /></TabsContent>
    </Tabs>
  );
}
