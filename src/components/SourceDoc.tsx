import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { AttachmentsButton } from "@/components/AttachmentsButton";
import { DocumentView } from "@/components/DocumentView";

export const SOURCE_LABEL: Record<string, string> = {
  opening_inventory: "فاتورة بضاعة أول المدة", closing_inventory: "فاتورة بضاعة آخر المدة",
  manual: "قيد يدوي", sale: "فاتورة مبيع", purchase: "فاتورة شراء", receipt: "سند قبض", payment: "سند دفع", sale_return: "مرتجع مبيع", purchase_return: "مرتجع شراء",
  stock_in: "إدخال مستودع", stock_out: "إخراج إلى مشروع", transfer: "مناقلة مستودعات", opening: "قيد افتتاحي", closing: "قيد إقفال", quote: "عرض سعر", pos_shift: "إغلاق وردية",
};

/** Shows the origin document of a journal entry; clicking opens it read-only in place. */
export function SourceDoc({ docType, documentId, full }: { docType: string; documentId: string | null; full?: boolean }) {
  const [view, setView] = useState<string | null>(null);
  const navigate = useNavigate();
  const edit = () => { void navigate({ to: "/documents", search: { edit: documentId! } }); };
  const doc = useQuery({
    queryKey: ["source_doc", documentId],
    enabled: !!documentId,
    queryFn: async () => (await db.from("documents").select("id,doc_no,doc_type,doc_date,amount,currency,notes").eq("id", documentId!).maybeSingle()).data,
  });
  const label = SOURCE_LABEL[doc.data?.doc_type ?? docType] ?? docType;
  if (!documentId) return <span className="text-xs text-muted-foreground">{label}</span>;
  const dialog = <DocumentView id={view} onClose={() => setView(null)} />;
  if (!full)
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <button type="button" onClick={edit} className="text-primary underline" title="فتح المستند الأصلي للتعديل">{label}{doc.data?.doc_no ? <span className="num"> #{doc.data.doc_no}</span> : null}</button>
        <AttachmentsButton entityType="document" entityId={documentId} docType={doc.data?.doc_type} />
        {dialog}
      </span>
    );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded border bg-muted/40 p-3 text-sm">
      <b>أصل السند:</b>
      <button type="button" onClick={edit} className="text-primary underline">{label} {doc.data?.doc_no ? <span className="num">رقم {doc.data.doc_no}</span> : null} — فتح للتعديل</button>
      <button type="button" onClick={() => setView(documentId)} className="text-xs text-muted-foreground underline">معاينة</button>
      {doc.data && <span>{fmtDate(doc.data.doc_date)}</span>}
      {doc.data && <span className="num">{fmtMoney(doc.data.amount, doc.data.currency)}</span>}
      {doc.data?.notes && <span className="text-muted-foreground">{doc.data.notes}</span>}
      <span className="no-print"><AttachmentsButton entityType="document" entityId={documentId} docType={doc.data?.doc_type} variant="outline" label="مرفقات المستند الأصلي" /></span>
      {dialog}
    </div>
  );
}
