import { useBaseCurrency } from "@/lib/currencies";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtDate, fmtNum, today } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Factory, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manufacturing")({
  head: () => ({
    meta: [
      { title: "أوامر التصنيع | يوسف سوفت" },
      { name: "description", content: "حوّل المواد الخام إلى منتج تام بتكلفة فعلية عبر أوامر التصنيع مع قيد محاسبي تلقائي." },
      { property: "og:title", content: "أوامر التصنيع | يوسف سوفت" },
      { property: "og:description", content: "حوّل المواد الخام إلى منتج تام بتكلفة فعلية عبر أوامر التصنيع مع قيد محاسبي تلقائي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManufacturingPage,
});

type Material = { component_product_id: string; qty: string; unit_cost: string };

function ManufacturingPage() {
  const baseCur = useBaseCurrency();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const emptyForm = { product_id: "", warehouse_id: "", qty: "1", mo_date: today(), labor_cost: "0", overhead_cost: "0", overhead_account_id: "", wip_account_id: "", scrap_pct: "0", standard_unit_cost: "0", currency: baseCur, notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [byps, setByps] = useState<{ product_id: string; qty: string; unit_value: string }[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([{ component_product_id: "", qty: "1", unit_cost: "0" }]);

  const list = useQuery({
    queryKey: ["manufacturing_orders", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(
        db.from("manufacturing_orders").select("*, products(name, unit), warehouses(name), journal_entries(entry_no)"),
        me?.tenantId,
      ).order("mo_no", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ref = useQuery({
    queryKey: ["mo_refs", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [products, warehouses, accounts] = await Promise.all([
        scope(db.from("products").select("id,name,unit,avg_cost").eq("is_group", false), me?.tenantId).order("name"),
        scope(db.from("warehouses").select("id,name").eq("is_group", false), me?.tenantId).order("name"),
        scope(db.from("accounts").select("id,code,name").eq("is_group", false), me?.tenantId).order("code"),
      ]);
      return { products: products.data ?? [], warehouses: warehouses.data ?? [], accounts: (accounts.data ?? []) as { id: string; code: string; name: string }[] };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.product_id) throw new Error("اختر المنتج التام");
      if (!form.warehouse_id) throw new Error("اختر المستودع");
      const clean = materials.filter((m) => m.component_product_id && Number(m.qty) > 0);
      if (!clean.length) throw new Error("أضف مادة خام واحدة على الأقل");
      const { data: mo, error } = await db
        .from("manufacturing_orders")
        .insert({
          tenant_id: me!.tenantId,
          product_id: form.product_id,
          warehouse_id: form.warehouse_id,
          qty: Number(form.qty) || 1,
          mo_date: form.mo_date,
          labor_cost: Number(form.labor_cost) || 0,
          overhead_cost: Number(form.overhead_cost) || 0,
          overhead_account_id: form.overhead_account_id || null,
          wip_account_id: form.wip_account_id || null,
          scrap_pct: Number(form.scrap_pct) || 0,
          standard_unit_cost: Number(form.standard_unit_cost) || 0,
          currency: form.currency,
          notes: form.notes || null,
          created_by: me!.userId,
        })
        .select()
        .single();
      if (error) throw error;
      const { error: mErr } = await db.from("manufacturing_materials").insert(
        clean.map((m) => ({
          tenant_id: me!.tenantId,
          order_id: mo.id,
          component_product_id: m.component_product_id,
          qty: Number(m.qty),
          unit_cost: Number(m.unit_cost) || 0,
        })),
      );
      if (mErr) throw mErr;
      const bp = byps.filter((b) => b.product_id && Number(b.qty) > 0);
      if (bp.length) {
        const { error: bErr } = await db.from("manufacturing_byproducts").insert(bp.map((b) => ({ tenant_id: me!.tenantId!, order_id: mo.id, product_id: b.product_id, qty: Number(b.qty), unit_value: Number(b.unit_value) || 0 })));
        if (bErr) throw bErr;
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ أمر التصنيع كمسودة");
      setOpen(false);
      setForm(emptyForm);
      setByps([]);
      setMaterials([{ component_product_id: "", qty: "1", unit_cost: "0" }]);
      qc.invalidateQueries({ queryKey: ["manufacturing_orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.rpc("complete_mo", { _id: id });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (entryId) => {
      toast.success(entryId ? "تم إنجاز أمر التصنيع وترحيل قيد التكلفة" : "تم إنجاز أمر التصنيع");
      qc.invalidateQueries({ queryKey: ["manufacturing_orders"] });
      qc.invalidateQueries({ queryKey: ["stock_moves"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stage = useMutation({
    mutationFn: async ({ id, st }: { id: string; st: string }) => {
      const { error } = await db.rpc("set_mo_stage", { _id: id, _stage: st });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تحديث مرحلة الأمر"); qc.invalidateQueries({ queryKey: ["manufacturing_orders"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("manufacturing_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الأمر");
      qc.invalidateQueries({ queryKey: ["manufacturing_orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="أوامر التصنيع"
        subtitle="الأمر يحوّل المواد الخام إلى منتج تام بتكلفة فعلية (مواد + عمالة) مع قيد محاسبي تلقائي عند الإنجاز"
        actions={
          can(me, "stock", "create") ? (
            <div className="flex gap-2"><Button variant="outline" onClick={() => setShowReport(!showReport)}>{showReport ? "الأوامر" : "تقرير التكاليف والانحرافات"}</Button><Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              أمر تصنيع
            </Button></div>
          ) : null
        }
      />

      {showReport && <CostReport rows={list.data ?? []} />}
      <div className={`mt-3 overflow-x-auto rounded-lg border bg-card ${showReport ? "hidden" : ""}`}>
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2 text-right">الرقم</th>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2 text-right">المنتج</th>
              <th className="px-3 py-2 text-right">الكمية</th>
              <th className="px-3 py-2 text-right">أجور</th>
              <th className="px-3 py-2 text-center">الحالة</th>
              <th className="px-3 py-2 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((o: any) => (
              <tr key={o.id} className="border-t">
                <td className="px-3 py-2">#{o.mo_no}</td>
                <td className="px-3 py-2">{fmtDate(o.mo_date)}</td>
                <td className="px-3 py-2">{o.products?.name ?? "—"}</td>
                <td className="px-3 py-2">{fmtNum(o.qty)} {o.products?.unit ?? ""}</td>
                <td className="px-3 py-2">{fmtNum(o.labor_cost)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${o.status === "completed" ? "bg-status-posted text-status-posted-foreground" : "bg-status-draft text-status-draft-foreground"}`}>
                    {o.status === "completed" ? "منجز" : STAGES[o.stage] ?? "مخطط"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-center gap-2">
                    {o.status === "draft" ? (
                      <>
                        {can(me, "stock", "create") && NEXT[o.stage ?? "planned"] && (
                          <Button size="sm" variant="secondary" disabled={stage.isPending} onClick={() => stage.mutate({ id: o.id, st: NEXT[o.stage ?? "planned"]! })}>
                            ← {STAGES[NEXT[o.stage ?? "planned"]!]}
                          </Button>
                        )}
                        {can(me, "stock", "create") && (
                          <Button size="sm" variant="outline" disabled={complete.isPending} onClick={() => complete.mutate(o.id)}>
                            <CheckCircle2 className="size-4" />
                            إنجاز
                          </Button>
                        )}
                        {can(me, "stock", "delete") && (
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => window.confirm("حذف أمر التصنيع؟") && remove.mutate(o.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </>
                    ) : (
                      o.journal_entry_id && (
                        <Button asChild size="sm" variant="ghost" title="قيد التكلفة">
                          <Link to="/journal/$entryId" params={{ entryId: o.journal_entry_id }}>
                            قيد #{o.journal_entries?.entry_no ?? "—"}
                          </Link>
                        </Button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(list.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  {list.isLoading ? "جارٍ التحميل..." : "لا توجد أوامر تصنيع"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Factory className="size-4" /> أمر تصنيع جديد</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>المنتج التام</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
                <option value="">— اختر —</option>
                {(ref.data?.products ?? []).map((p: { id: string; name: string }) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>المستودع</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
                <option value="">— اختر —</option>
                {(ref.data?.warehouses ?? []).map((w: { id: string; name: string }) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>الكمية المنتجة</Label>
              <Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input type="date" value={form.mo_date} onChange={(e) => setForm({ ...form, mo_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>تكلفة العمالة والطاقة</Label>
              <Input type="number" value={form.labor_cost} onChange={(e) => setForm({ ...form, labor_cost: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>تكاليف غير مباشرة</Label>
              <Input type="number" value={form.overhead_cost} onChange={(e) => setForm({ ...form, overhead_cost: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>حساب التكاليف غير المباشرة</Label>
              <AccSel value={form.overhead_account_id} onChange={(v) => setForm({ ...form, overhead_account_id: v })} list={ref.data?.accounts ?? []} />
            </div>
            <div className="space-y-1">
              <Label>حساب إنتاج تحت التشغيل (اختياري)</Label>
              <AccSel value={form.wip_account_id} onChange={(v) => setForm({ ...form, wip_account_id: v })} list={ref.data?.accounts ?? []} />
            </div>
            <div className="space-y-1">
              <Label>نسبة الهدر %</Label>
              <Input type="number" value={form.scrap_pct} onChange={(e) => setForm({ ...form, scrap_pct: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>التكلفة المعيارية للوحدة</Label>
              <Input type="number" value={form.standard_unit_cost} onChange={(e) => setForm({ ...form, standard_unit_cost: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">المواد الخام</h3>
              <Button size="sm" variant="outline" onClick={() => setMaterials([...materials, { component_product_id: "", qty: "1", unit_cost: "0" }])}>
                <Plus className="size-4" />
                مادة
              </Button>
            </div>
            <table className="w-full border text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="border px-2 py-2 text-right">المادة</th>
                  <th className="border px-2 py-2 text-right">الكمية</th>
                  <th className="border px-2 py-2 text-right">تكلفة الوحدة (اختياري)</th>
                  <th className="border px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => {
                  const p = (ref.data?.products ?? []).find((x: { id: string }) => x.id === m.component_product_id);
                  return (
                    <tr key={i}>
                      <td className="border px-2 py-1">
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          value={m.component_product_id}
                          onChange={(e) => {
                            const next = [...materials];
                            const np = (ref.data?.products ?? []).find((x: { id: string }) => x.id === e.target.value);
                            next[i] = { ...m, component_product_id: e.target.value, unit_cost: String(np?.avg_cost ?? 0) };
                            setMaterials(next);
                          }}
                        >
                          <option value="">— اختر —</option>
                          {(ref.data?.products ?? [])
                            .filter((x: { id: string }) => x.id !== form.product_id)
                            .map((x: { id: string; name: string }) => (
                              <option key={x.id} value={x.id}>{x.name}</option>
                            ))}
                        </select>
                      </td>
                      <td className="border px-2 py-1">
                        <Input
                          type="number"
                          value={m.qty}
                          onChange={(e) => {
                            const next = [...materials];
                            next[i] = { ...m, qty: e.target.value };
                            setMaterials(next);
                          }}
                        />
                      </td>
                      <td className="border px-2 py-1">
                        <Input
                          type="number"
                          value={m.unit_cost}
                          placeholder={String(p?.avg_cost ?? 0)}
                          onChange={(e) => {
                            const next = [...materials];
                            next[i] = { ...m, unit_cost: e.target.value };
                            setMaterials(next);
                          }}
                        />
                      </td>
                      <td className="border px-2 py-1 text-center">
                        <Button size="sm" variant="outline" onClick={() => setMaterials(materials.filter((_, x) => x !== i))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">اترك تكلفة الوحدة فارغة (صفر) لتُحتسب من متوسط تكلفة المادة تلقائياً.</p>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">منتجات ثانوية (تُخصم قيمتها من تكلفة المنتج الرئيسي)</h3>
              <Button size="sm" variant="outline" onClick={() => setByps([...byps, { product_id: "", qty: "1", unit_value: "0" }])}><Plus className="size-4" /> منتج ثانوي</Button>
            </div>
            {byps.map((b, i) => (
              <div key={i} className="mb-1 grid grid-cols-[1fr_6rem_7rem_auto] gap-2">
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={b.product_id} onChange={(e) => setByps(byps.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))}>
                  <option value="">— اختر —</option>
                  {(ref.data?.products ?? []).map((x: { id: string; name: string }) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <Input type="number" placeholder="الكمية" value={b.qty} onChange={(e) => setByps(byps.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                <Input type="number" placeholder="قيمة الوحدة" value={b.unit_value} onChange={(e) => setByps(byps.map((x, j) => (j === i ? { ...x, unit_value: e.target.value } : x)))} />
                <Button size="sm" variant="outline" onClick={() => setByps(byps.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "جارٍ الحفظ..." : "حفظ كمسودة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STAGES: Record<string, string> = { planned: "مخطط", in_progress: "قيد التشغيل", qc: "فحص الجودة", completed: "مكتمل" };
const NEXT: Record<string, string> = { planned: "in_progress", in_progress: "qc" };

function AccSel({ value, onChange, list }: { value: string; onChange: (v: string) => void; list: { id: string; code: string; name: string }[] }) {
  return (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— افتراضي —</option>
      {list.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
    </select>
  );
}

/** Standard vs actual cost per completed order, with scrap and variance. */
function CostReport({ rows }: { rows: any[] }) {
  const done = rows.filter((o) => o.status === "completed");
  let tStd = 0, tAct = 0;
  const planned = done.reduce((t, o) => t + Number(o.qty || 0), 0);
  const goodAll = done.reduce((t, o) => t + Number(o.good_qty ?? o.qty ?? 0), 0);
  const actAll = done.reduce((t, o) => t + Number(o.actual_total_cost ?? 0), 0);
  const open = rows.filter((o) => o.status !== "completed");
  const months = new Map<string, { n: number; scrap: number; planned: number }>();
  for (const o of done) {
    const k = String(o.mo_date ?? "").slice(0, 7);
    const m = months.get(k) ?? { n: 0, scrap: 0, planned: 0 };
    m.n++; m.planned += Number(o.qty || 0); m.scrap += Number(o.qty || 0) - Number(o.good_qty ?? o.qty ?? 0);
    months.set(k, m);
  }
  const kpi = [
    ["أوامر منجزة", fmtNum(done.length)],
    ["أوامر مفتوحة", fmtNum(open.length)],
    ["نسبة الهدر", planned ? `${fmtNum(((planned - goodAll) / planned) * 100)}%` : "—"],
    ["متوسط تكلفة الوحدة", goodAll ? fmtNum(actAll / goodAll) : "—"],
  ];
  return (
    <div className="mt-3 space-y-3">
    <div className="grid gap-2 sm:grid-cols-4">
      {kpi.map(([l, v]) => <div key={l} className="rounded-lg border bg-card p-3 text-sm">{l}<div className="num text-lg font-bold">{v}</div></div>)}
    </div>
    {months.size > 0 && (
      <div className="rounded-lg border bg-card p-3 text-sm">
        <div className="mb-2 font-medium">الهدر الشهري</div>
        {[...months.entries()].sort().map(([k, m]) => {
          const pct = m.planned ? (m.scrap / m.planned) * 100 : 0;
          return (
            <div key={k} className="mb-1 flex items-center gap-2">
              <span className="w-20">{k}</span>
              <div className="h-3 flex-1 rounded bg-muted"><div className="h-3 rounded bg-destructive" style={{ width: `${Math.min(100, pct)}%` }} /></div>
              <span className="num w-16">{fmtNum(pct)}%</span>
            </div>
          );
        })}
      </div>
    )}
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary"><tr>
          {["الأمر", "المنتج", "الكمية المخططة", "الكمية السليمة", "الهدر", "التكلفة المعيارية", "التكلفة الفعلية", "الانحراف", "تكلفة الوحدة الفعلية"].map((h) => <th key={h} className="px-3 py-2 text-right">{h}</th>)}
        </tr></thead>
        <tbody>
          {done.map((o) => {
            const good = Number(o.good_qty ?? o.qty);
            const std = Number(o.standard_unit_cost) * good;
            const act = Number(o.actual_total_cost ?? 0);
            tStd += std; tAct += act;
            const v = act - std;
            return (
              <tr key={o.id} className="border-t">
                <td className="px-3 py-2">#{o.mo_no}</td><td className="px-3 py-2">{o.products?.name}</td>
                <td className="px-3 py-2">{fmtNum(o.qty)}</td><td className="px-3 py-2">{fmtNum(good)}</td><td className="px-3 py-2">{fmtNum(Number(o.qty) - good)}</td>
                <td className="px-3 py-2">{std ? fmtNum(std) : "—"}</td><td className="px-3 py-2">{fmtNum(act)}</td>
                <td className={`px-3 py-2 ${std && v > 0 ? "text-destructive" : ""}`}>{std ? fmtNum(v) : "—"}</td>
                <td className="px-3 py-2">{fmtNum(good ? act / good : 0)}</td>
              </tr>
            );
          })}
          {!done.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">لا توجد أوامر منجزة</td></tr>}
          {done.length > 0 && <tr className="border-t font-bold"><td colSpan={5} className="px-3 py-2">الإجمالي</td><td className="px-3 py-2">{fmtNum(tStd)}</td><td className="px-3 py-2">{fmtNum(tAct)}</td><td className="px-3 py-2">{fmtNum(tAct - tStd)}</td><td /></tr>}
        </tbody>
      </table>
    </div>
    </div>
  );
}
