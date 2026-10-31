import { CashJournal } from "@/components/CashJournal";
import { CashSheet } from "@/components/CashSheet";
import { BalanceSettlements, BankReconciliation, CashCount } from "@/components/Settlements";
import { pageHead } from "@/lib/page-head";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { FxLog } from "@/components/FxLog";
import { FxRevaluationCard } from "@/components/FxRevaluationCard";
import { fmtNum } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBaseCurrency } from "@/lib/currencies";
import { postEntry } from "@/lib/post-entry";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/treasury")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    ...(typeof s["tab"] === "string" ? { tab: s["tab"] } : {}),
  }),
  head: () => pageHead("الخزينة ويومية الصندوق", "حركات النقد والمقبوضات والمدفوعات وتحويلات العملات في يوسف سوفت."),
  component: TreasuryPage,
});

type Acc = { id: string; code: string; name: string; currency: string };

function useCashAccounts() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["cash_accounts", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async (): Promise<Acc[]> =>
      ((await scope(db.from("accounts").select("id,code,name,currency").eq("is_group", false).like("code", "110%"), me?.tenantId).order("code")).data ?? []).filter(
        (a: Acc) => !a.name.includes("شيك"),
      ),
  });
}

async function latestRate(cur: string): Promise<string> {
  const { data } = await db.from("exchange_rates").select("rate_to_usd").eq("currency", cur).order("rate_date", { ascending: false }).limit(1);
  return data?.[0]?.rate_to_usd ? String(data[0].rate_to_usd) : "";
}

function AccSelect({ value, onChange, list }: { value: string; onChange: (v: string) => void; list: Acc[] }) {
  return (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— اختر —</option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>{a.code} - {a.name} ({a.currency})</option>
      ))}
    </select>
  );
}

function CashBalances() {
  const accs = useCashAccounts().data ?? [];
  const ids = accs.map((a) => a.id);
  const q = useQuery({
    queryKey: ["cash_balances", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await db.from("journal_lines").select("account_id,debit,credit").in("account_id", ids).range(0, 99999);
      const m = new Map<string, number>();
      for (const l of data ?? []) m.set(l.account_id, (m.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
      return m;
    },
  });
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50"><tr>
          <th className="border px-2 py-2 text-right">الرمز</th><th className="border px-2 py-2 text-right">الصندوق / المصرف</th>
          <th className="border px-2 py-2 text-right">العملة</th><th className="border px-2 py-2 text-right">الرصيد</th><th className="border px-2 py-2" />
        </tr></thead>
        <tbody>
          {accs.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">لا توجد صناديق أو مصارف</td></tr>}
          {accs.map((a) => (
            <tr key={a.id}>
              <td className="border px-2 py-1">{a.code}</td><td className="border px-2 py-1">{a.name}</td>
              <td className="border px-2 py-1">{a.currency}</td>
              <td className="num border px-2 py-1">{fmtNum(q.data?.get(a.id) ?? 0)}</td>
              <td className="border px-2 py-1"><Link to="/ledgers" className="text-primary underline">الحركات</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TreasuryPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const cashAccounts = useCashAccounts().data ?? [];
  const value = tab && ["balances", "sheet", "journal", "transfer", "settle", "fx", "count", "netting", "bank"].includes(tab) ? tab : tab === "exchange" ? "transfer" : "balances";
  return (
    <div>
      <PageHeader title="الخزينة والنقدية" subtitle="كل عملية تُنشئ قيداً محاسبياً تلقائياً" />
      <Tabs value={value} onValueChange={(v) => navigate({ to: "/treasury", search: { tab: v }, replace: true })}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="sheet">إدخال يومية الصندوق</TabsTrigger>
          <TabsTrigger value="journal">كشف يومية صندوق</TabsTrigger>
          <TabsTrigger value="balances">الصناديق والمصارف</TabsTrigger>
          <TabsTrigger value="transfer">التحويلات والمناقلات</TabsTrigger>
          <TabsTrigger value="settle">تسوية عملات زبون/مورد</TabsTrigger>
          <TabsTrigger value="fx">فروق الصرف والتقييم</TabsTrigger>
          <TabsTrigger value="count">جرد وتسوية الصندوق</TabsTrigger>
          <TabsTrigger value="netting">المقاصة وتسوية الكسور</TabsTrigger>
          <TabsTrigger value="bank">مطابقة كشف البنك</TabsTrigger>
        </TabsList>
        <TabsContent value="sheet"><CashSheet boxes={cashAccounts} /></TabsContent>
        <TabsContent value="journal"><CashJournal accounts={cashAccounts} /></TabsContent>
        <TabsContent value="balances"><CashBalances /></TabsContent>
        <TabsContent value="transfer">
          <div className="space-y-6">
            <section><h3 className="mb-2 font-semibold">صرف عملات</h3><ExchangeForm /></section>
            <section><h3 className="mb-2 font-semibold">مناقلة صناديق</h3><TransferForm /></section>
          </div>
        </TabsContent>
        <TabsContent value="settle"><SettleForm /></TabsContent>
        <TabsContent value="fx"><FxRevaluationCard editable /><FxLog /></TabsContent>
        <TabsContent value="count"><CashCount boxes={cashAccounts} /></TabsContent>
        <TabsContent value="netting"><BalanceSettlements /></TabsContent>
        <TabsContent value="bank"><BankReconciliation boxes={cashAccounts} /></TabsContent>
      </Tabs>
    </div>
  );
}

export function ExchangeForm() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const accs = useCashAccounts().data ?? [];
  const [f, setF] = useState({ date: today(), from: "", to: "", fromAmt: "", toAmt: "", rate: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const A = accs.find((a) => a.id === f.from);
  const B = accs.find((a) => a.id === f.to);
  const foreignCur = A && B ? (A.currency === base ? B.currency : A.currency) : "";
  function calc(next: typeof f) {
    const a = accs.find((x) => x.id === next.from);
    const r = Number(next.rate) || 0, amt = Number(next.fromAmt) || 0;
    if (a && r > 0 && amt > 0) next.toAmt = String(Math.round((a.currency === base ? amt * r : amt / r) * 100) / 100);
    return next;
  }
  async function pick(key: "from" | "to", id: string) {
    const next = { ...f, [key]: id };
    const a = accs.find((x) => x.id === next.from), b = accs.find((x) => x.id === next.to);
    if (a && b && a.currency !== b.currency) {
      const fc = a.currency === base ? b.currency : a.currency;
      const r = await latestRate(fc);
      if (r) next.rate = r;
    }
    setF(calc(next));
  }
  const fa = Number(f.fromAmt) || 0;
  const ta = Number(f.toAmt) || 0;
  const rate = fa && ta ? (A?.currency === base ? ta / fa : fa / ta) : 0;

  async function save() {
    if (!A || !B || fa <= 0 || ta <= 0) { toast.error("اختر الحسابين وأدخل المبلغين"); return; }
    if (A.currency === B.currency) { toast.error("العملتان متطابقتان — استخدم مناقلة الصناديق"); return; }
    if (A.currency !== base && B.currency !== base) { toast.error(`يجب أن يكون أحد الطرفين بالعملة الأساسية (${base})`); return; }
    const foreign = A.currency === base ? B : A;
    const foreignAmt = A.currency === base ? ta : fa;
    const baseAmt = A.currency === base ? fa : ta;
    setBusy(true);
    try {
      await postEntry(me!.tenantId!, me?.userId, {
        entry_date: f.date,
        description: f.notes || `صرف عملات: ${fa} ${A.currency} ← ${ta} ${B.currency}`,
        currency: foreign.currency,
        exchange_rate: foreignAmt / baseAmt,
      }, [
        { account_id: B.id, debit: foreignAmt, credit: 0, description: `صرف عملات ${ta} ${B.currency}` },
        { account_id: A.id, debit: 0, credit: foreignAmt, description: `صرف عملات ${fa} ${A.currency}` },
      ]);
      toast.success("تم تسجيل عملية الصرف");
      setF({ ...f, fromAmt: "", toAmt: "", notes: "" });
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div />
        <div className="space-y-1"><Label>من صندوق (يُصرف منه)</Label><AccSelect list={accs} value={f.from} onChange={(v) => pick("from", v)} /></div>
        <div className="space-y-1"><Label>المبلغ المصروف {A ? `(${A.currency})` : ""}</Label><Input type="number" value={f.fromAmt} onChange={(e) => setF(calc({ ...f, fromAmt: e.target.value }))} /></div>
        <div className="space-y-1"><Label>إلى صندوق (يُقبض فيه)</Label><AccSelect list={accs} value={f.to} onChange={(v) => pick("to", v)} /></div>
        <div className="space-y-1"><Label>المبلغ المقبوض {B ? `(${B.currency})` : ""}</Label><Input type="number" value={f.toAmt} onChange={(e) => setF({ ...f, toAmt: e.target.value })} /></div>
        <div className="space-y-1"><Label>سعر الصرف {foreignCur ? `(كم ${foreignCur} = 1 ${base})` : ""}</Label><Input type="number" value={f.rate} onChange={(e) => setF(calc({ ...f, rate: e.target.value }))} /></div>
      </div>
      {rate > 0 && <p className="text-sm text-muted-foreground">سعر الصرف الناتج: {rate.toFixed(4)} مقابل 1 {base}</p>}
      <div className="space-y-1"><Label>البيان</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "تسجيل الصرف"}</Button>
    </div>
  );
}

export function TransferForm() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const accs = useCashAccounts().data ?? [];
  const [f, setF] = useState({ date: today(), from: "", to: "", amount: "", rate: "1", notes: "" });
  const [busy, setBusy] = useState(false);
  const A = accs.find((a) => a.id === f.from);
  const B = accs.find((a) => a.id === f.to);
  const toList = A ? accs.filter((a) => a.currency === A.currency && a.id !== A.id) : accs;

  async function pickFrom(id: string) {
    const a = accs.find((x) => x.id === id);
    const r = a && a.currency !== base ? await latestRate(a.currency) : "1";
    setF((p) => ({ ...p, from: id, to: "", rate: r }));
  }

  async function save() {
    const amt = Number(f.amount) || 0;
    if (!A || !B || amt <= 0) { toast.error("اختر الصندوقين وأدخل المبلغ"); return; }
    const rate = A.currency === base ? 1 : Number(f.rate);
    if (A.currency !== base && !(rate > 0)) { toast.error(`أدخل سعر الصرف (كم ${A.currency} = 1 ${base})`); return; }
    setBusy(true);
    try {
      await postEntry(me!.tenantId!, me?.userId, {
        entry_date: f.date, description: f.notes || `مناقلة من ${A.name} إلى ${B.name}`, currency: A.currency, exchange_rate: rate,
      }, [
        { account_id: B.id, debit: amt, credit: 0, description: `مناقلة من ${A.name}` },
        { account_id: A.id, debit: 0, credit: amt, description: `مناقلة إلى ${B.name}` },
      ]);
      toast.success("تمت المناقلة");
      setF({ ...f, amount: "", notes: "" });
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="space-y-1"><Label>المبلغ {A ? `(${A.currency})` : ""}</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div className="space-y-1"><Label>من صندوق / بنك</Label><AccSelect list={accs} value={f.from} onChange={pickFrom} /></div>
        <div className="space-y-1"><Label>إلى صندوق / بنك (نفس العملة)</Label><AccSelect list={toList} value={f.to} onChange={(v) => setF({ ...f, to: v })} /></div>
        {A && A.currency !== base && (
          <div className="space-y-1"><Label>سعر الصرف (كم {A.currency} = 1 {base})</Label><Input type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></div>
        )}
      </div>
      <div className="space-y-1"><Label>البيان</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "تسجيل المناقلة"}</Button>
    </div>
  );
}

/**
 * Moves part of a partner's balance from one currency to another (e.g. a payment
 * in EUR settles a USD debt). Posts: entry in currency A (partner ↔ FX clearing),
 * entry in currency B (FX clearing ↔ partner), and closes any base-currency
 * difference left in the clearing account to FX gain/loss.
 */
export function SettleForm() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const { data: curs } = useQuery({
    queryKey: ["settle_curs", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const codes = new Set<string>([base]);
      ((await scope(db.from("accounts").select("currency").eq("is_group", false), me?.tenantId)).data ?? []).forEach((a: { currency: string }) => codes.add(a.currency));
      return [...codes];
    },
  });
  const { data: partners } = useQuery({
    queryKey: ["settle_partners", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => (await scope(db.from("partners").select("id,name,account_id,currency").eq("is_group", false), me?.tenantId).order("name")).data ?? [],
  });
  const [f, setF] = useState({ date: today(), partner: "", fromCur: "", fromAmt: "", fromRate: "", toCur: "", toAmt: "", toRate: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const rateOf = async (c: string) => (c === base ? "1" : await latestRate(c));
  function calc(n: typeof f) {
    const a = Number(n.fromAmt), ra = Number(n.fromRate), rb = Number(n.toRate);
    if (a > 0 && ra > 0 && rb > 0) n.toAmt = String(Math.round((a / ra) * rb * 100) / 100);
    return n;
  }
  async function pickCur(key: "fromCur" | "toCur", c: string) {
    const r = c ? await rateOf(c) : "";
    setF((p) => calc({ ...p, [key]: c, [key === "fromCur" ? "fromRate" : "toRate"]: r }));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const P = (partners ?? []).find((p: any) => p.id === f.partner);
  async function save() {
    const X = Number(f.fromAmt), Y = Number(f.toAmt), ra = Number(f.fromRate), rb = Number(f.toRate);
    if (!P || !P.account_id) { toast.error("اختر زبوناً/مورداً له حساب مرتبط"); return; }
    if (P.currency) { toast.error("هذه الجهة محددة بعملة واحدة — التسوية للجهات متعددة العملات فقط"); return; }
    if (!f.fromCur || !f.toCur || f.fromCur === f.toCur) { toast.error("اختر عملتين مختلفتين"); return; }
    if (!(X > 0 && Y > 0 && ra > 0 && rb > 0)) { toast.error("أدخل المبالغ وأسعار الصرف"); return; }
    const { data: ts } = await db.from("tenant_settings").select("fx_account_id,fx_gain_account_id,fx_loss_account_id").eq("tenant_id", me!.tenantId).maybeSingle();
    const clr = ts?.fx_account_id || ts?.fx_gain_account_id || ts?.fx_loss_account_id;
    if (!clr) { toast.error("حدد حساب فروق أسعار الصرف في الإعدادات أولاً"); return; }
    setBusy(true);
    try {
      const desc = f.notes || `تسوية عملات: ${X} ${f.fromCur} مقابل ${Y} ${f.toCur} - ${P.name}`;
      await postEntry(me!.tenantId!, me?.userId, { entry_date: f.date, description: desc, currency: f.fromCur, exchange_rate: ra }, [
        { account_id: P.account_id, partner_id: P.id, debit: X, credit: 0, description: desc },
        { account_id: clr, debit: 0, credit: X, description: desc },
      ]);
      await postEntry(me!.tenantId!, me?.userId, { entry_date: f.date, description: desc, currency: f.toCur, exchange_rate: rb }, [
        { account_id: clr, debit: Y, credit: 0, description: desc },
        { account_id: P.account_id, partner_id: P.id, debit: 0, credit: Y, description: desc },
      ]);
      // Base-currency residue in the clearing account = exchange gain (<0) or loss (>0).
      const diff = Math.round((Y / rb - X / ra) * 100) / 100;
      const target = diff > 0 ? ts?.fx_loss_account_id : ts?.fx_gain_account_id;
      if (diff !== 0 && target && target !== clr) {
        await postEntry(me!.tenantId!, me?.userId, { entry_date: f.date, description: `فرق صرف - ${desc}`, currency: base, exchange_rate: 1 }, diff > 0
          ? [{ account_id: target, debit: diff, credit: 0 }, { account_id: clr, debit: 0, credit: diff }]
          : [{ account_id: clr, debit: -diff, credit: 0 }, { account_id: target, debit: 0, credit: -diff }]);
      }
      toast.success(diff ? `تمت التسوية — فرق صرف ${Math.abs(diff)} ${base} ${diff > 0 ? "خسارة" : "ربح"}` : "تمت التسوية");
      setF({ ...f, fromAmt: "", toAmt: "", notes: "" });
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }
  const CurSel = ({ v, on }: { v: string; on: (c: string) => void }) => (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={v} onChange={(e) => on(e.target.value)}>
      <option value="">— اختر —</option>
      {(curs ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
  return (
    <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-5">
      <p className="text-sm text-muted-foreground">مثال: الزبون عليه دولار ودفع يورو — انقل رصيد اليورو ليسدد من دين الدولار. يُحسب فرق الصرف ويُرحّل تلقائياً.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="space-y-1"><Label>الزبون / المورد</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.partner} onChange={(e) => setF({ ...f, partner: e.target.value })}>
            <option value="">— اختر —</option>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(partners ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.currency ? ` (${p.currency} فقط)` : ""}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label>من رصيد عملة (المدفوعة)</Label><CurSel v={f.fromCur} on={(c) => pickCur("fromCur", c)} /></div>
        <div className="space-y-1"><Label>المبلغ {f.fromCur}</Label><Input type="number" value={f.fromAmt} onChange={(e) => setF(calc({ ...f, fromAmt: e.target.value }))} /></div>
        <div className="space-y-1"><Label>سعرها (كم {f.fromCur || "…"} = 1 {base})</Label><Input type="number" value={f.fromRate} onChange={(e) => setF(calc({ ...f, fromRate: e.target.value }))} /></div>
        <div />
        <div className="space-y-1"><Label>إلى رصيد عملة (الدين)</Label><CurSel v={f.toCur} on={(c) => pickCur("toCur", c)} /></div>
        <div className="space-y-1"><Label>المبلغ المُسدَّد {f.toCur}</Label><Input type="number" value={f.toAmt} onChange={(e) => setF({ ...f, toAmt: e.target.value })} /></div>
        <div className="space-y-1"><Label>سعرها (كم {f.toCur || "…"} = 1 {base})</Label><Input type="number" value={f.toRate} onChange={(e) => setF(calc({ ...f, toRate: e.target.value }))} /></div>
      </div>
      <div className="space-y-1"><Label>البيان</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "تسجيل التسوية"}</Button>
    </div>
  );
}
