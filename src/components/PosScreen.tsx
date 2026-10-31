import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { enqueue, isNetworkError, loadRefs, newSale, pushSale, readQueue, saveRefs, subscribeQueue, syncQueue } from "@/lib/pos-offline";
import { toast } from "sonner";
import { CloudOff, Minus, Plus, Printer, RefreshCw, Search, Trash2, Mic, Square, Loader2 } from "lucide-react";
import { useVoiceInput } from "@/lib/ai/use-voice-input";
import { supabase } from "@/integrations/supabase/client";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum, today } from "@/lib/format";
import { convertRounded } from "@/lib/prices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarcodeInput, findByCode } from "@/components/BarcodeInput";
import { cn } from "@/lib/utils";
import { loadPosPrinters, printOrderTicket, printPosReceipt, savePosPrinters, type PosPrinters } from "@/lib/receipt";
import { useBranding } from "@/lib/branding";
import { PosTools } from "@/components/PosTools";
import { useCurrencies, useBaseCurrency } from "@/lib/currencies";
import { expenseError, stationPartners, stationPrice, stationsForUser, type PosStation } from "@/lib/pos-stations";
import { postEntry } from "@/lib/post-entry";
import { useReceiptTemplate } from "@/components/ReceiptTemplateCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Product = { id: string; name: string; sku: string; barcode: string | null; unit: string; parent_id: string | null; categoryName: string | null; last_purchase_price: number; sale_price: number; avg_cost: number; qty_on_hand: number; prices?: Record<string, number> | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Refs = { products: Product[]; warehouses: any[]; partners: any[] };
type CartLine = { p: Product; qty: number; price: number };

export function PosScreen({ mode: baseMode }: { mode: "sale" | "purchase" }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const brand = useBranding();
  const receiptTpl = useReceiptTemplate(me?.tenantId);
  const forced = me?.accountKind === "sales_cashier" ? "sale" : me?.accountKind === "purchase_cashier" ? "purchase" : null;
  const mode = baseMode;
  const wrongKind = !!forced && forced !== mode;
  const [isReturn, setIsReturn] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [wh, setWh] = useState("");
  const [partner, setPartner] = useState("");
  const [paid, setPaid] = useState(true);
  const base = useBaseCurrency();
  const currencies = useCurrencies().data ?? [];
  const [payCur, setPayCur] = useState("");
  const [tendered, setTendered] = useState("");
  const posRates = useQuery({
    queryKey: ["pos_rates", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data } = await db.from("exchange_rates").select("currency,rate_to_usd,rate_date").eq("tenant_id", me!.tenantId!).order("rate_date", { ascending: false }).limit(200);
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: { currency: string; rate_to_usd: number }) => { if (m[r.currency] === undefined) m[r.currency] = Number(r.rate_to_usd); });
      return m;
    },
  });
  const [sypView, setSypView] = useState<{ on: boolean; step: number; rate: number }>({ on: false, step: 0, rate: 0 });
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("pos_syp_view") || "null"); if (v) setSypView({ on: !!v.on, step: Number(v.step) || 0, rate: Number(v.rate) || 0 }); } catch { /* ignore */ } }, []);
  const updSyp = (v: Partial<{ on: boolean; step: number; rate: number }>) => setSypView((o) => { const n = { ...o, ...v }; localStorage.setItem("pos_syp_view", JSON.stringify(n)); return n; });
  const fetchedSypRate = base === "SYP" ? 1 : Number(posRates.data?.["SYP"] ?? 0);
  const sypRate = sypView.rate > 0 ? sypView.rate : fetchedSypRate;
  const showSyp = sypView.on && sypRate > 0;
  const syp = (v: number) => `${fmtNum(convertRounded(v, sypRate, sypView.step), 0)} ل.س`;
  const [printFormat, setPrintFormat] = useState<"thermal" | "a4">("thermal");
  const [printers, setPrinters] = useState<PosPrinters>({ receiptPrinter: "", orderTicket: false, orderPrinter: "", orderCopies: 1 });
  useEffect(() => { setPrinters(loadPosPrinters()); }, []);
  const updPrinters = (p: Partial<PosPrinters>) => setPrinters((o) => { const n = { ...o, ...p }; savePosPrinters(n); return n; });

  const ref = useQuery({
    queryKey: ["pos_refs", me?.tenantId],
    enabled: !!me?.tenantId,
    networkMode: "offlineFirst",
    queryFn: async () => {
      if (!navigator.onLine) { const c = loadRefs<Refs>(me?.tenantId); if (c) return c; }
      const [p, w, pa] = await Promise.all([
        scope(db.from("products").select("id,name,sku,barcode,unit,parent_id,last_purchase_price,sale_price,avg_cost,qty_on_hand,prices,is_group,is_active"), me?.tenantId).order("name"),
        scope(db.from("warehouses").select("id,name,is_group"), me?.tenantId).order("name"),
        scope(db.from("partners").select("id,name,code,currency,partner_type,barcode,parent_id,is_group,accounts:account_id(code)"), me?.tenantId).order("name"),
      ]);
      if (p.error || w.error || pa.error) { const c = loadRefs<Refs>(me?.tenantId); if (c) return c; throw p.error || w.error || pa.error; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const productRows = (p.data ?? []) as any[];
      const categoryNames = new Map(productRows.filter((x) => x.is_group).map((x) => [x.id, x.name]));
      const out: Refs = {
        products: productRows
          .filter((x) => !x.is_group && x.is_active !== false)
          .map((x) => ({ ...x, categoryName: x.parent_id ? categoryNames.get(x.parent_id) ?? null : null })) as Product[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warehouses: ((w.data ?? []) as any[]).filter((x) => !x.is_group),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partners: (pa.data ?? []) as any[],
      };
      saveRefs(me?.tenantId, out);
      return out;
    },
  });
  const stationsQ = useQuery({
    queryKey: ["pos_stations_mine", me?.tenantId, mode],
    enabled: !!me?.tenantId && typeof navigator !== "undefined" && navigator.onLine,
    queryFn: async () => {
      const { data } = await db.from("pos_stations" as never).select("*").eq("tenant_id", me!.tenantId!);
      return stationsForUser((data ?? []) as unknown as PosStation[], mode, me?.userId, !!(me?.isTenantAdmin || me?.isSuperAdmin));
    },
  });
  const myStations = stationsQ.data ?? [];
  const stKey = `pos_station_${me?.tenantId ?? ""}_${mode}`;
  const [stationId, setStationId] = useState("");
  useEffect(() => { setStationId(localStorage.getItem(stKey) || ""); }, [stKey]);
  const station = myStations.find((s) => s.id === stationId) ?? (myStations.length === 1 ? myStations[0] : undefined);
  const pickStation = (id: string) => { setStationId(id); localStorage.setItem(stKey, id); const st = myStations.find((s) => s.id === id); setWh(st?.warehouse_id ?? ""); setPartner(st?.default_partner_id ?? ""); };
  useEffect(() => { if (station) { if (station.warehouse_id) setWh(station.warehouse_id); if (station.default_partner_id) setPartner((p) => p || station.default_partner_id!); } }, [station?.id]);
  const [drawerAcc, setDrawerAcc] = useState("");
  useEffect(() => { setDrawerAcc(""); }, [station?.id]);
  const drawerAccs = useQuery({
    queryKey: ["pos_drawer_accs", station?.id, station?.cash_account_ids],
    enabled: !!station?.cash_account_ids?.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => { const r = await db.from("accounts").select("id,code,name,currency").in("id", station!.cash_account_ids!); if (r.error) throw r.error; return (r.data ?? []) as any[]; },
  });
  const whLocked = !!station?.lock_warehouse && !!station?.warehouse_id;
  const priceOf = (p: Product) =>
    mode === "sale"
      ? Number(stationPrice(p, station?.price_level ?? null)) || 0
      : Number(p.last_purchase_price) || Number(p.prices?.["purchase"]) || Number(p.avg_cost) || 0;
  const [expOpen, setExpOpen] = useState(false);
  const [exp, setExp] = useState({ account: "", amount: "", note: "" });
  const expAccounts = useQuery({
    queryKey: ["pos_exp_accounts", me?.tenantId, station?.id],
    enabled: expOpen && !!station,
    queryFn: async () => {
      let q = db.from("accounts").select("id,code,name").eq("tenant_id", me!.tenantId!).eq("is_group", false);
      if (station!.expense_account_ids?.length) q = q.in("id", station!.expense_account_ids);
      else q = q.eq("nature", "expenses" as never);
      const { data } = await q.order("code");
      return (data ?? []) as { id: string; code: string; name: string }[];
    },
  });
  const payExpense = useMutation({
    mutationFn: async () => {
      if (!station || !me?.tenantId) throw new Error("اختر نقطة أولاً");
      const amt = Number(exp.amount);
      const err = expenseError(station, amt, exp.account);
      if (err) throw new Error(err);
      if (!station.cash_account_id) throw new Error("لم يُحدَّد صندوق لهذه النقطة");
      const desc = `مصروف من درج ${station.name}${exp.note ? " — " + exp.note : ""}`;
      await postEntry(me.tenantId, me.userId, { entry_date: today(), description: desc, currency: base }, [
        { account_id: exp.account, debit: amt, credit: 0, description: desc },
        { account_id: station.cash_account_id, debit: 0, credit: amt, description: desc },
      ]);
    },
    onSuccess: () => { toast.success("تم صرف المصروف من الدرج"); setExp({ account: "", amount: "", note: "" }); setExpOpen(false); qc.invalidateQueries({ queryKey: ["pos_shift"] }); qc.invalidateQueries({ queryKey: ["pos_cash_balance"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const products = ref.data?.products ?? [];
  const warehouse = (whLocked ? station!.warehouse_id! : wh) || ref.data?.warehouses[0]?.id || "";
  const cats = useMemo(() => [...new Set(products.map((p) => p.categoryName).filter(Boolean))] as string[], [products]);
  const shown = products.filter(
    (p) => (!cat || p.categoryName === cat) && (!search || p.name.includes(search) || p.sku.toLowerCase().includes(search.toLowerCase())),
  );
  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const payCode = payCur || base;
  const payRate = payCode === base ? 1 : Number(posRates.data?.[payCode]) || 0;
  const due = Math.round(total * payRate * 100) / 100;
  // Cash drawers follow the payment currency: show matching drawers and pick one automatically.
  const drawerCur = (a: { currency?: string | null }) => a.currency || base;
  const drawerList = (drawerAccs.data ?? []).filter((a) => drawerCur(a) === payCode);
  useEffect(() => {
    const list = drawerAccs.data ?? [];
    if (!list.length) return;
    const cur = list.find((a) => a.id === drawerAcc);
    if (cur && drawerCur(cur) === payCode) return;
    setDrawerAcc(list.find((a) => drawerCur(a) === payCode)?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payCode, drawerAccs.data]);
  // Split tender: extra payments in other currencies; the main currency covers what remains.
  const [splits, setSplits] = useState<{ id: string; cur: string; amt: string; drawer: string }[]>([]);
  const rateOf = (c: string) => (c === base ? 1 : Number(posRates.data?.[c]) || 0);
  const splitBase = splits.reduce((t, x) => t + (rateOf(x.cur) ? (Number(x.amt) || 0) / rateOf(x.cur) : 0), 0);
  const remainBase = Math.max(0, total - splitBase);
  const dueMain = Math.round(remainBase * payRate * 100) / 100;
  const change = Number(tendered) > 0 && payRate ? Number(tendered) - dueMain : 0;

  const holdKey = `pos_held_${me?.tenantId ?? ""}_${mode}`;
  const [held, setHeld] = useState<{ at: string; cart: CartLine[]; partner: string }[]>([]);
  useEffect(() => { try { setHeld(JSON.parse(localStorage.getItem(holdKey) || "[]")); } catch { setHeld([]); } }, [holdKey]);
  const saveHeld = (h: typeof held) => { setHeld(h); localStorage.setItem(holdKey, JSON.stringify(h)); };
  function holdCart() {
    if (!cart.length) return;
    saveHeld([...held, { at: new Date().toTimeString().slice(0, 5), cart, partner }]);
    setCart([]); setPartner(station?.lock_partner ? station.default_partner_id ?? "" : "");
    toast.success("تم تعليق الفاتورة");
  }
  function resumeHeld(i: number) {
    const h = held[i]; if (!h) return;
    const rest = held.filter((_, j) => j !== i);
    if (cart.length) rest.push({ at: new Date().toTimeString().slice(0, 5), cart, partner });
    saveHeld(rest); setCart(h.cart); setPartner(h.partner);
  }

  function add(p: Product) {
    setCart((c) => {
      const i = c.findIndex((l) => l.p.id === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { p, qty: 1, price: priceOf(p) }];
    });
  }
  const [voiceBusy, setVoiceBusy] = useState(false);
  const voice = useVoiceInput(async (spoken) => {
    setVoiceBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/pos-voice", { method: "POST", headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ text: spoken }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "تعذّر تنفيذ الأمر");
      let n = 0;
      for (const a of j.actions as { action: string; product_id: string | null; qty: number | null; price: number | null }[]) {
        if (a.action === "clear") { setCart([]); n++; continue; }
        const p = products.find((x) => x.id === a.product_id);
        if (!p) continue;
        n++;
        if (a.action === "remove") { setQty(p.id, 0); continue; }
        setCart((c) => {
          const i = c.findIndex((l) => l.p.id === p.id);
          const base = i >= 0 ? c[i]! : { p, qty: 0, price: priceOf(p) };
          const qty = a.action === "set_qty" ? (a.qty ?? 1) : base.qty + (a.qty ?? 1);
          const line = { ...base, qty, price: a.price ?? base.price };
          return i >= 0 ? c.map((l, j2) => (j2 === i ? line : l)) : [...c, line];
        });
      }
      toast.success(`«${spoken}»` + (n ? "" : " — لم يُطابق أي صنف"));
      if (j.not_found?.length) toast.error("غير موجود: " + j.not_found.join("، "));
    } catch (e) { toast.error((e as Error).message); }
    finally { setVoiceBusy(false); }
  });
  function setQty(id: string, q: number) {
    setCart((c) => (q <= 0 ? c.filter((l) => l.p.id !== id) : c.map((l) => (l.p.id === id ? { ...l, qty: q } : l))));
  }

  const pending = useSyncExternalStore(subscribeQueue, () => readQueue().length, () => 0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  async function runSync(quiet = false) {
    if (!navigator.onLine || !readQueue().length) return;
    setSyncing(true);
    const r = await syncQueue();
    setSyncing(false);
    if (r.sent) { toast.success(`تمت مزامنة ${r.sent} فاتورة`); void qc.invalidateQueries(); }
    if (r.failed.length && !quiet) toast.error("فواتير لم تُرفع: " + r.failed[0]);
  }
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void runSync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void runSync(true);
    const t = setInterval(() => void runSync(true), 30000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!cart.length) throw new Error("السلة فارغة");
      if (myStations.length > 1 && !station) throw new Error("اختر نقطة البيع التي تعمل عليها");
      if (!warehouse) throw new Error("لا يوجد مستودع، أضف مستودعاً أولاً");
      if (wrongKind) throw new Error("غير مسموح لهذا الحساب");
      if (!me?.tenantId) throw new Error("سجّل الدخول واختر الشركة أولاً");
      if (paid && payCode !== base && !payRate) throw new Error(`لا يوجد سعر صرف لـ${payCode} — أضفه من الإعدادات`);
      if (paid && Number(tendered) > 0 && Number(tendered) < dueMain) throw new Error("المبلغ المستلم أقل من المطلوب");
      for (const x of splits) if (Number(x.amt) > 0 && !rateOf(x.cur)) throw new Error(`لا يوجد سعر صرف لـ${x.cur}`);
      if (paid && splitBase - total > 0.01) throw new Error("مجموع الدفعات بالعملات الأخرى أكبر من قيمة الفاتورة");
      const sale = newSale({
        ...(paid && splits.length ? { extraPayments: splits.filter((x) => Number(x.amt) > 0).map((x) => ({ id: x.id, currency: x.cur, rate: rateOf(x.cur), amount: Number(x.amt), cashAccountId: x.drawer || null })) } : {}),
        tenantId: me.tenantId, userId: me.userId, currency: base, mode: isReturn ? (mode === "sale" ? "sale_return" : "purchase_return") : mode, partnerId: partner || null, warehouseId: warehouse, paid, total,
        ...(paid && payCode !== base ? { payCurrency: payCode, payRate } : {}),
        ...(paid && Number(tendered) > 0 ? { payTendered: Number(tendered) } : {}),
        lines: cart.map((l) => ({ product_id: l.p.id, qty: l.qty, unit_price: l.price })),
        patternId: station?.pattern_id ?? null, cashAccountId: drawerAcc || station?.cash_account_id || null,
      });
      if (!navigator.onLine) { enqueue(sale); return { doc_no: sale.localNo, offline: true }; }
      try {
        const doc = await pushSale(sale);
        return { doc_no: doc.doc_no ?? null, offline: false };
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        enqueue(sale);
        return { doc_no: sale.localNo, offline: true };
      }
    },
    onSuccess: (doc) => {
      if (doc.offline) toast.warning("لا يوجد إنترنت — حُفظت الفاتورة على الجهاز وستُرفع تلقائياً عند عودة الاتصال");
      else toast.success(`تم حفظ الفاتورة رقم ${doc.doc_no ?? ""}`);
      const receipt = {
        company: me?.tenantName ?? "",
        logoUrl: brand.data?.logo_url ?? null,
        title: `${isReturn ? (mode === "sale" ? "مرتجع مبيع" : "مرتجع شراء") : mode === "sale" ? "فاتورة مبيع" : "فاتورة شراء"}${doc.offline ? " — محلية غير مرحّلة" : ""}`,
        docNo: doc.doc_no ?? "غير متصل",
        cashier: me?.fullName || me?.email || "",
        partner: (ref.data?.partners ?? []).find((p) => p.id === partner)?.name ?? "",
        lines: cart.map((l) => ({ name: l.p.name, qty: l.qty, price: l.price })),
        paid,
        template: receiptTpl.data ?? null,
      };
      printPosReceipt(receipt, printFormat);
      if (printers.orderTicket && mode === "sale" && !isReturn) {
        setTimeout(() => printOrderTicket(receipt, printers.orderPrinter, printers.orderCopies), 1500);
      }
      setCart([]); setSplits([]);
      setIsReturn(false);
      setTendered("");
      qc.invalidateQueries({ queryKey: ["pos_refs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allPartners = ref.data?.partners ?? [];
  const scoped = !!(station?.partner_ids?.length || station?.partner_group_ids?.length);
  const partnersList = stationPartners(station, allPartners.filter((p) => !p.is_group && (scoped || (mode === "sale" ? p.partner_type !== "supplier" : p.partner_type !== "customer"))), allPartners);
  const partnerLocked = !!station?.lock_partner && !!station?.default_partner_id;

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[1fr_380px] 2xl:grid-cols-[1fr_440px]">
      <section className="flex min-h-0 flex-col gap-3">
        {(!online || pending > 0) && (
          <div className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm", online ? "bg-muted" : "border-destructive/40 bg-destructive/10 text-destructive")}>
            <span className="flex items-center gap-2">
              {!online && <CloudOff className="size-4" />}
              {online ? "متصل" : "وضع بدون إنترنت — البيع مستمر"}
              {pending > 0 && ` · ${pending} فاتورة بانتظار المزامنة`}
            </span>
            {online && pending > 0 && (
              <Button size="sm" variant="outline" disabled={syncing} onClick={() => void runSync()}>
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} />مزامنة الآن
              </Button>
            )}
          </div>
        )}
        {wrongKind && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">هذا الحساب مخصص لـ{forced === "sale" ? "نقطة البيع" : "نقطة الشراء"} فقط.</p>}
        {myStations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
            <span className="text-sm font-medium">النقطة:</span>
            <select className="h-10 min-w-48 rounded-md border bg-background px-2" value={station?.id ?? ""} onChange={(e) => pickStation(e.target.value)}>
              {!station && <option value="">اختر النقطة…</option>}
              {myStations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {station?.allow_expenses && <Button variant="outline" onClick={() => setExpOpen(true)}>صرف مصروف من الدرج</Button>}
          </div>
        )}
        <Dialog open={expOpen} onOpenChange={setExpOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>صرف مصروف من درج {station?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <select className="h-11 w-full rounded-md border bg-background px-2" value={exp.account} onChange={(e) => setExp({ ...exp, account: e.target.value })}>
                <option value="">حساب المصروف…</option>
                {(expAccounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <Input type="number" inputMode="decimal" placeholder={`المبلغ (${base})${Number(station?.max_expense) > 0 ? " — الحد " + station!.max_expense : ""}`} value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} />
              <Input placeholder="البيان (مثلاً أجرة نقل)" value={exp.note} onChange={(e) => setExp({ ...exp, note: e.target.value })} />
              <Button className="w-full" disabled={payExpense.isPending} onClick={() => payExpense.mutate()}>صرف</Button>
            </div>
          </DialogContent>
        </Dialog>
        <PosTools mode={mode} onReturn={(r) => {
          setIsReturn(true);
          setPartner(r.partnerId ?? "");
          setCart(r.lines.map((l) => ({ p: products.find((x) => x.id === l.product_id) ?? { id: l.product_id, name: l.name, sku: "", barcode: null, unit: "", parent_id: null, categoryName: null, last_purchase_price: 0, sale_price: 0, avg_cost: 0, qty_on_hand: 0 }, qty: l.qty, price: l.price })));
          toast.info("عُبّئت مواد الفاتورة في المرتجع — عدّل الكميات ثم اضغط حفظ المرتجع");
        }} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-muted p-1">
            {[false, true].map((r) => (
              <button key={String(r)} onClick={() => { setIsReturn(r); setCart([]); }} className={cn("rounded-lg px-6 py-2.5 text-base font-medium text-muted-foreground", isReturn === r && "bg-card text-foreground shadow-soft")}>
                {r ? (mode === "sale" ? "مرتجع بيع" : "مرتجع شراء") : mode === "sale" ? "بيع" : "شراء"}
              </button>
            ))}
          </div>
          <BarcodeInput big autoFocus className="min-w-64 flex-1" onCode={(code) => {
            const who = (ref.data?.partners ?? []).find((x) => x.barcode && x.barcode === code);
            if (who) { setPartner(who.id); toast.success((mode === "sale" ? "الزبون: " : "المورد: ") + who.name); return; }
            const p = findByCode(products, code);
            if (!p) { toast.error("لا توجد مادة أو جهة بهذا الباركود: " + code); return; }
            add(p);
          }} />
          <Button type="button" variant={voice.state === "rec" ? "destructive" : "outline"} className="h-14 w-14 shrink-0" title="أمر صوتي: مثلاً «ثلاث علب حليب وكيلو سكر»" aria-label="أمر صوتي" disabled={!online || voiceBusy} onClick={voice.toggle}>
            {voice.state === "busy" || voiceBusy ? <Loader2 className="size-6 animate-spin" /> : voice.state === "rec" ? <Square className="size-6" /> : <Mic className="size-6" />}
          </Button>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-14 ps-10 text-lg" placeholder="بحث بالاسم" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {cats.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["", ...cats].map((c) => (
              <button key={c || "all"} onClick={() => setCat(c)} className={cn("whitespace-nowrap rounded-full border bg-card px-5 py-2.5 text-base transition", cat === c && "bg-primary text-primary-foreground")}>
                {c || "الكل"}
              </button>
            ))}
          </div>
        )}
        <div className="grid min-h-40 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 overflow-y-auto">
          {shown.map((p) => (
            <button key={p.id} onClick={() => add(p)} className="flex min-h-20 flex-col justify-between rounded-xl border bg-card p-2.5 text-start shadow-soft transition active:scale-[0.97] hover:border-foreground/20">
              <span className="text-sm font-semibold leading-tight">{p.name}</span>
              <span className="mt-1 flex items-end justify-between text-xs text-muted-foreground">
                <span>{fmtNum(p.qty_on_hand, 0)} {p.unit}</span>
                <span className="num text-sm font-bold text-foreground">{showSyp ? syp(priceOf(p)) : fmtNum(priceOf(p))}</span>
              </span>
            </button>
          ))}
          {!shown.length && <p className="col-span-full p-8 text-center text-muted-foreground">لا توجد مواد</p>}
        </div>
        <div className="grid gap-3 rounded-2xl border bg-card p-3 shadow-soft md:grid-cols-2">
          <label className="flex items-center justify-between gap-2 text-sm">حجم الفاتورة
            <select className="h-10 rounded-md border bg-background px-3" value={printFormat} onChange={e => setPrintFormat(e.target.value === "a4" ? "a4" : "thermal")}>
              <option value="thermal">حرارية 80 مم</option><option value="a4">فاتورة كبيرة A4</option>
            </select>
          </label>
          <details className="rounded-md border bg-background p-2 text-sm">
            <summary className="cursor-pointer font-medium">الطابعات</summary>
            <div className="mt-2 space-y-2">
              <label className="block">طابعة نقطة البيع (الفاتورة)
                <Input className="mt-1 h-9" placeholder="مثال: طابعة الكاشير" value={printers.receiptPrinter} onChange={(e) => updPrinters({ receiptPrinter: e.target.value })} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={printers.orderTicket} onChange={(e) => updPrinters({ orderTicket: e.target.checked })} />
                طباعة تفاصيل الطلب تلقائياً لقسم التسليم
              </label>
              {printers.orderTicket && (
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <label className="block">طابعة قسم التسليم
                    <Input className="mt-1 h-9" placeholder="مثال: طابعة المطبخ" value={printers.orderPrinter} onChange={(e) => updPrinters({ orderPrinter: e.target.value })} />
                  </label>
                  <label className="block">النسخ
                    <Input type="number" min={1} max={5} className="mt-1 h-9" value={printers.orderCopies} onChange={(e) => updPrinters({ orderCopies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
                  </label>
                </div>
              )}
              <p className="text-xs text-muted-foreground">تُحفظ على هذا الجهاز. عند أول طباعة اختر الطابعة المسماة في نافذة الطباعة، وسيتذكرها المتصفح.</p>
            </div>
          </details>
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" className="size-5" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            مدفوعة نقداً
          </label>
          {paid && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">عملة الدفع
                <select className="mt-1 h-11 w-full rounded-md border bg-background px-2 text-base" value={payCode} onChange={(e) => { setPayCur(e.target.value); setTendered(""); }}>
                  <option value={base}>{base}</option>
                  {currencies.filter((c) => c.code !== base).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </label>
              <label className="text-sm">المبلغ المستلم
                <Input type="number" inputMode="decimal" className="mt-1 h-11 text-base" placeholder={fmtNum(dueMain)} value={tendered} onChange={(e) => setTendered(e.target.value)} />
              </label>
              <div className="col-span-2 space-y-2 rounded-md border p-2">
                {splits.map((x) => (
                  <div key={x.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1">
                    <select className="h-9 rounded-md border bg-background px-1 text-sm" value={x.cur} onChange={(e) => setSplits((l) => l.map((y) => y.id === x.id ? { ...y, cur: e.target.value, drawer: "" } : y))}>
                      {[base, ...currencies.map((c) => c.code).filter((c) => c !== base)].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Input type="number" inputMode="decimal" className="h-9" placeholder="المبلغ" value={x.amt} onChange={(e) => setSplits((l) => l.map((y) => y.id === x.id ? { ...y, amt: e.target.value } : y))} />
                    <select className="h-9 rounded-md border bg-background px-1 text-sm" value={x.drawer} onChange={(e) => setSplits((l) => l.map((y) => y.id === x.id ? { ...y, drawer: e.target.value } : y))} aria-label="الصندوق">
                      <option value="">الصندوق الافتراضي</option>
                      {(drawerAccs.data ?? []).filter((a) => drawerCur(a) === x.cur).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSplits((l) => l.filter((y) => y.id !== x.id))}>✕</Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setSplits((l) => [...l, { id: crypto.randomUUID(), cur: currencies.find((c) => c.code !== payCode)?.code ?? base, amt: "", drawer: "" }])}>+ دفع جزء بعملة أخرى</Button>
                {splits.length > 0 && <p className="text-xs text-muted-foreground">المتبقي بـ{payCode}: <span className="font-semibold">{fmtNum(dueMain)}</span></p>}
              </div>
              {payCode !== base && (
                <p className="col-span-2 text-xs text-muted-foreground">{payRate ? `السعر: 1 ${base} = ${fmtNum(payRate)} ${payCode}` : `لا يوجد سعر صرف لـ${payCode}`}</p>
              )}
              {Number(tendered) > 0 && (
                <p className={cn("col-span-2 text-base font-semibold", change < 0 ? "text-destructive" : "")}>{change < 0 ? "ناقص" : "الباقي للزبون"}: {fmtNum(Math.abs(change))} {payCode}</p>
              )}
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-lg">الإجمالي <span className="text-sm text-muted-foreground">{base}</span></span>
            <span className="num text-4xl font-semibold tracking-tight">{fmtNum(total)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" checked={sypView.on} onChange={(e) => updSyp({ on: e.target.checked })} /> عرض الأسعار بالليرة السورية</label>
            {sypView.on && base !== "SYP" && (
              <label className="flex items-center gap-1 text-xs">سعر الصرف
                <Input type="number" inputMode="decimal" className="h-8 w-28 px-1 text-xs" placeholder={fetchedSypRate ? fmtNum(fetchedSypRate) : "أدخل السعر"} value={sypView.rate || ""} onChange={(e) => updSyp({ rate: Number(e.target.value) || 0 })} />
              </label>
            )}
            {sypView.on && (
              <select className="h-8 rounded-md border bg-background px-1 text-xs" value={sypView.step} onChange={(e) => updSyp({ step: Number(e.target.value) })}>
                <option value={0}>بدون تقريب</option><option value={1}>لأقرب 1</option><option value={100}>لأقرب 100</option><option value={500}>لأقرب 500</option><option value={1000}>لأقرب 1000</option><option value={5000}>لأقرب 5000</option>
              </select>
            )}
            {sypView.on && !sypRate && <span className="text-xs text-destructive">لا يوجد سعر صرف لليرة السورية — أدخله في الحقل</span>}
          </div>
          {showSyp && base !== "SYP" && (
            <div className="flex items-baseline justify-between text-primary"><span>الإجمالي بالليرة السورية</span><span className="num text-2xl font-semibold">{syp(total)}</span></div>
          )}
          {paid && payCode !== base && payRate > 0 && (
            <div className="flex items-baseline justify-between text-primary">
              <span>المطلوب بـ{payCode}</span>
              <span className="num text-2xl font-semibold">{fmtNum(due)}</span>
            </div>
          )}
          {held.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs text-muted-foreground">فواتير معلّقة:</span>
              {held.map((h, i) => (
                <Button key={i} size="sm" variant="outline" onClick={() => resumeHeld(i)}>
                  {h.at} · {h.cart.length} مادة · {fmtNum(h.cart.reduce((s, l) => s + l.qty * l.price, 0))}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="h-14 flex-1 text-base" onClick={() => setCart([])} disabled={!cart.length}>إلغاء</Button>
            <Button variant="secondary" className="h-14 flex-1 text-base" onClick={holdCart} disabled={!cart.length}>تعليق</Button>
            <Button className="h-14 flex-[2] text-lg" onClick={() => save.mutate()} disabled={!cart.length || save.isPending}>
              <Printer className="size-5" />
              {save.isPending ? "جارٍ الحفظ..." : isReturn ? `حفظ المرتجع ${fmtNum(total)} وطباعة` : `دفع ${fmtNum(total)} وطباعة`}
            </Button>
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="grid grid-cols-2 gap-2 border-b p-3">
          <select className="h-12 rounded-md border bg-background px-2 text-base" value={warehouse} disabled={whLocked} onChange={(e) => setWh(e.target.value)}>
            {(ref.data?.warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="h-12 rounded-md border bg-background px-2 text-base" value={partner} disabled={partnerLocked} onChange={(e) => setPartner(e.target.value)}>
            <option value="">{mode === "sale" ? "زبون نقدي" : "مورد نقدي"}</option>
            {partnersList.map((p) => <option key={p.id} value={p.id}>{p.name}{p.accounts?.code || p.code ? ` · ${p.accounts?.code || p.code}` : ""}{p.currency ? ` · ${p.currency}` : ""}</option>)}
          </select>
          {!!station?.cash_account_ids?.length && (
            <select className="col-span-2 h-10 rounded-md border bg-background px-2" value={drawerAcc} onChange={(e) => setDrawerAcc(e.target.value)} aria-label="الصندوق">
              <option value="">{station.cash_account_id ? "الصندوق الافتراضي" : "درج المستخدم"}</option>
              {drawerList.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name} · {drawerCur(a)}</option>)}
            </select>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!cart.length && <p className="p-8 text-center text-muted-foreground">امسح باركود أو اضغط على مادة</p>}
          {cart.map((l) => (
            <div key={l.p.id} className="flex items-center gap-2 border-b p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{l.p.name}</div>
                <Input type="number" className="mt-1 h-9 w-28" value={l.price} onChange={(e) => setCart((c) => c.map((x) => (x.p.id === l.p.id ? { ...x, price: Number(e.target.value) } : x)))} />
              </div>
              <Button size="icon" variant="outline" className="size-11" onClick={() => setQty(l.p.id, l.qty - 1)}><Minus /></Button>
              <span className="num w-10 text-center text-lg font-bold">{l.qty}</span>
              <Button size="icon" variant="outline" className="size-11" onClick={() => setQty(l.p.id, l.qty + 1)}><Plus /></Button>
              <Button size="icon" variant="ghost" className="size-11 text-destructive" onClick={() => setQty(l.p.id, 0)}><Trash2 /></Button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
