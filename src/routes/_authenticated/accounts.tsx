import { RecordNotesButton } from "@/components/collab/RecordNotes";
import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { AccountTree } from "@/components/AccountTree";
import { pageHead } from "@/lib/page-head";
import { useCurrencies, useBaseCurrency } from "@/lib/currencies";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
  head: () => pageHead("شجرة الحسابات", "دليل الحسابات المحاسبية وتعريف الحسابات وربطها بالحسابات الختامية في يوسف سوفت."),
});

function AccountsPage() {
  const { data: curs } = useCurrencies();
  const baseCur = useBaseCurrency();
  const curOptions = (curs ?? [{ code: "USD", name: "دولار أمريكي", symbol: "$" }, { code: "SYP", name: "ليرة سورية", symbol: "ل.س" }]).map((c) => ({ value: c.code, label: `${c.name} (${c.symbol || c.code})` }));
  // Accept the name, the code and the exported label "name (symbol)" of every currency.
  const curMap = Object.fromEntries([
    ...(curs ?? []).map((c) => [c.name, c.code]),
    ...(curs ?? []).map((c) => [c.code, c.code]),
    ...curOptions.map((o) => [o.label, o.value]),
  ]);
  return (
    <Tabs defaultValue="tree" className="w-full">
    <TabsList className="mb-4">
      <TabsTrigger value="tree">شجرة الحسابات</TabsTrigger>
      <TabsTrigger value="list">جدول الحسابات</TabsTrigger>
    </TabsList>
    <TabsContent value="tree" forceMount className="data-[state=inactive]:hidden"><AccountTree /></TabsContent>
    <TabsContent value="list" forceMount className="data-[state=inactive]:hidden">
    <CrudPage
      wideForm
      columnFilters
      defaultView="table"
      maxColumns={8}
      table="accounts"
      module="accounts"
      title="بطاقة حساب - شجرة الحسابات"
      subtitle="رمز حساب فريد، حساب أب، نوع الحساب، وعملة الحساب. البطاقات التي لها قيود محاسبية لا تُحذف، بل تُجمّد بإلغاء التفعيل"
      orderBy="code"
      ascending
      validate={(p) => (!p["is_group"] && p["nature"] !== "closing" && !p["closing_account_id"] ? "حدد الحساب الختامي الذي يُقفل فيه هذا الحساب" : !p["is_group"] && !p["currency"] ? "حدد عملة الحساب" : null)}
      extraRowAction={(row) => <RecordNotesButton entityType="account" entityId={row.id} label={`حساب ${row.code} - ${row.name}`} />}
      importColumns={[
        { key: "code", label: "رمز الحساب", required: true, example: "1101" },
        { key: "name", label: "اسم الحساب", required: true, example: "الصندوق" },
        { key: "parent_code", label: "رمز الحساب الأب", example: "1100" },
        { key: "nature", label: "نوع الحساب", required: true, example: "أصول", map: { أصول: "assets", خصوم: "liabilities", "حقوق ملكية": "equity", إيرادات: "revenues", مصاريف: "expenses", ختامي: "closing", "حسابات ختامية": "closing", "مركز كلفة": "cost_centers", ميزانية: "balance_sheet", "أرباح وخسائر": "profit_loss" } },
        {
          key: "currency",
          label: "العملة",
          required: true,
          example: "USD",
          map: { "دولار أمريكي": "USD", "ليرة سورية": "SYP", ...curMap },
        },
        { key: "is_group", label: "حساب تجميعي", type: "boolean", example: "لا" },
        { key: "closing_code", label: "رمز الحساب الختامي", example: "" },
        { key: "is_monetary", label: "حساب نقدي", type: "boolean", example: "نعم" },
        { key: "balance_side", label: "طبيعة الحساب", example: "مدين", map: { مدين: "debit", دائن: "credit", "مدين ودائن": "both" } },
        {
          key: "cash_flow_type",
          label: "نشاط التدفقات النقدية",
          example: "",
          map: { تشغيلي: "operating", استثماري: "investing", تمويلي: "financing" },
        },
        { key: "notes", label: "ملاحظات", example: "" },
      ]}
      importLookups={[
        { key: "parent_code", target: "parent_id", table: "accounts", matchOn: ["code", "name"] },
        { key: "closing_code", target: "closing_account_id", table: "accounts", matchOn: ["code", "name"] },
      ]}
      fields={[
        { key: "code", label: "رمز الحساب", required: true },
        { key: "name", label: "اسم الحساب", required: true },
        { key: "is_group", label: "حساب تجميعي", type: "checkbox", hideInTable: true },
        { key: "parent_id", label: "الحساب الأب (الحسابات التجميعية فقط)", type: "ref", refTable: "accounts", refFilter: { key: "is_group", value: true }, refShowCode: "code" },
        { key: "is_closing", label: "ختامي", type: "checkbox", defaultValue: false, showIf: (f) => !f["is_group"], render: (row) => row.nature === "closing" ? "نعم" : "لا" },
        {
          key: "currency",
          label: "العملة",
          type: "select",
          required: true,
          defaultValue: baseCur || "USD",
          showIf: (f) => !f["is_group"],
          options: curOptions,
          render: (row) => row.is_group ? "—" : (curOptions.find((o) => o.value === row.currency)?.label ?? row.currency ?? "—"),
        },
        { key: "closing_account_id", label: "أين يُقفل (الحساب الختامي)", type: "ref", refTable: "accounts", refFilter: { key: "nature", value: "closing" }, refLeafOnly: true, refShowCode: "code", showIf: (f) => !f["is_group"] },
        {
          key: "balance_side",
          label: "طبيعة الحساب",
          type: "select",
          showIf: (f) => !f["is_closing"],
          options: [
            { value: "debit", label: "مدين (يظهر في الموجودات)" },
            { value: "credit", label: "دائن (يظهر في المطاليب وحقوق الملكية)" },
            { value: "both", label: "مدين ودائن (حسب الرصيد)" },
          ],
          render: (row) => row.balance_side === "debit" ? "مدين" : row.balance_side === "credit" ? "دائن" : row.balance_side === "both" ? "مدين ودائن" : "حسب الأب",
        },
        {
          key: "cash_flow_type",
          label: "نوع النشاط في قائمة التدفقات النقدية",
          type: "select",
          showIf: (f) => !f["is_group"] && !f["is_closing"],
          options: [
            { value: "operating", label: "تشغيلي" },
            { value: "investing", label: "استثماري" },
            { value: "financing", label: "تمويلي" },
          ],
        },
        { key: "is_monetary", label: "نقدي / غير نقدي (يُحدد مرة واحدة)", type: "checkbox", lockOnEdit: true, showIf: (f) => !f["is_group"] && !f["is_closing"] && (f["currency"] || baseCur) !== baseCur, render: (row) => row.is_group || row.nature === "closing" || row.currency === baseCur ? "—" : row.is_monetary ? "نقدي" : "غير نقدي" },
        { key: "name_en", label: "الاسم بالإنكليزية", hideInTable: true },
        { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true, hideInTable: true },
        { key: "notes", label: "ملاحظات", type: "textarea", hideInTable: true },
      ]}
    />
    </TabsContent>
    </Tabs>
  );
}
