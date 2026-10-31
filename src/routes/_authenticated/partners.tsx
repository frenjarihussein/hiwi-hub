import { useState } from "react";
import { usePriceNames } from "@/lib/prices";
import { useCurrencies } from "@/lib/currencies";
import { RecordNotesButton } from "@/components/collab/RecordNotes";
import { ShareLinkButton } from "@/components/collab/ShareLinkButton";
import { WhatsAppStatementButton } from "@/components/collab/WhatsAppStatementButton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { EntityTree } from "@/components/EntityTree";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { pageHead } from "@/lib/page-head";
import { useBaseCurrency } from "@/lib/currencies";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/partners")({ component: PartnersPage, head: () => pageHead("الزبائن والموردون", "بطاقات الزبائن والموردين وحساباتهم المحاسبية والعملات والتصنيفات في يوسف سوفت.") });

function PartnersPage() {
  const [kind, setKind] = useState<"customer" | "supplier">("customer");
  const priceNames = usePriceNames();
  const baseCur = useBaseCurrency();
  const currencies = useCurrencies().data ?? [];
  return (
    <Tabs defaultValue="tree">
    <TabsList className="mb-4">
      <TabsTrigger value="tree">شجرة وتصنيفات الشركاء</TabsTrigger>
      <TabsTrigger value="cards">دليل البطاقات والبيانات</TabsTrigger>
    </TabsList>
    <TabsContent value="tree">
    <Tabs value={kind} onValueChange={(v) => setKind(v as "customer" | "supplier")}><TabsList><TabsTrigger value="customer">شجرة الزبائن</TabsTrigger><TabsTrigger value="supplier">شجرة الموردين</TabsTrigger></TabsList></Tabs>
    <EntityTree
      table="partners"
      module="partners"
      large
      rowFilter={{ key: "partner_type", values: [kind, "both"] }}
      title={kind === "customer" ? "شجرة الزبائن" : "شجرة الموردين"}
      extraSelect="currency"
      buildInsert={() => ({ partner_type: kind, is_active: true })}
      usageCheck={{ table: "journal_lines", column: "partner_id", message: "لا يمكن حذف بطاقة لها حركات محاسبية، يمكنك إلغاء تفعيلها" }}
    />
    </TabsContent>
    <TabsContent value="cards" forceMount className="data-[state=inactive]:hidden">
    <CrudPage
      table="partners"
      module="partners"
      maxColumns={8}
      validate={(p) => {
        if (!p["account_id"]) {
          p["auto_account"] = true;
        } else p["auto_parent_account_id"] = null;
        return null;
      }}
      title="بطاقات الزبائن والموردين"
      subtitle="اضغط على أيقونة الكشف لعرض كشف حساب مفصّل مع الرصيد المتحرك. البطاقات ذات القيود لا تُحذف بل تُجمّد"
      orderBy="name"
      ascending
      facetKeys={["partner_type", "account_id"]}
      stats={(rows) => [
        { label: "الزبائن", value: rows.filter((r) => r.partner_type !== "supplier").length, tone: "success" },
        { label: "الموردون", value: rows.filter((r) => r.partner_type !== "customer").length, tone: "warning" },
        { label: "بدون رقم هاتف", value: rows.filter((r) => !r.phone).length, tone: "danger" },
      ]}
      extraRowAction={(row) => (
        <>
        <Button asChild size="icon" variant="ghost" title="كشف حساب">
          <Link to="/statement/$partnerId" params={{ partnerId: row.id }}>
            <FileText className="size-4" />
          </Link>
        </Button>
        <WhatsAppStatementButton partnerId={row.id} name={row.name} phone={row.phone} />
        <ShareLinkButton entityType="statement" entityId={row.id} label={`كشف حساب ${row.name}`} phone={row.phone} />
        <RecordNotesButton entityType="partner" entityId={row.id} label={row.name} />
        </>
      )}
      importColumns={[
        { key: "code", label: "الرمز", example: "C-001" },
        { key: "name", label: "الاسم", required: true, example: "شركة النور" },
        {
          key: "partner_type",
          label: "النوع",
          required: true,
          example: "زبون",
          map: { زبون: "customer", مورد: "supplier", "زبون ومورد": "both" },
        },
        { key: "deal_type", label: "نوع التعامل", example: "مواد وخدمات", map: { مواد: "stock", خدمات: "service", "مواد وخدمات": "both" } },
        { key: "phone", label: "الهاتف", example: "0900000000" },
        { key: "address", label: "العنوان", example: "دمشق" },
        { key: "account_code", label: "رمز الحساب المرتبط", example: "1201" },
      ]}
      importLookups={[{ key: "account_code", target: "account_id", table: "accounts", matchOn: ["code", "name"] }]}
      fields={[
        { key: "is_group", label: "بطاقة تجميعية", type: "checkbox", defaultValue: false },
        { key: "code", label: "الرمز" },
        { key: "name", label: "الاسم", required: true },
        { key: "name_en", label: "الاسم بالإنكليزية", hideInTable: true },
        {
          key: "partner_type",
          label: "النوع",
          type: "select",
          required: true,
          defaultValue: "customer",
          options: [
            { value: "customer", label: "زبون" },
            { value: "supplier", label: "مورد" },
            { value: "both", label: "زبون ومورد" },
          ],
        },
        {
          key: "deal_type",
          label: "نوع التعامل",
          type: "select",
          required: true,
          defaultValue: "both",
          options: [
            { value: "stock", label: "مواد فقط" },
            { value: "service", label: "خدمات فقط" },
            { value: "both", label: "مواد وخدمات معاً" },
          ],
          render: (r) => (r.deal_type === "stock" ? "مواد" : r.deal_type === "service" ? "خدمات" : "مواد وخدمات"),
        },
        {
          key: "parent_id",
          label: "البطاقة الأب (التجميعية)",
          type: "ref",
          refTable: "partners",
          refFilter: { key: "is_group", value: true },
          refExtraSelect: "partner_type,account_id",
          refMatch: (f, r) => !r["partner_type"] || r["partner_type"] === "both" || f["partner_type"] === "both" || r["partner_type"] === f["partner_type"],
        },
        { key: "phone", label: "الهاتف" },
        { key: "address", label: "العنوان" },
        { key: "barcode", label: "باركود الزبون / المورد", type: "barcode", hideInTable: true },
        { key: "account_id", label: "الحساب المرتبط", type: "ref", refTable: "accounts", refExtraSelect: "is_group",
          refMatch: (f, r) => !!r["is_group"] === !!f["is_group"], refAccountScope: { explicitParent: "auto_parent_account_id", entityParent: "parent_id" } },
        { key: "auto_parent_account_id", label: "الحساب التجميعي الأب للحساب المرتبط", type: "ref", refTable: "accounts", refFilter: { key: "is_group", value: true }, hideInTable: true },
        { key: "credit_limit", label: "الحد الائتماني", type: "number", hideInTable: true },
        { key: "price_level", label: "السعر المعتمد للزبون", type: "select", hideInTable: true,
          options: [...priceNames.map((n, i) => ({ value: String(i + 1), label: n }))] },
        { key: "currency", label: "عملة التعامل (يُنشأ حسابه بنفس العملة)", type: "select", defaultValue: baseCur, showIf: (f) => !f["is_group"],
          options: [{ value: "", label: "متعدد العملات (بدون تحديد)" }, ...currencies.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))] },
        { key: "is_monetary", label: "حساب نقدي (إعادة تقييم فروق الصرف)", type: "checkbox", defaultValue: true, disabled: true, hideInTable: true, showIf: (f) => !f["is_group"] && !!f["currency"] && f["currency"] !== baseCur },
        { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
      ]}
    />
    </TabsContent>
    </Tabs>
  );
}
