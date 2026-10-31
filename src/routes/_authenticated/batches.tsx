import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtDate, fmtNum, today } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/batches")({
  head: () => ({
    meta: [
      { title: "دفعات المخزون والصلاحية | يوسف سوفت" },
      { name: "description", content: "تتبع دفعات المخزون وتواريخ الصلاحية مع تنبيهات الانتهاء وإعدام الدفعات التالفة." },
      { property: "og:title", content: "دفعات المخزون والصلاحية | يوسف سوفت" },
      { property: "og:description", content: "تتبع دفعات المخزون وتواريخ الصلاحية مع تنبيهات الانتهاء وإعدام الدفعات التالفة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BatchesPage,
});

type Batch = {
  id: string;
  product_id: string;
  warehouse_id: string;
  batch_no: string | null;
  expiry_date: string | null;
  qty_remaining: number;
  unit_cost: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  products?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warehouses?: any;
};

function BatchesPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"all" | "soon" | "expired">("all");
  const [editing, setEditing] = useState<Batch | null>(null);
  const [form, setForm] = useState({ batch_no: "", expiry_date: "" });

  const list = useQuery({
    queryKey: ["product_batches", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(
        db.from("product_batches").select("*, products(name, unit), warehouses(name)"),
        me?.tenantId,
      )
        .gt("qty_remaining", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as Batch[];
    },
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("product_batches")
        .update({ batch_no: form.batch_no || null, expiry_date: form.expiry_date || null })
        .eq("id", editing!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الدفعة");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["product_batches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const damage = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (b: Batch) => {
      const amt = Number(b.qty_remaining) * Number(b.unit_cost);
      const { data: doc, error } = await db
        .from("documents")
        .insert({
          tenant_id: me!.tenantId,
          doc_type: "stock_out",
          doc_date: today(),
          currency: "USD",
          exchange_rate: 1,
          warehouse_id: b.warehouse_id,
          amount: amt,
          notes: `إعدام دفعة ${b.batch_no ?? ""} — ${b.products?.name ?? ""}`,
        })
        .select()
        .single();
      if (error) throw error;
      const { error: lErr } = await db.from("document_lines").insert({
        tenant_id: me!.tenantId,
        document_id: doc.id,
        product_id: b.product_id,
        qty: Number(b.qty_remaining),
        unit_price: Number(b.unit_cost),
        expiry_date: b.expiry_date,
      });
      if (lErr) throw lErr;
      const { error: pErr } = await db.rpc("post_document", { _id: doc.id });
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      toast.success("تم إعدام الدفعة وتسجيل خسارة التلف");
      qc.invalidateQueries({ queryKey: ["product_batches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const soonDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const t = today();

  const rows = useMemo(() => {
    return (list.data ?? []).filter((b) => {
      const name = b.products?.name ?? "";
      if (search && !name.includes(search) && !(b.batch_no ?? "").includes(search)) return false;
      if (mode === "expired") return !!b.expiry_date && b.expiry_date < t;
      if (mode === "soon") return !!b.expiry_date && b.expiry_date >= t && b.expiry_date <= soonDate;
      return true;
    });
  }, [list.data, search, mode, t, soonDate]);

  const expiredValue = (list.data ?? [])
    .filter((b) => b.expiry_date && b.expiry_date < t)
    .reduce((s, b) => s + b.qty_remaining * b.unit_cost, 0);
  const soonValue = (list.data ?? [])
    .filter((b) => b.expiry_date && b.expiry_date >= t && b.expiry_date <= soonDate)
    .reduce((s, b) => s + b.qty_remaining * b.unit_cost, 0);

  return (
    <div>
      <PageHeader
        title="دفعات المخزون والصلاحية"
        subtitle="تُنشأ الدفعة تلقائياً عند ترحيل فاتورة شراء أو إدخال مستودع، ويُخصم البيع من الدفعة الأقرب انتهاءً أولاً"
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">دفعات منتهية الصلاحية</p>
          <p className="mt-1 text-xl font-bold text-destructive">{fmtNum(expiredValue)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">تنتهي خلال 30 يوماً</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{fmtNum(soonValue)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">عدد الدفعات المتبقية</p>
          <p className="mt-1 text-xl font-bold">{(list.data ?? []).length}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input placeholder="بحث باسم المادة أو رقم الدفعة..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-64" />
        <div className="flex overflow-hidden rounded-lg border">
          <Button size="sm" variant={mode === "all" ? "default" : "ghost"} className="rounded-none" onClick={() => setMode("all")}>الكل</Button>
          <Button size="sm" variant={mode === "soon" ? "default" : "ghost"} className="rounded-none" onClick={() => setMode("soon")}>قريبة الانتهاء</Button>
          <Button size="sm" variant={mode === "expired" ? "default" : "ghost"} className="rounded-none" onClick={() => setMode("expired")}>منتهية</Button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2 text-right">المادة</th>
              <th className="px-3 py-2 text-right">الدفعة</th>
              <th className="px-3 py-2 text-right">الصلاحية</th>
              <th className="px-3 py-2 text-right">المستودع</th>
              <th className="px-3 py-2 text-right">الكمية المتبقية</th>
              <th className="px-3 py-2 text-right">التكلفة</th>
              <th className="px-3 py-2 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const expired = !!b.expiry_date && b.expiry_date < t;
              const soon = !!b.expiry_date && !expired && b.expiry_date <= soonDate;
              return (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2">{b.products?.name ?? "—"}</td>
                  <td className="px-3 py-2">{b.batch_no ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={expired ? "font-medium text-destructive" : soon ? "font-medium text-amber-600" : ""}>
                      {b.expiry_date ? fmtDate(b.expiry_date) : "بدون"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{b.warehouses?.name ?? "—"}</td>
                  <td className="px-3 py-2">{fmtNum(b.qty_remaining)} {b.products?.unit ?? ""}</td>
                  <td className="px-3 py-2">{fmtNum(b.unit_cost)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="تعديل الدفعة"
                        disabled={!can(me, "stock", "edit")}
                        onClick={() => {
                          setEditing(b);
                          setForm({ batch_no: b.batch_no ?? "", expiry_date: b.expiry_date ?? "" });
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {can(me, "documents", "create") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={damage.isPending}
                          title="إعدام الدفعة وتسجيل التلف"
                          onClick={() => window.confirm(`إعدام الدفعة ${b.batch_no ?? ""} بالكامل (${fmtNum(b.qty_remaining)})؟`) && damage.mutate(b)}
                        >
                          <ShieldAlert className="size-4" />
                          إعدام
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  {list.isLoading ? "جارٍ التحميل..." : "لا توجد دفعات — تُنشأ تلقائياً عند ترحيل فواتير الشراء مع تحديد تاريخ الصلاحية"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل الدفعة — {editing?.products?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>رقم الدفعة</Label>
              <Input value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>تاريخ الصلاحية</Label>
              <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {saveEdit.isPending ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
