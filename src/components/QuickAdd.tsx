import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { usePriceNames } from "@/lib/prices";
import { useBaseCurrency, useCurrencies } from "@/lib/currencies";
import { unitOptions, useUnits } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Kind = "partner" | "warehouse" | "product" | "category" | "account";
const TITLE: Record<Kind, string> = {
  partner: "بطاقة زبون / مورد جديدة",
  warehouse: "بطاقة مستودع جديدة",
  product: "بطاقة مادة جديدة",
  category: "تصنيف جديد",
  account: "بطاقة حساب جديدة",
};
const LINK: Record<Kind, string> = {
  partner: "+ إضافة زبون / مورد",
  warehouse: "+ إضافة مستودع",
  product: "+ إضافة مادة",
  category: "+ إضافة تصنيف",
  account: "+ إضافة حساب",
};
const NATURES: [string, string][] = [
  ["assets", "أصول"], ["liabilities", "خصوم"], ["equity", "حقوق ملكية / رأس مال"],
  ["revenues", "إيرادات"], ["expenses", "مصاريف"], ["balance_sheet", "ميزانية"],
  ["profit_loss", "أرباح وخسائر"], ["closing", "ختامي"], ["cost_centers", "مراكز كلفة"],
];

type F = Record<string, string | boolean>;
const EMPTY: F = {
  name: "", name_en: "", code: "", partner_type: "customer", phone: "", address: "", account_id: "", parent_id: "",
  currency: "", credit_limit: "", price_level: "", location: "", allow_negative: false, unit: "قطعة", barcode: "",
  category_id: "", sale_price: "", purchase_price: "", min_price: "", reorder_level: "", warehouse_id: "",
  nature: "assets", is_group: false, p1: "", p2: "", p3: "", p4: "", p5: "",
};
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const num = (v: string) => v.replace(/[^\d.]/g, "");

/** Opens a full card (all main fields) to create an entity without leaving the form. */
export function QuickAdd({ kind, onCreated }: { kind: Kind; onCreated: (id: string) => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF0] = useState<F>(EMPTY);
  const set = (k: string, v: string | boolean) => setF0((o) => ({ ...o, [k]: v }));
  const s = (k: string) => String(f[k] ?? "");
  const priceNames = usePriceNames();
  const units = useUnits("stock");
  const currencies = useCurrencies().data ?? [];
  const baseCur = useBaseCurrency();
  const t = me?.tenantId;

  const accounts = useQuery({
    queryKey: ["quickadd_accounts", t],
    enabled: !!t && open && ["partner", "warehouse", "account"].includes(kind),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => ((await scope(db.from("accounts").select("id,code,name,is_group,nature,parent_id"), t).order("code")).data ?? []) as any[],
  });
  const groups = useQuery({
    queryKey: ["quickadd_groups", kind, t],
    enabled: !!t && open && ["partner", "warehouse", "product", "category"].includes(kind),
    queryFn: async () => {
      const table = kind === "partner" ? "partners" : kind === "warehouse" ? "warehouses" : "products";
      const cols = table === "products" ? "id,name,sku" : "id,name,code";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((await scope(db.from(table).select(cols).eq("is_group", true), t).order("name")).data ?? []) as any[];
    },
  });
  const warehouses = useQuery({
    queryKey: ["quickadd_warehouses", t],
    enabled: !!t && kind === "product" && open,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => ((await scope(db.from("warehouses").select("id,code,name").eq("is_group", false).eq("is_active", true), t).order("code")).data ?? []) as any[],
  });

  async function save() {
    if (!s("name").trim()) { toast.error("الاسم مطلوب"); return; }
    if ((kind === "product" || kind === "account") && !s("code").trim()) { toast.error("الرمز مطلوب"); return; }
    if (kind === "account" && !s("parent_id")) { toast.error("اختر الحساب الأب"); return; }
    setBusy(true);
    const name = s("name").trim();
    const name_en = s("name_en").trim() || null;
    let table: "partners" | "warehouses" | "products" | "accounts";
    let row: Record<string, unknown>;
    if (kind === "partner") {
      table = "partners";
      row = {
        tenant_id: t, name, name_en, code: s("code").trim() || null, partner_type: s("partner_type"), phone: s("phone") || null,
        address: s("address") || null, parent_id: s("parent_id") || null, currency: s("currency") || null,
        credit_limit: Number(s("credit_limit")) || 0, price_level: s("price_level") ? Number(s("price_level")) : null, is_active: true,
        ...(s("account_id") ? { account_id: s("account_id") } : { auto_account: true }),
      };
    } else if (kind === "warehouse") {
      table = "warehouses";
      row = { tenant_id: t, name, name_en, code: s("code").trim() || null, location: s("location") || null, parent_id: s("parent_id") || null,
        account_id: s("account_id") || null, allow_negative: !!f["allow_negative"], is_active: true };
    } else if (kind === "account") {
      table = "accounts";
      const parent = (accounts.data ?? []).find((a) => a.id === s("parent_id"));
      row = { tenant_id: t, name, name_en, code: s("code").trim(), parent_id: s("parent_id"), nature: s("nature") || parent?.nature || "assets",
        currency: s("currency") || baseCur || "USD", is_group: !!f["is_group"], is_active: true };
    } else if (kind === "category") {
      table = "products";
      row = { tenant_id: t, name, name_en, sku: s("code").trim() || `CAT-${Date.now()}`, unit: "قطعة", parent_id: s("parent_id") || null, is_group: true, is_active: true };
    } else {
      table = "products";
      const prices: Record<string, number> = {};
      priceNames.forEach((_, i) => { const v = Number(s(`p${i + 1}`)); if (v) prices[String(i + 1)] = v; });
      row = {
        tenant_id: t, name, name_en, sku: s("code").trim(), barcode: s("barcode").trim() || null, unit: s("unit") || "قطعة",
        parent_id: s("category_id") || null, sale_price: Number(s("sale_price")) || 0, purchase_price: Number(s("purchase_price")) || 0,
        last_purchase_price: Number(s("purchase_price")) || 0, min_price: Number(s("min_price")) || 0, reorder_level: Number(s("reorder_level")) || 0,
        default_warehouse_id: s("warehouse_id") || null, currency: s("currency") || baseCur || "USD", prices, item_type: "stock", is_active: true,
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db.from(table) as any).insert(row).select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تمت الإضافة");
    for (const k of ["doc_refs", "journal_refs", "quickadd_categories", "quickadd_groups", "quickadd_accounts", "accounts", "refs"]) qc.invalidateQueries({ queryKey: [k] });
    onCreated(data.id);
    setOpen(false);
    setF0(EMPTY);
  }

  const field = (k: string, label: string, opts?: { numeric?: boolean; auto?: boolean }) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input autoFocus={opts?.auto} inputMode={opts?.numeric ? "decimal" : undefined} value={s(k)} onChange={(e) => set(k, opts?.numeric ? num(e.target.value) : e.target.value)} />
    </div>
  );
  const curSelect = (label = "العملة") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select className={sel} value={s("currency")} onChange={(e) => set("currency", e.target.value)}>
        <option value="">— العملة الأساسية ({baseCur}) —</option>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {currencies.map((c: any) => <option key={c.code} value={c.code}>{c.code} - {c.name ?? c.code}</option>)}
      </select>
    </div>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupLabel = (g: any) => `${g.code ?? g.sku ?? ""} - ${g.name}`;
  const parentSelect = (label: string, key = "parent_id") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select className={sel} value={s(key)} onChange={(e) => set(key, e.target.value)}>
        <option value="">— بدون —</option>
        {(groups.data ?? []).map((g) => <option key={g.id} value={g.id}>{groupLabel(g)}</option>)}
      </select>
    </div>
  );
  const accSelect = (label: string, filter: (a: { is_group: boolean }) => boolean, empty: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select className={sel} value={s(kind === "account" ? "parent_id" : "account_id")} onChange={(e) => set(kind === "account" ? "parent_id" : "account_id", e.target.value)}>
        <option value="">{empty}</option>
        {(accounts.data ?? []).filter(filter).map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setOpen(true)}>{LINK[kind]}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{TITLE[kind]}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {field("name", "الاسم *", { auto: true })}
              {field("name_en", "الاسم الأجنبي")}
              {field("code", kind === "product" || kind === "account" ? "الرمز *" : "الرمز")}
            </div>

            {kind === "partner" && (
              <Tabs defaultValue="main">
                <TabsList><TabsTrigger value="main">البيانات الأساسية</TabsTrigger><TabsTrigger value="fin">البيانات المالية</TabsTrigger></TabsList>
                <TabsContent value="main" className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label>النوع</Label>
                    <select className={sel} value={s("partner_type")} onChange={(e) => set("partner_type", e.target.value)}>
                      <option value="customer">زبون</option><option value="supplier">مورد</option><option value="both">زبون ومورد</option>
                    </select></div>
                  {parentSelect("المجموعة الأب")}
                  {field("phone", "الهاتف")}
                  {field("address", "العنوان")}
                </TabsContent>
                <TabsContent value="fin" className="grid gap-3 sm:grid-cols-2">
                  {accSelect("الحساب المرتبط", (a) => !a.is_group, "— إنشاء حساب تلقائياً —")}
                  {curSelect()}
                  {field("credit_limit", "سقف الائتمان", { numeric: true })}
                  <div className="space-y-1"><Label>مستوى السعر</Label>
                    <select className={sel} value={s("price_level")} onChange={(e) => set("price_level", e.target.value)}>
                      <option value="">— السعر الافتراضي —</option>
                      {priceNames.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                    </select></div>
                </TabsContent>
              </Tabs>
            )}

            {kind === "warehouse" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {parentSelect("المستودع الأب")}
                {field("location", "العنوان / الموقع")}
                {accSelect("حساب المخزون المرتبط", (a) => !a.is_group, "— تلقائي —")}
                <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={!!f["allow_negative"]} onChange={(e) => set("allow_negative", e.target.checked)} /> السماح بالرصيد السالب</label>
              </div>
            )}

            {kind === "account" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {accSelect("الحساب الأب *", (a) => a.is_group, "— اختر —")}
                <div className="space-y-1"><Label>طبيعة الحساب</Label>
                  <select className={sel} value={s("nature")} onChange={(e) => set("nature", e.target.value)}>
                    {NATURES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                {curSelect()}
                <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={!!f["is_group"]} onChange={(e) => set("is_group", e.target.checked)} /> حساب رئيسي (تجميعي)</label>
              </div>
            )}

            {kind === "category" && <div className="grid gap-3 sm:grid-cols-2">{parentSelect("التصنيف الأب")}</div>}

            {kind === "product" && (
              <Tabs defaultValue="main">
                <TabsList><TabsTrigger value="main">البيانات الأساسية</TabsTrigger><TabsTrigger value="price">الأسعار</TabsTrigger><TabsTrigger value="stock">المخزون</TabsTrigger></TabsList>
                <TabsContent value="main" className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label>الوحدة</Label>
                    <select className={sel} value={s("unit")} onChange={(e) => set("unit", e.target.value)}>
                      {unitOptions(units.data, "stock").map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select></div>
                  {field("barcode", "الباركود")}
                  {parentSelect("التصنيف", "category_id")}
                  {curSelect("عملة المادة")}
                </TabsContent>
                <TabsContent value="price" className="grid gap-3 sm:grid-cols-3">
                  {field("purchase_price", "سعر الشراء", { numeric: true })}
                  {field("sale_price", "سعر البيع", { numeric: true })}
                  {field("min_price", "أدنى سعر", { numeric: true })}
                  {priceNames.map((n, i) => <div key={i}>{field(`p${i + 1}`, `سعر ${n}`, { numeric: true })}</div>)}
                </TabsContent>
                <TabsContent value="stock" className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label>المستودع الافتراضي</Label>
                    <select className={sel} value={s("warehouse_id")} onChange={(e) => set("warehouse_id", e.target.value)}>
                      <option value="">— بدون —</option>
                      {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.code} - {w.name}</option>)}
                    </select></div>
                  {field("reorder_level", "حد إعادة الطلب", { numeric: true })}
                </TabsContent>
              </Tabs>
            )}

            <Button onClick={save} disabled={busy} className="w-full"><Plus className="size-4" /> {busy ? "جارٍ الحفظ..." : "حفظ البطاقة"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
