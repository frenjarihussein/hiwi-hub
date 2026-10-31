import { createFileRoute, Link } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { EntityTree } from "@/components/EntityTree";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_authenticated/cost-centers")({
  head: () => pageHead("مراكز الكلفة", "إدارة مراكز الكلفة وربطها بحسابات شجرة الحسابات وتوزيع القيود عليها."),
  component: CostCentersPage,
});

function CostCentersPage() {
  return (
    <>
      <div className="mb-4"><Button asChild variant="outline"><Link to="/accounts">شجرة الحسابات</Link></Button></div>
      <EntityTree table="cost_centers" module="accounts" title="شجرة مراكز الكلفة (التصنيفات والمراكز)" buildInsert={() => ({ is_active: true })} usageCheck={{ table: "journal_lines", column: "cost_center_id", message: "لا يمكن حذف مركز له حركات محاسبية، يمكنك إلغاء تفعيله" }} />
      <CrudPage
        table="cost_centers"
        module="accounts"
        title="مراكز الكلفة"
        subtitle="عرّف مراكز الكلفة واربط كل مركز بحسابه من نوع (مراكز كلفة) في شجرة الحسابات، ثم اختر المركز في سطور القيود"
        orderBy="code"
        ascending
          fields={[
        { key: "is_group", label: "بطاقة تجميعية", type: "checkbox", defaultValue: false },
          { key: "code", label: "رمز المركز" },
          {
            key: "parent_id",
            label: "البطاقة الأب (التجميعية)",
            type: "ref",
            refTable: "cost_centers",
            refFilter: { key: "is_group", value: true }, refExtraSelect: "account_id",
          },
          { key: "name", label: "اسم المركز", required: true },
          { key: "name_en", label: "الاسم بالإنكليزية", hideInTable: true },
          { key: "account_id", label: "الحساب المرتبط", type: "ref", refTable: "accounts", refExtraSelect: "is_group", refMatch: (f, r) => !!r["is_group"] === !!f["is_group"], refAccountScope: { entityParent: "parent_id" } },
          { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
          { key: "notes", label: "ملاحظات", type: "textarea", hideInTable: true },
        ]}
      />
    </>
  );
}
