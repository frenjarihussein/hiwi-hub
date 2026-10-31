import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db, scope } from "@/lib/db";
import { offlineKey } from "@/lib/offline-store";
import { readQueue, subscribeQueue, type PosSale } from "@/lib/pos-offline";
import { localStatementRows } from "@/lib/local-statement";
import { fmtDate, fmtNum } from "@/lib/format";

const labels = { sale: "فاتورة مبيع", purchase: "فاتورة شراء", sale_return: "مرتجع مبيع", purchase_return: "مرتجع شراء", receipt: "تسديد نقدي — قبض", payment: "تسديد نقدي — دفع" };

export function LocalInvoiceStatement({ partnerId, tenantId, base, officialBalance, officialReady, journalDocumentIds }: {
  partnerId: string; tenantId: string | null; base: string; officialBalance: number; officialReady: boolean; journalDocumentIds: string[];
}) {
  const [sales, setSales] = useState<PosSale[]>([]);
  const scopeKey = offlineKey();
  useEffect(() => {
    const update = () => setSales(readQueue().filter((sale) => sale.partnerId === partnerId));
    update();
    const unsubscribe = subscribeQueue(update);
    window.addEventListener("storage", update);
    return () => { unsubscribe(); window.removeEventListener("storage", update); };
  }, [partnerId, scopeKey]);
  const ids = sales.flatMap((sale) => [sale.id, sale.voucherId]);
  const posted = useQuery({
    queryKey: ["local-statement-posted", scopeKey, partnerId, ids],
    enabled: !!tenantId && ids.length > 0,
    networkMode: "always",
    retry: false,
    refetchInterval: 5000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await scope(db.from("documents").select("id").eq("status", "posted").in("id", ids), tenantId);
      if (error) throw error;
      return (data ?? []).map((row: { id: string }) => row.id);
    },
  });
  if (!sales.length) return null;
  const rows = localStatementRows(sales, partnerId, base, new Set([...journalDocumentIds, ...(posted.data ?? [])]));
  if (!rows.length) return null;
  const change = rows.reduce((sum, row) => sum + row.baseAmount, 0);
  return <section className="mt-6 border-t border-border pt-4" aria-label="الفواتير المحلية">
    <h2 className="font-semibold text-primary">الفواتير المحلية — غير مرحّلة رسمياً</h2>
    <p className="mt-1 text-sm text-muted-foreground">تقدير من فواتير نقطة البيع على هذا الجهاز فقط؛ لا يغيّر الرصيد الرسمي ولا يشمل الأجهزة الأخرى.</p>
    <div className="my-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <span>صافي الحركات المحلية: <strong>{fmtNum(change)} {base}</strong></span>
      {officialReady && <span>الرصيد التقديري مع المحلي: <strong>{fmtNum(officialBalance + change)} {base}</strong></span>}
    </div>
    {(posted.isError || !officialReady) && <p className="mb-3 text-sm text-warning-foreground">تعذّر تحديث الرصيد أو التحقق من بعض الفواتير؛ الأرقام تقديرية وقد تتضمن عملية وصلت أثناء انقطاع الرد.</p>}
    <div className="overflow-x-auto">
      <table className="w-full border text-sm">
        <thead className="bg-secondary"><tr>
          {["الرقم المحلي", "التاريخ", "الحركة", "العملة", "مدين", "دائن", `المعادل (${base})`].map((label) => <th key={label} className="border px-2 py-2 text-right">{label}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td className="max-w-52 break-all border px-2 py-2" dir="ltr">{row.number}</td>
          <td className="whitespace-nowrap border px-2 py-2">{fmtDate(row.date)}</td>
          <td className="border px-2 py-2">{labels[row.kind]}</td>
          <td className="border px-2 py-2">{row.currency}</td>
          <td className="border px-2 py-2">{fmtNum(row.debit)}</td>
          <td className="border px-2 py-2">{fmtNum(row.credit)}</td>
          <td className="border px-2 py-2">{fmtNum(row.baseAmount)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}