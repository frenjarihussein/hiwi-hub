import { RecordNotesButton } from "@/components/collab/RecordNotes";
import { ApprovalButton } from "@/components/collab/ApprovalButton";
import { ShareLinkButton } from "@/components/collab/ShareLinkButton";
const DOC_TITLE_FOR_COLLAB: Record<string, string> = { sale: "فاتورة بيع", purchase: "فاتورة شراء", sale_return: "مرتجع بيع", purchase_return: "مرتجع شراء", receipt: "سند قبض", payment: "سند دفع", quote: "عرض سعر", transfer: "مناقلة", stock_in: "إدخال مستودع", stock_out: "إخراج مستودع" };
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fragment, useEffect, useRef, useState } from "react";
import { db, scope } from "@/lib/db";
import { can, canDocType, useMe } from "@/lib/session";
import { fmtDate, fmtNum, today } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExchangeForm, TransferForm } from "./treasury";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Minus, Trash2, CheckCircle2, RotateCcw, Pencil, Printer, MessageCircle, LayoutList, Table2 } from "lucide-react";
import { AttachmentsButton } from "@/components/AttachmentsButton";
import { printDocument } from "@/lib/print";
import { useBranding } from "@/lib/branding";
import { useBaseCurrency, useCurrencies } from "@/lib/currencies";
import { QuickAdd } from "@/components/QuickAdd";
import { BarcodeInput, findByCode } from "@/components/BarcodeInput";
import { Eye, BookOpenText, Receipt, Shuffle } from "lucide-react";
import { DocumentView } from "@/components/DocumentView";
import { nowParts, useManualDatetime } from "@/lib/datetime-pref";
import { ExprInput } from "@/components/ExprInput";
import { isUnderCategory } from "@/lib/category-path";
import { ChargesEditor, LineAdjust, chargesNet, rebaseCharges, type Charge } from "@/components/ChargesEditor";
import { chargeAccountError, costRules, hasAdjustments, usesCostPolicy } from "@/lib/purchase-cost-policy";
import { AccountPicker } from "@/components/AccountPicker";
import { priceForLevel } from "@/lib/prices";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react";
import { applyPattern, patternAllowsPartner, patternAllowsUser, patternAllowsWarehouse, patternAllowsCash, patternAllowsCurrency, primaryAllowed, type DocPattern } from "@/lib/doc-patterns";
import { InvoiceBalanceInfo } from '@/components/InvoiceBalanceInfo';

/** Browse documents of the same type: first / previous / next / last / by number. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DocNavigator({ docType, currentNo, onOpen, onNew }: { docType: string; currentNo: number | null; onOpen: (d: any) => void; onNew?: () => void }) {
  const [no, setNo] = useState("");
  useEffect(() => setNo(currentNo != null ? String(currentNo) : ""), [currentNo]);
  async function go(dir: "first" | "prev" | "next" | "last" | "exact", n?: number) {
    let q = db.from("documents").select("*").eq("doc_type", docType);
    if (dir === "exact") q = q.eq("doc_no", n!);
    else if (dir === "prev" && currentNo != null) q = q.lt("doc_no", currentNo).order("doc_no", { ascending: false });
    else if (dir === "next" && currentNo != null) q = q.gt("doc_no", currentNo).order("doc_no", { ascending: true });
    else if (dir === "first") q = q.order("doc_no", { ascending: true });
    else q = q.order("doc_no", { ascending: false }); // last, or prev from a new document
    if (dir === "next" && currentNo == null) { toast.info("هذا مستند جديد — لا يوجد تالٍ"); return; }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.info(dir === "exact" ? `لا يوجد مستند بالرقم ${n}` : dir === "next" ? "هذا آخر مستند" : "هذا أول مستند"); return; }
    onOpen(data);
  }
  const b = "grid size-8 place-items-center rounded-md border hover:bg-accent";
  return (
    <div className="flex items-center gap-1" dir="rtl">
      <button type="button" className={b} title="الأول" onClick={() => go("first")}><ChevronsRight className="size-4" /></button>
      <button type="button" className={b} title="السابق" onClick={() => go("prev")}><ChevronRight className="size-4" /></button>
      <input
        className="num h-8 w-16 rounded-md border bg-background px-1 text-center text-sm"
        placeholder="رقم"
        value={no}
        onChange={(e) => setNo(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const n = Number(no); if (n > 0) void go("exact", n); } }}
        title="اكتب رقم الفاتورة ثم Enter"
      />
      <button type="button" className={b} title="التالي" onClick={() => go("next")}><ChevronLeft className="size-4" /></button>
      <button type="button" className={b} title="الأخير" onClick={() => go("last")}><ChevronsLeft className="size-4" /></button>
      {onNew && <button type="button" className="ms-1 h-8 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90" title="مستند جديد من نفس النوع" onClick={onNew}>+ جديد</button>}
    </div>
  );
}
import {
  DataFilters,
  applyFilters,
  resolveRange,
  useDataFilters,
  type FacetConfig,
} from "@/components/DataFilters";

export const Route = createFileRoute("/_authenticated/documents")({
  validateSearch: (s: Record<string, unknown>): { new?: string; open?: string; edit?: string; pattern?: string } => ({
    ...(typeof s['pattern'] === "string" ? { pattern: s['pattern'] } : {}),
    ...(typeof s['edit'] === "string" ? { edit: s['edit'] } : {}),
    ...(typeof s['new'] === "string" ? { new: s['new'] } : {}),
    ...(typeof s['open'] === "string" ? { open: s['open'] } : {}),
  }),
  head: () => ({ meta: [
    { title: "المستندات والفواتير | يوسف سوفت" },
    { name: "description", content: "فواتير البيع والشراء والمرتجعات والسندات." },
    { property: "og:title", content: "المستندات والفواتير | يوسف سوفت" },
    { property: "og:description", content: "فواتير البيع والشراء والمرتجعات والسندات." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: DocumentsPage,
});

const DOC_TYPES = [
  { value: "quote", label: "عرض سعر", lines: true, partner: true, warehouse: false },
  { value: "sale", label: "فاتورة مبيع", lines: true, partner: true, warehouse: true },
  { value: "purchase", label: "فاتورة شراء", lines: true, partner: true, warehouse: true },
  { value: "opening_inventory", label: "فاتورة بضاعة أول المدة", lines: true, partner: false, warehouse: true },
  { value: "closing_inventory", label: "فاتورة بضاعة آخر المدة", lines: true, partner: false, warehouse: true },
  { value: "sale_return", label: "مرتجع مبيع", lines: true, partner: true, warehouse: true },
  { value: "purchase_return", label: "مرتجع شراء", lines: true, partner: true, warehouse: true },
  { value: "receipt", label: "سند قبض", lines: false, partner: true, warehouse: false },
  { value: "payment", label: "سند دفع", lines: false, partner: true, warehouse: false },
  { value: "transfer", label: "مناقلة بين المستودعات", lines: true, partner: false, warehouse: true },
  { value: "stock_in", label: "إدخال مستودع", lines: true, partner: true, warehouse: true },
  { value: "stock_out", label: "سند تسليم مواد (إخراج مستودع)", lines: true, partner: false, warehouse: true },
  { value: "purchase_request", label: "طلب شراء", lines: true, partner: false, warehouse: true },
  { value: "purchase_order", label: "أمر شراء", lines: true, partner: true, warehouse: true },
  { value: "payment_order", label: "أمر صرف", lines: false, partner: true, warehouse: false },
  { value: "stocktake", label: "جرد مخزني", lines: true, partner: false, warehouse: true },
];
/** Documents that complete the cycle but never post or create an entry. */
/** Document cycle: which documents each type can be converted into. */
const CONVERT_TO: Record<string, string[]> = {
  quote: ["sale"],
  purchase_request: ["purchase_order"],
  purchase_order: ["stock_in", "purchase"],
  stock_in: ["purchase"],
  sale: ["stock_out", "sale_return"],
  purchase: ["purchase_return"],
  payment_order: ["payment"],
};
const NON_POSTING = ["quote", "purchase_request", "purchase_order", "payment_order"];

type Line = { product_id: string; qty: string; unit_price: string; expiry_date: string; disc?: string; add?: string; wh?: string; discount_account?: string; addition_account?: string; addition_credit?: string };
type LineKind = "all" | "stock" | "service";
const LINE_KINDS: [LineKind, string][] = [["all", "الكل"], ["stock", "مادة"], ["service", "خدمة"]];
const MULTI_WH = "__multi";
const lineNet = (l: Line) => (Number(l.qty) || 0) * (Number(l.unit_price) || 0) - (Number(l.disc) || 0) + (Number(l.add) || 0);

const emptyDoc = {
  doc_type: "sale",
  doc_date: today(),
  doc_time: "",
  currency: "USD",
  exchange_rate: "1",
  partner_id: "",
  warehouse_id: "",
  to_warehouse_id: "",
  final_warehouse_id: "",
  settles_document_id: "",
  project_id: "",
  pattern_id: "",
  account_id: "",
  partner_account_id: "",
  cash_account_id: "",
  amount: "0",
  notes: "",
  valid_until: "",
  terms: "",
  payment_mode: "credit",
  discount_amount: "0",
  freight_amount: "0",
};

function DocumentsPage() {
  const { data: me } = useMe();
  const baseCur = useBaseCurrency();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [open, setOpen] = useState(false);
  const [headOpen, setHeadOpen] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);
  const manualDt = useManualDatetime();
  const [form, setForm] = useState(emptyDoc);
  const [editing, setEditing] = useState<{ id: string; status: string; journal_entry_id?: string | null } | null>(null);
  const [editingNo, setEditingNo] = useState<number | null>(null);
  useEffect(() => { if (!editing) setEditingNo(null); }, [editing]);
  const brand = useBranding();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [lines, setLines] = useState<Line[]>([{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]);
  /** Category chosen per invoice line; filters the item list of that line. */
  const [adjOpen, setAdjOpen] = useState<Record<number, boolean>>({});
  const [lineCats, setLineCats] = useState<Record<number, string>>({});
  /* Per-line item kind picker: all / stock item / service. */
  const [lineKinds, setLineKinds] = useState<Record<number, LineKind>>({});
  const [filters, setFilters] = useDataFilters();
  const [view, setView] = useState<"compact" | "table">("compact");
  const range = resolveRange(filters);
  const myTypes = DOC_TYPES.filter((d) => canDocType(me, d.value));
  const allTypes = myTypes.length === DOC_TYPES.length;
  const typeFilter = (filters.facets["doc_type"] ?? []).length > 0 ? filters.facets["doc_type"]! : allTypes ? [] : myTypes.map((d) => d.value);

  useEffect(() => {
    if (!search.new || !me || !can(me, "documents", "create")) return;
    if (DOC_TYPES.some((d) => d.value === search.new) && canDocType(me, search.new, "create") && primaryAllowed(ref.data?.denied, me.userId, search.new, me.isTenantAdmin || me.isSuperAdmin)) {
      setEditing(null);
      setForm({ ...emptyDoc, currency: baseCur, doc_type: search.new, doc_date: nowParts().date, doc_time: nowParts().time });
      setLines([{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]);
      setCharges([]);
      setLineCats({}); setLineKinds({});
      setOpen(true);
    }
    void navigate({ search: {}, replace: true });
  }, [search.new, me, navigate]);
  // Opening a new document from a saved pattern (?pattern=<id>): applies its fixed values.
  useEffect(() => {
    if (!search.pattern || !me) return;
    const id = search.pattern;
    void (async () => {
      const { data } = await db.from("doc_patterns").select("*").eq("id", id).maybeSingle();
      const p = data as unknown as DocPattern | null;
      if (!p || !p.is_active || !canDocType(me, p.doc_type, "create") || !patternAllowsUser(p, me.userId, me.isTenantAdmin || me.isSuperAdmin)) toast.error("لا تملك صلاحية فتح هذا النمط");
      else {
        setEditing(null);
        setForm(applyPattern({ ...emptyDoc, currency: baseCur, doc_date: nowParts().date, doc_time: nowParts().time }, p));
        setLines([{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]);
        setCharges([]); setLineCats({}); setLineKinds({});
        setOpen(true);
      }
      void navigate({ search: {}, replace: true });
    })();
  }, [search.pattern, me]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening a specific document from a journal entry or another screen (?open=<id>).
  useEffect(() => {
    if (!search.open || !me) return;
    const id = search.open;
    void (async () => {
      const { data, error } = await db.from("documents").select("id").eq("id", id).maybeSingle();
      if (error || !data) toast.error("تعذّر فتح المستند الأصلي");
      else setViewId(id);
      void navigate({ search: {}, replace: true });
    })();
  }, [search.open, me]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening a document straight into its edit window (?edit=<id>), e.g. from a journal entry's source link.
  useEffect(() => {
    if (!search.edit || !me) return;
    const id = search.edit;
    void (async () => {
      const { data, error } = await db.from("documents").select("*").eq("id", id).maybeSingle();
      if (error || !data) toast.error("تعذّر فتح المستند الأصلي");
      else await startEdit(data);
      void navigate({ search: {}, replace: true });
    })();
  }, [search.edit, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = DOC_TYPES.find((d) => d.value === form.doc_type) ?? { value: "sale", label: "فاتورة بيع", lines: true, partner: true, warehouse: true };
  const patterns = useQuery({
    queryKey: ["doc_patterns", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => ((await db.from("doc_patterns").select("*").order("doc_type").order("name")).data ?? []) as unknown as DocPattern[],
  });
  const myPatterns = (patterns.data ?? []).filter((p) => p.is_active && !!me && canDocType(me, p.doc_type, "create") && patternAllowsUser(p, me.userId, me.isTenantAdmin || me.isSuperAdmin));
  const activePattern = (patterns.data ?? []).find((p) => p.id === form.pattern_id) ?? null;
  const shown = (k: string) => !activePattern?.hidden?.includes(k);
  const allCurs = useCurrencies().data ?? [];
  const curOpts = () => allCurs.filter((c) => c.is_active !== false && (patternAllowsCurrency(activePattern, c.code) || c.code === form.currency));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cashOpts = (): any[] => (ref.data?.accounts ?? []).filter((a: { id: string; nature?: string }) =>
    a.id === form.cash_account_id || a.id === form.account_id ||
    (activePattern?.cash_account_ids?.length ? activePattern.cash_account_ids.includes(a.id) : !["revenues", "expenses", "profit_loss", "cost_centers"].includes(a.nature ?? "")));
  /** Partner ledger accounts limited to the pattern's chosen accounts and everything under them. */
  const underAccount = (id: string, roots: string[]) => {
    const seen = new Set<string>();
    for (let c: string | null = id; c && !seen.has(c); c = ref.data?.accountParent.get(c) ?? null) { if (roots.includes(c)) return true; seen.add(c); }
    return false;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerAccOpts = (): any[] => (ref.data?.accounts ?? []).filter((a: { id: string }) =>
    a.id === form.partner_account_id || !activePattern?.partner_account_ids?.length || underAccount(a.id, activePattern.partner_account_ids));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counterOpts = (): any[] => capitalIsGroup ? (ref.data?.accounts ?? []).filter((a: { id: string; is_group?: boolean }) => !a.is_group && a.id !== capitalRoot && underAccount(a.id, [capitalRoot])) : capitalFixed ? (ref.data?.accounts ?? []).filter((a: { id: string }) => a.id === capitalRoot) : cashOpts();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whOpts = (): any[] => (ref.data?.warehouses ?? []).filter((w: { id: string }) => patternAllowsWarehouse(activePattern, w.id));
  const primaryOk = (t: string) => primaryAllowed(ref.data?.denied, me?.userId, t, !!(me?.isTenantAdmin || me?.isSuperAdmin));
  // Admins editing an existing document may override pattern locks.
  const locked = (k: string) => !(editing && (me?.isTenantAdmin || me?.isSuperAdmin)) && !!activePattern?.locked?.includes(k) && !!activePattern?.defaults?.[k];
  const switchPattern = (id: string) => {
    const base = { ...emptyDoc, currency: baseCur, doc_type: form.doc_type, doc_date: form.doc_date, doc_time: form.doc_time };
    const p = myPatterns.find((x) => x.id === id && x.doc_type === form.doc_type);
    setForm(p ? applyPattern(base, p) : base);
  };
  function openPattern(p: DocPattern) {
    setEditing(null); setEditingNo(null);
    setForm(applyPattern({ ...emptyDoc, currency: baseCur, doc_date: nowParts().date, doc_time: nowParts().time }, p));
    setLines([{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]);
    setCharges([]); setLineCats({}); setLineKinds({});
    setOpen(true);
  }
  /** بطاقات الشركاء الفعلية فقط (بدون التصنيفات)، مصفّاة حسب نوع المستند. */
  const partnerOptions = () => (ref.data?.partners ?? []).filter((p: any) => {
    if (p.is_group) return false;
    if (!patternAllowsPartner(activePattern, p, ref.data?.partnerParent, ref.data?.accountParent)) return false;
    // Partners explicitly chosen in the pattern always show, regardless of customer/supplier type.
    const scoped = !!activePattern && ((activePattern.partner_ids?.length ?? 0) + (activePattern.partner_group_ids?.length ?? 0) + (activePattern.partner_account_ids?.length ?? 0)) > 0;
    if (scoped) return true;
    const t = p.partner_type ?? "both";
    if (["sale", "sale_return", "receipt"].includes(form.doc_type)) return t === "customer" || t === "both";
    if (["purchase", "purchase_return", "payment", "purchase_order", "payment_order"].includes(form.doc_type)) return t === "supplier" || t === "both";
    return true;
  });

  // Date range and document types are pushed into the backend query.
  const list = useQuery({
    queryKey: ["documents", me?.tenantId, typeFilter.join(","), range.from, range.to],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      let q = db.from("documents").select("*, je:journal_entry_id(audited)").order("doc_date", { ascending: false }).order("doc_time", { ascending: false, nullsFirst: false }).order("doc_no", { ascending: false });
      if (typeFilter.length > 0) q = q.in("doc_type", typeFilter);
      if (range.from) q = q.gte("doc_date", range.from);
      if (range.to) q = q.lte("doc_date", range.to);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const ref = useQuery({
    queryKey: ["doc_refs", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const [partners, warehouses, products, projects, accounts, settings] = await Promise.all([
        scope(db.from("partners").select("id,name,phone,barcode,is_group,partner_type,deal_type,price_level,currency,account_id,parent_id"), me?.tenantId).order("name"),
        scope(db.from("warehouses").select("id,name").eq("is_group", false), me?.tenantId).order("name"),
        scope(db.from("products").select("id,name,sku,barcode,sale_price,prices,last_purchase_price,purchase_price,avg_cost,initial_quantity,parent_id,is_group,default_warehouse_id,item_type,unit"), me?.tenantId).order("name"),
        scope(db.from("projects").select("id,name"), me?.tenantId).order("name"),
        scope(db.from("accounts").select("id,code,name,is_group,nature,parent_id"), me?.tenantId).order("code"),
        db.from("tenant_settings").select("cash_account_id,capital_account_id,primary_pattern_denied,inventory_method,purchase_cost_policy,purchase_discount_account_id,purchase_freight_account_id").eq("tenant_id", me?.tenantId).maybeSingle(),
      ]);
      return {
        defaultCash: settings.data?.cash_account_id ?? "",
        denied: ((settings.data as { primary_pattern_denied?: unknown } | null)?.primary_pattern_denied ?? {}) as Record<string, string[]>,
        costSettings: settings.data,
        partners: partners.data ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partnerParent: new Map<string, string | null>((partners.data ?? []).map((x: any) => [x.id, x.parent_id ?? null])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accountParent: new Map<string, string | null>((accounts.data ?? []).map((x: any) => [x.id, x.parent_id ?? null])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupIds: new Set<string>((accounts.data ?? []).filter((x: any) => x.is_group).map((x: any) => x.id)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        capitalId: ((settings.data as any)?.capital_account_id ?? "") as string,
        warehouses: warehouses.data ?? [],
        products: products.data ?? [],
        projects: projects.data ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accounts: (accounts.data ?? []).filter((a: any) => !a.is_group && a.nature !== "closing"),
      };
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Opening stock capital: pattern main (or primary capital) may be a main account (pick a sub-account per document) or a fixed sub-account.
  const capitalRoot = form.doc_type === "opening_inventory" ? (activePattern?.accounts?.["main"] || ref.data?.capitalId || "") : "";
  const capitalIsGroup = !!capitalRoot && !!ref.data?.groupIds.has(capitalRoot);
  const capitalFixed = !!capitalRoot && !capitalIsGroup;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerDeal: string = (ref.data?.partners ?? []).find((p: any) => p.id === form.partner_id)?.deal_type ?? "both";
  const dealOk = (p: { item_type?: string; id?: string }) => partnerDeal === "both" || (p.item_type ?? "stock") === partnerDeal;
  const [pickOpen, setPickOpen] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [pickSel, setPickSel] = useState<Record<string, boolean>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickList = (ref.data?.products ?? []).filter((p: any) => {
    if (p.is_group || !dealOk(p)) return false;
    if (p.item_type !== "service" && p.default_warehouse_id && form.warehouse_id && form.warehouse_id !== MULTI_WH && p.default_warehouse_id !== form.warehouse_id) return false;
    const q = pickQ.trim().toLowerCase();
    return !q || [p.name, p.sku, p.barcode].some((v) => v && String(v).toLowerCase().includes(q));
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addProducts = (ps: any[]) => {
    const sale = ["sale", "quote", "sale_return"].includes(form.doc_type);
    const cost = ["purchase", "purchase_return", "opening_inventory", "closing_inventory"].includes(form.doc_type);
    const stockCost = ["transfer", "stock_out", "stock_in"].includes(form.doc_type);
    setLines((cur) => {
      const have = new Set(cur.map((l) => l.product_id));
      const add = ps.filter((p) => !have.has(p.id)).map((p) => ({
        product_id: p.id, qty: "1", expiry_date: "",
        unit_price: String(sale ? priceForLevel(p, partnerLevel) || p.last_purchase_price || 0 : cost ? p.last_purchase_price || p.purchase_price || p.avg_cost || 0 : stockCost ? p.avg_cost || p.last_purchase_price || p.purchase_price || 0 : 0),
      }));
      if (!add.length) toast.info("لا توجد مواد جديدة لإضافتها");
      else toast.success(`أضيفت ${add.length} مادة`);
      return [...cur.filter((l) => l.product_id), ...add];
    });
    setHeadOpen(false);
  };
  const partnerLevel = Number((ref.data?.partners ?? []).find((p: any) => p.id === form.partner_id)?.price_level) || 0;
  /** Switches the document currency and fills the latest rate on or before the document date. */
  async function applyCurrency(cur: string) {
    setForm((f) => ({ ...f, currency: cur, exchange_rate: cur === baseCur ? "1" : "" }));
    if (cur !== baseCur) {
      const { data } = await scope(db.from("exchange_rates").select("rate_to_usd").eq("currency", cur), me?.tenantId).lte("rate_date", form.doc_date || today()).order("rate_date", { ascending: false }).limit(1);
      const r = data?.[0]?.rate_to_usd;
      if (r) setForm((f) => (f.currency === cur ? { ...f, exchange_rate: String(r) } : f));
    }
  }
  /** Open (not fully settled) invoices of the selected partner for receipt/payment vouchers. */
  const openInvoices = useQuery({
    queryKey: ["open_invoices", me?.tenantId, form.partner_id, form.doc_type],
    enabled: !!me?.tenantId && !!form.partner_id && (form.doc_type === "receipt" || form.doc_type === "payment"),
    queryFn: async () => {
      const invType = form.doc_type === "receipt" ? "sale" : "purchase";
      const { data: invs, error } = await scope(
        db.from("documents").select("id,doc_no,doc_date,amount,currency,exchange_rate"),
        me?.tenantId,
      )
        .eq("doc_type", invType)
        .eq("partner_id", form.partner_id);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = (invs ?? []).map((d: any) => d.id);
      const settled: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: pays, error: pErr } = await scope(
          db.from("documents").select("settles_document_id,amount,exchange_rate"),
          me?.tenantId,
        ).in("settles_document_id", ids);
        if (pErr) throw pErr;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of pays ?? []) {
          settled[p.settles_document_id] =
            (settled[p.settles_document_id] ?? 0) + Number(p.amount) / (Number(p.exchange_rate) || 1);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (invs ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((d: any) => {
          const total = Number(d.amount) / (Number(d.exchange_rate) || 1);
          return { ...d, total, remaining: total - (settled[d.id] ?? 0) };
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((d: any) => d.remaining > 0.005)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => String(a.doc_date).localeCompare(String(b.doc_date)));
    },
  });

  const kindOf = (i: number, l: Line): LineKind => {
    if (lineKinds[i]) return lineKinds[i]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = l.product_id ? (ref.data?.products ?? []).find((x: any) => x.id === l.product_id) : null;
    return p ? ((p.item_type ?? "stock") as LineKind) : "all";
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kindOk = (i: number, l: Line, p: any) => { const k = kindOf(i, l); return k === "all" || (p.item_type ?? "stock") === k; };
  const catOf = (productId: string): string =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    productId ? ((ref.data?.products ?? []).find((p: any) => p.id === productId)?.parent_id ?? "") : "";

  const [updRate, setUpdRate] = useState(false);
  const afterSave = useRef<"close" | "new" | "stay">("close");
  const create = useMutation({
    mutationFn: async () => {
      if (form.currency !== baseCur && !(Number(form.exchange_rate) > 0)) {
        throw new Error(`أدخل سعر الصرف الصحيح: كم ${form.currency} = 1 ${baseCur}`);
      }
      if (updRate && form.currency !== baseCur) {
        const { error: re } = await db.from("exchange_rates").upsert({ tenant_id: me!.tenantId, rate_date: form.doc_date || today(), currency: form.currency, rate_to_usd: Number(form.exchange_rate), source: "document", updated_at: new Date().toISOString() }, { onConflict: "tenant_id,rate_date,currency" });
        if (re) throw new Error(re.message);
      }
      if (capitalIsGroup && (!form.account_id || !underAccount(form.account_id, [capitalRoot]))) throw new Error("اختر حساب رأس المال الفرعي لهذا المستند");
      const linesTotal = lines.reduce((s, l) => s + lineNet(l), 0);
      const isInv = hasAdjustments(form.doc_type);
      if (usesCostPolicy(form.doc_type, ref.data?.costSettings?.inventory_method)) {
        const error = chargeAccountError([...charges, ...lines.flatMap((l) => [{ kind: "discount" as const, amount: l.disc || "", exp_account_id: l.discount_account }, { kind: "add" as const, amount: l.add || "", exp_account_id: l.addition_account, account_id: l.addition_credit }])], ref.data?.costSettings?.purchase_cost_policy, { discount: ref.data?.costSettings?.purchase_discount_account_id, addition: ref.data?.costSettings?.purchase_freight_account_id });
        if (error) throw new Error(error);
      }
      if (form.doc_type === "sale" && form.payment_mode === "credit" && form.partner_id) {
        const { data: pt } = await db.from("partners").select("name, credit_limit").eq("id", form.partner_id).maybeSingle();
        const limit = Number(pt?.credit_limit) || 0;
        if (limit > 0) {
          const { data: jl } = await db.from("journal_lines").select("debit, credit").eq("partner_id", form.partner_id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bal = (jl ?? []).reduce((s: number, l: any) => s + Number(l.debit) - Number(l.credit), 0);
          let prevAmt = 0;
          if (editing) {
            const { data: od } = await db.from("documents").select("amount, exchange_rate, status").eq("id", editing.id).maybeSingle();
            if (od?.status === "posted") prevAmt = Number(od.amount) / (Number(od.exchange_rate) || 1);
          }
          const newTotal = bal + (linesTotal + chargesNet(charges)) / (Number(form.exchange_rate) || 1) - prevAmt;
          if (newTotal > limit && !window.confirm(`تنبيه: رصيد الزبون "${pt?.name}" سيصبح ${newTotal.toFixed(2)} ويتجاوز حد الائتمان ${limit.toFixed(2)}. هل تريد المتابعة؟`)) {
            throw new Error("تم الإلغاء: تجاوز حد الائتمان");
          }
        }
      }
      const payload = {
        tenant_id: me!.tenantId,
        doc_type: form.doc_type,
        doc_date: !manualDt && !editing ? nowParts().date : form.doc_date,
        doc_time: !manualDt && !editing ? nowParts().time : form.doc_time || null,
        currency: form.currency,
        exchange_rate: Number(form.exchange_rate) || 1,
        partner_id: form.partner_id || null,
        warehouse_id: form.warehouse_id && form.warehouse_id !== MULTI_WH ? form.warehouse_id : null,
        to_warehouse_id: form.to_warehouse_id || null,
        final_warehouse_id: form.doc_type === "transfer" ? form.final_warehouse_id || null : null,
        settles_document_id:
          form.doc_type === "receipt" || form.doc_type === "payment" ? form.settles_document_id || null : null,
        project_id: ["sale", "purchase", "sale_return", "purchase_return"].includes(form.doc_type) ? null : form.project_id || null,
        account_id: (capitalFixed ? capitalRoot : form.account_id) || null,
        pattern_id: form.pattern_id || null,
        partner_account_id: form.partner_account_id || null,
        cash_account_id: form.cash_account_id || null,
        amount: meta.lines ? linesTotal + (isInv ? chargesNet(charges) : 0) : Number(form.amount) || 0,
        notes: form.notes || null,
        valid_until: form.doc_type === "quote" ? form.valid_until || null : null,
        terms: form.doc_type === "quote" ? form.terms || null : null,
        payment_mode: ["sale", "purchase"].includes(form.doc_type) ? form.payment_mode : "credit",
        discount_amount: isInv ? charges.filter((c) => c.kind === "discount").reduce((a, c) => a + (Number(c.amount) || 0), 0) : 0,
        freight_amount: isInv ? charges.filter((c) => c.kind === "add").reduce((a, c) => a + (Number(c.amount) || 0), 0) : 0,
        charges: isInv
          ? charges.filter((c) => Number(c.amount) > 0).map((c) => ({ kind: c.kind, account_id: c.account_id || null, exp_account_id: c.exp_account_id || null, pct: Number(c.pct) || null, amount: Number(c.amount) || 0, note: c.note || null }))
          : [],
      };
      let docId: string;
      if (editing) {
        if (editing.status === "posted") {
          const { error: uErr } = await db.rpc("unpost_document", { _id: editing.id });
          if (uErr) throw uErr;
        }
        const { tenant_id: _t, ...upd } = payload;
        const { error } = await db.from("documents").update(upd).eq("id", editing.id);
        if (error) throw error;
        const { error: dErr } = await db.from("document_lines").delete().eq("document_id", editing.id);
        if (dErr) throw dErr;
        docId = editing.id;
      } else {
        const { data, error } = await db.from("documents").insert(payload).select().single();
        if (error) throw error;
        docId = data.id;
      }
      const data = { id: docId };
      if (meta.lines) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prodOf = (id: string) => (ref.data?.products ?? []).find((p: any) => p.id === id);
        const isSvc = (id: string) => prodOf(id)?.item_type === "service";
        if (form.warehouse_id === MULTI_WH && lines.some((l) => l.product_id && !l.wh && !isSvc(l.product_id))) throw new Error("حدد المستودع لكل سطر مادة");
        if (["sale", "quote"].includes(form.doc_type)) {
          const low = lines.find((l) => l.product_id && isSvc(l.product_id) && Number(prodOf(l.product_id)?.min_price) > 0 && Number(l.unit_price) < Number(prodOf(l.product_id)?.min_price));
          if (low && !window.confirm(`سعر «${prodOf(low.product_id)?.name}» أقل من الحد الأدنى (${prodOf(low.product_id)?.min_price}). متابعة؟`)) throw new Error("تم الإلغاء");
        }
        const rows = lines
          .filter((l) => l.product_id && Number(l.qty) > 0)
          .map((l) => ({
            tenant_id: me!.tenantId,
            document_id: data.id,
            product_id: l.product_id,
            qty: Number(l.qty),
            unit_price: Number(l.unit_price) || 0,
            expiry_date: l.expiry_date || null,
            line_discount: Number(l.disc) || 0,
            line_addition: Number(l.add) || 0,
            charge_accounts: { discount: l.discount_account || null, addition: l.addition_account || null, addition_credit: l.addition_credit || null },
            warehouse_id: form.warehouse_id === MULTI_WH ? l.wh || null : null,
          }));
        if (rows.length === 0) throw new Error("أضف بنداً واحداً على الأقل");
        const { error: lErr } = await db.from("document_lines").insert(rows);
        if (lErr) throw lErr;
      }
      if (editing?.status === "posted") {
        const { error: pErr } = await db.rpc("post_document", { _id: docId });
        if (pErr) throw pErr;
      }
      return docId;
    },
    onSuccess: async (docId: string) => {
      toast.success(editing ? "تم حفظ التعديلات" : form.doc_type === "quote" ? "تم حفظ عرض السعر" : "تم حفظ المستند كمسودة");
      const stay = afterSave.current === "stay";
      const again = afterSave.current === "new"; afterSave.current = "close";
      const keepType = form.doc_type;
      setEditing(null);
      setOpen(false);
      if (again) setTimeout(() => openNew(keepType), 0);
      if (stay && docId) {
        const { data: fresh } = await db.from("documents").select("*").eq("id", docId).single();
        if (fresh) setTimeout(() => startEdit(fresh), 0);
      }
      setForm(emptyDoc);
      setLines([{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]);
      setCharges([]);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** For cash invoices: create and post a receipt/payment voucher settling the invoice in full. */
  async function autoSettleCash(id: string) {
    const { data: d, error } = await db.from("documents").select("*").eq("id", id).single();
    if (error) throw error;
    if (!d || d.payment_mode !== "cash" || !["sale", "purchase"].includes(d.doc_type)) return;
    const { data: existing } = await db.from("documents").select("id").eq("settles_document_id", id).limit(1);
    if (existing && existing.length > 0) return;
    const { data: v, error: vErr } = await db.from("documents").insert({
      tenant_id: d.tenant_id,
      doc_type: d.doc_type === "sale" ? "receipt" : "payment",
      doc_date: d.doc_date,
      currency: d.currency,
      exchange_rate: d.exchange_rate,
      partner_id: d.partner_id,
      settles_document_id: d.id,
      partner_account_id: d.partner_account_id ?? null,
      cash_account_id: d.cash_account_id ?? null,
      amount: d.amount,
      notes: `تسديد نقدي للفاتورة رقم ${d.doc_no ?? ""}`,
    }).select().single();
    if (vErr) throw vErr;
    const { error: pErr } = await db.rpc("post_document", { _id: v.id });
    if (pErr) throw pErr;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isCreditInvoice = (d: any) =>
    d.status === "posted" && (d.doc_type === "sale" || d.doc_type === "purchase") && (d.payment_mode ?? "credit") === "credit";

  /** Open the receipt/payment voucher(s) created to settle an invoice (view, with edit from the viewer). */
  async function openLinkedVoucher(invoiceId: string) {
    const { data, error } = await db.from("documents").select("id").eq("settles_document_id", invoiceId).order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.info("لا يوجد سند قبض أو دفع مرتبط بهذه الفاتورة"); return; }
    if (data.length > 1) toast.info(`يوجد ${data.length} سندات مرتبطة — يُعرض الأول`);
    setViewId(data[0].id);
  }

  /** Open a new receipt/payment voucher pre-filled to settle the given credit invoice. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function startSettle(d: any) {
    setEditing(null);
    setForm({
      ...emptyDoc,
      doc_type: d.doc_type === "sale" ? "receipt" : "payment",
      currency: d.currency ?? "USD",
      exchange_rate: String(d.exchange_rate ?? 1),
      partner_id: d.partner_id ?? "",
      settles_document_id: d.id,
      partner_account_id: d.partner_account_id ?? null,
      cash_account_id: d.cash_account_id ?? null,
      amount: String(d.amount ?? 0),
      notes: `تسديد الفاتورة رقم ${d.doc_no ?? ""}`,
    });
    setLines([{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]);
      setCharges([]);
    setOpen(true);
  }

  const receive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("receive_transfer" as never, { _id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم استلام المناقلة في المستودع النهائي"); qc.invalidateQueries({ queryKey: ["documents"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const post = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("post_document", { _id: id });
      if (error) throw error;
      await autoSettleCash(id);
    },
    onSuccess: () => {
      toast.success("تم ترحيل المستند");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unpost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("unpost_document", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إلغاء الترحيل");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async ({ d, to }: { d: any; to: string }) => {
      const src = DOC_TYPES.find((x) => x.value === d.doc_type);
      const tgt = DOC_TYPES.find((x) => x.value === to);
      const ls = src?.lines ? await loadLines(d.id) : [];
      if (src?.lines && tgt?.lines && !ls.length) throw new Error("المستند لا يحوي بنوداً");
      const wh = tgt?.warehouse ? d.warehouse_id || ref.data?.warehouses?.[0]?.id || null : null;
      const amount = ls.length ? ls.reduce((s2, l) => s2 + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0) : Number(d.amount) || 0;
      const { data: inv, error } = await db.from("documents").insert({
        tenant_id: me!.tenantId, doc_type: to, doc_date: today(), currency: d.currency, exchange_rate: d.exchange_rate,
        partner_id: tgt?.partner ? d.partner_id : null, warehouse_id: wh, project_id: d.project_id ?? null, account_id: d.account_id ?? null,
        amount,
        settles_document_id: to === "payment" || to === "receipt" ? null : undefined,
        notes: `من ${src?.label ?? ""} رقم ${d.doc_no}${d.notes ? " — " + d.notes : ""}`,
      }).select().single();
      if (error) throw error;
      if (tgt?.lines && ls.length) {
        const { error: lErr } = await db.from("document_lines").insert(
          ls.map((l) => ({ tenant_id: me!.tenantId, document_id: inv.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })),
        );
        if (lErr) throw lErr;
      }
      await db.from("documents").update({ converted_document_id: inv.id }).eq("id", d.id);
      return { inv, label: tgt?.label ?? "" };
    },
    onSuccess: ({ inv, label }) => {
      toast.success(`تم إنشاء ${label} رقم ${inv.doc_no} كمسودة — راجعه ثم احفظه`);
      qc.invalidateQueries({ queryKey: ["documents"] });
      setOpen(false);
      setEditing(null);
      setTimeout(() => startEdit(inv), 0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function convertMenu(d: any) {
    const targets = (CONVERT_TO[d.doc_type] ?? []).filter((t) => canDocType(me, t, "create"));
    if (!targets.length || !can(me, "documents", "create")) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={convert.isPending} title={d.converted_document_id ? "سبق تحويله" : "تحويل إلى مستند آخر"}>
            <Shuffle className="size-4" />{d.converted_document_id ? "حُوّل" : "تحويل"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-right">
          {targets.map((t) => (
            <DropdownMenuItem key={t} onClick={() => convert.mutate({ d, to: t })} className="justify-start">
              تحويل إلى {DOC_TYPES.find((x) => x.value === t)?.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function loadLines(id: string): Promise<any[]> {
    const { data, error } = await db.from("document_lines").select("*, products(name, unit)").eq("document_id", id);
    if (error) throw error;
    return data ?? [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function startEdit(d: any) {
    try {
      const ls = await loadLines(d.id);
      setForm({
        doc_type: d.doc_type,
        doc_date: d.doc_date,
        doc_time: d.doc_time ? String(d.doc_time).slice(0, 5) : "",
        currency: d.currency ?? "USD",
        exchange_rate: String(d.exchange_rate ?? 1),
        partner_id: d.partner_id ?? "",
        warehouse_id: d.warehouse_id ?? (ls.some((l) => l.warehouse_id) ? MULTI_WH : ""),
        to_warehouse_id: d.to_warehouse_id ?? "",
        final_warehouse_id: d.final_warehouse_id ?? "",
        settles_document_id: d.settles_document_id ?? "",
        project_id: d.project_id ?? "",
        pattern_id: d.pattern_id ?? "",
        account_id: d.account_id ?? "",
        partner_account_id: d.partner_account_id ?? "",
        cash_account_id: d.cash_account_id ?? "",
        amount: String(d.amount ?? 0),
        notes: d.notes ?? "",
        valid_until: d.valid_until ?? "",
        terms: d.terms ?? "",
        payment_mode: d.payment_mode ?? "credit",
        discount_amount: String(d.discount_amount ?? 0),
        freight_amount: String(d.freight_amount ?? 0),
      });
      setLines(
        ls.length
          ? ls.map((l) => ({ product_id: l.product_id, qty: String(l.qty), unit_price: String(l.unit_price), expiry_date: l.expiry_date ?? "", disc: Number(l.line_discount) ? String(l.line_discount) : "", add: Number(l.line_addition) ? String(l.line_addition) : "", wh: l.warehouse_id ?? "", discount_account: l.charge_accounts?.discount ?? "", addition_account: l.charge_accounts?.addition ?? "", addition_credit: l.charge_accounts?.addition_credit ?? "" }))
          : [{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }],
      );
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saved: any[] = Array.isArray(d.charges) ? d.charges : [];
        const legacy: Charge[] = [];
        if (!saved.length && Number(d.discount_amount)) legacy.push({ kind: "discount", account_id: "", pct: "", amount: String(d.discount_amount), note: "" });
        if (!saved.length && Number(d.freight_amount)) legacy.push({ kind: "add", account_id: "", pct: "", amount: String(d.freight_amount), note: "مصاريف نقل" });
        setCharges(saved.length ? saved.map((c) => ({ kind: c.kind === "discount" ? "discount" : "add", account_id: c.account_id ?? "", exp_account_id: c.exp_account_id ?? "", pct: c.pct ? String(c.pct) : "", amount: String(c.amount ?? 0), note: c.note ?? "" })) : legacy);
      }
      setEditing({ id: d.id, status: d.status, journal_entry_id: d.journal_entry_id });
      setEditingNo(d.doc_no ?? null);
      setLineCats({}); setLineKinds({});
      setOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function printDoc(d: any) {
    try {
      const t = DOC_TYPES.find((x) => x.value === d.doc_type);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nameOf = (list: any[] | undefined, id: string | null) => (list ?? []).find((x: any) => x.id === id)?.name ?? "—";
      const meta: [string, string][] = [
        ["رقم المستند", String(d.doc_no ?? "—")],
        ["التاريخ", fmtDate(d.doc_date) + (d.doc_time ? " " + String(d.doc_time).slice(0, 5) : "")],
        ["العملة", d.currency === "SYP" ? "ليرة سورية" : d.currency === "USD" ? "دولار أمريكي" : d.currency],
      ];
      if (d.partner_id) meta.push(["الزبون / المورد", nameOf(ref.data?.partners, d.partner_id)]);
      if (d.warehouse_id) meta.push(["المستودع", nameOf(ref.data?.warehouses, d.warehouse_id)]);
      if (d.to_warehouse_id) meta.push(["مستودع الوجهة", nameOf(ref.data?.warehouses, d.to_warehouse_id)]);
      if (d.project_id) meta.push(["المشروع", nameOf(ref.data?.projects, d.project_id)]);
      if (d.doc_type === "quote") {
        if (d.valid_until) meta.push(["صالح حتى", fmtDate(d.valid_until)]);
      } else meta.push(["الحالة", d.status === "posted" ? "مرحّل" : "غير مرحّل"]);
      const hasLines = t?.lines;
      const ls = hasLines ? await loadLines(d.id) : [];
      const sum = ls.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price) - (Number(l.line_discount) || 0) + (Number(l.line_addition) || 0), 0);
      printDocument({
        title: t?.label ?? "مستند",
        company: me?.tenantName,
        logo: brand.data?.logo_url,
        meta,
        columns: hasLines ? ["#", "المادة", "الوحدة", "الكمية", "السعر", "الإجمالي"] : ["البيان", "المبلغ"],
        rows: hasLines
          ? ls.map((l, i) => [i + 1, l.products?.name ?? "", l.products?.unit ?? "", fmtNum(l.qty), fmtNum(l.unit_price), fmtNum(Number(l.qty) * Number(l.unit_price))])
          : [[d.notes || t?.label || "", fmtNum(d.amount)]],
        footer: (() => {
          const cur = d.currency ?? "";
          const disc = Number(d.discount_amount) || 0;
          const fr = Number(d.freight_amount) || 0;
          if (!hasLines || (!disc && !fr)) return [["الإجمالي", `${fmtNum(hasLines ? sum : d.amount)} ${cur}`]];
          const f: [string, string][] = [["المجموع", `${fmtNum(sum)} ${cur}`]];
          if (disc) f.push(["الحسم", `${fmtNum(disc)} ${cur}`]);
          if (fr) f.push(["الإضافات", `${fmtNum(fr)} ${cur}`]);
          f.push(["الصافي", `${fmtNum(sum - disc + fr)} ${cur}`]);
          return f;
        })(),
        template: brand.data?.print_template,
        taxNumber: brand.data?.tax_number,
        footerText: brand.data?.print_footer,
        qr: hasLines && ["sale", "sale_return", "purchase", "purchase_return"].includes(d.doc_type) ? (() => {
          const net = sum - (Number(d.discount_amount) || 0) + (Number(d.freight_amount) || 0);
          const vat = brand.data?.tax_settings?.vat;
          const tax = vat?.enabled ? Math.round(net * Number(vat.rate || 0)) / 100 : 0;
          const cur = d.currency ?? "";
          // Readable text: any phone camera shows the invoice details as-is for verification.
          return [
            me?.tenantName ?? "",
            brand.data?.tax_number ? `الرقم الضريبي: ${brand.data.tax_number}` : null,
            `${t?.label ?? "فاتورة"} رقم: ${d.doc_no ?? ""}`,
            `التاريخ: ${d.doc_date}${d.doc_time ? " " + String(d.doc_time).slice(0, 5) : ""}`,
            d.partners?.name ? `العميل: ${d.partners.name}` : null,
            "—",
            ...ls.map((l) => `${l.products?.name ?? ""} × ${fmtNum(l.qty)} @ ${fmtNum(l.unit_price)} = ${fmtNum(Number(l.qty) * Number(l.unit_price))}`),
            "—",
            `المجموع: ${fmtNum(sum)} ${cur}`,
            Number(d.discount_amount) ? `الحسم: ${fmtNum(d.discount_amount)} ${cur}` : null,
            Number(d.freight_amount) ? `الإضافات: ${fmtNum(d.freight_amount)} ${cur}` : null,
            tax ? `الضريبة: ${fmtNum(tax)} ${cur}` : null,
            `الإجمالي: ${fmtNum(net + tax)} ${cur}`,
            `الحالة: ${d.status === "posted" ? "مرحّل" : "غير مرحّل"}`,
          ].filter(Boolean).join("\n");
        })() : null,
        notes: hasLines ? [d.notes, d.terms ? "الشروط والأحكام:\n" + d.terms : null].filter(Boolean).join("\n\n") || null : null,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function sendWhatsApp(d: any) {
    const t = DOC_TYPES.find((x) => x.value === d.doc_type);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (ref.data?.partners ?? []).find((x: any) => x.id === d.partner_id);
    let total = Number(d.amount);
    if (t?.lines) {
      const ls = await loadLines(d.id);
      total = ls.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price) - (Number(l.line_discount) || 0) + (Number(l.line_addition) || 0), 0) - (Number(d.discount_amount) || 0) + (Number(d.freight_amount) || 0);
    }
    const msg = [
      me?.tenantName ?? "",
      `${t?.label ?? "مستند"} رقم ${d.doc_no ?? "—"}`,
      `التاريخ: ${fmtDate(d.doc_date)}`,
      p ? `السيد/ة: ${p.name}` : "",
      `الإجمالي: ${fmtNum(total)} ${d.currency ?? ""}`,
      d.valid_until ? `صالح حتى: ${fmtDate(d.valid_until)}` : "",
      "شكراً لتعاملكم معنا",
    ].filter(Boolean).join("\n");
    const phone = String(p?.phone ?? "").replace(/[^0-9]/g, "").replace(/^00/, "");
    if (!phone) toast.info("لا يوجد رقم هاتف لهذا الطرف — اختر جهة الاتصال من واتساب");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  const facets: FacetConfig[] = [
    { key: "doc_type", label: "نوع المستند", options: myTypes.map((d) => ({ value: d.value, label: d.label })) },
    {
      key: "status",
      label: "الحالة",
      options: [
        { value: "draft", label: "مسودة" },
        { value: "posted", label: "مرحّل" },
      ],
    },
    {
      key: "currency",
      label: "العملة",
      options: [
        { value: "USD", label: "دولار ($)" },
        { value: "SYP", label: "ليرة سورية (ل.س)" },
      ],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: "partner_id", label: "الزبون / المورد", options: (ref.data?.partners ?? []).map((p: any) => ({ value: p.id, label: p.name })) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: "warehouse_id", label: "المستودع", options: (ref.data?.warehouses ?? []).map((w: any) => ({ value: w.id, label: w.name })) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: "project_id", label: "المشروع", options: (ref.data?.projects ?? []).map((p: any) => ({ value: p.id, label: p.name })) },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = applyFilters<any>(list.data ?? [], filters, {
    dateKey: "doc_date",
    searchText: (d) =>
      [
        DOC_TYPES.find((t) => t.value === d.doc_type)?.label ?? "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ref.data?.partners ?? []).find((p: any) => p.id === d.partner_id)?.name ?? "",
        d.status === "posted" ? "مرحّل" : "مسودة",
      ].join(" "),
  });

  const [cashForm, setCashForm] = useState<null | "exchange" | "transfer">(null);
  const total = meta.lines
    ? lines.reduce((s, l) => s + lineNet(l), 0)
    : Number(form.amount) || 0;

  useEffect(() => {
    setCharges((cur) => {
      const next = rebaseCharges(cur, total);
      return next.some((c, i) => c.amount !== cur[i]?.amount) ? next : cur;
    });
  }, [total]);

  function openNew(type: string) {
    setEditing(null);
    setForm({ ...emptyDoc, currency: baseCur, doc_type: type, doc_date: nowParts().date, doc_time: nowParts().time });
    setLines([{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]);
      setCharges([]);
    setLineCats({}); setLineKinds({});
    setOpen(true);
  }

  return (
    <div>
      <Dialog open={!!cashForm} onOpenChange={(o) => !o && setCashForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{cashForm === "exchange" ? "صرف عملات" : "مناقلة صناديق"}</DialogTitle></DialogHeader>
          {cashForm === "exchange" ? <ExchangeForm /> : cashForm === "transfer" ? <TransferForm /> : null}
        </DialogContent>
      </Dialog>
      <DocumentView id={viewId} onClose={() => setViewId(null)} onEdit={async (id) => {
        setViewId(null);
        const { data } = await db.from("documents").select("*").eq("id", id).maybeSingle();
        if (data) await startEdit(data);
      }} />
      <PageHeader
        title="المستندات والفواتير"
        subtitle="فواتير البيع والشراء، سندات القبض والدفع، وحركات المستودعات مع ترحيل محاسبي تلقائي"
        actions={
          can(me, "documents", "create") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button><Plus className="size-4" />اختر نوع المستند</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 text-right">
                <div className="px-2 pt-1 pb-1 text-xs font-semibold text-muted-foreground">المستندات الأساسية</div>
                {DOC_TYPES.filter((d) => d.value !== "stocktake" && canDocType(me, d.value, "create") && primaryOk(d.value)).map((type) => <DropdownMenuItem key={type.value} onClick={() => openNew(type.value)} className="justify-start py-2.5">{type.label}</DropdownMenuItem>)}
                {myPatterns.filter((p) => p.doc_type !== "custom_entry").length > 0 && <div className="border-t px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">الأنماط الثانوية</div>}
                {myPatterns.filter((p) => p.doc_type !== "custom_entry").map((p) => <DropdownMenuItem key={p.id} onClick={() => openPattern(p)} className="justify-between gap-2 py-2.5"><span>{p.name}</span><span className="text-xs text-muted-foreground">{DOC_TYPES.find((d) => d.value === p.doc_type)?.label ?? ""}</span></DropdownMenuItem>)}
                <div className="border-t px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">عمليات سريعة</div>
                <DropdownMenuItem onClick={() => setCashForm("exchange")} className="justify-start py-2.5">صرف عملات</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCashForm("transfer")} className="justify-start py-2.5">مناقلة صناديق</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />

      <DataFilters
        filters={filters}
        onChange={setFilters}
        facets={facets}
        searchPlaceholder="بحث برقم المستند أو الملاحظات..."
      />

      <div className="mt-3 flex justify-end">
        <div className="flex overflow-hidden rounded-lg border">
          <Button type="button" size="sm" variant={view === "compact" ? "default" : "ghost"} className="rounded-none" onClick={() => setView("compact")}>
            <LayoutList className="size-4" />
            قائمة مبسّطة
          </Button>
          <Button type="button" size="sm" variant={view === "table" ? "default" : "ghost"} className="rounded-none" onClick={() => setView("table")}>
            <Table2 className="size-4" />
            الجدول الكامل
          </Button>
        </div>
      </div>

      {view === "compact" && (
        <div className="mt-3 divide-y rounded-lg border bg-card">
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">لا توجد مستندات</p>
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {rows.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => startEdit(d)}>
                <p className="truncate font-medium">
                  {DOC_TYPES.find((t) => t.value === d.doc_type)?.label} #{d.doc_no}
                  <span className="mx-2 text-xs font-normal text-muted-foreground">{fmtDate(d.doc_date)}{d.doc_time ? ` ${String(d.doc_time).slice(0, 5)}` : ""}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(ref.data?.partners ?? []).find((p: any) => p.id === d.partner_id)?.name ?? "—"}
                  {" · "}
                  {fmtNum(d.amount)} {d.currency}
                </p>
              </div>
              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${d.status === "posted" ? "bg-status-posted text-status-posted-foreground" : "bg-status-draft text-status-draft-foreground"}`}>
                {d.doc_type === "quote" ? (d.converted_document_id ? "محوّل لفاتورة" : d.valid_until && d.valid_until < today() ? "منتهي" : "عرض سعر") : d.status === "posted" ? "مرحّل" : "غير مرحّل"}
              </span>
              {d.doc_type !== "quote" && d.status === "posted" && <span className={`ms-1 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${d.je?.audited ? "bg-status-paid text-status-paid-foreground" : "bg-muted text-muted-foreground"}`}>{d.je?.audited ? "مدقق" : "غير مدقق"}</span>}
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" title="عرض المستند والقيد" onClick={() => setViewId(d.id)}>
                  <Eye className="size-4" />
                </Button>
                {d.journal_entry_id && (
                  <Button size="icon" variant="ghost" title="فتح القيد المحاسبي" asChild>
                    <Link to="/journal/$entryId" params={{ entryId: d.journal_entry_id }}>
                      <BookOpenText className="size-4" />
                    </Link>
                  </Button>
                )}
                {d.doc_type === "transfer" && d.final_warehouse_id && d.status === "posted" && (d.received_document_id
                  ? <span className="self-center rounded-full bg-status-paid px-2 py-0.5 text-xs text-status-paid-foreground">مُستلمة</span>
                  : <Button size="sm" variant="outline" disabled={receive.isPending} onClick={() => { if (confirm("تأكيد استلام البضاعة في المستودع النهائي؟")) receive.mutate(d.id); }}>تأكيد الاستلام</Button>)}
                <Button size="icon" variant="ghost" title="طباعة" onClick={() => printDoc(d)}>
                  <Printer className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" title="واتساب" onClick={() => sendWhatsApp(d)}>
                  <MessageCircle className="size-4" />
                </Button>
                {d.status === "draft" && !NON_POSTING.includes(d.doc_type) && can(me, "documents", "edit") && (
                  <Button size="sm" variant="outline" onClick={() => post.mutate(d.id)}>
                    <CheckCircle2 className="size-4" />
                    ترحيل
                  </Button>
                )}
                {d.journal_entry_id && (
                  <Button size="sm" variant="outline" title="مشاهدة القيد الناتج عن الفاتورة" asChild>
                    <Link to="/journal/$entryId" params={{ entryId: d.journal_entry_id }}><BookOpenText className="size-4" />القيد</Link>
                  </Button>
                )}
                {isCreditInvoice(d) && can(me, "documents", "create") && (
                  <Button size="sm" variant="outline" onClick={() => startSettle(d)}>
                    سداد
                  </Button>
                )}
                {convertMenu(d)}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "table" && (
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2 text-right">النوع</th>
              <th className="px-3 py-2 text-right">الرقم</th>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2 text-right">الجهة</th>
              <th className="px-3 py-2 text-right">المبلغ</th>
              <th className="px-3 py-2 text-center">الحالة</th>
              <th className="px-3 py-2 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {rows.map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-2">{DOC_TYPES.find((t) => t.value === d.doc_type)?.label}</td>
                <td className="px-3 py-2">{d.doc_no}</td>
                <td className="px-3 py-2">{fmtDate(d.doc_date)}{d.doc_time ? ` ${String(d.doc_time).slice(0, 5)}` : ""}</td>
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(ref.data?.partners ?? []).find((p: any) => p.id === d.partner_id)?.name ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {fmtNum(d.amount)} {d.currency}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${d.status === "posted" ? "bg-status-posted text-status-posted-foreground" : "bg-status-draft text-status-draft-foreground"}`}
                  >
                    {d.doc_type === "quote" ? (d.converted_document_id ? "محوّل لفاتورة" : d.valid_until && d.valid_until < today() ? "منتهي" : "عرض سعر") : d.status === "posted" ? "مرحّل" : "غير مرحّل"}
                  </span>
                  {d.doc_type !== "quote" && d.status === "posted" && <span className={`ms-1 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${d.je?.audited ? "bg-status-paid text-status-paid-foreground" : "bg-muted text-muted-foreground"}`}>{d.je?.audited ? "مدقق" : "غير مدقق"}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="outline" title="طباعة" onClick={() => printDoc(d)}>
                      <Printer className="size-4" />
                    </Button>
                    <Button size="sm" variant="outline" title="إرسال عبر واتساب" onClick={() => sendWhatsApp(d)}>
                      <MessageCircle className="size-4" />
                    </Button>
                    <AttachmentsButton entityType="document" entityId={d.id} docType={d.doc_type} variant="outline" />
                    <RecordNotesButton entityType="document" entityId={d.id} label={`${DOC_TITLE_FOR_COLLAB[d.doc_type] ?? "مستند"} رقم ${d.doc_no ?? ""}`} variant="outline" />
                    <ApprovalButton entityType="document" entityId={d.id} title={`${DOC_TITLE_FOR_COLLAB[d.doc_type] ?? "مستند"} رقم ${d.doc_no ?? ""}`} amount={d.amount} />
                    <ShareLinkButton entityType="document" entityId={d.id} label={`${DOC_TITLE_FOR_COLLAB[d.doc_type] ?? "مستند"} رقم ${d.doc_no ?? ""}`} />
                    <Button size="sm" variant="outline" title="عرض المستند والقيد" onClick={() => setViewId(d.id)}>
                      <Eye className="size-4" />
                    </Button>
                    {d.journal_entry_id && (
                      <Button size="sm" variant="outline" title="فتح القيد المحاسبي" asChild>
                        <Link to="/journal/$entryId" params={{ entryId: d.journal_entry_id }}>
                          <BookOpenText className="size-4" />
                        </Link>
                      </Button>
                    )}
                    {d.journal_entry_id && (
                      <Button size="sm" variant="outline" title="مشاهدة القيد الناتج عن الفاتورة" asChild>
                        <Link to="/journal/$entryId" params={{ entryId: d.journal_entry_id }}><BookOpenText className="size-4" />القيد</Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      title="تعديل"
                      disabled={!can(me, "documents", "edit")}
                      onClick={() => startEdit(d)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {convertMenu(d)}
                    {d.status === "draft" ? (
                      <>
                        {NON_POSTING.includes(d.doc_type) ? (
                          <span className="text-xs text-muted-foreground">بدون قيد</span>
                        ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!can(me, "documents", "edit")}
                          onClick={() => post.mutate(d.id)}
                        >
                          <CheckCircle2 className="size-4" />
                          ترحيل
                        </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!can(me, "documents", "delete")}
                          onClick={() => window.confirm("حذف المستند؟") && remove.mutate(d.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                      {isCreditInvoice(d) && can(me, "documents", "create") && (
                        <Button size="sm" variant="outline" onClick={() => startSettle(d)}>
                          سداد
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!can(me, "documents", "edit")}
                        onClick={() => unpost.mutate(d.id)}
                      >
                        <RotateCcw className="size-4" />
                        إلغاء الترحيل
                      </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  لا توجد مستندات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-2 overflow-y-auto overscroll-contain rounded-none p-3 sm:max-w-none sm:overflow-hidden">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pe-6">
              <DialogTitle>{editing ? `تعديل ${meta.label}${editingNo != null ? ` رقم ${editingNo}` : ""}` : `${meta.label} جديدة`}</DialogTitle>
              {!editing && myPatterns.some((x) => x.doc_type === form.doc_type) && (
                <select aria-label="النمط" className="h-8 rounded-md border bg-background px-2 text-sm" value={form.pattern_id} onChange={(e) => switchPattern(e.target.value)}>
                  {primaryOk(form.doc_type) && <option value="">النمط الأساسي</option>}
                  {myPatterns.filter((x) => x.doc_type === form.doc_type).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
              {activePattern && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary" title={activePattern.explanation ?? ""}>نمط: {activePattern.name}</span>}
              <DocNavigator docType={form.doc_type} currentNo={editingNo} onOpen={(d) => void startEdit(d)} onNew={() => { setEditing(null); setEditingNo(null); { const base = { ...emptyDoc, currency: baseCur, doc_type: form.doc_type, doc_date: nowParts().date, doc_time: nowParts().time }; setForm(activePattern ? applyPattern(base, activePattern) : base); } setLines([{ product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]); setCharges([]); setLineCats({}); setLineKinds({}); }} />
            </div>
          </DialogHeader>

          {meta.lines && (
            <Button type="button" variant="outline" className="flex w-full shrink-0 items-center justify-between px-3 py-1 text-sm font-bold text-primary" onClick={() => setHeadOpen((v) => !v)} aria-expanded={headOpen}>
              <span>بيانات الفاتورة {!headOpen && form.partner_id ? "· " + ((ref.data?.partners ?? []).find((p: any) => p.id === form.partner_id)?.name ?? "") : ""}</span>
              <span>{headOpen ? "طيّ ▲" : "فتح ▼"}</span>
            </Button>
          )}
          <div className={"grid gap-2 sm:grid-cols-4 lg:grid-cols-6 " + (meta.lines ? "max-h-[30dvh] shrink-0 overflow-y-auto" : "min-h-0 flex-1 overflow-y-auto") + (meta.lines && !headOpen ? " hidden" : "")}>
            <div className="space-y-1"><Label>نوع المستند</Label><div className="flex h-9 items-center rounded-md border bg-secondary px-3 text-sm font-medium">{meta.label}</div></div>
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input
                type="date"
                disabled={!manualDt}
                value={form.doc_date}
                onChange={(e) => setForm({ ...form, doc_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{manualDt ? "الوقت" : "الوقت (تلقائي)"}</Label>
              <Input
                type="time"
                disabled={!manualDt}
                value={form.doc_time}
                onChange={(e) => setForm({ ...form, doc_time: e.target.value })}
              />
            </div>
            {shown("currency") && <div className="space-y-1">
              <Label>العملة</Label>
              <select disabled={locked("currency")}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.currency}
                onChange={(e) => applyCurrency(e.target.value)}
              >
                {curOpts().map((c) => <option key={c.code} value={c.code}>{c.name} {c.symbol ? `(${c.symbol})` : `(${c.code})`}</option>)}
              </select>
            </div>}
            {shown("currency") && form.currency !== baseCur && (
              <div className="space-y-1">
                <Label>سعر الصرف (كم {form.currency} = 1 {baseCur})</Label>
                <Input
                  type="number"
                  value={form.exchange_rate}
                  onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={updRate} onChange={(e) => setUpdRate(e.target.checked)} />
                  اعتماد هذا السعر في نشرة الأسعار (يُسجَّل في سجل الصرف)
                </label>
                {Number(form.exchange_rate) > 0 && total > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {total.toLocaleString()} {form.currency} = {(total / Number(form.exchange_rate)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {baseCur} · 1 {baseCur} = {(Number(form.exchange_rate)).toLocaleString()} {form.currency}
                  </p>
                )}
              </div>
            )}
            {meta.partner && (
              <div className="space-y-1">
                <Label>الزبون / المورد</Label>
                <select disabled={locked("partner_id")}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.partner_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    setForm((f) => ({ ...f, partner_id: id, partner_account_id: (ref.data?.partners ?? []).find((p: any) => p.id === id)?.account_id ?? "" }));
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const pc = (ref.data?.partners ?? []).find((p: any) => p.id === id)?.currency;
                    if (pc && pc !== form.currency) { applyCurrency(pc); toast.info(`عملة هذا الحساب: ${pc}`); }
                  }}
                >
                  <option value="">— اختر —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {partnerOptions().map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <QuickAdd kind="partner" onCreated={(id) => setForm((f) => ({ ...f, partner_id: id }))} />
              </div>
            )}
            {meta.partner && shown("partner_account_id") && <div className="space-y-1"><Label>حساب الزبون / المورد</Label><select aria-label="حساب الزبون / المورد" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.partner_account_id} onChange={(e) => setForm({ ...form, partner_account_id: e.target.value })}><option value="">— حساب البطاقة الافتراضي —</option>{partnerAccOpts().map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>}
            {meta.warehouse && (
              <div className="space-y-1">
                <Label>المستودع</Label>
                <select disabled={locked("warehouse_id")}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.warehouse_id}
                  onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                >
                  <option value="">— اختر —</option>
                  {meta.lines && !["transfer"].includes(form.doc_type) && <option value={MULTI_WH}>أكثر من مستودع (مستودع لكل سطر)</option>}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {whOpts().map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <QuickAdd kind="warehouse" onCreated={(id) => setForm((f) => ({ ...f, warehouse_id: id }))} />
              </div>
            )}
            {form.doc_type === "quote" && (
              <>
                <div className="space-y-1">
                  <Label>صالح حتى</Label>
                  <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>الشروط والأحكام (الدفع، التسليم، الضمان...)</Label>
                  <Textarea rows={3} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
                </div>
              </>
            )}
            {form.doc_type === "transfer" && (
              <div className="space-y-1">
                <Label>مستودع الوجهة</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.to_warehouse_id}
                  onChange={(e) => setForm({ ...form, to_warehouse_id: e.target.value })}
                >
                  <option value="">— اختر —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {whOpts().map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <QuickAdd kind="warehouse" onCreated={(id) => setForm((f) => ({ ...f, to_warehouse_id: id }))} />
              </div>
            )}
            {form.doc_type === "transfer" && (
              <div className="space-y-1">
                <Label>المستودع النهائي (استلام على مرحلتين — اختياري)</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.final_warehouse_id} onChange={(e) => setForm({ ...form, final_warehouse_id: e.target.value })}>
                  <option value="">— بدون، المناقلة مباشرة —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {whOpts().filter((w: any) => w.id !== form.to_warehouse_id).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">عند اختياره تُرسل البضاعة إلى مستودع الوجهة (بضاعة بالطريق) وتبقى بانتظار تأكيد الاستلام.</p>
              </div>
            )}
            {me?.features["projects"] !== false && shown("project_id") && !["sale", "purchase", "sale_return", "purchase_return"].includes(form.doc_type) && (
            <div className="space-y-1">
              <Label>المشروع {form.doc_type === "stock_out" ? "" : "(اختياري)"}</Label>
              <select disabled={locked("project_id")}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              >
                <option value="">— بدون —</option>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(ref.data?.projects ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            )}
            {hasAdjustments(form.doc_type) && shown("payment_mode") && (
              <div className="space-y-1">
                <Label>طريقة الدفع</Label>
                <select disabled={locked("payment_mode")}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.payment_mode}
                  onChange={(e) => setForm({ ...form, payment_mode: e.target.value, cash_account_id: form.cash_account_id || ref.data?.defaultCash || "" })}
                >
                  <option value="credit">آجل</option>
                  <option value="cash">نقدي</option>
                </select>
                {form.payment_mode === "cash" && (
                  <p className="text-xs text-muted-foreground">
                    عند الترحيل يُنشأ {form.doc_type === "sale" ? "سند قبض" : "سند دفع"} تلقائياً بكامل قيمة الفاتورة
                  </p>
                )}
              </div>
            )}
            {form.payment_mode === "cash" && ["sale", "purchase"].includes(form.doc_type) && <div className="space-y-1"><Label>صندوق الدفع النقدي</Label><select disabled={locked("cash_account_id")} aria-label="صندوق الدفع النقدي" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.cash_account_id || ref.data?.defaultCash || ""} onChange={(e) => setForm({ ...form, cash_account_id: e.target.value })}><option value="">— الصندوق الافتراضي —</option>{cashOpts().map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>}
            {(form.doc_type === "receipt" ||
              form.doc_type === "payment" ||
              form.doc_type === "stock_in" || form.doc_type === "opening_inventory" || form.doc_type === "closing_inventory") && (
              <div className="space-y-1">
                <Label>{form.doc_type === "opening_inventory" ? (capitalIsGroup ? "حساب رأس المال الفرعي *" : "حساب رأس المال") : form.doc_type === "closing_inventory" ? "الحساب المقابل للبضاعة" : "الحساب المقابل (صندوق / مصرف)"}</Label>
                <select disabled={locked("account_id") || capitalFixed}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={capitalFixed ? capitalRoot : form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                >
                  <option value="">{capitalIsGroup ? "— اختر حساب رأس المال الفرعي —" : "— الافتراضي من الإعدادات —"}</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {counterOpts().map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
                {!locked("account_id") && !capitalFixed && <QuickAdd kind="account" onCreated={(id) => setForm((f) => ({ ...f, account_id: id }))} />}
              </div>
            )}
            {(form.doc_type === "receipt" || form.doc_type === "payment") && (
              <div className="space-y-1 sm:col-span-2">
                <Label>تسديد فاتورة آجلة (اختياري)</Label>
                {!form.partner_id ? (
                  <p className="rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground">
                    حدّد {form.doc_type === "receipt" ? "الزبون" : "المورد"} أولاً لعرض فواتيره الآجلة غير المسددة
                  </p>
                ) : (
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={form.settles_document_id}
                    onChange={async (e) => {
                      const id = e.target.value;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const inv = (openInvoices.data ?? []).find((d: any) => d.id === id);
                      setForm((f) => ({ ...f, settles_document_id: id }));
                      if (!inv) return;
                      // Debt stays fixed in the invoice currency; convert it to the voucher currency at today's rates.
                      const owed = inv.remaining * (Number(inv.exchange_rate) || 1);
                      let todayInvRate = Number(inv.exchange_rate) || 1;
                      if (inv.currency !== baseCur) {
                        const { data } = await scope(db.from("exchange_rates").select("rate_to_usd").eq("currency", inv.currency), me?.tenantId).order("rate_date", { ascending: false }).limit(1);
                        todayInvRate = Number(data?.[0]?.rate_to_usd) || todayInvRate;
                      } else todayInvRate = 1;
                      setForm((f) => {
                        const amt = inv.currency === f.currency ? owed : (owed / todayInvRate) * (Number(f.exchange_rate) || 1);
                        return { ...f, amount: String(Math.round(amt * 100) / 100) };
                      });
                      if (inv.currency !== form.currency) toast.info(`المتبقي ${fmtNum(owed)} ${inv.currency} — حُوّل إلى ${form.currency} بسعر اليوم، والفرق يُسجّل تلقائياً في فروق الصرف`);
                    }}
                  >
                    <option value="">— بدون تسديد فاتورة محددة —</option>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(openInvoices.data ?? []).map((d: any) => (
                      <option key={d.id} value={d.id}>
                        فاتورة {d.doc_no} - {fmtDate(d.doc_date)} - المتبقي: {fmtNum(d.remaining * (Number(d.exchange_rate) || 1))} {d.currency} ({fmtNum(d.remaining)} {baseCur})
                      </option>
                    ))}
                  </select>
                )}
                {form.partner_id && (openInvoices.data ?? []).length === 0 && !openInvoices.isLoading && (
                  <p className="text-xs text-muted-foreground">لا توجد فواتير آجلة غير مسددة لهذا الطرف</p>
                )}
              </div>
            )}
            {!meta.lines && (
              <div className="space-y-1">
                <Label>المبلغ</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            )}
            {shown("notes") && <div className="space-y-1 sm:col-span-3">
              <Label>ملاحظات</Label>
              <Input value={form.notes} disabled={locked("notes")} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>}
          </div>

          {shown("balance_info") && meta.partner && <InvoiceBalanceInfo accountId={form.partner_account_id || (ref.data?.partners ?? []).find((p: { id: string; account_id?: string }) => p.id === form.partner_id)?.account_id || undefined} partnerId={form.partner_id} />}
          {shown("balance_info") && form.account_id && <InvoiceBalanceInfo accountId={form.account_id} />}

          {meta.lines && (
            <div className="flex min-h-0 flex-1 flex-col max-sm:flex-none">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">البنود ({lines.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {form.warehouse_id && form.warehouse_id !== MULTI_WH && (
                    <Button size="sm" variant="outline" onClick={() => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const ps = (ref.data?.products ?? []).filter((p: any) => !p.is_group && (p.item_type ?? "stock") !== "service" && dealOk(p) && (!p.default_warehouse_id || p.default_warehouse_id === form.warehouse_id));
                      addProducts(ps);
                    }}>جلب مواد المستودع</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setPickSel({}); setPickQ(""); setPickOpen(true); }}>عدة مواد</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLines([...lines, { product_id: "", qty: "1", unit_price: "0", expiry_date: "" }])}
                  >
                    <Plus className="size-4" />
                    بند
                  </Button>
                </div>
                <Dialog open={pickOpen} onOpenChange={setPickOpen}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>اختيار عدة مواد</DialogTitle></DialogHeader>
                    <Input placeholder="بحث بالاسم أو الكود أو الباركود" value={pickQ} onChange={(e) => setPickQ(e.target.value)} />
                    <div className="max-h-[50vh] overflow-auto rounded border">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {pickList.map((p: any) => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm hover:bg-muted/50">
                          <input type="checkbox" checked={!!pickSel[p.id]} onChange={(e) => setPickSel((s) => ({ ...s, [p.id]: e.target.checked }))} />
                          <span className="flex-1">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.sku || p.barcode || ""} {p.unit || ""}</span>
                        </label>
                      ))}
                      {!pickList.length && <div className="p-4 text-center text-sm text-muted-foreground">لا توجد مواد</div>}
                    </div>
                    <DialogFooter className="gap-2">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Button variant="outline" onClick={() => setPickSel(Object.fromEntries(pickList.map((p: any) => [p.id, true])))}>تحديد الكل</Button>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Button onClick={() => { addProducts(pickList.filter((p: any) => pickSel[p.id])); setPickOpen(false); }}>إضافة ({Object.values(pickSel).filter(Boolean).length})</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <BarcodeInput
                className="mb-2"
                onCode={(code) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const partnerHit: any = meta.partner ? (ref.data?.partners ?? []).find((x: any) => x.barcode && x.barcode === code) : null;
                  if (partnerHit) { setForm({ ...form, partner_id: partnerHit.id }); return toast.success("تم اختيار: " + partnerHit.name); }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const p: any = findByCode(ref.data?.products ?? [], code);
                  if (!p) return toast.error("لا توجد مادة أو جهة بهذا الباركود: " + code);
                  const idx = lines.findIndex((l) => l.product_id === p.id);
                  if (idx >= 0) {
                    const next = [...lines];
                  const cur = next[idx];
                  if (!cur) return;
                    next[idx] = { ...cur, qty: String(Number(cur.qty || 0) + 1) };
                    return setLines(next);
                  }
                  const price = form.doc_type === "sale" || form.doc_type === "sale_return" ? priceForLevel(p, partnerLevel) || p.last_purchase_price : form.doc_type === "purchase" || form.doc_type === "purchase_return" ? p.last_purchase_price || p.purchase_price || p.avg_cost : ["transfer", "stock_out", "stock_in"].includes(form.doc_type) ? p.avg_cost || p.last_purchase_price || p.purchase_price || 0 : 0;
                  const periodInventory = ["opening_inventory", "closing_inventory"].includes(form.doc_type);
                  const row = { product_id: p.id, qty: "1", unit_price: String(periodInventory ? p.purchase_price || p.avg_cost || p.last_purchase_price || 0 : price ?? 0), expiry_date: "" };
                  setLines([...lines.filter((l) => l.product_id), row]);
                }}
              />
              <div className="min-h-48 max-w-full flex-1 overflow-auto">
              <table className="mobile-cards w-full min-w-[640px] border text-sm">
                <thead className="bg-secondary">
                  <tr>
                    {form.warehouse_id === MULTI_WH && <th className="border px-2 py-2 text-right">المستودع</th>}
                    <th className="border px-2 py-2 text-right">المادة</th>
                    <th className="border px-2 py-2 text-right">الوحدة</th>
                    <th className="border px-2 py-2 text-right">الكمية</th>
                    <th className="border px-2 py-2 text-right">السعر <span className="text-xs text-muted-foreground">({form.currency})</span></th>
                    {["purchase", "stock_in", "opening_inventory"].includes(form.doc_type) && shown("expiry") && (
                      <th className="border px-2 py-2 text-right">الصلاحية</th>
                    )}
                    <th className="border px-2 py-2 text-right">الإجمالي <span className="text-xs text-muted-foreground">({form.currency})</span></th>
                    <th className="border px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <Fragment key={i}>
                    <tr>
                      {form.warehouse_id === MULTI_WH && (
                        <td data-label="المستودع" className="border px-2 py-1">
                          <select aria-label="مستودع السطر" className="h-9 w-full min-w-28 rounded-md border bg-background px-2 text-sm" value={l.wh ?? ""} onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, wh: e.target.value } : x)))}>
                            <option value="">— اختر —</option>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {whOpts().map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        </td>
                      )}
                      <td data-label="المادة" className="border px-2 py-1">
                        {partnerDeal === "both" && (
                          <div role="group" aria-label="نوع السطر" className="mb-1 inline-flex overflow-hidden rounded border text-[11px] leading-5">
                            {LINE_KINDS.map(([v, lab]) => (
                              <button
                                key={v}
                                type="button"
                                aria-pressed={kindOf(i, l) === v}
                                className={kindOf(i, l) === v ? "bg-primary px-2 text-primary-foreground" : "px-2 text-muted-foreground hover:bg-muted"}
                                onClick={() => {
                                  setLineKinds({ ...lineKinds, [i]: v });
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const cur = (ref.data?.products ?? []).find((x: any) => x.id === l.product_id);
                                  if (v !== "all" && cur && (cur.item_type ?? "stock") !== v) {
                                    const next = [...lines];
                                    next[i] = { ...l, product_id: "" };
                                    setLines(next);
                                    setLineCats({ ...lineCats, [i]: "" });
                                  }
                                }}
                              >
                                {lab}
                              </button>
                            ))}
                          </div>
                        )}
                        <select
                          className="mb-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                          value={lineCats[i] ?? catOf(l.product_id)}
                          onChange={(e) => {
                            setLineCats({ ...lineCats, [i]: e.target.value });
                            if (l.product_id && catOf(l.product_id) !== e.target.value) {
                              const next = [...lines];
                              next[i] = { ...l, product_id: "" };
                              setLines(next);
                            }
                          }}
                        >
                          <option value="">— كل التصنيفات —</option>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(ref.data?.products ?? []).filter((p: any) => p.is_group && dealOk(p) && kindOk(i, l, p)).map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          value={l.product_id}
                          onChange={(e) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const p = (ref.data?.products ?? []).find((x: any) => x.id === e.target.value);
                            const next = [...lines];
                            next[i] = {
                              ...l,
                              product_id: e.target.value,
                              qty: l.qty,
                              unit_price:
                                form.doc_type === "sale" || form.doc_type === "quote" || form.doc_type === "sale_return"
                                  ? String(priceForLevel(p, partnerLevel) || (p?.last_purchase_price ?? 0))
                                  : ["purchase", "purchase_return", "opening_inventory", "closing_inventory"].includes(form.doc_type)
                                    ? String(p?.last_purchase_price || p?.purchase_price || p?.avg_cost || 0)
                                    : ["transfer", "stock_out", "stock_in"].includes(form.doc_type)
                                      ? String(p?.avg_cost || p?.last_purchase_price || p?.purchase_price || 0)
                                      : l.unit_price,
                            };
                            setLines(next);
                          }}
                        >
                          <option value="">— اختر —</option>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(ref.data?.products ?? [])
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .filter((p: any) => p.id === l.product_id || (!p.is_group && dealOk(p) && kindOk(i, l, p) && (p.item_type === "service" || !p.default_warehouse_id || p.default_warehouse_id === form.warehouse_id || form.warehouse_id === MULTI_WH) && (!(lineCats[i] ?? catOf(l.product_id)) || isUnderCategory(ref.data?.products ?? [], p.id, lineCats[i] ?? catOf(l.product_id)))))
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {l.product_id && (ref.data?.products ?? []).find((p: { id: string; item_type?: string; unit?: string }) => p.id === l.product_id)?.item_type !== 'service' && <InvoiceBalanceInfo productId={l.product_id} warehouseId={form.warehouse_id === MULTI_WH ? l.wh : form.warehouse_id} unit={(ref.data?.products ?? []).find((p: { id: string; item_type?: string; unit?: string }) => p.id === l.product_id)?.unit} />}
                        <div className="flex gap-2">
                          <QuickAdd kind="product" onCreated={(id) => { const next = [...lines]; next[i] = { ...l, product_id: id }; setLines(next); }} />
                          <QuickAdd kind="category" onCreated={() => qc.invalidateQueries({ queryKey: ["doc_refs"] })} />
                        </div>
                      </td>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <td data-label="الوحدة" className="border px-2 py-1 text-center text-muted-foreground">{(ref.data?.products ?? []).find((x: any) => x.id === l.product_id)?.unit || "—"}</td>
                      <td data-label="الكمية" className="border px-2 py-1">
                        <ExprInput
                          value={l.qty}
                          onValue={(v) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
                        />
                      </td>
                      <td data-label="السعر" className="border px-2 py-1">
                        <ExprInput
                          value={l.unit_price}
                          onValue={(v) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, unit_price: v } : x)))}
                        />
                      </td>
                      {["purchase", "stock_in", "opening_inventory"].includes(form.doc_type) && shown("expiry") && (
                        <td data-label="الصلاحية" className="border px-2 py-1">
                          <Input
                            type="date"
                            value={l.expiry_date}
                            onChange={(e) => {
                              const next = [...lines];
                              next[i] = { ...l, expiry_date: e.target.value };
                              setLines(next);
                            }}
                          />
                        </td>
                      )}
                      <td data-label="الإجمالي" className="border px-2 py-1">
                        <ExprInput
                          value={String(Math.round((Number(l.qty) || 0) * (Number(l.unit_price) || 0) * 1e4) / 1e4)}
                          onValue={(v) => {
                            const t = Number(v);
                            if (!isFinite(t)) return;
                            setLines((cur) => cur.map((x, j) => {
                              if (j !== i) return x;
                              const q = Number(x.qty) || 0;
                              const p = Number(x.unit_price) || 0;
                              // total ÷ qty gives the price; with no qty, total ÷ price gives the qty
                              if (q > 0) return { ...x, unit_price: String(Math.round((t / q) * 1e6) / 1e6) };
                              if (p > 0) return { ...x, qty: String(Math.round((t / p) * 1e6) / 1e6) };
                              return { ...x, qty: "1", unit_price: String(t) };
                            }));
                          }}
                        />
                        {(Number(l.disc) || Number(l.add)) ? <div className="mt-0.5 text-xs text-muted-foreground">الصافي: {fmtNum(lineNet(l))} {form.currency}</div> : null}
                      </td>
                      <td className="border px-2 py-1 text-center">
                        <div className="flex justify-center gap-1">
                          {hasAdjustments(form.doc_type) && shown("line_adjust") && (
                            <Button size="sm" variant={adjOpen[i] || Number(l.disc) || Number(l.add) ? "secondary" : "outline"} title="حسم / إضافة للسطر" aria-label="حسم أو إضافة للسطر" onClick={() => setAdjOpen((o) => ({ ...o, [i]: !o[i] }))}>
                              {adjOpen[i] ? <Minus className="size-4" /> : <Plus className="size-4" />}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" aria-label="حذف السطر" onClick={() => setLines(lines.filter((_, x) => x !== i))}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {hasAdjustments(form.doc_type) && adjOpen[i] && (
                      <tr className="bg-muted/40">
                        <td colSpan={99} className="border px-2 py-2">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div><Label className="text-xs">حسم السطر ({form.currency})</Label>
                              <LineAdjust amount={l.disc ?? ""} gross={(Number(l.qty) || 0) * (Number(l.unit_price) || 0)} onAmount={(v) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, disc: v } : x)))} /></div>
                            <div><Label className="text-xs">إضافة السطر ({form.currency})</Label>
                              <LineAdjust amount={l.add ?? ""} gross={(Number(l.qty) || 0) * (Number(l.unit_price) || 0)} onAmount={(v) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, add: v } : x)))} /></div>
                            {usesCostPolicy(form.doc_type, ref.data?.costSettings?.inventory_method) && <>
                              {!costRules(ref.data?.costSettings?.purchase_cost_policy).discountInCost && Number(l.disc) > 0 && <div><Label>حساب حسم السطر</Label><AccountPicker accounts={ref.data?.accounts ?? []} value={l.discount_account || ref.data?.costSettings?.purchase_discount_account_id || ""} onChange={(id) => setLines((cur) => cur.map((x, j) => j === i ? { ...x, discount_account: id } : x))} /></div>}
                              {Number(l.add) > 0 && <div><Label>الحساب الدائن لإضافة السطر *</Label><AccountPicker accounts={ref.data?.accounts ?? []} value={l.addition_credit || ""} onChange={(id) => setLines((cur) => cur.map((x, j) => j === i ? { ...x, addition_credit: id } : x))} /></div>}
                              {!costRules(ref.data?.costSettings?.purchase_cost_policy).additionInCost && Number(l.add) > 0 && <div><Label>حساب مصروف إضافة السطر</Label><AccountPicker accounts={ref.data?.accounts ?? []} value={l.addition_account || ref.data?.costSettings?.purchase_freight_account_id || ""} onChange={(id) => setLines((cur) => cur.map((x, j) => j === i ? { ...x, addition_account: id } : x))} /></div>}
                            </>}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              </div>
              <Button variant="outline" className="mt-2 h-11 w-full border-dashed border-primary text-primary sm:hidden" onClick={() => { setLines([...lines, { product_id: "", qty: "1", unit_price: "0", expiry_date: "" }]); setHeadOpen(false); }}>
                <Plus className="size-4" /> إضافة بند
              </Button>
            </div>
          )}

          {hasAdjustments(form.doc_type) && shown("charges") && (
            <ChargesEditor
              charges={charges}
              onChange={setCharges}
              base={total}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              accounts={(ref.data?.accounts ?? []) as any}
              policy={usesCostPolicy(form.doc_type, ref.data?.costSettings?.inventory_method) ? ref.data?.costSettings?.purchase_cost_policy || "net" : undefined}
              defaults={{ discount: ref.data?.costSettings?.purchase_discount_account_id, addition: ref.data?.costSettings?.purchase_freight_account_id }}
            />
          )}
          <div className="sticky bottom-0 z-10 -mx-2 mt-3 border-t bg-background px-2 pb-1 pt-2 shadow-sm">
          <p className="text-sm font-semibold">
            الإجمالي: {fmtNum(total)} {form.currency}
            {hasAdjustments(form.doc_type) && charges.length > 0 ? (
              <> — الصافي: {fmtNum(total + chargesNet(charges))} {form.currency}</>
            ) : null}
          </p>

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>إغلاق</Button>
            {editing && convertMenu(editing)}
            {editing && <Button variant="outline" onClick={() => { const id = editing.id; setOpen(false); setEditing(null); setViewId(id); }}>معاينة</Button>}
            {editing?.journal_entry_id && <Button asChild variant="outline"><Link to="/journal/$entryId" params={{ entryId: editing.journal_entry_id }} onClick={() => setOpen(false)}>أصل القيد</Link></Button>}
            <Button variant="outline" onClick={() => { afterSave.current = "stay"; create.mutate(); }} disabled={create.isPending}>حفظ ومتابعة التعديل</Button>
            <Button variant="secondary" onClick={() => { afterSave.current = "new"; create.mutate(); }} disabled={create.isPending}>حفظ وجديد</Button>
            <Button onClick={() => { afterSave.current = "close"; create.mutate(); }} disabled={create.isPending}>
              {create.isPending ? "جارٍ الحفظ..." : editing ? (editing.status === "posted" ? "حفظ وإعادة الترحيل" : "حفظ التعديلات") : "حفظ كمسودة"}
            </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
