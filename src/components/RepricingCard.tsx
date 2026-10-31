import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { usePriceNames, repriceValue } from "@/lib/prices";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { id: string; sku: string; name: string; purchase_price: number; sale_price: number; prices: Record<string, number> | null };

/** "New pricing": load every product, apply a % change with rounding, edit by hand, then save. */
export function RepricingCard({ editable }: { editable: boolean }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const names = usePriceNames();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [pct, setPct] = useState("10");
  const [round, setRound] = useState("1");
  const [target, setTarget] = useState("sale_price");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    const { data, error } = await db.from("products").select("id,sku,name,purchase_price,sale_price,prices").eq("tenant_id", me!.tenantId).eq("is_group", false).order("name");
    if (error) { toast.error(error.message); return; }
    setRows(data as Row[]);
    setOrig(Object.fromEntries((data as Row[]).map((r) => [r.id, JSON.stringify(r)])));
  }

  const get = (r: Row, k: string) => (k.startsWith("prices.") ? Number(r.prices?.[k.slice(7)] ?? 0) : Number((r as any)[k] ?? 0));
  const put = (r: Row, k: string, v: number): Row => (k.startsWith("prices.") ? { ...r, prices: { ...(r.prices ?? {}), [k.slice(7)]: v } } : { ...r, [k]: v });

  function apply() {
    if (!rows) return;
    setRows(rows.map((r) => put(r, target, repriceValue(get(r, target), Number(pct) || 0, Number(round) || 0))));
  }

  async function save() {
    if (!rows) return;
    const changed = rows.filter((r) => orig[r.id] !== JSON.stringify(r));
    if (!changed.length) { toast.info("لا توجد تغييرات"); return; }
    setBusy(true);
    for (const r of changed) {
      const { error } = await db.from("products").update({ purchase_price: r.purchase_price, sale_price: r.sale_price, prices: r.prices ?? {} }).eq("id", r.id);
      if (error) { setBusy(false); toast.error(error.message); return; }
    }
    setBusy(false);
    toast.success(`تم حفظ أسعار ${changed.length} مادة`);
    qc.invalidateQueries({ queryKey: ["products"] });
    load();
  }

  const cols = [
    { k: "purchase_price", l: "سعر الشراء" },
    { k: "sale_price", l: "سعر البيع" },
    ...names.map((n, i) => ({ k: `prices.${i + 1}`, l: n })),
  ];
  const shown = (rows ?? []).filter((r) => !q || r.name.includes(q) || r.sku?.includes(q));

  return (
    <div className="mb-8">
      <PageHeader title="تسعير جديد" subtitle="اعرض كل المواد بأسعارها، طبّق زيادة أو تخفيضاً بنسبة مع التقريب، وعدّل يدوياً قبل الحفظ" />
      <div className="max-w-5xl space-y-3 rounded-lg border bg-card p-5">
        {!rows ? (
          <Button onClick={load} disabled={!me?.tenantId}>عرض المواد وأسعارها</Button>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><Label>السعر</Label>
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                  {cols.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>النسبة % (سالبة للتخفيض)</Label><Input className="w-28" type="number" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
              <div className="space-y-1"><Label>التقريب إلى</Label>
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={round} onChange={(e) => setRound(e.target.value)}>
                  {["0", "0.01", "0.5", "1", "5", "10", "50", "100", "500", "1000"].map((v) => <option key={v} value={v}>{v === "0" ? "بدون" : v}</option>)}
                </select>
              </div>
              <Button variant="outline" onClick={apply} disabled={!editable}>تطبيق على الكل</Button>
              <Input className="w-48" placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
              <Button onClick={save} disabled={!editable || busy}>حفظ الأسعار</Button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card"><tr className="border-b text-muted-foreground">
                  <th className="py-2 text-right">الرمز</th><th className="py-2 text-right">المادة</th>
                  {cols.map((c) => <th key={c.k} className="py-2 text-right">{c.l}</th>)}
                </tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="num py-1">{r.sku}</td><td className="py-1">{r.name}</td>
                      {cols.map((c) => (
                        <td key={c.k} className="py-1">
                          <Input className="h-8 w-28" type="number" disabled={!editable} value={String(get(r, c.k))}
                            onChange={(e) => setRows((cur) => cur!.map((x) => (x.id === r.id ? put(x, c.k, Number(e.target.value) || 0) : x)))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
