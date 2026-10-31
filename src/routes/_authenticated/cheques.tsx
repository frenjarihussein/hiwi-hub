import { pageHead } from "@/lib/page-head";
import { RecordNotesButton } from "@/components/collab/RecordNotes";
import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { today } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBaseCurrency, useCurrencies } from "@/lib/currencies";
import { chequeLines, linkedAccounts, post2, rateFor } from "@/lib/auto-entries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/cheques")({ head: () => pageHead("الشيكات", "متابعة الشيكات الواردة والصادرة والتحصيل والترحيل. في يوسف سوفت."), component: ChequesPage });

const STATUS_AR: Record<string, string> = { pending: "تسجيل الشيك", collected: "تحصيل/صرف الشيك", returned: "ارتداد الشيك", cancelled: "إلغاء الشيك" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PostChequeButton({ row }: { row: any }) {
  const { data: me } = useMe();
  const base = useBaseCurrency();
  const qc = useQueryClient();
  if (row.posted_status === row.status) return null;
  async function go() {
    try {
      const st = await linkedAccounts(me!.tenantId!);
      const notes = row.direction === "incoming" ? st.notes_receivable_account_id : st.notes_payable_account_id;
      if (!notes) throw new Error("حدد حساب أوراق القبض/الدفع في الإعدادات أولاً");
      const p = row.partner_id ? (await db.from("partners").select("account_id").eq("id", row.partner_id).maybeSingle()).data : null;
      if (!p?.account_id) throw new Error("حدد الجهة في الشيك وتأكد أن لها حساباً مرتبطاً");
      const b = row.bank_id ? (await db.from("banks").select("account_id").eq("id", row.bank_id).maybeSingle()).data : null;
      const tid = me!.tenantId!, rate = await rateFor(row.currency, base), amt = Number(row.amount);
      const inc = row.direction === "incoming";
      const post = (d: string, c: string, label: string, date: string) => post2(tid, me?.userId, date, `${label} رقم ${row.cheque_no}`, row.currency, rate, d, c, amt, row.partner_id);
      const now = new Date().toISOString().slice(0, 10);
      const prev = row.posted_status as string | null;
      if (!prev && row.status === "cancelled") { /* never booked: nothing to post */ }
      else {
        if (!prev && row.status !== "pending") {
          const reg = chequeLines({ ...row, status: "pending" }, { notes, partner: p.account_id, bank: null })!;
          await post(reg.debit, reg.credit, STATUS_AR["pending"]!, row.issue_date ?? row.due_date);
        }
        if (prev === "collected" && (row.status === "returned" || row.status === "cancelled")) {
          if (!b?.account_id) throw new Error("البنك المرتبط ليس له حساب محاسبي");
          await post(inc ? p.account_id : b.account_id, inc ? b.account_id : p.account_id, STATUS_AR[row.status]!, now);
        } else {
          const l = chequeLines(row, { notes, partner: p.account_id, bank: b?.account_id ?? null });
          if (!l) throw new Error("حدد بنكاً له حساب محاسبي لتحصيل الشيك");
          await post(l.debit, l.credit, STATUS_AR[row.status]!, row.status === "pending" ? (row.issue_date ?? row.due_date) : now);
        }
      }
      await db.from("cheques").update({ posted_status: row.status }).eq("id", row.id);
      toast.success("تم ترحيل قيد الشيك");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  }
  return <Button size="icon" variant="ghost" title={`ترحيل قيد: ${STATUS_AR[row.status] ?? ""}`} onClick={go}><BookCheck className="size-4 text-primary" /></Button>;
}

function ChequesPage() {
  const currencies = (useCurrencies().data ?? []).map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }));
  const base = useBaseCurrency() ?? "USD";
  return (
    <Tabs defaultValue="cheques">
      <TabsList className="no-print mb-4">
        <TabsTrigger value="cheques">الشيكات</TabsTrigger>
        <TabsTrigger value="banks">البنوك</TabsTrigger>
      </TabsList>

      <TabsContent value="cheques">
        <CrudPage
          table="cheques"
          module="cheques"
          title="إدارة الشيكات"
          subtitle="بعد تغيير حالة الشيك اضغط زر الترحيل في السطر لتوليد القيد: تسجيل ← تحصيل أو ارتداد"
          orderBy="due_date"
          ascending
          extraRowAction={(row) => <><PostChequeButton row={row} /><RecordNotesButton entityType="cheque" entityId={row.id} label={`شيك رقم ${row.cheque_no}`} /></>}
          fields={[
            { key: "cheque_no", label: "رقم الشيك", required: true },
            {
              key: "direction",
              label: "الاتجاه",
              type: "select",
              required: true,
              defaultValue: "incoming",
              options: [
                { value: "incoming", label: "وارد (برسم التحصيل)" },
                { value: "outgoing", label: "صادر (مدفوع)" },
              ],
            },
            { key: "bank_id", label: "البنك", type: "ref", refTable: "banks" },
            { key: "partner_id", label: "الجهة", type: "ref", refTable: "partners" },
            { key: "amount", label: "المبلغ", type: "number", required: true },
            {
              key: "currency",
              label: "العملة",
              type: "select",
              defaultValue: base,
              options: currencies,
            },
            { key: "issue_date", label: "تاريخ الإصدار", type: "date", defaultValue: today() },
            { key: "due_date", label: "تاريخ الاستحقاق", type: "date", required: true, defaultValue: today() },
            {
              key: "status",
              label: "الحالة",
              type: "select",
              defaultValue: "pending",
              options: [
                { value: "pending", label: "قيد التحصيل" },
                { value: "collected", label: "محصّل" },
                { value: "returned", label: "مرتجع" },
                { value: "cancelled", label: "ملغى" },
              ],
            },
            { key: "notes", label: "ملاحظات", type: "textarea", hideInTable: true },
          ]}
        />
      </TabsContent>

      <TabsContent value="banks">
        <CrudPage
          table="banks"
          module="cheques"
          title="البنوك والحسابات المصرفية"
          orderBy="name"
          ascending
          fields={[
            { key: "name", label: "اسم البنك", required: true },
            { key: "branch", label: "الفرع" },
            { key: "account_no", label: "رقم الحساب" },
            {
              key: "currency",
              label: "العملة",
              type: "select",
              defaultValue: base,
              options: currencies,
            },
            { key: "account_id", label: "الحساب المحاسبي", type: "ref", refTable: "accounts" },
          ]}
        />
      </TabsContent>
    </Tabs>
  );
}
