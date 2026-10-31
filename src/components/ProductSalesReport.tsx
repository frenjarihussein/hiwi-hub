import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { fmtNum } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SALE_TYPES: Record<string, string> = { sale: "فاتورة بيع", sale_return: "مرتجع بيع", pos_sale: "بيع نقطة بيع", purchase: "فاتورة شراء", purchase_return: "مرتجع شراء", quote: "عرض سعر" };

/** Every invoice line of one item (stock or service): how many times sold, dates and invoices. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ProductSalesReport({ product, onClose }: { product: any; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["product_sales", product?.id],
    enabled: !!product?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("document_lines")
        .select("id, qty, unit_price, documents(doc_no, doc_date, doc_type, status, partners(name))")
        .eq("product_id", product.id);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).filter((r) => r.documents).sort((a, b) => String(b.documents.doc_date).localeCompare(String(a.documents.doc_date)));
    },
  });
  const rows = q.data ?? [];
  const sales = rows.filter((r) => String(r.documents.doc_type).includes("sale") && !String(r.documents.doc_type).includes("return"));
  const total = sales.reduce((a, r) => a + Number(r.qty) * Number(r.unit_price), 0);
  const buys = rows.filter((r) => r.documents.doc_type === "purchase");
  const buyTotal = buys.reduce((a, r) => a + Number(r.qty) * Number(r.unit_price), 0);
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{product?.item_type === "service" ? "تقرير الخدمة" : "تقرير مبيعات"}: {product?.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded border p-2">عدد مرات البيع: <b className="num">{sales.length}</b></div>
          <div className="rounded border p-2">الكمية المباعة: <b className="num">{fmtNum(sales.reduce((a, r) => a + Number(r.qty), 0))}</b></div>
          <div className="rounded border p-2">قيمة المبيعات: <b className="num">{fmtNum(total)}</b></div>
          <div className="rounded border p-2">عدد مرات الشراء: <b className="num">{buys.length}</b></div>
          <div className="rounded border p-2">قيمة المشتريات: <b className="num">{fmtNum(buyTotal)}</b></div>
          <div className="rounded border p-2">آخر حركة: <b className="num">{rows[0]?.documents.doc_date ?? "—"}</b></div>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">التاريخ</th><th className="p-2 text-start">الفاتورة</th><th className="p-2 text-start">النوع</th><th className="p-2 text-start">الطرف</th><th className="p-2 text-start">الكمية</th><th className="p-2 text-start">السعر</th><th className="p-2 text-start">القيمة</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="num p-2">{r.documents.doc_date}</td>
                  <td className="num p-2">{r.documents.doc_no ?? "—"}</td>
                  <td className="p-2">{SALE_TYPES[r.documents.doc_type] ?? r.documents.doc_type}</td>
                  <td className="p-2">{r.documents.partners?.name ?? "—"}</td>
                  <td className="num p-2">{fmtNum(r.qty)}</td>
                  <td className="num p-2">{fmtNum(r.unit_price)}</td>
                  <td className="num p-2">{fmtNum(Number(r.qty) * Number(r.unit_price))}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">{q.isLoading ? "جارٍ التحميل..." : "لا توجد فواتير لهذه المادة"}</td></tr>}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
