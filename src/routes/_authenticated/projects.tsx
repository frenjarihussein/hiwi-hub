import { createFileRoute, Link } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { EntityTree } from "@/components/EntityTree";
import { Button } from "@/components/ui/button";
import { fmtNum } from "@/lib/format";
import { BarChart3, FileText } from "lucide-react";
import { pageHead } from "@/lib/page-head";
import { can, useMe, type Me } from "@/lib/session";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { ProjectLeads } from "@/components/solar/ProjectLeads";

export const Route = createFileRoute("/_authenticated/projects")({ component: ProjectsPage, head: () => pageHead("المشاريع", "تعريف المشاريع وتصنيفاتها وحساباتها المرتبطة ومتابعة تكاليفها في يوسف سوفت.") });

function ProjectsPage() {
  const { data: me } = useMe();
  const projectsOnly = me?.accountKind === "projects_only";
  return (
    <>
    <ProjectLeads />
    {!projectsOnly && <EntityTree table="projects" module="projects" title="شجرة المشاريع الكاملة (التصنيفات والمشاريع)" buildInsert={() => ({ is_active: true, contract_value: 0, currency: "USD" })} usageCheck={{ table: "journal_lines", column: "project_id", message: "لا يمكن حذف مشروع له حركات محاسبية، يمكنك إلغاء تفعيله" }} />}
    <CrudPage
      table="projects"
      module="projects"
      title="بطاقات المشاريع"
      subtitle="اضغط على أيقونة التحليل لعرض نسبة الإنجاز ومقارنة الموازنة بالمصاريف والإيرادات. المشاريع ذات الحركات لا تُحذف بل تُجمّد"
      orderBy="name"
      ascending
      dateKey="start_date"
      stats={(rows) => [
        { label: "قيد التنفيذ", value: rows.filter((r) => r.status === "active").length, tone: "success" },
        { label: "إجمالي قيم العقود", value: fmtNum(rows.reduce((a, r) => a + Number(r.contract_value || 0), 0)) },
        { label: "متوسط نسبة الإنجاز", value: `${fmtNum(rows.length ? rows.reduce((a, r) => a + Number(r.completion_pct || 0), 0) / rows.length : 0, 0)}%`, tone: "warning" },
      ]}
      facetKeys={["status", "currency", "client_id"]}
      bulkActions={can(me as Me, "projects", "edit") ? (ids, done) => {
        const setStatus = async (status: string, extra: Record<string, unknown> = {}) => {
          const { error } = await db.from("projects").update({ status, ...extra }).in("id", ids);
          if (error) toast.error(error.message); else toast.success(`تم تحديث ${ids.length} مشروع`);
          done();
        };
        return (
          <>
            <Button size="sm" onClick={() => void setStatus("completed")}>تحويل إلى منجز</Button>
            <Button size="sm" variant="outline" onClick={() => void setStatus("active")}>قيد التنفيذ</Button>
            <Button size="sm" variant="outline" onClick={() => void setStatus("on_hold")}>إيقاف</Button>
          </>
        );
      } : undefined}
      extraRowAction={(row) => (
        <>
        <Button asChild size="icon" variant="ghost" title="تفاصيل المشروع">
          <Link to="/projects/$projectId" params={{ projectId: row.id }}>
            <BarChart3 className="size-4" />
          </Link>
        </Button>
        {!projectsOnly && <Button asChild size="icon" variant="ghost" title="كشف حساب المشروع">
          <Link to="/ledgers" search={{ tab: "project", id: row.id }}>
            <FileText className="size-4" />
          </Link>
        </Button>}
        </>
      )}
      fields={[
        { key: "is_group", label: "بطاقة تجميعية", type: "checkbox", defaultValue: false },
        { key: "code", label: "رمز المشروع" },
        {
          key: "parent_id",
          label: "البطاقة الأب (التجميعية)",
          type: "ref",
          refTable: "projects",
          refFilter: { key: "is_group", value: true }, refExtraSelect: "account_id",
        },
        { key: "name", label: "اسم المشروع", required: true },
        { key: "client_id", label: "الزبون", type: "ref", refTable: "partners" },
        { key: "contract_value", label: "قيمة العقد", type: "number", defaultValue: 0 },
        {
          key: "currency",
          label: "العملة",
          type: "select",
          defaultValue: "USD",
          options: [
            { value: "USD", label: "دولار ($)" },
            { value: "SYP", label: "ليرة سورية (ل.س)" },
          ],
        },
        { key: "start_date", label: "تاريخ البدء", type: "date" },
        { key: "end_date", label: "تاريخ الانتهاء", type: "date" },
        { key: "completion_pct", label: "نسبة الإنجاز %", type: "number", defaultValue: 0, digits: 0 },
        {
          key: "status",
          label: "الحالة",
          type: "select",
          defaultValue: "active",
          options: [
            { value: "lead", label: "عميل مهتم" },
            { value: "active", label: "قيد التنفيذ" },
            { value: "on_hold", label: "متوقف" },
            { value: "completed", label: "تم الإنجاز" },
            { value: "closed", label: "مغلق" },
          ],
        },
        { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
        ...(projectsOnly ? [] : [{ key: "account_id", label: "الحساب المرتبط", type: "ref" as const, refTable: "accounts", refExtraSelect: "is_group", refMatch: (f: Record<string, unknown>, r: Record<string, unknown>) => !!r["is_group"] === !!f["is_group"], refAccountScope: { entityParent: "parent_id" } }]),
        { key: "notes", label: "ملاحظات", type: "textarea", hideInTable: true },
      ]}
    />
    </>
  );
}
