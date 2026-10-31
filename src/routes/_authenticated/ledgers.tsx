import { balanceLabel, ledgerAmounts, ledgerDescription } from "@/lib/ledger-display";
import { useBaseCurrency, useCurrencies, useLatestRates } from "@/lib/currencies";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { exportCsv, printPage } from "@/lib/export";
import { fmtDate, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Printer } from "lucide-react";
import { ServiceStatement } from "@/components/ServiceReports";

type Search = { tab?: string | undefined; id?: string | undefined };

export const Route = createFileRoute("/_authenticated/ledgers")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: typeof s["tab"] === "string" ? (s["tab"] as string) : undefined,
    id: typeof s["id"] === "string" ? (s["id"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "دفاتر الأستاذ والكشوف | يوسف سوفت" },
      {
        name: "description",
        content: "أستاذ المواد والمستودعات وكشوف الزبائن والموردين وأستاذ الحسابات مع فلترة تاريخية وطباعة وتصدير.",
      },
      { property: "og:title", content: "دفاتر الأستاذ والكشوف" },
      { property: "og:description", content: "كشوف تاريخية قابلة للطباعة والتصدير إلى إكسل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgersPage,
});

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type Col = { key: string; label: string; numeric?: boolean };

function LedgerTable({
  title,
  subtitle,
  columns,
  rows,
  footer,
}: {
  title: string;
  subtitle?: string;
  columns: Col[];
  rows: Record<string, string | undefined>[];
  footer?: { label: string; value: string };
}) {
  const { t } = useI18n();
  const { data: me } = useMe();
  return (
    <div className="print-area rounded-lg border bg-card p-6">
      <div className="no-print mb-4 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => exportCsv(title, columns, rows)}>
          <Download className="size-4" />
          {t("تصدير إلى إكسل")}
        </Button>
        <Button size="sm" onClick={printPage}>
          <Printer className="size-4" />
          {t("طباعة")}
        </Button>
      </div>

      <div className="mb-5 border-b pb-4 text-center">
        <h1 className="text-lg font-bold">{me?.tenantName ?? t("يوسف سوفت")}</h1>
        <h2 className="mt-1 font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-secondary">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="border px-2 py-2 text-start">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="border px-2 py-6 text-center text-muted-foreground">
                  {t("لا توجد حركات")}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className={r["_strong"] ? "bg-muted/60 font-semibold" : ""}>
                {columns.map((c) => (
                  <td key={c.key} className="border px-2 py-2 whitespace-nowrap">
                    {r["_entryId"] && ["entry", "description"].includes(c.key) ? <Link to="/journal/$entryId" params={{ entryId: r["_entryId"] }} className="text-primary underline underline-offset-2">{r[c.key] ?? ""}</Link> : r[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot className="bg-muted font-bold">
              <tr>
                <td className="border px-2 py-2 text-start" colSpan={columns.length - 1}>
                  {footer.label}
                </td>
                <td className="border px-2 py-2">{footer.value}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Filters({
  from,
  to,
  setFrom,
  setTo,
  children,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="no-print mb-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <Label className="text-xs">{t("من تاريخ")}</Label>
        <Input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">{t("إلى تاريخ")}</Label>
        <Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {children}
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Shared option lists, always scoped to the active company. */
type Opt = { value: string; label: string; currency?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useOptions(table: string, labelExpr: (r: any) => string, order = "name", leavesOnly = false, stockOnly = false) {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["opts", table, me?.tenantId, leavesOnly, stockOnly],
    enabled: !!me,
    queryFn: async () => {
      let q = db.from(table).select("*").order(order);
      if (me?.tenantId) q = q.eq("tenant_id", me.tenantId);
      // Statements are for leaf cards only — group (summary) accounts are excluded.
      if (leavesOnly) q = q.eq("is_group", false);
      const { data } = await q;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).filter((r: any) => !stockOnly || r.item_type !== "service").map((r: any) => ({ value: r.id as string, label: labelExpr(r), currency: r.currency }) as Opt);
    },
  });
}

/* ---------------- Stock ledger (product / warehouse) ---------------- */

function useStockMoves(args: { from: string; to: string; productId?: string | undefined; warehouseId?: string | undefined }) {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["stock_ledger", me?.tenantId, args],
    enabled: !!me && (!!args.productId || !!args.warehouseId),
    queryFn: async () => {
      let q = db
        .from("stock_moves")
        .select("*, products(name,unit,sku), warehouses(name)")
        .order("move_date")
        .order("created_at");
      if (me?.tenantId) q = q.eq("tenant_id", me.tenantId);
      if (args.productId) q = q.eq("product_id", args.productId);
      if (args.warehouseId) q = q.eq("warehouse_id", args.warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function StockLedger({ mode, initialId }: { mode: "product" | "warehouse"; initialId?: string | undefined }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(todayStr());
  const [id, setId] = useState(initialId ?? "");
  const baseCur = useBaseCurrency();
  const curList = useCurrencies().data ?? [];
  const sym = curList.find((x) => x.code === baseCur)?.symbol || baseCur;
  const cm = (v: number, d = 2) => `${fmtNum(v, d)} ${sym}`;

  const products = useOptions("products", (r) => `${r["sku"] ?? ""} - ${r["name"]}`, "name", true, true);
  const costMethod = useQuery({ queryKey: ["cost_method"], queryFn: async () => String((await db.from("tenant_settings").select("cost_method").maybeSingle()).data?.cost_method ?? "avg") });
  const lastMode = String(costMethod.data ?? "").includes("last");
  const warehouses = useOptions("warehouses", (r) => String(r["name"]));
  const moves = useStockMoves({
    from,
    to,
    productId: mode === "product" ? id || undefined : undefined,
    warehouseId: mode === "warehouse" ? id || undefined : undefined,
  });

  const all = moves.data ?? [];
  // Opening-inventory invoices always form the opening balance, even when dated inside the period.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOpenInv = (m: any) => m.reference === "opening_inventory" && m.move_date <= to;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opening = all.filter((m: any) => m.move_date < from || isOpenInv(m));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const period = all.filter((m: any) => !isOpenInv(m) && m.move_date >= from && m.move_date <= to);

  let balance = opening.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: number, m: any) => s + (m.direction === "in" ? Number(m.qty) : -Number(m.qty)),
    0,
  );

  // Weighted-average valuation (product ledger): inflows at their cost, outflows at the running average.
  let val = 0;
  let avg = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyCost = (m: any, q0: number) => {
    const qty = Number(m.qty);
    let price: number;
    const q1x = q0 + (m.direction === "in" ? qty : -qty);
    if (lastMode) {
      // Last purchase price: each inflow reprices the whole remaining stock.
      if (m.direction === "in" && Number(m.unit_cost)) avg = Number(m.unit_cost);
      price = avg;
      val = q1x * avg;
      return price;
    }
    if (m.direction === "in") {
      price = Number(m.unit_cost) || avg;
      val += qty * price;
    } else {
      price = avg;
      val -= qty * avg;
    }
    const q1 = q0 + (m.direction === "in" ? qty : -qty);
    if (Math.abs(q1) < 1e-9) val = 0;
    avg = q1 > 1e-9 ? val / q1 : m.direction === "in" ? price : avg;
    return price;
  };
  if (mode === "product") {
    let q0 = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opening.forEach((m: any) => { applyCost(m, q0); q0 += m.direction === "in" ? Number(m.qty) : -Number(m.qty); });
  }

  // Unit of the selected item (product ledger) — taken from the movements themselves.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseUnit: string = mode === "product" ? (all.find((m: any) => m.products?.unit)?.products?.unit ?? "") : "";

  const rows: Record<string, string | undefined>[] = [
    {
      date: fmtDate(from),
      ref: t("رصيد أول المدة"),
      item: "",
      unit: mode === "product" ? baseUnit : "",
      inQty: "",
      outQty: "",
      balance: fmtNum(balance, 4),
      price: "",
      moveValue: "",
      avg: mode === "product" ? cm(avg, 4) : "",
      value: mode === "product" ? cm(val) : "",
      _strong: "1",
    },
  ];

  let totalIn = 0;
  let totalOut = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  period.forEach((m: any) => {
    const qty = Number(m.qty);
    const price = mode === "product" ? applyCost(m, balance) : Number(m.unit_cost) || 0;
    if (m.direction === "in") {
      balance += qty;
      totalIn += qty;
    } else {
      balance -= qty;
      totalOut += qty;
    }
    rows.push({
      date: fmtDate(m.move_date),
      ref: m.reference || "—",
      item: mode === "product" ? (m.warehouses?.name ?? "—") : (m.products?.name ?? "—"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unit: mode === "product" ? baseUnit : (m.products?.unit ?? ""),
      inQty: m.direction === "in" ? fmtNum(qty, 4) : "",
      outQty: m.direction === "out" ? fmtNum(qty, 4) : "",
      balance: fmtNum(balance, 4),
      price: cm(price, 4),
      moveValue: cm(qty * price),
      avg: mode === "product" ? cm(avg, 4) : "",
      value: mode === "product" ? cm(val) : "",
    });
  });

  const stockMap = new Map<string, { sku: string; name: string; unit: string; qty: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all.filter((m: any) => m.move_date <= to).forEach((m: any) => {
    const r = stockMap.get(m.product_id) ?? { sku: m.products?.sku ?? "", name: m.products?.name ?? "—", unit: m.products?.unit ?? "", qty: 0 };
    r.qty += m.direction === "in" ? Number(m.qty) : -Number(m.qty);
    stockMap.set(m.product_id, r);
  });
  const contents = [...stockMap.values()]
    .filter((r) => Math.abs(r.qty) > 0.00001)
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((r) => ({ sku: r.sku, name: r.name, unit: r.unit, qty: fmtNum(r.qty, 4) }));

  const columns: Col[] = [
    { key: "date", label: t("التاريخ") },
    { key: "ref", label: t("المرجع") },
    { key: "item", label: mode === "product" ? t("المستودع") : t("المادة") },
    { key: "unit", label: t("الوحدة") },
    { key: "inQty", label: t("الكمية الواردة") },
    { key: "outQty", label: t("الكمية الصادرة") },
    { key: "balance", label: t("الرصيد المتحرك للكمية") },
    { key: "price", label: t("سعر الحركة") },
    { key: "moveValue", label: t("قيمة الحركة") },
    ...(mode === "product" ? [
      { key: "avg", label: lastMode ? t("آخر سعر شراء بعد الحركة") : t("الكلفة الوسطية بعد الحركة") },
      { key: "value", label: t("رصيد المادة بالكلفة") },
    ] : []),
  ];

  const label =
    mode === "product"
      ? (products.data ?? []).find((o: Opt) => o.value === id)?.label
      : (warehouses.data ?? []).find((o: Opt) => o.value === id)?.label;

  return (
    <>
      <Filters from={from} to={to} setFrom={setFrom} setTo={setTo}>
        <Picker
          label={mode === "product" ? t("اختر المادة") : t("اختر المستودع")}
          value={id}
          onChange={setId}
          options={(mode === "product" ? products.data : warehouses.data) ?? []}
        />
      </Filters>
      {id ? (
        <LedgerTable
          title={`${mode === "product" ? t("أستاذ المواد") : t("أستاذ المستودع")} — ${label ?? ""}`}
          subtitle={`${t("من تاريخ")} ${fmtDate(from)} ${t("إلى تاريخ")} ${fmtDate(to)}`}
          columns={columns}
          rows={rows}
          footer={{
            label: `${t("الإجمالي")}: ${t("الكمية الواردة")} ${fmtNum(totalIn, 4)}${mode === "product" && baseUnit ? " " + baseUnit : ""} · ${t("الكمية الصادرة")} ${fmtNum(totalOut, 4)}${mode === "product" && baseUnit ? " " + baseUnit : ""} — ${t("رصيد آخر المدة")}`,
            value: mode === "product" ? `${fmtNum(balance, 4)}${baseUnit ? " " + baseUnit : ""} — ${t("بالكلفة")} ${cm(val)}` : fmtNum(balance, 4),
          }}
        />
      ) : (
        <p className="rounded-lg border bg-card p-6 text-muted-foreground">
          {mode === "product" ? t("اختر المادة") : t("اختر المستودع")}
        </p>
      )}
      {id && mode === "warehouse" && (
        <div className="mt-6">
          <LedgerTable
            title={`${t("المواد الموجودة في المستودع")} — ${label ?? ""}`}
            subtitle={`${t("الرصيد حتى تاريخ")} ${fmtDate(to)}`}
            columns={[
              { key: "sku", label: t("رمز المادة") },
              { key: "name", label: t("المادة") },
              { key: "unit", label: t("الوحدة") },
              { key: "qty", label: t("الكمية المتوفرة") },
            ]}
            rows={contents}
            footer={{ label: t("عدد المواد"), value: String(contents.length) }}
          />
        </div>
      )}
    </>
  );
}

/* ---------------- Journal-based ledgers (partner / account) ---------------- */

function useJournalLines(args: { partnerId?: string | undefined; accountId?: string | undefined; projectId?: string | undefined }) {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["gl_ledger", me?.tenantId, args],
    enabled: !!me && (!!args.partnerId || !!args.accountId || !!args.projectId),
    queryFn: async () => {
      let q = db
        .from("journal_lines")
        .select(`*, ${me?.isAuditor ? "journal_entries!inner" : "journal_entries"}(id,entry_no,entry_date,description,currency,exchange_rate,audited,doc_type), accounts(code,name,currency), partners(name)`);
      if (me?.isAuditor) q = q.eq("journal_entries.audited", true);
      if (me?.tenantId) q = q.eq("tenant_id", me.tenantId);
      if (args.partnerId) q = q.eq("partner_id", args.partnerId);
      if (args.accountId) q = q.eq("account_id", args.accountId);
      if (args.projectId) q = q.eq("project_id", args.projectId);
      const { data, error } = await q;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).sort((a: any, b: any) =>
        String(a.journal_entries?.entry_date ?? "").localeCompare(String(b.journal_entries?.entry_date ?? "")),
      );
    },
  });
}

export function GlLedger({ mode, initialId, accountOptions }: { mode: "partner" | "account" | "project"; initialId?: string | undefined; accountOptions?: Opt[] }) {
  const { t } = useI18n();
  const base = useBaseCurrency();
  const currencies = useCurrencies().data ?? [];
  const rates = useLatestRates();
  const symbol = (c: string) => currencies.find((x) => x.code === c)?.symbol || c;
  const money = (v: number | undefined, c: string) => v === undefined ? "—" : `${fmtNum(v)} ${symbol(c)}`;
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(todayStr());
  const [id, setId] = useState(initialId ?? "");
  const [cur, setCur] = useState("");
  const [equivalent, setEquivalent] = useState("");
  const [fallback, setFallback] = useState(true);
  const partners = useOptions("partners", (r) => String(r.name), "name", true);
  const accounts = useOptions("accounts", (r) => `${r.code} - ${r.name} (${symbol(r.currency || base)})`, "code", true);
  const projects = useOptions("projects", (r) => String(r.name), "name", true);
  const optList: Opt[] = (mode === "partner" ? partners.data : mode === "project" ? projects.data : accountOptions ?? accounts.data) ?? [];
  const selected = optList.find((o) => o.value === id);
  const own = selected?.currency || cur || base;
  const lines = useJournalLines({ projectId: mode === "project" ? id || undefined : undefined, partnerId: mode === "partner" ? id || undefined : undefined, accountId: mode === "account" ? id || undefined : undefined });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (lines.data ?? []).filter((l: any) => l.journal_entries && (!cur || ledgerAmounts(l, base).currency === cur));
  const byCur: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all.forEach((l: any) => { if (l.journal_entries.entry_date > to) return; const a = ledgerAmounts(l, base); byCur[a.currency] = (byCur[a.currency] ?? 0) + a.original; });
  let balance = 0, balanceOwn = 0, totalDebit = 0, totalCredit = 0;
  let missingOwn = false;
  const rows: Record<string, string | undefined>[] = [];
  const amount = (v: number, c: string) => balanceLabel(v, symbol(c));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apply = (l: any) => {
    const a = ledgerAmounts(l, base, own, rates);
    balance += a.debitBase - a.creditBase;
    if (a.debit === undefined || a.credit === undefined) missingOwn = true;
    else balanceOwn += a.debit - a.credit;
    return a;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // The opening entry always forms the opening balance, even when dated inside the period.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOpening = (l: any) => l.journal_entries.doc_type === "opening" && l.journal_entries.entry_date <= to;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all.filter((l: any) => l.journal_entries.entry_date < from || isOpening(l)).forEach(apply);
  const eqRate = equivalent === base ? 1 : rates[equivalent];
  const balances = () => ({ balance: amount(balance, base), balanceOwn: missingOwn ? "—" : amount(balanceOwn, own), equivalent: eqRate ? amount(balance * eqRate, equivalent) : "—" });
  rows.push({ date: fmtDate(from), description: t("رصيد أول المدة"), ...balances(), _strong: "1" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all.filter((l: any) => !isOpening(l) && l.journal_entries.entry_date >= from && l.journal_entries.entry_date <= to).forEach((l: any) => {
    const a = apply(l);
    totalDebit += a.debitBase; totalCredit += a.creditBase;
    rows.push({ _entryId: l.entry_id, entry: String(l.journal_entries.entry_no ?? ""), date: fmtDate(l.journal_entries.entry_date), description: ledgerDescription(l.description, l.journal_entries.description, fallback), other: `${l.accounts?.code ?? ""} - ${l.accounts?.name ?? ""}`, debit: money(a.debitBase, base), credit: money(a.creditBase, base), debitOwn: money(a.debit, own), creditOwn: money(a.credit, own), ...balances() });
  });
  const columns: Col[] = [
    { key: "entry", label: t("رقم القيد") }, { key: "date", label: t("التاريخ") }, { key: "description", label: t("البيان") },
    ...(mode !== "account" ? [{ key: "other", label: t("الحساب") }] : []),
    { key: "debit", label: `مدين (${symbol(base)})` }, { key: "credit", label: `دائن (${symbol(base)})` },
    ...(own !== base ? [{ key: "debitOwn", label: `مدين (${symbol(own)})` }, { key: "creditOwn", label: `دائن (${symbol(own)})` }] : []),
    ...(own !== base ? [{ key: "balanceOwn", label: `الرصيد (${symbol(own)})` }] : []),
    { key: "balance", label: `الرصيد (${symbol(base)})` },
    ...(equivalent ? [{ key: "equivalent", label: `المعادل (${symbol(equivalent)})` }] : []),
  ];
  return <>
    <Filters from={from} to={to} setFrom={setFrom} setTo={setTo}>
      <Picker label={mode === "account" ? "اختر الحساب" : mode === "partner" ? "اختر الزبون / المورد" : "اختر المشروع"} value={id} onChange={(v) => { setId(v); setCur(""); }} options={optList} />
      <Picker label="المعادل بعملة" value={equivalent} onChange={setEquivalent} options={currencies.filter((c) => c.is_active !== false).map((c) => ({ value: c.code, label: `${c.name} (${symbol(c.code)})` }))} />
    </Filters>
    <div className="no-print mb-3 flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} />اعتماد بيان القيد عند فراغ بيان السطر</label>
      <label className="flex items-center gap-2">عملة الحركات<select className="h-9 rounded-md border bg-background px-2" value={cur} onChange={(e) => setCur(e.target.value)}><option value="">كل العملات</option>{Object.keys(byCur).map((c) => <option key={c} value={c}>{symbol(c)} — {c}</option>)}</select></label>
    </div>
    {id && <div className="mb-3 flex flex-wrap gap-3 text-sm">{Object.entries(byCur).map(([c,v]) => <span key={c}>رصيد {c}: <b>{amount(v,c)}</b></span>)}</div>}
    {id ? <LedgerTable title={`كشف حساب — ${selected?.label ?? ""}`} subtitle={`${fmtDate(from)} — ${fmtDate(to)}${equivalent ? ` · المعادل بسعر اليوم: ${eqRate ? fmtNum(eqRate,4) : "سعر الصرف غير متوفر"}` : ""}${missingOwn ? " · سعر تحويل عملة الحساب غير متوفر لبعض الحركات" : ""}`} columns={columns} rows={rows} footer={{ label: `الإجمالي: مدين ${money(totalDebit,base)} · دائن ${money(totalCredit,base)}${own !== base ? ` · رصيد عملة الحساب ${missingOwn ? "—" : amount(balanceOwn,own)}` : ""}${equivalent ? ` · المعادل ${eqRate ? amount(balance * eqRate,equivalent) : "—"}` : ""}`, value: amount(balance,base) }} /> : <p className="text-muted-foreground">اختر حساباً</p>}
  </>;
}

function LedgersPage() {
  const { t, dir } = useI18n();
  const search = Route.useSearch();
  const tab = search.tab ?? "product";

  return (
    <div>
      <PageHeader
        title={t("دفاتر الأستاذ التاريخية")}
        subtitle={t("اختر الفترة الزمنية ثم اعرض الكشف، ويمكن طباعته أو تصديره إلى إكسل")}
      />
      <Tabs defaultValue={tab} dir={dir}>
        <TabsList className="no-print mb-4 flex-wrap">
          <TabsTrigger value="product">{t("أستاذ المواد")}</TabsTrigger>
          <TabsTrigger value="service">{t("كشف خدمة")}</TabsTrigger>
          <TabsTrigger value="warehouse">{t("أستاذ المستودع")}</TabsTrigger>
          <TabsTrigger value="partner">{t("كشوف الزبائن والموردين")}</TabsTrigger>
          <TabsTrigger value="project">{t("كشف حساب مشروع")}</TabsTrigger>
          <TabsTrigger value="account">{t("أستاذ حساب")}</TabsTrigger>
        </TabsList>
        <TabsContent value="product">
          <StockLedger mode="product" initialId={tab === "product" ? search.id : undefined} />
        </TabsContent>
        <TabsContent value="service">
          <ServiceStatement initialId={tab === "service" ? search.id : undefined} />
        </TabsContent>
        <TabsContent value="warehouse">
          <StockLedger mode="warehouse" initialId={tab === "warehouse" ? search.id : undefined} />
        </TabsContent>
        <TabsContent value="partner">
          <GlLedger mode="partner" initialId={tab === "partner" ? search.id : undefined} />
        </TabsContent>
        <TabsContent value="project">
          <GlLedger mode="project" initialId={tab === "project" ? search.id : undefined} />
        </TabsContent>
        <TabsContent value="account">
          <GlLedger mode="account" initialId={tab === "account" ? search.id : undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
