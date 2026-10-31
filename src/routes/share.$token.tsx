import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Send } from "lucide-react";
import { getSharedRecord, postPartnerInquiry } from "@/lib/share.functions";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/share/$token")({
  head: () => ({ meta: [
    { title: "مستند مشترك | يوسف سوفت" },
    { name: "description", content: "اطّلع على الفاتورة أو كشف الحساب وأرسل استفسارك مباشرة إلى الشركة." },
    { property: "og:title", content: "مستند مشترك | يوسف سوفت" },
    { property: "og:description", content: "اطّلع على الفاتورة أو كشف الحساب وأرسل استفسارك مباشرة إلى الشركة." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: SharePage,
});

const DOC_LABEL: Record<string, string> = { sale: "فاتورة بيع", purchase: "فاتورة شراء", sale_return: "مرتجع بيع", purchase_return: "مرتجع شراء", receipt: "سند قبض", payment: "سند دفع", quote: "عرض سعر" };

function SharePage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["share", token], queryFn: () => getSharedRecord({ data: { token } }) });
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setErr("");
    try {
      await postPartnerInquiry({ data: { token, name, body } });
      setBody("");
      qc.invalidateQueries({ queryKey: ["share", token] });
    } catch (e) { setErr(e instanceof Error ? e.message : "تعذّر الإرسال"); }
    setBusy(false);
  }
  if (q.isLoading) return <p className="p-10 text-center text-muted-foreground">جارٍ التحميل...</p>;
  const d = q.data;
  if (!d || !d.ok) return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-secondary p-6 text-center"><div className="rounded-xl border bg-card p-8"><h1 className="text-lg font-bold">الرابط غير صالح أو منتهي الصلاحية</h1><p className="mt-2 text-sm text-muted-foreground">تواصل مع الشركة للحصول على رابط جديد.</p></div></div>;
  return (
    <div dir="rtl" className="min-h-screen bg-secondary px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-xl border bg-card p-6">
          <div className="mb-4 border-b pb-3 text-center">
            <h1 className="text-xl font-bold">{d.tenantName}</h1>
            <h2 className="mt-1 text-muted-foreground">{d.label}</h2>
          </div>
          {d.document && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <div><span className="text-muted-foreground">النوع: </span>{DOC_LABEL[d.document.doc_type] ?? d.document.doc_type}</div>
                <div><span className="text-muted-foreground">الرقم: </span>{d.document.doc_no}</div>
                <div><span className="text-muted-foreground">التاريخ: </span>{fmtDate(d.document.doc_date)}</div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <div><span className="text-muted-foreground">الجهة: </span>{(d.document as any).partners?.name ?? "—"}</div>
              </div>
              {d.lines.length > 0 && (
                <table className="mb-3 w-full border text-sm">
                  <thead className="bg-secondary"><tr><th className="border px-2 py-1 text-right">المادة</th><th className="border px-2 py-1 text-right">الكمية</th><th className="border px-2 py-1 text-right">السعر</th><th className="border px-2 py-1 text-right">الإجمالي</th></tr></thead>
                  <tbody>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {d.lines.map((l: any, i: number) => <tr key={i}><td className="border px-2 py-1">{l.products?.name}</td><td className="border px-2 py-1">{fmtNum(l.qty)}</td><td className="border px-2 py-1">{fmtNum(l.unit_price)}</td><td className="border px-2 py-1">{fmtNum(Number(l.qty) * Number(l.unit_price))}</td></tr>)}
                  </tbody>
                </table>
              )}
              <p className="text-lg font-bold">المبلغ الإجمالي: {fmtNum(d.document.amount)} {d.document.currency}</p>
              {d.document.notes && <p className="mt-2 text-sm text-muted-foreground">{d.document.notes}</p>}
            </>
          )}
          {d.statement && (
            <>
              <p className="mb-2 text-sm"><span className="text-muted-foreground">كشف حساب: </span><span className="font-semibold">{d.statement.partner}</span></p>
              <div className="overflow-x-auto">
                <table className="w-full border text-sm">
                  <thead className="bg-secondary"><tr>{["التاريخ", "البيان", "مدين", "دائن", "الرصيد"].map((h) => <th key={h} className="border px-2 py-1 text-right">{h}</th>)}</tr></thead>
                  <tbody>{d.statement.rows.map((r, i) => <tr key={i}><td className="border px-2 py-1">{fmtDate(r.date)}</td><td className="border px-2 py-1">{r.description}</td><td className="border px-2 py-1">{fmtNum(r.debit)}</td><td className="border px-2 py-1">{fmtNum(r.credit)}</td><td className="border px-2 py-1 font-medium">{fmtNum(r.balance)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h3 className="mb-3 font-semibold">استفسارات وملاحظات</h3>
          <div className="mb-4 space-y-2">
            {d.inquiries.map((m) => (
              <div key={m.id} className={`flex ${m.from_partner ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.from_partner ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  <div className="mb-0.5 text-[11px] opacity-80">{m.author_name ?? (m.from_partner ? "أنت" : d.tenantName)} · {fmtDateTime(m.created_at)}</div>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            ))}
            {!d.inquiries.length && <p className="text-sm text-muted-foreground">هل لديك سؤال حول هذا المستند؟ اكتبه هنا وسيصل مباشرة إلى الشركة.</p>}
          </div>
          <div className="space-y-2">
            <Input placeholder="اسمك" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            <Textarea rows={3} placeholder="اكتب استفسارك..." value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button disabled={busy || !name.trim() || !body.trim()} onClick={send}><Send className="size-4" />إرسال الاستفسار</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
