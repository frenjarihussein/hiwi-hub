import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Folder, FileText, Plus, Trash2, Rows3, FolderPlus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { generateEan13 } from "@/lib/barcode";
import { useI18n } from "@/lib/i18n";
import { suggestFreeCode } from "@/lib/coding";
import { useQuery } from "@tanstack/react-query";
import { accountNature, leafOnlyField } from "@/lib/directory-rules";
import { unitOptions, useUnits } from "@/lib/units";
import { usePriceNames } from "@/lib/prices";
import { useBaseCurrency, useCurrencies } from "@/lib/currencies";
import { TopScrollArea } from "@/components/TopScrollArea";
import { costFromMoves } from "@/lib/stocktake-report";
const fmtCost = (v: unknown) => (Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: 4 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Line = { key: string; id?: string; parent: string | null; code: string; name: string; name_en: string; is_group: boolean; dirty?: boolean; orig?: Row; vals: Row };

type Col = { key: string; label: string; type?: "text" | "number" | "bool" | "select"; options?: [string, string][]; leafOnly?: boolean; w?: string; required?: boolean; readOnly?: boolean };
const CUR: [string, string][] = ["USD", "SYP", "TRY", "EUR", "SAR", "AED", "JOD", "GBP", "EGP"].map((c) => [c, c]);
/** Card fields shown as extra columns in the bulk window, per table — required first, then by importance. */
const COLS: Record<string, Col[]> = {
  accounts: [
    { key: "currency", label: "العملة", type: "select", options: CUR, w: "6rem", required: true },
    { key: "is_closing", label: "ختامي", type: "bool", leafOnly: true, w: "4rem" },
    { key: "closing_account_id", label: "أين يُقفل (الحساب الختامي)", type: "select", leafOnly: true, w: "16rem" },
    { key: "cash_flow_type", label: "التدفق النقدي", type: "select", leafOnly: true, options: [["", "—"], ["operating", "تشغيلي"], ["investing", "استثماري"], ["financing", "تمويلي"]] },
    { key: "is_monetary", label: "نقدي", type: "bool", leafOnly: true, w: "4rem" },
    { key: "balance_side", label: "الطبيعة", type: "select", options: [["", "حسب الأب"], ["debit", "مدين"], ["credit", "دائن"], ["both", "مدين ودائن"]] },
    { key: "is_active", label: "فعّال", type: "bool", w: "4rem" },
    { key: "notes", label: "ملاحظات", w: "12rem" },
  ],
  products: [
    { key: "barcode", label: "الباركود", leafOnly: true, w: "12rem" },
    { key: "unit", label: "الوحدة", type: "select", w: "8rem", leafOnly: true },
    { key: "currency", label: "العملة", type: "select", options: CUR, w: "6rem" },
    { key: "_cost", label: "سعر الكلفة", type: "number", leafOnly: true, w: "7rem", readOnly: true },
    { key: "sale_price", label: "سعر البيع الأساسي", type: "number", leafOnly: true, w: "7rem" },
    { key: "reorder_level", label: "حد الطلب", type: "number", leafOnly: true, w: "6rem" },
    { key: "is_active", label: "فعّال", type: "bool", w: "4rem" },
  ],
  partners: [
    { key: "partner_type", label: "النوع", type: "select", options: [["customer", "زبون"], ["supplier", "مورد"], ["both", "زبون ومورد"]] },
    { key: "deal_type", label: "نوع التعامل", type: "select", options: [["stock", "مواد"], ["service", "خدمات"], ["both", "مواد وخدمات"]], w: "8rem" },
    { key: "phone", label: "الهاتف", leafOnly: true },
    { key: "address", label: "العنوان", leafOnly: true, w: "12rem" },
    { key: "barcode", label: "الباركود", leafOnly: true, w: "12rem" },
    { key: "currency", label: "العملة", type: "select", options: CUR, w: "6rem" },
    { key: "credit_limit", label: "سقف الدين", type: "number", leafOnly: true, w: "7rem" },
    { key: "is_active", label: "فعّال", type: "bool", w: "4rem" },
  ],
  warehouses: [
    { key: "location", label: "الموقع", w: "12rem" },
    { key: "allow_negative", label: "يسمح بالسالب", type: "bool", w: "6rem" },
    { key: "is_active", label: "فعّال", type: "bool", w: "4rem" },
  ],
  projects: [
    { key: "contract_value", label: "قيمة العقد", type: "number", leafOnly: true, w: "8rem" },
    { key: "currency", label: "العملة", type: "select", options: CUR, w: "6rem" },
    { key: "start_date", label: "البداية", leafOnly: true, w: "9rem" },
    { key: "end_date", label: "النهاية", leafOnly: true, w: "9rem" },
    { key: "is_active", label: "فعّال", type: "bool", w: "4rem" },
    { key: "notes", label: "ملاحظات", w: "12rem" },
  ],
  cost_centers: [
    { key: "is_active", label: "فعّال", type: "bool", w: "4rem" },
    { key: "notes", label: "ملاحظات", w: "12rem" },
  ],
};

/** Fields copied from the nearest existing relative when inserting a new row. */
const INHERIT: Record<string, string[]> = {
  accounts: ["nature", "closing_account_id", "cash_flow_type", "is_monetary", "balance_side"],
  products: ["unit", "item_type"],
  partners: ["partner_type", "deal_type"],
  warehouses: [],
};

/** Spreadsheet-like window: every record on one line, add groups and sub-items, save all at once. */
export function BulkTreeEditor({ table, codeField = "code", extra = {} }: { table: string; codeField?: string; extra?: Record<string, unknown> }) {
  const { data: me } = useMe();
  const { t } = useI18n();
  const qc = useQueryClient();
  const definedCurs = useCurrencies(table === "products").data;
  const baseCur = useBaseCurrency();
  const itemKind = extra["item_type"] === "service" ? "service" : "stock";
  const units = useUnits(itemKind);
  const priceNames = usePriceNames(itemKind);
  const [open, setOpen] = useState(false);
  const pctKey = `bulk-pcts:${table}:${itemKind}`;
  const [pcts, setPctsState] = useState<Record<string, string>>({});
  useEffect(() => { try { setPctsState(JSON.parse(localStorage.getItem(pctKey) ?? "{}")); } catch { /* ignore */ } }, [pctKey]);
  const setPcts = (v: Record<string, string>) => { setPctsState(v); try { localStorage.setItem(pctKey, JSON.stringify(v)); } catch { /* ignore */ } };
  const references = useQuery({
    queryKey: ["bulk_refs", table, me?.tenantId], enabled: open && !!me?.tenantId,
    queryFn: async () => {
      const result: Record<string, [string, string][]> = {};
      for (const ref of ["accounts", "warehouses", "partners"]) {
        const { data, error } = await db.from(ref).select("id,code,name,is_group").eq("tenant_id", me?.tenantId).order("code");
        if (error) throw error;
        result[ref] = (data ?? []).map((r: Row) => [r.id, `${r.code ?? ""} - ${r.name}`]);
      }
      if (table === "accounts") { const { data } = await db.from("partners").select("account_id").eq("tenant_id", me?.tenantId).eq("is_group", false); result["linkedPartnerAccounts"] = (data ?? []).filter((r: Row) => r.account_id).map((r: Row) => [r.account_id, ""]); }
      return result;
    },
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const closingAccounts = useQuery({
    queryKey: ["bulk_closing_accounts", me?.tenantId],
    enabled: open && table === "accounts" && !!me?.tenantId,
    queryFn: async () => {
      if (!me?.tenantId) return [];
      const { data, error } = await db.from("accounts").select("id,code,name").eq("tenant_id", me.tenantId).eq("nature", "closing").eq("is_group", false).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function reload() {
    if (!me) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (db.from(table) as any).select("*").eq("tenant_id", me.tenantId);
      if (table === "partners" && extra["partner_type"]) q = q.in("partner_type", [extra["partner_type"], "both"]);
      if (table === "products" && extra["item_type"]) q = q.eq("item_type", extra["item_type"]);
      const { data, error } = await q.order(codeField);
      if (error) { toast.error(error.message); return; }
      let mc: Record<string, number> = {};
      if (table === "products") {
        const { data: mv } = await db.from("stock_moves").select("product_id,direction,qty,unit_cost,move_date,created_at").eq("tenant_id", me.tenantId).range(0, 199999);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mc = costFromMoves((mv ?? []) as any[]);
      }
      setLines((data ?? []).map((r: Row) => ({ key: r.id, id: r.id, parent: r.parent_id ?? null, code: r[codeField] ?? "", name: r.name ?? "", name_en: r.name_en ?? "", is_group: !!r.is_group, orig: r, vals: { ...r, _cost: mc[r.id] ?? 0, is_closing: r.nature === "closing", ...Object.fromEntries(priceNames.map((_, i) => [`prices.${i+1}`, r.prices?.[String(i+1)] ?? ""])), ...Object.fromEntries(Object.entries((r.price_rules ?? {}) as Row).map(([k, v]) => [`price_rules.${k}`, v])) } })));
  }
  useEffect(() => { if (open) void reload(); }, [open, me?.tenantId, table, codeField, extra["partner_type"], extra["item_type"]]);

  // Order lines as a tree (depth-first) for display.
  const ordered = useMemo(() => {
    const kids: Record<string, Line[]> = {};
    lines.forEach((l) => { (kids[l.parent ?? "root"] ??= []).push(l); });
    const out: { l: Line; depth: number }[] = [];
    const walk = (p: string, d: number) => (kids[p] ?? []).forEach((l) => { out.push({ l, depth: d }); walk(l.key, d + 1); });
    walk("root", 0);
    return out;
  }, [lines]);

  function addLine(parent: Line | null, isGroup: boolean) {
    const sibs = lines.filter((l) => l.parent === (parent?.key ?? null)).map((l) => l.code);
    const code = suggestFreeCode(parent?.code ?? "", sibs, lines.map((l) => l.code));
    setLines((ls) => [...ls, { key: `new-${crypto.randomUUID()}`, parent: parent?.key ?? null, code, name: "", name_en: "", is_group: isGroup, dirty: true, vals: { is_active: true, currency: baseCur, unit: "قطعة", is_monetary: table === "partners", partner_type: extra["partner_type"] ?? "customer", deal_type: "both", ...(table === "products" ? { item_type: extra["item_type"] ?? "stock", unit: extra["item_type"] === "service" ? "خدمة" : "قطعة" } : {}) } }]);
  }
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p, dirty: true } : l)));
  const extraCols: Col[] = [];
  if (["partners", "warehouses", "projects", "cost_centers"].includes(table)) extraCols.push({ key: "account_id", label: "الحساب المرتبط", type: "select", options: (references.data?.["accounts"] ?? []), w: "16rem" });
  if (table === "partners") extraCols.push({ key: "auto_parent_account_id", label: "الحساب التجميعي الأب", type: "select", options: (references.data?.["accounts"] ?? []), w: "16rem" }, { key: "price_level", label: "السعر المعتمد", type: "select", leafOnly: true, options: [["0", "الافتراضي"], ...priceNames.map((n, i): [string, string] => [String(i+1), n])] });
  if (table === "products" && extra["item_type"] === "service") extraCols.push({ key: "service_source", label: "مصدر الخدمة", type: "select", leafOnly: true, options: [["internal", "داخلية"], ["purchased", "مشتراة"]], w: "7rem" }, { key: "service_account_id", label: "حساب الخدمة", type: "select", leafOnly: true, options: (references.data?.["accounts"] ?? []), w: "16rem" }, ...priceNames.map((n, i): Col => ({ key: `prices.${i+1}`, label: n, type: "number", leafOnly: true })));
  else if (table === "products") extraCols.push({ key: "default_warehouse_id", label: "المستودع", type: "select", leafOnly: true, options: (references.data?.["warehouses"] ?? []) }, ...priceNames.map((n, i): Col => ({ key: `prices.${i+1}`, label: n, type: "number", leafOnly: true })));
  if (table === "products") {
    const modes: [string, string][] = [["fixed", "قيمة ثابتة"], ["cost", "الكلفة + نسبة"]];
    [...(priceNames.length ? [] : [["sale", "الأساسي"]]), ...priceNames.map((n, i) => [String(i + 1), n])].forEach(([k, n]) => extraCols.push(
      { key: `price_rules.${k}_mode`, label: `طريقة ${n}`, type: "select", leafOnly: true, options: modes, w: "8rem" },
      { key: `price_rules.${k}_pct`, label: `نسبة ${n} %`, type: "number", leafOnly: true, w: "6rem" },
    ));
  }
  if (table === "projects") extraCols.push({ key: "client_id", label: "الزبون", type: "select", options: (references.data?.["partners"] ?? []) }, { key: "completion_pct", label: "نسبة الإنجاز", type: "number" }, { key: "status", label: "الحالة", type: "select", options: [["active", "قيد التنفيذ"], ["on_hold", "متوقف"], ["completed", "تم الإنجاز"], ["closed", "مغلق"]] });
  const cols = [...(COLS[table] ?? []).filter((c) => !(table === "products" && c.key === "sale_price" && priceNames.length)), ...extraCols].map((c): Col => ({ ...c, leafOnly: c.leafOnly || leafOnlyField(table, c.key),
    ...(c.key === "closing_account_id" ? { options: (closingAccounts.data ?? []).map((a: Row): [string, string] => [a.id, `${a.code} - ${a.name}`]) }
    : c.key === "unit" ? { options: unitOptions(units.data, itemKind).map((u): [string, string] => [u.value, u.label]) }
    : c.key === "currency" ? { options: (definedCurs ?? []).filter((x) => x.is_active !== false).map((x): [string, string] => [x.code, `${x.name} (${x.code})`]) } : {})
  }));
  const displayCols: Col[] = [...cols.filter((c) => c.key !== "notes"), { key: "name_en", label: "الاسم بالإنكليزية", w: "10rem" }, ...cols.filter((c) => c.key === "notes")];
  const tpl = `7rem minmax(14rem,1.4fr) 8rem ${displayCols.map((c) => c.w ?? "9rem").join(" ")}`;
  const setVal = (key: string, k: string, v: unknown) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, vals: { ...l.vals, [k]: v }, dirty: true } : l)));
  function valsFor(l: Line): Row {
    const out: Row = {};
    cols.forEach((c) => {
      if (c.readOnly) return;
      if ((c.leafOnly && l.is_group) || c.key === "is_closing" || (table === "accounts" && c.key === "currency" && (references.data?.["linkedPartnerAccounts"] ?? []).some(([id]) => id === l.id))) return;
      let v = l.vals[c.key];
      if (v === undefined) return;
      if (c.type === "number") v = v === "" || v === null ? null : Number(v);
      else if (c.type !== "bool" && v === "") v = null;
      if (c.key.includes(".")) { const [col, sub] = c.key.split("."); if (!col || !sub) return; out[col] = { ...(l.orig?.[col] ?? {}), ...(out[col] ?? {}), [sub]: v }; }
      else out[c.key] = v;
    });
    if (table === "accounts") {
      if (l.is_group || l.vals.is_closing) { out.is_monetary = false; out.cash_flow_type = null; }
      // Base-currency accounts have no exchange differences, so they are never monetary.
      if ((l.vals.currency ?? baseCur) === baseCur) out.is_monetary = false;
      out.nature = accountNature(!!l.vals.is_closing, l.orig?.nature); if (!l.vals.is_closing) out.closing_type = null;
    }
    return out;
  }
  async function removeSaved(l: Line) {
    const kids = lines.filter((x) => x.parent === l.key);
    if (kids.length) { toast.error(t("احذف العناصر الفرعية أولاً")); return; }
    if (!confirm(`${t("حذف")} ${l.code} ${l.name}؟`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from(table) as any).delete().eq("id", l.id);
    if (error) { toast.error(t("لا يمكن الحذف: ") + error.message); return; }
    setLines((ls) => ls.filter((x) => x.key !== l.key));
    qc.invalidateQueries({ queryKey: [table] });
    qc.invalidateQueries({ queryKey: [`${table}_tree`] });
    toast.success(t("تم الحذف"));
  }
  const stockItems = table === "products" && itemKind === "stock";
  // Fills retail/named prices from each leaf's purchase price using the entered markup percentages.
  function applyPrices() {
    const keys = [["sale_price", pcts["sale_price"]], ...priceNames.map((_, i) => [`prices.${i + 1}`, pcts[`prices.${i + 1}`]])].filter(([, v]) => v !== undefined && v !== "") as [string, string][];
    if (!keys.length) { toast.error(t("أدخل نسبة الربح لأحد الأسعار")); return; }
    let n = 0;
    setLines((ls) => ls.map((l) => {
      if (l.is_group) return l;
      const base = Number(l.vals._cost) || 0;
      n++;
      const vals = { ...l.vals };
      keys.forEach(([k, pct]) => {
        const rk = k === "sale_price" ? "sale" : k.split(".")[1];
        vals[`price_rules.${rk}_mode`] = "cost"; vals[`price_rules.${rk}_pct`] = pct;
        if (base > 0) vals[k] = Math.round(base * (1 + Number(pct) / 100) * 10000) / 10000;
      });
      return { ...l, vals, dirty: true };
    }));
    setTimeout(() => toast.success(`${t("تم احتساب أسعار")} ${n} ${t("مادة")} — ${t("اضغط حفظ")}`), 0);
  }
  function fillBarcodes() {
    let n = 0;
    setLines((ls) => ls.map((l) => { if (l.is_group || l.vals.barcode) return l; n++; return { ...l, vals: { ...l.vals, barcode: generateEan13() }, dirty: true }; }));
    setTimeout(() => toast.success(`${t("تم توليد")} ${n} ${t("باركود")} — ${t("اضغط حفظ")}`), 0);
  }
  const removeNew = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key && l.parent !== key));

  function inherited(l: Line): Row {
    const fields = INHERIT[table] ?? [];
    if (!fields.length) return {};
    // Nearest existing sibling leaf, else any existing ancestor.
    const sib = lines.find((x) => x.orig && x.parent === l.parent && x.is_group === l.is_group && x.key !== l.key);
    let src: Row | undefined = sib?.orig;
    let p = lines.find((x) => x.key === l.parent);
    while (!src && p) { if (p.orig) src = p.orig; const parent = p.parent; p = lines.find((x) => x.key === parent); }
    const out: Row = {};
    if (src) { const source = src; fields.forEach((f) => { if (source[f] !== undefined && source[f] !== null) out[f] = source[f]; }); }
    if (l.is_group) for (const key of Object.keys(out)) if (leafOnlyField(table, key)) delete out[key];
    return out;
  }

  async function save(close = false) {
    if (!me) return;
    setBusy(true);
    try {
      const idMap: Record<string, string> = {};
      for (const { l } of ordered) {
        if (!l.dirty) continue;
        if (!l.name.trim()) throw new Error(t("كل سطر يجب أن يحتوي اسماً"));
        if (table === "accounts" && !l.is_group && !l.vals.is_closing && !l.vals.closing_account_id) throw new Error(`${l.code}: حدد الحساب الختامي للإقفال`);
        const parentId = l.parent ? (idMap[l.parent] ?? (l.parent.startsWith("new-") ? null : l.parent)) : null;
        if (l.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (db.from(table) as any).update({ ...valsFor(l), parent_id: parentId, is_group: l.is_group, name: l.name.trim(), name_en: l.name_en.trim() || null, [codeField]: l.code }).eq("id", l.id);
          if (error) throw error;
          setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, dirty: false } : x));
        } else {
          const row: Row = { ...extra, ...inherited(l), ...Object.fromEntries(Object.entries(valsFor(l)).filter(([, v]) => v !== null)), tenant_id: me.tenantId, [codeField]: l.code, name: l.name.trim(), name_en: l.name_en.trim() || null, parent_id: parentId, is_group: l.is_group };
          if (table === "partners" && !l.is_group) row.auto_account = !row.account_id;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (db.from(table) as any).insert(row).select("id").single();
          if (error) throw new Error(`${l.code} ${l.name}: ${error.message}`);
          idMap[l.key] = data.id;
          setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, key: data.id, id: data.id, parent: parentId, dirty: false } : x.parent === l.key ? { ...x, parent: data.id } : x));
        }
      }
      toast.success(t("تم حفظ كل الأسطر"));
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["crud", table] });
      qc.invalidateQueries({ queryKey: [`${table}_tree`] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["refs"] });
      if (close) setOpen(false);
      else await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Rows3 className="size-4" />{t("إدخال متعدد")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-screen max-h-screen w-screen max-w-none flex-col gap-3 overflow-hidden rounded-none p-4 pt-0 sm:max-w-none">
          <DialogHeader><DialogTitle>{t("إدخال وتعديل متعدد")}</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => addLine(null, true)}><FolderPlus className="size-4" />{t("تجميعي رئيسي")}</Button>
            <Button size="sm" variant="secondary" onClick={() => addLine(null, false)}><Plus className="size-4" />{t("عنصر رئيسي")}</Button>
            {stockItems && <Button size="sm" variant="outline" onClick={fillBarcodes}>{t("توليد باركود للمواد بلا باركود")}</Button>}
          </div>
          {stockItems && (
            <div className="flex flex-wrap items-end gap-2 rounded border bg-muted/40 p-2 text-xs">
              <span className="font-semibold">{t("احتساب الأسعار من سعر الكلفة (نسبة ربح % تُثبَّت على كل المواد)")}</span>
              {[...(priceNames.length ? [] : [["sale_price", "الأساسي"]]), ...priceNames.map((n, i) => [`prices.${i + 1}`, n])].map(([k, label]) => (
                <label key={k} className="flex items-center gap-1">{t(label!)}<Input type="number" className="h-8 w-20" value={pcts[k!] ?? ""} onChange={(e) => setPcts({ ...pcts, [k!]: e.target.value })} /></label>
              ))}
              <Button size="sm" onClick={applyPrices}>{t("احتساب")}</Button>
              {!priceNames.length && <span className="text-muted-foreground">{t("لإضافة سعر الجملة عرّف اسم السعر «جملة» من الإعدادات ← أسماء الأسعار")}</span>}
            </div>
          )}
          <TopScrollArea className="flex min-h-0 flex-1 flex-col rounded border" contentClassName="min-h-0 flex-1 overflow-auto">
           <div className="min-w-max">
            <div className="sticky top-0 z-10 grid gap-2 border-b bg-muted px-2 py-1 text-xs font-semibold" style={{ gridTemplateColumns: tpl }}>
              <span>{t("الإجراءات")}</span><span>{t("الاسم")} *</span><span>{t("الرمز")} *</span>
              {displayCols.map((c) => <span key={c.key}>{t(c.label)}{c.required ? " *" : ""}</span>)}
            </div>
            {ordered.map(({ l, depth }) => (
              <div key={l.key} className={`grid items-center gap-2 border-b px-2 py-1 ${l.is_group ? "border-s-4 border-s-primary bg-primary/10 font-bold" : ""} ${l.id ? "" : "bg-primary/5"}`} style={{ gridTemplateColumns: tpl }}>
                <div className="flex gap-0.5">
                  {l.is_group && <>
                    <Button size="icon" variant="ghost" className="size-7" title={t("إضافة تجميعي فرعي")} onClick={() => addLine(l, true)}><FolderPlus className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-7" title={t("إضافة فرعي")} onClick={() => addLine(l, false)}><Plus className="size-4" /></Button>
                  </>}
                  {l.id && <Button size="icon" variant="ghost" className="size-7 text-destructive" title={t("حذف")} onClick={() => removeSaved(l)}><Trash2 className="size-4" /></Button>}
                  {!l.id && <Button size="icon" variant="ghost" className="size-7 text-destructive" title={t("حذف السطر")} onClick={() => removeNew(l.key)}><Trash2 className="size-4" /></Button>}
                </div>
                <div className="flex items-center gap-1" style={{ paddingInlineStart: depth * 18 }}>
                  {l.is_group ? <Folder className="size-5 shrink-0 text-primary" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                  <Input className={`h-8 ${l.is_group ? "font-bold text-primary" : ""}`} value={l.name} placeholder={l.is_group ? t("اسم التجميعي") : t("الاسم")} onChange={(e) => patch(l.key, { name: e.target.value })} />
                </div>
                <Input className="num h-8" value={l.code} onChange={(e) => patch(l.key, { code: e.target.value })} />
                {displayCols.map((c) => {
                  if (c.key === "name_en") return <Input key={c.key} className="h-8" dir="ltr" value={l.name_en} placeholder={t("الاسم بالإنكليزية")} onChange={(e) => patch(l.key, { name_en: e.target.value })} />;
                  if ((c.leafOnly && l.is_group) || (table === "accounts" && c.key === "closing_type" && !l.vals.is_closing)
                    || (table === "accounts" && ["is_monetary", "cash_flow_type"].includes(c.key) && l.vals.is_closing)
                    || (table === "accounts" && c.key === "is_monetary" && (l.vals.currency ?? baseCur) === baseCur)) return <span key={c.key} />;
                  const v = l.vals[c.key];
                  if (c.readOnly) return <span key={c.key} className="num text-sm font-normal">{fmtCost(v)}</span>;
                  const readOnlyCurrency = table === "accounts" && c.key === "currency" && (references.data?.["linkedPartnerAccounts"] ?? []).some(([id]) => id === l.id);
                  if (c.type === "bool") return <input key={c.key} type="checkbox" className="size-4 justify-self-center" checked={!!v} onChange={(e) => setVal(l.key, c.key, e.target.checked)} />;
                  if (c.type === "select") return (
                    <select key={c.key} disabled={readOnlyCurrency} className="h-8 rounded-md border bg-background px-1 text-sm font-normal" value={v ?? ""} onChange={(e) => setVal(l.key, c.key, e.target.value)}>
                      {!c.options?.some(([o]) => o === "") && <option value="">—</option>}
                      {c.options?.filter(([o]) => c.key !== "closing_account_id" || o !== l.id).map(([o, lb]) => <option key={o} value={o}>{t(lb)}</option>)}
                    </select>
                  );
                  if (c.key === "barcode") return (
                    <div key={c.key} className="flex items-center gap-0.5">
                      <Input className="h-8 font-normal" dir="ltr" value={v ?? ""} onChange={(e) => setVal(l.key, c.key, e.target.value)} />
                      <BarcodeScanner compact onScan={(code) => setVal(l.key, c.key, code)} />
                    </div>
                  );
                  return <Input key={c.key} className={`h-8 font-normal ${c.type === "number" ? "num" : ""}`} type={c.key.endsWith("_date") ? "date" : c.type === "number" ? "number" : "text"} value={v ?? ""} onChange={(e) => setVal(l.key, c.key, e.target.value)} />;
                })}
              </div>
            ))}
           </div>
          </TopScrollArea>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{t("إلغاء")}</Button>
            <Button onClick={() => save(false)} disabled={busy}>{busy ? t("جارٍ الحفظ...") : t("حفظ وتحديث")}</Button>
            <Button onClick={() => save(true)} disabled={busy}>{t("حفظ وإغلاق")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
