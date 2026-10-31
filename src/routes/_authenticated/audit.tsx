import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { exportCsv, printPage } from "@/lib/export";
import { AUDIT_ACTION_LABEL, fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Download, Printer, Undo2, Eye } from "lucide-react";
import { useState } from "react";
import { TABLE_LABEL, describeAudit, changedFields } from "@/lib/audit-describe";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataFilters, applyFilters, useDataFilters, type FacetConfig } from "@/components/DataFilters";

export const Route = createFileRoute("/_authenticated/audit")({ head: () => pageHead("سجل الحركات", "تفاصيل عمليات المستخدمين والتغييرات على سجلات الشركة. في يوسف سوفت."), component: AuditPage });

function AuditPage() {
  const { data: me } = useMe();
  const [filters, setFilters] = useDataFilters();
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detail, setDetail] = useState<any>(null);
  const undo = async (id: number) => {
    if (!window.confirm("هل تريد التراجع عن هذه العملية؟")) return;
    const { error } = await db.rpc("undo_audit", { _id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("تم التراجع عن العملية");
    qc.invalidateQueries();
  };

  const logs = useQuery({
    queryKey: ["audit_log", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await scope(db.from("audit_log").select("*"), me?.tenantId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const users = useQuery({
    queryKey: ["audit_users", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await scope(db.from("profiles").select("id, full_name, email"), me?.tenantId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Map<string, string>((data ?? []).map((u: any) => [u.id, u.full_name || u.email]));
    },
  });
  const userName = (id?: string | null) => (id ? (users.data?.get(id) ?? id) : "—");

  const facets: FacetConfig[] = [
    {
      key: "table_name",
      label: "الجدول",
      options: Array.from(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new Set<string>((logs.data ?? []).map((r: any) => String(r.table_name))),
      )
        .sort()
        .map((v) => ({ value: v, label: TABLE_LABEL[v] ?? v })),
    },
    {
      key: "action",
      label: "العملية",
      options: ["INSERT", "UPDATE", "DELETE"].map((v) => ({ value: v, label: AUDIT_ACTION_LABEL[v] ?? v })),
    },
    {
      key: "user_id",
      label: "المستخدم",
      options: Array.from(users.data?.entries() ?? []).map(([id, name]) => ({
        value: String(id),
        label: String(name),
      })),
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = applyFilters<any>(logs.data ?? [], filters, {
    dateKey: "created_at",
    searchText: (r) => `${JSON.stringify(r)} ${userName(r.user_id)}`,
  });

  return (
    <div>
      <PageHeader
        title="سجل الحركات (Audit Trail)"
        subtitle="يسجّل النظام آلياً كل إضافة وتعديل وحذف مع المستخدم والوقت"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(
                  "سجل الحركات",
                  [
                    { key: "created_at", label: "الوقت" },
                    { key: "table_name", label: "الجدول" },
                    { key: "action", label: "العملية" },
                    { key: "summary", label: "التفاصيل" },
                    { key: "user_id", label: "المستخدم" },
                  ],
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  rows.map((r: any) => ({
                    created_at: fmtDateTime(r.created_at),
                    table_name: TABLE_LABEL[r.table_name] ?? r.table_name,
                    action: AUDIT_ACTION_LABEL[r.action] ?? r.action,
                    summary: describeAudit(r),
                    user_id: userName(r.user_id),
                  })),
                )
              }
            >
              <Download className="size-4" />
              تصدير إلى إكسل
            </Button>
            <Button variant="outline" onClick={printPage}>
              <Printer className="size-4" />
              طباعة
            </Button>
          </>
        }
      />

      <DataFilters
        filters={filters}
        onChange={setFilters}
        facets={facets}
        searchPlaceholder="بحث في سجل الحركات..."
      />


      <div className="print-area overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2 text-right">الوقت</th>
              <th className="px-3 py-2 text-right">الجدول</th>
              <th className="px-3 py-2 text-right">العملية</th>
              <th className="px-3 py-2 text-right">تفاصيل الحركة</th>
              <th className="px-3 py-2 text-right">المستخدم</th>
              <th className="px-3 py-2 text-right no-print">تراجع</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  لا توجد حركات مسجّلة
                </td>
              </tr>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{fmtDateTime(r.created_at)}</td>
                <td className="px-3 py-2">{TABLE_LABEL[r.table_name] ?? r.table_name}</td>
                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${r.action === "DELETE" ? "bg-destructive/15 text-destructive" : r.action === "INSERT" ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground"}`}>{AUDIT_ACTION_LABEL[r.action] ?? r.action}</span></td>
                <td className="px-3 py-2">{describeAudit(r)} <Button size="sm" variant="link" className="no-print h-auto p-0 ms-1" onClick={() => setDetail(r)}><Eye className="size-3.5" />عرض</Button></td>
                <td className="px-3 py-2 text-xs">{userName(r.user_id)}</td>
                <td className="px-3 py-2 no-print">
                  <Button size="sm" variant="ghost" onClick={() => undo(r.id)}>
                    <Undo2 className="size-4" />
                    تراجع
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detail ? describeAudit(detail) : ""}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">بواسطة {userName(detail.user_id)} — {fmtDateTime(detail.created_at)}</p>
              <div className="max-h-[60vh] overflow-auto rounded border">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-start">الحقل</th>{detail.old_data && <th className="p-2 text-start">القيمة السابقة</th>}{detail.new_data && <th className="p-2 text-start">{detail.old_data ? "القيمة الجديدة" : "القيمة"}</th>}</tr></thead>
                  <tbody>
                    {changedFields(detail.old_data, detail.new_data).map((f) => (
                      <tr key={f.key} className="border-t"><td className="p-2 font-medium">{f.label}</td>{detail.old_data && <td className="p-2 text-destructive break-all">{f.before}</td>}{detail.new_data && <td className="p-2 text-primary break-all">{f.after}</td>}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
