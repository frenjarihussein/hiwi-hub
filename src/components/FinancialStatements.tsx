import { balanceSheetSide, effectiveSide, parenthesizedAmount } from "@/lib/ledger-display";
import { lineOriginal } from "@/lib/line-currency";
import { useBaseCurrency } from "@/lib/currencies";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum, isProfitLoss } from "@/lib/format";
import { printPage } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { closingResolver } from "@/lib/closing-path";

type Acc = { id: string; code: string; name: string; nature: string; currency?: string; parent_id: string | null; is_group: boolean; closing_account_id: string | null; closing_type: string | null; cash_flow_type?: string | null; balance_side?: string | null };
type Bal = Acc & { debit: number; credit: number; bal: number; fc?: number };
export type ClosingType = "operating" | "trading" | "profit_loss" | "pl_distribution" | "balance_sheet";
export const CLOSING_LABEL: Record<ClosingType, string> = {
  operating: "حساب التشغيل",
  trading: "حساب المتاجرة",
  profit_loss: "حساب الأرباح والخسائر",
  pl_distribution: "حساب توزيع الأرباح والخسائر",
  balance_sheet: "الميزانية",
};
/** Reporting currency chosen by the user: base amounts are multiplied by `rate` (units of `code` per 1 base unit). */
export type ReportFx = { code: string; symbol: string; rate: number; reval?: boolean; rates?: Record<string, number> };
export const ReportFxContext = createContext<ReportFx>({ code: "USD", symbol: "$", rate: 1 });
export const useFx = () => useContext(ReportFxContext);
const FxSym = () => <>{useFx().symbol}</>;
const ORDER: ClosingType[] = ["operating", "trading", "profit_loss", "pl_distribution", "balance_sheet"];

/** Balances (USD) per leaf account for the period, plus closing-account resolution and cash flow data. */
export function useStatementsData(from: string, to: string) {
  const { data: me } = useMe();
  const fx = useFx();
  const baseCur = useBaseCurrency();
  const mult = fx.rate > 0 ? fx.rate : 1;
  return useQuery({
    queryKey: ["fin_statements", me?.tenantId, baseCur, from, to, me?.isAuditor, mult, !!fx.reval, JSON.stringify(fx.rates ?? {})],
    enabled: !!me?.tenantId,
    refetchInterval: 5000,
    refetchOnWindowFocus: "always",
    staleTime: 0,
    queryFn: async () => {
      if (!me?.tenantId) throw new Error("اختر شركة لعرض الحسابات الختامية");
      const [a, l, s, b] = await Promise.all([
        scope(db.from("accounts").select("id,code,name,nature,currency,parent_id,is_group,closing_account_id,closing_type,cash_flow_type,balance_side"), me?.tenantId).order("code"),
        scope(db.from("journal_lines").select(`entry_id,account_id,debit,credit,line_currency,fc_amount,${me?.isAuditor ? "journal_entries!inner" : "journal_entries"}(entry_date,exchange_rate,currency,audited)`), me?.tenantId)
          .gte("journal_entries.entry_date", from).lte("journal_entries.entry_date", to),
        db.from("tenant_settings").select("cash_account_id,customers_account_id,suppliers_account_id,inventory_account_id,closing_account_links").eq("tenant_id", me.tenantId).maybeSingle(),
        scope(db.from("banks").select("account_id"), me?.tenantId),
      ]);
      if (a.error) throw a.error;
      if (l.error) throw l.error;
      const accounts = (a.data ?? []) as Acc[];
      const byId = new Map(accounts.map((x) => [x.id, x]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lines = ((l.data ?? []) as any[])
        .filter((x) => x.journal_entries && (!me?.isAuditor || x.journal_entries.audited))
        .map((x) => {
          const r = Number(x.journal_entries.exchange_rate) || 1;
          const o = lineOriginal(x, x.journal_entries.currency);
          return { entry: x.entry_id as string, account: x.account_id as string, cur: o.cur, od: Math.max(o.amount, 0), oc: Math.max(-o.amount, 0), d: (Number(x.debit) / r) * mult, c: (Number(x.credit) / r) * mult };
        });
      const bal = new Map<string, Bal>();
      lines.forEach((x) => {
        const acc = byId.get(x.account);
        if (!acc) return;
        const row = bal.get(acc.id) ?? { ...acc, debit: 0, credit: 0, bal: 0 };
        row.debit += x.d; row.credit += x.c; row.bal = row.debit - row.credit;
        if (acc.currency && acc.currency !== baseCur && x.cur === acc.currency) row.fc = (row.fc ?? 0) + x.od - x.oc;
        bal.set(acc.id, row);
      });
      // إعادة تقييم الحسابات النقدية بالعملة الأجنبية بسعر صرف نهاية الفترة وإظهار الفروقات.
      const fxDiffs: { code: string; name: string; diff: number }[] = [];
      if (fx.reval && fx.rates) {
        const agg = new Map<string, { orig: number; hist: number }>();
        lines.forEach((x) => {
          const acc = byId.get(x.account);
          // Any balance-sheet line recorded in a foreign currency is revalued (not only accounts flagged with that currency).
          if (!acc || !x.cur || x.cur === baseCur || isProfitLoss(acc.nature) || acc.nature === "closing") return;
          const key = `${acc.id}|${x.cur}`;
          const g = agg.get(key) ?? { orig: 0, hist: 0 };
          g.orig += x.od - x.oc; g.hist += x.d - x.c;
          agg.set(key, g);
        });
        let total = 0;
        agg.forEach((g, key) => {
          const [id = "", cur = ""] = key.split("|");
          const acc = byId.get(id)!;
          const r = fx.rates![cur];
          if (!r || r <= 0) return;
          const diff = (g.orig / r) * mult - g.hist;
          if (Math.abs(diff) < 0.005) return;
          const row = bal.get(id)!;
          if (diff > 0) row.debit += diff; else row.credit -= diff;
          row.bal = row.debit - row.credit;
          total += diff;
          fxDiffs.push({ code: acc.code, name: acc.name, diff });
        });
        if (Math.abs(total) >= 0.005) {
          const v: Bal = { id: "fx-reval", code: "FX", name: total > 0 ? "أرباح فروقات أسعار الصرف (إعادة تقييم)" : "خسائر فروقات أسعار الصرف (إعادة تقييم)", nature: total > 0 ? "revenues" : "expenses", parent_id: null, is_group: false, closing_account_id: null, closing_type: null, debit: total < 0 ? -total : 0, credit: total > 0 ? total : 0, bal: -total };
          bal.set(v.id, v);
        }
      }
      const isUnder = (id: string, root: string | null | undefined) => {
        if (!root) return false;
        let cur: Acc | undefined = byId.get(id);
        for (let i = 0; cur && i < 30; i++) { if (cur.id === root) return true; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
        return false;
      };
      const { closingOf, typeOf } = closingResolver(accounts, s.data?.closing_account_links ?? {});
      const st = s.data ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bankAccs = new Set(((b.data ?? []) as any[]).map((x) => x.account_id).filter(Boolean));
      const isCash = (id: string) => isUnder(id, st.cash_account_id) || bankAccs.has(id);
      return { accounts, byId, rows: [...bal.values()].sort((x, y) => x.code.localeCompare(y.code)), closingOf, typeOf, lines, isCash, isUnder, settings: st, fxDiffs };
    },
  });
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="print-area rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button size="sm" className="no-print" onClick={printPage}><Printer className="size-4" />طباعة</Button>
      </div>
      {children}
    </div>
  );
}

function Section({ title, rows, sign, total, totalLabel }: { title: string; rows: { code: string; name: string; v: number }[]; sign?: 1 | -1; total?: number; totalLabel?: string }) {
  const sum = total ?? rows.reduce((s, r) => s + r.v * (sign ?? 1), 0);
  return (
    <div className="mb-4">
      <h3 className="mb-1 font-semibold">{title}</h3>
      <table className="w-full border text-sm">
        <tbody>
          {rows.length === 0 && <tr><td className="border px-2 py-2 text-muted-foreground" colSpan={2}>لا توجد أرصدة</td></tr>}
          {rows.map((r) => (
            <tr key={r.code + r.name}><td className="border px-2 py-1.5">{r.code} {r.name}</td><td className="num w-40 border px-2 py-1.5 text-left">{fmtNum(r.v * (sign ?? 1))}</td></tr>
          ))}
        </tbody>
        <tfoot className="bg-muted font-bold"><tr><td className="border px-2 py-1.5">{totalLabel ?? `مجموع ${title}`}</td><td className="num border px-2 py-1.5 text-left">{fmtNum(sum)}</td></tr></tfoot>
      </table>
    </div>
  );
}

/** Hierarchy level: 1 = leaf accounts only, n = leaves plus n-1 parent levels, 0 = up to the top. */
type HierItem = { id: string; code: string; name: string; v: number; fc?: number | undefined; cur?: string | null | undefined };
type HierRow = { kind: "leaf" | "head" | "sub"; depth: number; id: string; code: string; name: string; v: number; fc?: number | undefined; cur?: string | null | undefined };
export function buildHier(items: HierItem[], byId: Map<string, Acc>, level: number): HierRow[] {
  if (level === 1) return items.map((i) => ({ kind: "leaf", depth: 0, ...i }));
  const up = level === 0 ? 50 : level - 1;
  type Node = { id: string; code: string; name: string; children: Node[]; leaf?: HierItem; total: number };
  const nodes = new Map<string, Node>();
  const roots: Node[] = [];
  const attach = (n: Node, parentId: string | null) => {
    if (!parentId) { roots.push(n); return; }
    const p = nodes.get(parentId)!; p.children.push(n);
  };
  items.forEach((it) => {
    const chain: Acc[] = [];
    let cur = byId.get(it.id)?.parent_id ? byId.get(byId.get(it.id)!.parent_id!) : undefined;
    while (cur && chain.length < up) { chain.push(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    // create ancestors top-down
    let parentId: string | null = null;
    for (let k = chain.length - 1; k >= 0; k--) {
      const a = chain[k]!;
      if (!nodes.has(a.id)) { const n: Node = { id: a.id, code: a.code, name: a.name, children: [], total: 0 }; nodes.set(a.id, n); attach(n, parentId); }
      nodes.get(a.id)!.total += it.v;
      parentId = a.id;
    }
    attach({ id: it.id, code: it.code, name: it.name, children: [], leaf: it, total: it.v }, parentId);
  });
  const out: HierRow[] = [];
  const sortN = (a: Node, b: Node) => a.code.localeCompare(b.code);
  const walk = (n: Node, depth: number) => {
    if (n.leaf) { out.push({ kind: "leaf", depth, ...n.leaf }); return; }
    out.push({ kind: "head", depth, id: n.id, code: n.code, name: n.name, v: n.total });
    [...n.children].sort(sortN).forEach((c) => walk(c, depth + 1));
    out.push({ kind: "sub", depth, id: n.id, code: n.code, name: n.name, v: n.total });
  };
  [...roots].sort(sortN).forEach((r) => walk(r, 0));
  return out;
}

export function LevelSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="no-print flex items-center gap-2 text-sm">
      <span className="font-medium">مستوى التجميع:</span>
      <select className="h-9 rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={1}>1 — الحسابات الفرعية فقط</option>
        <option value={2}>2 — مع الحساب الأب</option>
        <option value={3}>3 — مع المستوى الأعلى</option>
        <option value={4}>4 — مستوى رابع</option>
        <option value={0}>كل المستويات حتى القمة</option>
      </select>
    </label>
  );
}

const rowCls = (r: HierRow) => r.kind === "head" ? "bg-secondary/60 font-semibold" : r.kind === "sub" ? "bg-muted font-bold" : "";
const rowLabel = (r: HierRow) => (r.kind === "sub" ? `مجموع ${r.code} ${r.name}` : `${r.code} ${r.name}`);

/** Debit/credit hierarchical table for closing accounts other than the balance sheet. */
function DcTable({ rows, carryIn }: { rows: HierRow[]; carryIn: number }) {
  return (
    <table className="w-full border text-sm">
      <thead className="bg-muted"><tr><th className="border px-2 py-1 text-right">الحساب</th><th className="border px-2 py-1 text-right">مدين (منه)</th><th className="border px-2 py-1 text-right">دائن (له)</th></tr></thead>
      <tbody>
        {rows.length === 0 && carryIn === 0 && <tr><td colSpan={3} className="border px-2 py-2 text-muted-foreground">لا توجد أرصدة مرتبطة بهذا الحساب في الفترة</td></tr>}
        {carryIn !== 0 && <tr className="italic"><td className="border px-2 py-1">رصيد منقول من المرحلة السابقة</td><td className="num border px-2 py-1">{carryIn < 0 ? fmtNum(-carryIn) : ""}</td><td className="num border px-2 py-1">{carryIn > 0 ? fmtNum(carryIn) : ""}</td></tr>}
        {rows.map((r, i) => (
          <tr key={i} className={rowCls(r)}>
            <td className="border px-2 py-1" style={{ paddingInlineStart: 8 + r.depth * 16 }}>{rowLabel(r)}</td>
            <td className="num border px-2 py-1">{r.kind !== "head" && r.v > 0 ? fmtNum(r.v) : ""}</td>
            <td className="num border px-2 py-1">{r.kind !== "head" && r.v < 0 ? fmtNum(-r.v) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One side of the balance sheet: amount + currency symbol, and the foreign balance of foreign-currency leaves. */
function SideTable({ title, rows, total }: { title: string; rows: HierRow[]; total: number }) {
  return (
    <div>
      <h3 className="mb-1 rounded bg-secondary px-3 py-2 font-semibold">{title}</h3>
      <table className="w-full border text-sm">
        <thead className="bg-muted"><tr><th className="border px-2 py-1 text-right">الحساب</th><th className="border px-2 py-1 text-right">المبلغ</th><th className="border px-2 py-1 text-right">الرصيد بالعملة الأجنبية</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="border px-2 py-2 text-muted-foreground">لا توجد أرصدة</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} className={rowCls(r)}>
              <td className="border px-2 py-1" style={{ paddingInlineStart: 8 + r.depth * 16 }}>{rowLabel(r)}</td>
              <td className="num border px-2 py-1">{r.kind !== "head" ? <>{parenthesizedAmount(r.v)} <FxSym /></> : ""}</td>
              <td className="num border px-2 py-1 text-xs">{r.kind === "leaf" && r.fc !== undefined && r.cur ? `${parenthesizedAmount(r.fc)} ${r.cur}` : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted font-bold"><tr><td className="border px-2 py-1">مجموع {title}</td><td className="num border px-2 py-1">{parenthesizedAmount(total)} <FxSym /></td><td className="border" /></tr></tfoot>
      </table>
    </div>
  );
}

/** Balance sheet in two sides: assets (debit) and liabilities/equity (credit). */
function BalanceSides({ items, byId, level, extraCredit }: { items: Bal[]; byId: Map<string, Acc>; level: number; extraCredit?: { name: string; v: number } | undefined }) {
  const toItem = (r: Bal, sign: 1 | -1): HierItem => ({ id: r.id, code: r.code, name: r.name, v: r.bal * sign, fc: r.fc === undefined ? undefined : r.fc * sign, cur: r.currency });
  const sideOf = (r: Bal) => balanceSheetSide(r.nature, r.bal, effectiveSide(byId.get(r.id), byId)).side;
  const debit = items.filter((r) => sideOf(r) === "debit").map((r) => toItem(r, 1));
  const credit = items.filter((r) => sideOf(r) === "credit").map((r) => toItem(r, -1));
  const dRows = buildHier(debit, byId, level);
  const cRows = buildHier(credit, byId, level);
  if (extraCredit && Math.abs(extraCredit.v) > 1e-9) cRows.push({ kind: "leaf", depth: 0, id: "pl", code: "", name: extraCredit.name, v: extraCredit.v });
  const td = debit.reduce((s, r) => s + r.v, 0);
  const tc = credit.reduce((s, r) => s + r.v, 0) + (extraCredit?.v ?? 0);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <SideTable title="الموجودات" rows={dRows} total={td} />
        <SideTable title="المطاليب وحقوق الملكية" rows={cRows} total={tc} />
      </div>
      <p className={`mt-3 rounded-lg border p-3 font-bold ${Math.abs(td - tc) < 0.01 ? "" : "text-destructive"}`}>
        مجموع الموجودات <span className="num">{parenthesizedAmount(td)}</span> <FxSym /> — مجموع المطاليب <span className="num">{parenthesizedAmount(tc)}</span> <FxSym />
      </p>
    </>
  );
}

const ResultLine = ({ label, v }: { label: string; v: number }) => (
  <p className="mb-4 rounded-lg border bg-muted/50 p-3 font-bold">{label}: <span className="num">{fmtNum(Math.abs(v))}</span> <FxSym /> ({v >= 0 ? "ربح / فائض" : "خسارة / عجز"})</p>
);

/** الحسابات الختامية: تشغيل ← متاجرة ← أرباح وخسائر ← توزيع ← ميزانية. Several closing accounts per type are supported. */
export function FinalAccounts({ from, to }: { from: string; to: string }) {
  const q = useStatementsData(from, to);
  const [pick, setPick] = useState("all");
  const [level, setLevel] = useState(1);
  if (!q.data) return <Shell title="الحسابات الختامية"><p className="text-muted-foreground">{q.isError ? (q.error as Error).message : "جارٍ التحميل..."}</p></Shell>;
  const { rows, closingOf, byId, accounts, typeOf } = q.data;
  const groups = new Map<string, { key: string; type: ClosingType; name: string; items: Bal[] }>();
  // Every defined closing account appears, even with no balances yet.
  accounts.filter((a) => a.nature === "closing" && !a.is_group).forEach((a) => groups.set(a.id, { key: a.id, type: typeOf(a), name: `${a.code} - ${a.name}`, items: [] }));
  rows.filter((r) => !r.is_group && r.nature !== "closing" && Math.abs(r.bal) > 1e-9).forEach((r) => {
    const c = closingOf(r);
    const key = c.closingId ?? `default-${c.type}`;
    const g = groups.get(key) ?? { key, type: c.type, name: c.closingId ? `${byId.get(c.closingId)!.code} - ${byId.get(c.closingId)!.name}` : CLOSING_LABEL[c.type], items: [] };
    g.items.push(r);
    groups.set(key, g);
  });
  // Consolidated balance sheets: a balance-sheet closing account also shows every sub balance sheet closed into it (recursively).
  const subsOf = new Map<string, string[]>();
  accounts.filter((a) => a.nature === "closing" && !a.is_group && a.closing_account_id && a.closing_account_id !== a.id).forEach((a) => {
    const l = subsOf.get(a.closing_account_id!) ?? []; l.push(a.id); subsOf.set(a.closing_account_id!, l);
  });
  const consolidated = new Map<string, { items: Bal[]; subs: string[] }>();
  for (const g of groups.values()) {
    if (g.type !== "balance_sheet" || !subsOf.has(g.key)) continue;
    const items = [...g.items]; const subs: string[] = []; const seen = new Set([g.key]); const stack = [...(subsOf.get(g.key) ?? [])];
    while (stack.length) {
      const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id);
      const sg = groups.get(id);
      if (sg?.type === "balance_sheet") { items.push(...sg.items); subs.push(sg.name); }
      stack.push(...(subsOf.get(id) ?? []));
    }
    if (subs.length) consolidated.set(g.key, { items, subs });
  }
  for (const [k, c] of consolidated) { const g = groups.get(k)!; g.items = c.items; g.name = `${g.name} — ميزانية تجميعية`; }
  let carry = 0; // credit-positive result carried to the next stage
  const allBlocks = ORDER.flatMap((t) => {
    const gs = [...groups.values()].filter((g) => g.type === t);
    if (t === "balance_sheet") return gs.map((g) => ({ g, carryIn: 0, result: 0 }));
    const out = gs.map((g) => {
      const result = g.items.reduce((s, r) => s - r.bal, 0);
      return { g, carryIn: 0, result };
    });
    const stageTotal = out.reduce((s, o) => s + o.result, 0) + carry;
    if (out.length) { out[0]!.carryIn = carry; }
    carry = stageTotal;
    return out.map((o, i) => ({ ...o, stageTotal: i === out.length - 1 ? stageTotal : undefined }));
  });
  const blocks = pick === "all" ? allBlocks : allBlocks.filter((b) => b.g.key === pick);
  return (
    <Shell title="الحسابات الختامية">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">الحساب الختامي:</span>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="all">كل الحسابات الختامية</option>
          {allBlocks.map((b) => <option key={b.g.key} value={b.g.key}>{b.g.name} ({CLOSING_LABEL[b.g.type]})</option>)}
        </select>
        <LevelSelect value={level} onChange={setLevel} />
      </div>
      {blocks.length === 0 && <p className="text-muted-foreground">لا توجد أرصدة في الفترة</p>}
      <FxDiffs items={q.data.fxDiffs} />
      {blocks.map(({ g, carryIn, result, ...rest }, i) => {
        const stageTotal = (rest as { stageTotal?: number }).stageTotal;
        return (
          <div key={i} className="mb-6">
            <h3 className="mb-2 rounded bg-secondary px-3 py-2 font-semibold">{g.name} <span className="text-xs text-muted-foreground">({CLOSING_LABEL[g.type]})</span></h3>
            {g.type === "balance_sheet"
              ? <BalanceSides items={g.items} byId={byId} level={level} extraCredit={carry ? { name: "نتيجة الفترة المنقولة", v: carry } : undefined} />
              : <DcTable rows={buildHier(g.items.map((r) => ({ id: r.id, code: r.code, name: r.name, v: r.bal })), byId, level)} carryIn={carryIn} />}
            {g.type !== "balance_sheet" && stageTotal !== undefined && (
              <p className="mt-2 font-bold">
                نتيجة {CLOSING_LABEL[g.type]}: <span className="num">{fmtNum(Math.abs(stageTotal))}</span> <FxSym /> {stageTotal >= 0 ? "(فائض/ربح)" : "(عجز/خسارة/تكلفة)"} {g.type !== "pl_distribution" && "— تُنقل للمرحلة التالية"}
              </p>
            )}
            {g.type !== "balance_sheet" && stageTotal === undefined && <p className="mt-1 text-xs text-muted-foreground">نتيجة هذا الحساب: {fmtNum(result)}</p>}
          </div>
        );
      })}
    </Shell>
  );
}

export function IncomeStatement({ from, to }: { from: string; to: string }) {
  const q = useStatementsData(from, to);
  // Accounts belong to the income statement when their closing path does not end in the balance sheet.
  const rows = (q.data?.rows ?? []).filter((r) => !r.is_group && r.nature !== "closing" && Math.abs(r.bal) > 1e-9 && q.data!.closingOf(r).type !== "balance_sheet");
  const rev = rows.filter((r) => r.bal < 0).map((r) => ({ code: r.code, name: r.name, v: -r.bal }));
  const exp = rows.filter((r) => r.bal >= 0).map((r) => ({ code: r.code, name: r.name, v: r.bal }));
  const tr = rev.reduce((s, r) => s + r.v, 0), te = exp.reduce((s, r) => s + r.v, 0);
  return (
    <Shell title="قائمة الدخل">
      <Section title="الإيرادات" rows={rev} />
      <Section title="المصاريف والتكاليف" rows={exp} />
      <ResultLine label="صافي الدخل" v={tr - te} />
    </Shell>
  );
}

export function FinancialPosition({ from, to }: { from: string; to: string }) {
  const q = useStatementsData(from, to);
  const [level, setLevel] = useState(1);
  if (!q.data) return <Shell title="الميزانية (المركز المالي)"><p className="text-muted-foreground">{q.isError ? (q.error as Error).message : "جارٍ التحميل..."}</p></Shell>;
  const leaves = q.data.rows.filter((r) => !r.is_group && r.nature !== "closing" && Math.abs(r.bal) > 1e-9);
  const inBs = (r: Bal) => q.data!.closingOf(r).type === "balance_sheet";
  const rows = leaves.filter(inBs);
  const pl = leaves.filter((r) => !inBs(r)).reduce((s, r) => s - r.bal, 0);
  return (
    <Shell title="الميزانية (المركز المالي)">
      <div className="mb-3"><LevelSelect value={level} onChange={setLevel} /></div>
      <BalanceSides items={rows} byId={q.data.byId} level={level} extraCredit={{ name: "صافي ربح (خسارة) الفترة", v: pl }} />
    </Shell>
  );
}

export function ManufacturingCostStatement({ from, to }: { from: string; to: string }) {
  const q = useStatementsData(from, to);
  const rows = (q.data?.rows ?? []).filter((r) => !r.is_group && Math.abs(r.bal) > 1e-9 && q.data!.closingOf(r).type === "operating");
  const items = rows.map((r) => ({ code: r.code, name: r.name, v: r.bal }));
  return (
    <Shell title="قائمة التكاليف الصناعية">
      <p className="mb-3 text-sm text-muted-foreground">تضم الحسابات المرتبطة بحساب ختامي من نوع «حساب التشغيل» (مواد أولية، أجور مباشرة، مصاريف صناعية).</p>
      <Section title="عناصر التكلفة" rows={items} totalLabel="تكلفة الإنتاج التام" />
    </Shell>
  );
}

export function CashFlowStatement({ from, to }: { from: string; to: string }) {
  const q = useStatementsData(from, to);
  if (!q.data) return <Shell title="قائمة التدفقات النقدية"><p className="text-muted-foreground">جارٍ التحميل...</p></Shell>;
  const { lines, isCash, byId, isUnder, settings } = q.data;
  const byEntry = new Map<string, typeof lines>();
  lines.forEach((l) => { const a = byEntry.get(l.entry) ?? []; a.push(l); byEntry.set(l.entry, a); });
  const buckets = { operating: new Map<string, number>(), investing: new Map<string, number>(), financing: new Map<string, number>() };
  const classify = (id: string): keyof typeof buckets => {
    // 1) explicit activity on the account or any ancestor
    let cur = byId.get(id);
    for (let i = 0; cur && i < 30; i++) {
      const t = cur.cash_flow_type;
      if (t === "operating" || t === "investing" || t === "financing") return t;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    const a = byId.get(id);
    if (!a) return "operating";
    if (isProfitLoss(a.nature)) return "operating";
    if ([settings.customers_account_id, settings.suppliers_account_id, settings.inventory_account_id].some((r) => isUnder(id, r))) return "operating";
    if (a.nature === "equity") return "financing";
    if (a.nature === "liabilities") return /قرض|قروض|تمويل|loan/i.test(a.name) ? "financing" : "operating";
    if (a.nature === "assets") return /ثابت|أصول ثابتة|معدات|آلات|سيارات|مباني|أراضي|أثاث|استثمار|مشاريع تحت التنفيذ/i.test(a.name) ? "investing" : "operating";
    return "operating";
  };
  byEntry.forEach((ls) => {
    const cashNet = ls.filter((l) => isCash(l.account)).reduce((s, l) => s + l.d - l.c, 0);
    if (Math.abs(cashNet) < 1e-9) return;
    const others = ls.filter((l) => !isCash(l.account));
    const weight = others.reduce((s, l) => s + (l.c - l.d), 0);
    others.forEach((l) => {
      const share = weight ? ((l.c - l.d) / weight) * cashNet : 0;
      const a = byId.get(l.account);
      const key = a ? `${a.code} ${a.name}` : "—";
      const b = buckets[classify(l.account)];
      b.set(key, (b.get(key) ?? 0) + share);
    });
  });
  const toRows = (m: Map<string, number>) => [...m.entries()].filter(([, v]) => Math.abs(v) > 1e-9).map(([k, v]) => ({ code: "", name: k, v }));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const net = sum(buckets.operating) + sum(buckets.investing) + sum(buckets.financing);
  return (
    <Shell title="قائمة التدفقات النقدية">
      <Section title="التدفقات من الأنشطة التشغيلية" rows={toRows(buckets.operating)} totalLabel="صافي التدفق التشغيلي" />
      <Section title="التدفقات من الأنشطة الاستثمارية" rows={toRows(buckets.investing)} totalLabel="صافي التدفق الاستثماري" />
      <Section title="التدفقات من الأنشطة التمويلية" rows={toRows(buckets.financing)} totalLabel="صافي التدفق التمويلي" />
      <ResultLine label="صافي التغير في النقدية" v={net} />
      <CashBalances from={from} to={to} net={net} />
    </Shell>
  );
}

/** جدول فروقات إعادة التقييم لكل حساب بعملة أجنبية. */
export function FxDiffs({ items }: { items: { code: string; name: string; diff: number }[] }) {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.diff, 0);
  return (
    <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <h3 className="mb-2 font-semibold">فروقات أسعار الصرف (إعادة التقييم بسعر نهاية الفترة)</h3>
      <table className="w-full border text-sm">
        <thead className="bg-muted"><tr><th className="border px-2 py-1 text-right">الحساب</th><th className="border px-2 py-1 text-right">ربح فرق</th><th className="border px-2 py-1 text-right">خسارة فرق</th></tr></thead>
        <tbody>{items.map((i) => <tr key={i.code}><td className="border px-2 py-1">{i.code} {i.name}</td><td className="num border px-2 py-1">{i.diff > 0 ? fmtNum(i.diff) : ""}</td><td className="num border px-2 py-1">{i.diff < 0 ? fmtNum(-i.diff) : ""}</td></tr>)}</tbody>
        <tfoot className="bg-muted font-bold"><tr><td className="border px-2 py-1">صافي الفرق</td><td className="num border px-2 py-1" colSpan={2}>{fmtNum(Math.abs(total))} {total >= 0 ? "ربح" : "خسارة"}</td></tr></tfoot>
      </table>
    </div>
  );
}

/** النقدية أول وآخر الفترة (رصيد الصندوق والبنوك قبل بداية الفترة + صافي التغير). */
function CashBalances({ from, to, net }: { from: string; to: string; net: number }) {
  const all = useStatementsData("1900-01-01", to);
  if (!all.data) return null;
  const { lines, isCash } = all.data;
  void from;
  const closing = lines.filter((l) => isCash(l.account)).reduce((s, l) => s + l.d - l.c, 0);
  const opening = closing - net;
  return (
    <>
      <ResultLine label="النقدية أول الفترة" v={opening} />
      <ResultLine label="النقدية آخر الفترة" v={closing} />
    </>
  );
}
