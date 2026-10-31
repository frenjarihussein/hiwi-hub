import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { db } from "@/lib/db";
import { fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SOURCE_LABEL } from "@/components/SourceDoc";
import { WhatsAppDocumentButton } from "@/components/collab/WhatsAppDocumentButton";

/** Read-only view of a document with its lines and the journal entry it generated. */
export function DocumentView({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit?: (id: string) => void }) {
  const q = useQuery({
    queryKey: ["doc_view", id],
    enabled: !!id,
    queryFn: async () => {
      const [d, lines, entries] = await Promise.all([
        db.from("documents").select("*, partners:partner_id(name,phone), warehouses:warehouse_id(name)").eq("id", id).maybeSingle(),
        db.from("document_lines").select("qty,unit_price,products(name,unit)").eq("document_id", id),
        db.from("journal_entries").select("id,entry_no,entry_date,audited,description,currency,exchange_rate,journal_lines(debit,credit,description,accounts(code,name))").eq("document_id", id),
      ]);
      if (d.error) throw d.error;
      return { doc: d.data, lines: lines.data ?? [], entries: entries.data ?? [] };
    },
  });
  const d = q.data?.doc;
  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-screen max-h-screen w-screen max-w-none flex-col gap-3 rounded-none overflow-y-auto p-4 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{d ? `${SOURCE_LABEL[d.doc_type] ?? d.doc_type} رقم ${d.doc_no ?? "—"}` : "عرض المستند"}</DialogTitle>
        </DialogHeader>
        {q.isLoading && <p className="p-4 text-center text-muted-foreground">جارٍ التحميل...</p>}
        {q.isSuccess && !d && <p className="p-4 text-center text-muted-foreground">المستند غير موجود أو لا تملك صلاحية عرضه</p>}
        {d && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 sm:grid-cols-3">
              <div><span className="text-muted-foreground">التاريخ: </span>{fmtDate(d.doc_date)}{d.doc_time ? ` ${String(d.doc_time).slice(0, 5)}` : ""}</div>
              <div><span className="text-muted-foreground">الجهة: </span>{d.partners?.name ?? "—"}</div>
              <div><span className="text-muted-foreground">المستودع: </span>{d.warehouses?.name ?? "—"}</div>
              <div><span className="text-muted-foreground">المبلغ: </span><span className="num">{fmtNum(d.amount)} {d.currency}</span></div>
              {Number(d.discount_amount) > 0 && <div><span className="text-muted-foreground">الحسم: </span><span className="num">{fmtNum(d.discount_amount)} {d.currency}</span></div>}
              {Number(d.freight_amount) > 0 && <div><span className="text-muted-foreground">الإضافات: </span><span className="num">{fmtNum(d.freight_amount)} {d.currency}</span></div>}
              <div><span className="text-muted-foreground">الحالة: </span>{d.status === "posted" ? "مرحّل" : "غير مرحّل"} · {q.data!.entries.some((e: { audited?: boolean }) => e.audited) ? "مدقق" : "غير مدقق"}</div>
              {d.notes && <div className="sm:col-span-3"><span className="text-muted-foreground">ملاحظات: </span>{d.notes}</div>}
            </div>
            {q.data!.lines.length > 0 && (
              <table className="w-full border text-sm">
                <thead className="bg-secondary"><tr><th className="border p-2 text-right">المادة</th><th className="border p-2 text-right">الكمية</th><th className="border p-2 text-right">السعر</th><th className="border p-2 text-right">المجموع</th></tr></thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {q.data!.lines.map((l: any, i: number) => (
                    <tr key={i}><td className="border p-2">{l.products?.name}</td><td className="border p-2"><span className="num">{fmtNum(l.qty)}</span> {l.products?.unit}</td><td className="num border p-2">{fmtNum(l.unit_price)}</td><td className="num border p-2">{fmtNum(l.qty * l.unit_price)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div>
              <h3 className="mb-2 font-semibold">القيد المحاسبي الناتج عن المستند</h3>
              {q.data!.entries.length === 0 && <p className="text-muted-foreground">لا يوجد قيد بعد — يُنشأ القيد عند ترحيل المستند.</p>}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {q.data!.entries.map((e: any) => (
                <div key={e.id} className="mb-3 rounded-lg border">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                    <span>قيد رقم <span className="num">{e.entry_no}</span> · {fmtDate(e.entry_date)} · {e.currency}</span>
                    <Link to="/journal/$entryId" params={{ entryId: e.id }} onClick={onClose} className="text-primary underline">فتح القيد</Link>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-right">الحساب</th><th className="p-2 text-right">البيان</th><th className="p-2 text-right">مدين</th><th className="p-2 text-right">دائن</th></tr></thead>
                    <tbody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(e.journal_lines ?? []).map((l: any, i: number) => (
                        <tr key={i} className="border-t"><td className="p-2">{l.accounts?.code} - {l.accounts?.name}</td><td className="p-2 text-muted-foreground">{l.description ?? ""}</td><td className="num p-2">{Number(l.debit) ? fmtNum(l.debit) : ""}</td><td className="num p-2">{Number(l.credit) ? fmtNum(l.credit) : ""}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <WhatsAppDocumentButton doc={d} lines={q.data!.lines} title={`${SOURCE_LABEL[d.doc_type] ?? d.doc_type} رقم ${d.doc_no ?? "—"}`} />
              {onEdit && <Button variant="outline" onClick={() => onEdit(d.id)}>فتح للتعديل</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
