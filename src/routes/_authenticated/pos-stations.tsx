import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, Trash2, Store, ShoppingCart } from "lucide-react";
import { ChipSelect } from "@/components/ChipSelect";
import { usePriceNames } from "@/lib/prices";
import type { PosStation } from "@/lib/pos-stations";

export const Route = createFileRoute("/_authenticated/pos-stations")({
  head: () => ({
    meta: [
      { title: "إدارة نقاط البيع والشراء — يوسف سوفت" },
      { name: "description", content: "تعريف عدة نقاط بيع وشراء لكل منها مستودع وصندوق ومستخدمون ومصاريف" },
      { property: "og:title", content: "إدارة نقاط البيع والشراء — يوسف سوفت" },
      { property: "og:description", content: "محطات بيع وشراء متعددة بإعدادات مستقلة" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StationsPage,
});

const blank = (): Partial<PosStation> => ({ station_type: "sale", name: "", lock_warehouse: true, allowed_user_ids: [], allow_expenses: false, expense_account_ids: [], max_expense: 0, is_active: true, price_level: null, partner_ids: [], partner_group_ids: [], lock_partner: false, cash_account_ids: [], lock_price_level: true });
const sel = "h-10 w-full rounded-md border bg-background px-2 text-sm";

function StationsPage() {
  const { data: me } = useMe();
  const t = me?.tenantId;
  const qc = useQueryClient();
  const priceNames = usePriceNames();
  const [edit, setEdit] = useState<Partial<PosStation> | null>(null);
  const isAdmin = !!(me?.isTenantAdmin || me?.isSuperAdmin);

  const data = useQuery({
    queryKey: ["pos_stations_admin", t],
    enabled: !!t,
    queryFn: async () => {
      const [s, w, a, p, u, pt] = await Promise.all([
        scope(db.from("pos_stations").select("*"), t).order("created_at"),
        scope(db.from("warehouses").select("id,name,is_group"), t).order("name"),
        scope(db.from("accounts").select("id,code,name,nature,is_group"), t).eq("is_group", false).order("code"),
        scope(db.from("partners").select("id,name,code,currency,account_id,partner_type,is_group,parent_id"), t).order("name"),
        scope(db.from("profiles").select("id,full_name,email"), t).order("full_name"),
        scope(db.from("doc_patterns").select("id,name,doc_type"), t).order("name"),
      ]);
      if (s.error) throw s.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const A = (a.data ?? []) as any[];
      return {
        stations: (s.data ?? []) as PosStation[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warehouses: ((w.data ?? []) as any[]).filter((x) => !x.is_group),
        accounts: A,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partners: ((p.data ?? []) as any[]).filter((x) => !x.is_group),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partnerGroups: ((p.data ?? []) as any[]).filter((x) => x.is_group),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        users: (u.data ?? []) as any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patterns: (pt.data ?? []) as any[],
      };
    },
  });
  const d = data.data;
  const name = (arr: { id: string; name: string }[] | undefined, id: string | null | undefined) => arr?.find((x) => x.id === id)?.name ?? "—";

  const save = useMutation({
    mutationFn: async (s: Partial<PosStation>) => {
      if (!s.name?.trim()) throw new Error("اكتب اسم النقطة");
      const row = { ...s, tenant_id: t, max_expense: Number(s.max_expense) || 0 };
      const r = s.id ? await db.from("pos_stations").update(row).eq("id", s.id) : await db.from("pos_stations").insert(row);
      if (r.error) throw r.error;
    },
    onSuccess: () => { toast.success("تم الحفظ"); setEdit(null); qc.invalidateQueries({ queryKey: ["pos_stations_admin"] }); qc.invalidateQueries({ queryKey: ["pos_stations"] }); qc.invalidateQueries({ queryKey: ["pos_stations_all"] }); qc.invalidateQueries({ queryKey: ["pos_stations_mine"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const r = await db.from("pos_stations").delete().eq("id", id); if (r.error) throw r.error; },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["pos_stations_admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return <p className="p-6 text-muted-foreground">هذه الشاشة لمدير الشركة فقط.</p>;
  const up = (v: Partial<PosStation>) => setEdit((o) => ({ ...o, ...v }));
  const type = edit?.station_type ?? "sale";
  const patterns = (d?.patterns ?? []).filter((p) => (type === "sale" ? p.doc_type === "sale" || p.doc_type === "sale_return" : p.doc_type === "purchase" || p.doc_type === "purchase_return"));
  const partners = (d?.partners ?? []).filter((p) => (type === "sale" ? p.partner_type !== "supplier" : p.partner_type !== "customer"));
  const isExp = (a: { nature?: string; code?: string }) => a.nature === "expenses" || String(a.code ?? "").startsWith("5");
  const expAccounts = [...(d?.accounts ?? [])].filter((a) => a.nature !== "cost_centers" && !/مشروع|مشاريع/.test(a.name ?? "")).sort((a, b) => Number(isExp(b)) - Number(isExp(a)) || String(a.code).localeCompare(String(b.code)));
  const allPartners = d?.partners ?? [];
  // Tree-ordered labels: group path › name · account number · currency.
  const pById = new Map([...(d?.partners ?? []), ...(d?.partnerGroups ?? [])].map((x) => [x.id, x]));
  const accCode = new Map((d?.accounts ?? []).map((a) => [a.id, a.code]));
  const pathOf = (x: { parent_id?: string | null }) => { const n: string[] = []; let c = x.parent_id ? pById.get(x.parent_id) : undefined; const seen = new Set<string>(); while (c && !seen.has(c.id)) { seen.add(c.id); n.unshift(c.name); c = c.parent_id ? pById.get(c.parent_id) : undefined; } return n; };
  const pLabel = (x: { id: string; name: string; code?: string | null; currency?: string | null; account_id?: string | null; parent_id?: string | null }) => {
    const path = pathOf(x); const acc = x.account_id ? accCode.get(x.account_id) : x.code;
    return `${path.length ? path.join(" › ") + " › " : ""}${x.name}${acc ? ` · ${acc}` : ""}${x.currency ? ` · ${x.currency}` : ""}`;
  };
  const treeOpts = (list: typeof allPartners) => list.map((x) => [x.id, pLabel(x)] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], "ar"));

  return (
    <div className="space-y-4">
      <PageHeader title="إدارة نقاط البيع والشراء" subtitle="عرّف أكثر من نقطة بيع أو شراء، لكل نقطة مستودعها وصندوقها ومستخدموها ومصاريفها." />
      <div className="flex gap-2">
        <Button onClick={() => setEdit(blank())}><Plus className="size-4" />نقطة جديدة</Button>
        <Button variant="outline" asChild><Link to="/pos">فتح نقطة البيع</Link></Button>
        <Button variant="outline" asChild><Link to="/purchase-pos">فتح نقطة الشراء</Link></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(d?.stations ?? []).map((s) => (
          <div key={s.id} className="space-y-2 rounded-xl border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                {s.station_type === "sale" ? <Store className="size-4 text-primary" /> : <ShoppingCart className="size-4 text-primary" />}
                {s.name}
                {!s.is_active && <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">معطلة</span>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEdit(s)} aria-label="تعديل"><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => confirm("حذف النقطة؟") && del.mutate(s.id)} aria-label="حذف"><Trash2 className="size-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>النوع: {s.station_type === "sale" ? "بيع" : "شراء"}</span>
              <span>المستودع: {name(d?.warehouses, s.warehouse_id)}</span>
              <span>الصندوق: {name(d?.accounts, s.cash_account_id)}</span>
              <span>الجهة: {name(d?.partners, s.default_partner_id)}</span>
              <span>السعر: {s.price_level || "الافتراضي"}</span>
              <span>المصاريف: {s.allow_expenses ? "مسموحة" : "لا"}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {s.allowed_user_ids?.length ? s.allowed_user_ids.map((u) => <span key={u} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{d?.users.find((x) => x.id === u)?.full_name || d?.users.find((x) => x.id === u)?.email || "مستخدم"}</span>) : <span className="text-xs text-muted-foreground">كل المستخدمين</span>}
            </div>
          </div>
        ))}
        {d && !d.stations.length && <p className="col-span-full rounded-xl border border-dashed p-8 text-center text-muted-foreground">لا توجد نقاط بعد — أضف أول نقطة بيع أو شراء.</p>}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "تعديل نقطة" : "نقطة جديدة"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>الاسم</Label><Input value={edit.name ?? ""} onChange={(e) => up({ name: e.target.value })} placeholder="كاشير الصالة 1" /></div>
              <div className="space-y-1"><Label>النوع</Label>
                <select className={sel} value={type} onChange={(e) => up({ station_type: e.target.value as "sale" | "purchase", pattern_id: null, default_partner_id: null })}>
                  <option value="sale">نقطة بيع</option><option value="purchase">نقطة شراء</option>
                </select></div>
              <div className="space-y-1"><Label>النمط المرتبط</Label>
                <select className={sel} value={edit.pattern_id ?? ""} onChange={(e) => up({ pattern_id: e.target.value || null })}>
                  <option value="">النمط الأساسي</option>{patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <div className="space-y-1"><Label>المستودع</Label>
                <select className={sel} value={edit.warehouse_id ?? ""} onChange={(e) => up({ warehouse_id: e.target.value || null })}>
                  <option value="">أي مستودع</option>{(d?.warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!edit.lock_warehouse} onChange={(e) => up({ lock_warehouse: e.target.checked })} />قفل المستودع (لا يمكن تغييره)</label></div>
              <div className="space-y-1"><Label>الصندوق / الدرج</Label>
                <select className={sel} value={edit.cash_account_id ?? ""} onChange={(e) => up({ cash_account_id: e.target.value || null })}>
                  <option value="">درج المستخدم الافتراضي</option>{(d?.accounts ?? []).filter((a) => a.nature === "assets" || a.nature === "balance_sheet").map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select></div>
              <div className="space-y-1"><Label>{type === "sale" ? "الزبون الافتراضي" : "المورد الافتراضي"}</Label>
                <select className={sel} value={edit.default_partner_id ?? ""} onChange={(e) => up({ default_partner_id: e.target.value || null })}>
                  <option value="">{type === "sale" ? "زبون نقدي" : "مورد نقدي"}</option>{treeOpts(partners).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!edit.lock_partner} onChange={(e) => up({ lock_partner: e.target.checked })} />قفل الجهة الافتراضية</label></div>
              <div className="space-y-1 sm:col-span-2"><Label>{type === "sale" ? "الزبائن المسموحون" : "الموردون المسموحون"}</Label>
                <ChipSelect options={treeOpts(partners)} value={edit.partner_ids ?? []} onChange={(v) => up({ partner_ids: v })} emptyText="الكل" /></div>
              <div className="space-y-1 sm:col-span-2"><Label>مجموعات الجهات المسموحة (تشمل ما تحتها)</Label>
                <ChipSelect options={treeOpts(d?.partnerGroups ?? [])} value={edit.partner_group_ids ?? []} onChange={(v) => up({ partner_group_ids: v })} emptyText="الكل" /></div>
              <div className="space-y-1 sm:col-span-2"><Label>الصناديق / المصارف المسموحة للتحصيل</Label>
                <ChipSelect options={(d?.accounts ?? []).filter((a) => a.nature === "assets" || a.nature === "balance_sheet").map((a) => [a.id, `${a.code} — ${a.name}`])} value={edit.cash_account_ids ?? []} onChange={(v) => up({ cash_account_ids: v })} emptyText="الصندوق الافتراضي فقط" /></div>
              {type === "sale" && (
                <div className="space-y-1"><Label>مستوى السعر</Label>
                  <select className={sel} value={edit.price_level ?? ""} onChange={(e) => up({ price_level: e.target.value || null })}>
                    {priceNames.length ? <option value="">{priceNames[0]} (الأول)</option> : <option value="">لا توجد أسعار معرّفة في الإعدادات</option>}{priceNames.map((n, i) => <option key={n} value={String(i + 1)}>{n}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={edit.lock_price_level !== false} onChange={(e) => up({ lock_price_level: e.target.checked })} />قفل مستوى السعر</label></div>
              )}
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={edit.is_active !== false} onChange={(e) => up({ is_active: e.target.checked })} />النقطة فعّالة</label>
              <div className="space-y-1 sm:col-span-2"><Label>المستخدمون المسموح لهم (أكثر من مستخدم على نفس النقطة)</Label>
                <ChipSelect options={(d?.users ?? []).map((u) => [u.id, u.full_name || u.email || u.id])} value={edit.allowed_user_ids ?? []} onChange={(v) => up({ allowed_user_ids: v })} emptyText="لم يتم التحديد — كل المستخدمين" /></div>
              <div className="space-y-2 rounded-lg border p-3 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!edit.allow_expenses} onChange={(e) => up({ allow_expenses: e.target.checked })} />السماح بدفع مصاريف من الدرج</label>
                {edit.allow_expenses && (
                  <>
                    <div className="space-y-1"><Label>حسابات المصاريف المسموحة</Label>
                      <ChipSelect options={expAccounts.map((a) => [a.id, `${a.code} — ${a.name}`])} value={edit.expense_account_ids ?? []} onChange={(v) => up({ expense_account_ids: v })} placeholder="ابحث باسم أو رقم الحساب..." emptyText="لم تحدد — كل حسابات المصاريف" /></div>
                    <div className="space-y-1"><Label>الحد الأقصى للمصروف الواحد (0 = بلا حد)</Label>
                      <Input type="number" value={edit.max_expense ?? 0} onChange={(e) => up({ max_expense: Number(e.target.value) })} /></div>
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter><Button disabled={save.isPending} onClick={() => edit && save.mutate(edit)}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
