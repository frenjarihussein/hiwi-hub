/* eslint-disable @typescript-eslint/no-explicit-any */
// Full project dossier printed through the shared company letterhead template (logo, theme colours, PDF).
import { db } from "@/lib/db";
import { printDocument, type PrintSection } from "@/lib/print";
import { fmtDate, fmtNum, PROJECT_STATUS_LABEL } from "@/lib/format";
import { startWork } from "@/lib/work-progress";

const SNAG: Record<string, string> = { open: "مفتوحة", in_progress: "قيد المعالجة", closed: "مغلقة" };
const PRI: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية" };

export async function printFullProjectReport(projectId: string, opts: { company?: string | null | undefined; includeFinance: boolean; actualCost?: number | undefined }) {
  const w = window.open("", "_blank", "width=960,height=1000");
  if (!w) throw new Error("اسمح بفتح النوافذ المنبثقة لطباعة التقرير");
  const work = startWork("تجهيز تقرير المشروع");
  try {
    const q = (t: string) => (db.from(t as any) as any).select("*").eq("project_id", projectId);
    const [pr, sol, wbs, ms, bom, boq, exp, sn] = await Promise.all([
      (db.from("projects") as any).select("*, partners(name)").eq("id", projectId).maybeSingle(),
      (db.from("solar_projects") as any).select("*").eq("project_id", projectId).maybeSingle(),
      q("project_wbs"), q("project_milestones"), q("project_bom"), q("boq_items"), q("project_expenses"), q("project_snags"),
    ]);
    const p = pr.data;
    if (!p) throw new Error("المشروع غير موجود");
    const survey = (sol.data?.survey ?? {}) as Record<string, any>;
    const nodes = (wbs.data ?? []) as any[];
    const byParent = (id: string | null) => nodes.filter((n) => n.parent_id === id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const wbsRows: (string | number)[][] = [];
    const walk = (id: string | null, d: number) => byParent(id).forEach((n) => { wbsRows.push([`${"— ".repeat(d)}${n.name}`, fmtNum(n.weight, 0), `${Number(n.progress ?? 0).toFixed(0)}%`, fmtDate(n.start_date) || "", fmtDate(n.end_date) || "", n.assignee ?? ""]); walk(n.id, d + 1); });
    walk(null, 0);
    const snags = (sn.data ?? []) as any[];
    const sections: PrintSection[] = [];
    const surveyRows = Object.entries(survey).filter(([, v]) => v !== null && v !== "" && typeof v !== "object").map(([k, v]) => [k, String(v)]);
    if (surveyRows.length) sections.push({ title: "المواصفات والمسح الفني", columns: ["البند", "القيمة"], rows: surveyRows });
    sections.push({ title: "شجرة الأعمال ونسب الإنجاز", columns: ["البند", "الوزن", "الإنجاز", "البداية", "النهاية", "المسؤول"], rows: wbsRows });
    sections.push({ title: `الملاحظات الفنية (${snags.filter((s) => s.status !== "closed").length} مفتوحة من ${snags.length})`, columns: ["الملاحظة", "الموقع", "الأولوية", "الحالة", "التاريخ"], rows: snags.map((s) => [s.title, s.location ?? "", PRI[s.priority] ?? s.priority, SNAG[s.status] ?? s.status, fmtDate(s.created_at)]) });
    const bomRows = (bom.data ?? []) as any[];
    sections.push({ title: "المواد والتجهيزات", columns: ["الفئة", "المادة", "المواصفة", "الكمية", ...(opts.includeFinance ? ["الكلفة", "الإجمالي"] : []), "حالة التوريد"], rows: bomRows.map((b) => [b.category, b.item, b.spec ?? "", fmtNum(b.qty), ...(opts.includeFinance ? [fmtNum(b.unit_cost), fmtNum(Number(b.qty) * Number(b.unit_cost))] : []), b.supply_status]) });
    if (opts.includeFinance) {
      const msRows = (ms.data ?? []) as any[];
      sections.push({ title: "مراحل الدفع", columns: ["المرحلة", "الاستحقاق", "المبلغ", "منجزة", "مفوترة"], rows: msRows.map((m) => [m.name, fmtDate(m.due_date) || "", fmtNum(m.amount), m.is_done ? "نعم" : "لا", m.invoiced ? "نعم" : "لا"]) });
      const boqRows = (boq.data ?? []) as any[];
      const budget = boqRows.reduce((s, b) => s + Number(b.qty) * Number(b.unit_price), 0);
      sections.push({ title: "جدول الكميات (BOQ)", columns: ["البند", "الوحدة", "الكمية", "السعر", "الإجمالي"], rows: boqRows.map((b) => [b.item_name, b.unit ?? "", fmtNum(b.qty), fmtNum(b.unit_price), fmtNum(Number(b.qty) * Number(b.unit_price))]) });
      const expRows = (exp.data ?? []) as any[];
      sections.push({ title: "المصاريف المباشرة", columns: ["التاريخ", "البيان", "المبلغ", "العملة"], rows: expRows.map((e) => [fmtDate(e.expense_date), e.description, fmtNum(e.amount), e.currency]) });
      const contract = Number(p.contract_value ?? 0);
      const actual = opts.actualCost ?? expRows.reduce((s, e) => s + Number(e.amount), 0);
      const invoiced = msRows.filter((m) => m.invoiced).reduce((s, m) => s + Number(m.amount ?? 0), 0);
      sections.push({ title: "الملخص المالي", footer: [["قيمة العقد", fmtNum(contract)], ["الموازنة التقديرية", fmtNum(budget)], ["المصاريف الفعلية", fmtNum(actual)], ["الإيرادات المفوترة", fmtNum(invoiced)], ["الربح المتوقع", fmtNum(contract - actual)]] });
    }
    await printDocument({
      title: "تقرير شامل للمشروع", company: opts.company,
      meta: [["المشروع", p.name ?? ""], ["رمز المشروع", p.code ?? "—"], ["العميل", p.partners?.name ?? survey["client"] ?? "—"], ["الحالة", PROJECT_STATUS_LABEL[p.status] ?? p.status ?? ""], ["نسبة الإنجاز", `${Number(p.completion_pct ?? 0).toFixed(0)}%`], ["البداية / النهاية", `${fmtDate(p.start_date) || "—"} / ${fmtDate(p.end_date) || "—"}`]],
      columns: [], rows: [], sections, notes: p.notes,
      signatures: ["المهندس المسؤول", "مدير المشروع", "العميل"],
    }, w);
  } catch (e) { w.close(); throw e; } finally { work.finish(); }
}
