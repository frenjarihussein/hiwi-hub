import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";
import { exportCsv, printPage } from "@/lib/export";
import { fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Download, Printer, Scale } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/session";
import { postEntry } from "@/lib/post-entry";
import { useBaseCurrency } from "@/lib/currencies";
import { today } from "@/lib/format";

type W = { id: string; name: string; is_group: boolean; parent_id: string | null };
type P = { id: string; sku: string; name: string; unit: string; avg_cost: number; last_purchase_price: number; sale_price: number };
type M = { product_id: string; warehouse_id: string; direction: string; qty: number };
type Row = {
  product_id: string; sku: string; name: string; unit: string; qty: number;
  cost: number; sale: number; costTotal: number; saleTotal: number;
};

/** Per-warehouse on-hand quantities with cost & sale price lists. */
export function StockValuationReport() {
  const [wh, setWh] = useState("all");
  const q = useQuery({
    queryKey: ["stock-valuation"],
    queryFn: async () => {
      const [w, p, m, s] = await Promise.all([
        db.from("warehouses").select("id,name,is_group,parent_id").order("name"),
        db.from("products").select("id,sku,name,unit,avg_cost,last_purchase_price,sale_price,is_group").eq("is_group", false),
        db.from("stock_moves").select("product_id,warehouse_id,direction,qty").range(0, 99999),
        db.from("tenant_settings").select("cost_method,inventory_account_id,cogs_account_id").maybeSingle(),
      ]);
      for (const r of [w, p, m]) if (r.error) throw r.error;
      const st = (s.data ?? {}) as { cost_method?: string; inventory_account_id?: string; cogs_account_id?: string };
      let book = 0;
      if (st.inventory_account_id) {
        const jl = await db.from("journal_lines").select("debit,credit,journal_entries(exchange_rate)").eq("account_id", st.inventory_account_id).range(0, 99999);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        book = (jl.data ?? []).reduce((t: number, l: any) => t + (Number(l.debit) - Number(l.credit)) / (Number(l.journal_entries?.exchange_rate) || 1), 0);
      }
      return { book, invAcc: st.inventory_account_id ?? "", cogsAcc: st.cogs_account_id ?? "", warehouses: (w.data ?? []) as W[], products: (p.data ?? []) as P[], moves: (m.data ?? []) as M[], method: String((s.data as { cost_method?: string } | null)?.cost_method ?? "") };
    },
  });

  const groups = useMemo(() => {
    if (!q.data) return [];
    const useLast = String(q.data.method).includes("last");
    const prod = new Map(q.data.products.map((p) => [p.id, p]));
    const qty = new Map<string, number>();
    for (const mv of q.data.moves) {
      const k = `${mv.warehouse_id}|${mv.product_id}`;
      qty.set(k, (qty.get(k) ?? 0) + (mv.direction === "in" ? 1 : -1) * Number(mv.qty));
    }
    const all = q.data.warehouses;
    const under = new Set<string>();
    if (wh !== "all") {
      const stack = [wh];
      while (stack.length) {
        const id = stack.pop()!;
        under.add(id);
        all.filter((x) => x.parent_id === id).forEach((x) => stack.push(x.id));
      }
    }
    return all
      .filter((w) => !w.is_group && (wh === "all" || under.has(w.id)))
      .map((w) => {
        const rows: Row[] = [];
        for (const [k, v] of qty) {
          const [wid, pid = ""] = k.split("|");
          if (wid !== w.id || Math.abs(v) < 1e-9) continue;
          const p = prod.get(pid);
          if (!p) continue;
          const cost = Number(useLast ? p.last_purchase_price : p.avg_cost) || 0;
          const sale = Number(p.sale_price) || 0;
          rows.push({ product_id: pid, sku: p.sku, name: p.name, unit: p.unit, qty: v, cost, sale, costTotal: v * cost, saleTotal: v * sale });
        }
        rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
        return { w, rows };
      });
  }, [q.data, wh]);

  const { data: me } = useMe();
  const baseCur = useBaseCurrency();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const isLast = String(q.data?.method ?? "").includes("last");
  const stockAtCost = groups.reduce((s, g) => s + g.rows.reduce((t, r) => t + r.costTotal, 0), 0);
  const diff = Math.round((stockAtCost - (q.data?.book ?? 0)) * 100) / 100;
  const postAdjust = async () => {
    if (!q.data?.invAcc || !q.data.cogsAcc) return toast.error("حدد حساب المخزون وحساب تكلفة المبيعات في الإعدادات أولاً");
    if (!me?.tenantId || Math.abs(diff) < 0.01) return undefined;
    setBusy(true);
    try {
      const a = Math.abs(diff);
      const d = "تسوية قيمة المخزون حسب آخر سعر شراء";
      await postEntry(me.tenantId, me.userId, { entry_date: today(), description: d, currency: baseCur ?? "USD" }, [
        { account_id: q.data.invAcc, debit: diff > 0 ? a : 0, credit: diff < 0 ? a : 0, description: d },
        { account_id: q.data.cogsAcc, debit: diff < 0 ? a : 0, credit: diff > 0 ? a : 0, description: d },
      ]);
      toast.success("تم ترحيل قيد تسوية المخزون");
      qc.invalidateQueries({ queryKey: ["stock-valuation"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    return undefined;
  };

  const exportAll = () =>
    exportCsv(
      "stock-by-warehouse.csv",
      [
        { key: "warehouse", label: "المستودع" }, { key: "sku", label: "الرمز" }, { key: "name", label: "المادة" },
        { key: "unit", label: "الوحدة" }, { key: "qty", label: "الكمية" }, { key: "cost", label: "سعر الكلفة" },
        { key: "costTotal", label: "إجمالي الكلفة" }, { key: "sale", label: "سعر المبيع" }, { key: "saleTotal", label: "إجمالي المبيع" },
      ],
      groups.flatMap((g) => g.rows.map((r) => ({ ...r, warehouse: g.w.name }))),
    );

  if (q.isLoading) return <p className="p-4 text-muted-foreground">جاري التحميل...</p>;
  if (q.error) return <p className="p-4 text-destructive">{(q.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={wh} onChange={(e) => setWh(e.target.value)}>
          <option value="all">كل المستودعات</option>
          {q.data?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.is_group ? `${w.name} (رئيسي مع فروعه)` : w.name}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={exportAll}><Download className="ml-1 h-4 w-4" />Excel</Button>
        <Button variant="outline" size="sm" onClick={printPage}><Printer className="ml-1 h-4 w-4" />طباعة</Button>
        <span className="text-xs text-muted-foreground">
          الكلفة حسب: {String(q.data?.method).includes("last") ? "آخر سعر شراء" : "المتوسط المرجّح"}
        </span>
      </div>
      {isLast && wh === "all" && (
        <div className="no-print flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
          <span>قيمة المخزون بآخر سعر شراء: <b className="num">{fmtNum(stockAtCost)}</b></span>
          <span>رصيد حساب المخزون: <b className="num">{fmtNum(q.data?.book ?? 0)}</b></span>
          <span>الفرق: <b className="num">{fmtNum(diff)}</b></span>
          <Button size="sm" disabled={busy || Math.abs(diff) < 0.01} onClick={postAdjust}><Scale className="ml-1 h-4 w-4" />ترحيل قيد التسوية</Button>
        </div>
      )}
      {groups.map(({ w, rows }) => {
        const tc = rows.reduce((s, r) => s + r.costTotal, 0);
        const ts = rows.reduce((s, r) => s + r.saleTotal, 0);
        return (
          <div key={w.id} className="overflow-x-auto rounded-lg border bg-card">
            <h3 className="border-b px-4 py-3 font-bold">{w.name}</h3>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["الرمز", "المادة", "الوحدة", "الكمية", "سعر الكلفة", "إجمالي الكلفة", "سعر المبيع", "إجمالي المبيع"].map((h) => (
                    <th key={h} className="border px-2 py-2 text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">لا توجد بضاعة</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.product_id}>
                    <td className="border px-2 py-1">{r.sku}</td>
                    <td className="border px-2 py-1">{r.name}</td>
                    <td className="border px-2 py-1">{r.unit}</td>
                    <td className="num border px-2 py-1">{fmtNum(r.qty)}</td>
                    <td className="num border px-2 py-1">{fmtNum(r.cost)}</td>
                    <td className="num border px-2 py-1">{fmtNum(r.costTotal)}</td>
                    <td className="num border px-2 py-1">{fmtNum(r.sale)}</td>
                    <td className="num border px-2 py-1">{fmtNum(r.saleTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50 font-bold">
                <tr>
                  <td colSpan={5} className="border px-2 py-2">الإجمالي</td>
                  <td className="num border px-2 py-2">{fmtNum(tc)}</td>
                  <td className="border px-2 py-2" />
                  <td className="num border px-2 py-2">{fmtNum(ts)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </div>
  );
}
