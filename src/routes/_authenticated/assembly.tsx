import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtDate, fmtNum, today } from "@/lib/format";
import { pageHead } from "@/lib/page-head";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/assembly")({
  head: () => pageHead("سندات الفك والتجميع", "حوّل عدة مواد إلى طقم واحد أو فك مادة إلى مكوناتها مع توزيع التكلفة وتحديث المخزون والقيد بين المستودعات."),
  component: AssemblyPage,
});

type Comp = { product_id: string; qty: string };
type Prod = { id: string; name: string; unit: string | null; avg_cost: number | null };
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const blank = { product_id: "", warehouse_id: "", to_warehouse_id: "", qty: "1", date: today(), notes: "" };

function AssemblyPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"assemble" | "disassemble">("assemble");
  const [f, setF] = useState(blank);
  const [comps, setComps] = useState<Comp[]>([{ product_id: "", qty: "1" }]);

  const ref = useQuery({
    queryKey: ["assembly_refs", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [p, w, r] = await Promise.all([
        scope(db.from("products").select("id,name,unit,avg_cost").eq("is_group", false).neq("item_type", "service"), me?.tenantId).order("name"),
        scope(db.from("warehouses").select("id,name").eq("is_group", false), me?.tenantId).order("name"),
        scope(db.from("product_recipes").select("product_id,component_product_id,qty"), me?.tenantId),
      ]);
      return { products: (p.data ?? []) as Prod[], warehouses: (w.data ?? []) as { id: string; name: string }[], recipes: (r.data ?? []) as { product_id: string; component_product_id: string; qty: number }[] };
    },
  });
  const list = useQuery({
    queryKey: ["assembly_vouchers", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(db.from("assembly_vouchers").select("*, products(name,unit), journal_entries(entry_no)"), me?.tenantId).order("voucher_no", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const products = ref.data?.products ?? [];
  const whs = ref.data?.warehouses ?? [];
  const pName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const wName = (id: string | null) => whs.find((w) => w.id === id)?.name ?? "";

  function pickProduct(id: string) {
    setF((s) => ({ ...s, product_id: id }));
    // Prefill the parts from the item's saved recipe, scaled to the entered quantity.
    const rec = (ref.data?.recipes ?? []).filter((r) => r.product_id === id);
    if (rec.length) setComps(rec.map((r) => ({ product_id: r.component_product_id, qty: String(Number(r.qty) * (Number(f.qty) || 1)) })));
  }

  const kitQty = Number(f.qty) || 0;
  const estimate = comps.reduce((a, c) => a + (Number(c.qty) || 0) * Number(products.find((p) => p.id === c.product_id)?.avg_cost ?? 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      const clean = comps.filter((c) => c.product_id && Number(c.qty) > 0).map((c) => ({ product_id: c.product_id, qty: Number(c.qty) }));
      const { error } = await db.rpc("post_assembly", { _mode: mode, _warehouse: f.warehouse_id || null, _to_warehouse: f.to_warehouse_id || null, _date: f.date, _product: f.product_id || null, _qty: kitQty, _components: clean, _notes: f.notes });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(mode === "assemble" ? "تم التجميع وتحديث المخزون" : "تم الفك وتحديث المخزون");
      setOpen(false);
      setF({ ...blank, warehouse_id: f.warehouse_id });
      setComps([{ product_id: "", qty: "1" }]);
      void qc.invalidateQueries({ queryKey: ["assembly_vouchers"] });
      void qc.invalidateQueries({ queryKey: ["stock_moves"] });
      void qc.invalidateQueries({ queryKey: ["assembly_refs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const start = (m: "assemble" | "disassemble") => { setMode(m); setOpen(true); };
  const canCreate = can(me, "stock", "create");

  return (
    <div>
      <PageHeader
        title="سندات الفك والتجميع"
        subtitle="التجميع: مكونات تخرج وتدخل مادة واحدة بتكلفتها. الفك: مادة تخرج وتدخل مكوناتها بتوزيع تكلفتها. بين مستودعين بحسابين مختلفين يُنشأ قيد تلقائي."
        actions={canCreate ? (<div className="flex gap-2"><Button onClick={() => start("assemble")}><Plus className="size-4" />تجميع</Button><Button variant="outline" onClick={() => start("disassemble")}><Plus className="size-4" />فك</Button></div>) : null}
      />
      <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary"><tr>{["الرقم", "النوع", "التاريخ", "المادة", "الكمية", "المستودع", "المكونات", "التكلفة", "القيد"].map((h) => <th key={h} className="px-3 py-2 text-right">{h}</th>)}</tr></thead>
          <tbody>
            {(list.data ?? []).map((v: any) => (
              <tr key={v.id} className="border-t align-top">
                <td className="px-3 py-2">#{v.voucher_no}</td>
                <td className="px-3 py-2">{v.mode === "assemble" ? "تجميع" : "فك"}</td>
                <td className="px-3 py-2">{fmtDate(v.voucher_date)}</td>
                <td className="px-3 py-2">{v.products?.name}</td>
                <td className="px-3 py-2">{fmtNum(v.qty)} {v.products?.unit ?? ""}</td>
                <td className="px-3 py-2">{wName(v.warehouse_id)}{v.to_warehouse_id ? ` ← ${wName(v.to_warehouse_id)}` : ""}</td>
                <td className="px-3 py-2 text-xs">{(v.components ?? []).map((c: any) => `${pName(c.product_id)} × ${fmtNum(c.qty)}`).join("، ")}</td>
                <td className="px-3 py-2">{fmtNum(v.total_cost)}</td>
                <td className="px-3 py-2">{v.journal_entry_id ? <Link className="text-primary underline" to="/journal/$entryId" params={{ entryId: v.journal_entry_id }}>#{v.journal_entries?.entry_no ?? "—"}</Link> : "—"}</td>
              </tr>
            ))}
            {(list.data ?? []).length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">{list.isLoading ? "جارٍ التحميل..." : "لا توجد سندات بعد"}</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Boxes className="size-4" />{mode === "assemble" ? "سند تجميع" : "سند فك"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>{mode === "assemble" ? "المادة الناتجة (الطقم)" : "المادة المراد فكها"}</Label>
              <select className={sel} value={f.product_id} onChange={(e) => pickProduct(e.target.value)}><option value="">— اختر —</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="space-y-1"><Label>الكمية</Label><Input type="number" min="0" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></div>
            <div className="space-y-1"><Label>{mode === "assemble" ? "مستودع صرف المكونات" : "مستودع صرف المادة"}</Label>
              <select className={sel} value={f.warehouse_id} onChange={(e) => setF({ ...f, warehouse_id: e.target.value })}><option value="">— اختر —</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="space-y-1"><Label>{mode === "assemble" ? "مستودع استلام الطقم" : "مستودع استلام المكونات"}</Label>
              <select className={sel} value={f.to_warehouse_id} onChange={(e) => setF({ ...f, to_warehouse_id: e.target.value })}><option value="">نفس المستودع</option>{whs.filter((w) => w.id !== f.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
              {f.to_warehouse_id && <p className="text-[11px] text-muted-foreground">يُنشأ قيد من حساب مستودع الصرف إلى حساب مستودع الاستلام.</p>}</div>
            <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div className="space-y-1"><Label>ملاحظات</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{mode === "assemble" ? "المكونات المستهلكة (إجمالي الكمية)" : "المكونات الناتجة (إجمالي الكمية)"}</h3>
              <Button size="sm" variant="outline" onClick={() => setComps([...comps, { product_id: "", qty: "1" }])}><Plus className="size-4" />مكوّن</Button>
            </div>
            <div className="space-y-2">
              {comps.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <select className={sel} value={c.product_id} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))}>
                    <option value="">— اختر —</option>{products.filter((p) => p.id !== f.product_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Input className="w-28" type="number" min="0" value={c.qty} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                  <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => setComps(comps.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {mode === "assemble" ? `تكلفة الوحدة الناتجة تقديرياً: ${fmtNum(kitQty ? estimate / kitQty : 0)} (من متوسط تكلفة المكونات).` : "تُوزَّع تكلفة المادة المفكوكة على المكونات حسب قيمتها الحالية."}
              {" "}إذا كان للمادة وصفة محفوظة تُعبّأ مكوناتها تلقائياً.
            </p>
          </div>
          <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "جارٍ الترحيل..." : "ترحيل السند"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
