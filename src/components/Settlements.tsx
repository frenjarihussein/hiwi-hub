import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtNum, today } from "@/lib/format";
import { post2, rateFor } from "@/lib/auto-entries";
import { useBaseCurrency } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Acc = { id: string; code: string; name: string; currency: string };

const DENOMS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01];

function useLeafAccounts() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["leaf_accounts", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async (): Promise<Acc[]> =>
      (await scope(db.from("accounts").select("id,code,name,currency").eq("is_group", false), me?.tenantId).order("code")).data ?? [],
  });
}

async function balancesOf(ids: string[]) {
  const m = new Map<string, number>();
  if (!ids.length) return m;
  const { data } = await db.from("journal_lines").select("account_id,debit,credit").in("account_id", ids).range(0, 99999);
  for (const l of data ?? []) m.set(l.account_id, (m.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
  return m;
}

function Sel({ value, onChange, list }: { value: string; onChange: (v: string) => void; list: Acc[] }) {
  return (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— اختر —</option>
      {list.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name} ({a.currency})</option>)}
    </select>
  );
}

/** Physical cash count by denomination vs book balance, posting shortage/surplus. */
export function CashCount({ boxes }: { boxes: Acc[] }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const baseCur = useBaseCurrency();
  const all = useLeafAccounts().data ?? [];
  const [box, setBox] = useState("");
  const [date, setDate] = useState(today());
  const [cnt, setCnt] = useState<Record<string, string>>({});
  const [shortAcc, setShortAcc] = useState("");
  const [surAcc, setSurAcc] = useState("");
  const bal = useQuery({ queryKey: ["cash_count_bal", box], enabled: !!box, queryFn: async () => (await balancesOf([box])).get(box) ?? 0 });
  const counted = useMemo(() => Math.round(DENOMS.reduce((t, d) => t + d * (Number(cnt[d]) || 0), 0) * 100) / 100, [cnt]);
  const book = bal.data ?? 0;
  const diff = Math.round((counted - book) * 100) / 100;
  const acc = boxes.find((b) => b.id === box);

  const post = useMutation({
    mutationFn: async () => {
      if (!box) throw new Error("اختر الصندوق");
      if (!diff) throw new Error("لا يوجد فرق — الصندوق مطابق");
      const cur = acc?.currency ?? baseCur ?? "USD";
      const rate = await rateFor(cur, baseCur);
      if (diff < 0) {
        if (!shortAcc) throw new Error("اختر حساب عجز الصندوق");
        await post2(me!.tenantId!, me?.userId, date, `عجز جرد صندوق ${acc?.name ?? ""}`, cur, rate, shortAcc, box, -diff);
      } else {
        if (!surAcc) throw new Error("اختر حساب زيادة الصندوق");
        await post2(me!.tenantId!, me?.userId, date, `زيادة جرد صندوق ${acc?.name ?? ""}`, cur, rate, box, surAcc, diff);
      }
    },
    onSuccess: () => { toast.success("تم ترحيل قيد تسوية الصندوق"); setCnt({}); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div><Label>الصندوق</Label><Sel value={box} onChange={setBox} list={boxes} /></div>
        <div><Label>تاريخ الجرد</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>حساب عجز الصندوق (مدين)</Label><Sel value={shortAcc} onChange={setShortAcc} list={all} /></div>
        <div><Label>حساب زيادة الصندوق (دائن)</Label><Sel value={surAcc} onChange={setSurAcc} list={all} /></div>
      </div>
      <table className="w-full max-w-xl text-sm">
        <thead className="bg-secondary"><tr><th className="p-2 text-right">الفئة</th><th className="p-2 text-right">العدد</th><th className="p-2 text-right">المبلغ</th></tr></thead>
        <tbody>
          {DENOMS.map((d) => (
            <tr key={d} className="border-t">
              <td className="num p-1">{fmtNum(d)}</td>
              <td className="p-1"><Input type="number" min={0} className="h-8 w-28" value={cnt[d] ?? ""} onChange={(e) => setCnt({ ...cnt, [d]: e.target.value })} /></td>
              <td className="num p-1">{fmtNum(d * (Number(cnt[d]) || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-6 text-sm">
        <span>الرصيد الدفتري: <b className="num">{fmtNum(book)}</b></span>
        <span>المعدود فعلياً: <b className="num">{fmtNum(counted)}</b></span>
        <span className={diff < 0 ? "text-destructive" : ""}>الفرق: <b className="num">{fmtNum(diff)}</b> {diff < 0 ? "(عجز)" : diff > 0 ? "(زيادة)" : "(مطابق)"}</span>
      </div>
      {can(me, "journal", "create") && <Button onClick={() => post.mutate()} disabled={!box || !diff || post.isPending}>ترحيل قيد التسوية</Button>}
    </div>
  );
}

/** Customer/supplier offset and small-balance (rounding) write-off. */
export function BalanceSettlements() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const baseCur = useBaseCurrency();
  const all = useLeafAccounts().data ?? [];
  const [date, setDate] = useState(today());
  const [a, setA] = useState(""), [b, setB] = useState(""), [amt, setAmt] = useState("");
  const [limit, setLimit] = useState("1");
  const [roundAcc, setRoundAcc] = useState("");
  const bals = useQuery({ queryKey: ["settle_bals", all.length], enabled: all.length > 0, queryFn: () => balancesOf(all.map((x) => x.id)) });
  const ba = bals.data?.get(a) ?? 0, bb = bals.data?.get(b) ?? 0;
  const small = all.filter((x) => { const v = bals.data?.get(x.id) ?? 0; return Math.abs(v) > 1e-9 && Math.abs(v) < (Number(limit) || 0) && x.id !== roundAcc; });

  const offset = useMutation({
    mutationFn: async () => {
      const v = Number(amt);
      if (!a || !b || a === b || !(v > 0)) throw new Error("اختر حساب الزبون وحساب المورد والمبلغ");
      const cur = all.find((x) => x.id === a)?.currency ?? baseCur ?? "USD";
      // Customer (debit balance) is credited, supplier (credit balance) is debited.
      await post2(me!.tenantId!, me?.userId, date, "مقاصة ذمم زبون/مورد", cur, await rateFor(cur, baseCur), b, a, v);
    },
    onSuccess: () => { toast.success("تم ترحيل قيد المقاصة"); setAmt(""); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const writeOff = useMutation({
    mutationFn: async () => {
      if (!roundAcc) throw new Error("اختر حساب فروقات الكسور");
      if (!small.length) throw new Error("لا توجد أرصدة صغيرة");
      for (const x of small) {
        const v = Math.round((bals.data?.get(x.id) ?? 0) * 100) / 100;
        if (!v) continue;
        const rate = await rateFor(x.currency, baseCur);
        if (v > 0) await post2(me!.tenantId!, me?.userId, date, `تسوية كسور ${x.name}`, x.currency, rate, roundAcc, x.id, v);
        else await post2(me!.tenantId!, me?.userId, date, `تسوية كسور ${x.name}`, x.currency, rate, x.id, roundAcc, -v);
      }
      return small.length;
    },
    onSuccess: (n) => { toast.success(`تمت تسوية ${n} حساب`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const allowed = can(me, "journal", "create");
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="font-semibold">مقاصة بين عميل هو مورد في نفس الوقت</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <div><Label>حساب الزبون (رصيد {fmtNum(ba)})</Label><Sel value={a} onChange={setA} list={all} /></div>
          <div><Label>حساب المورد (رصيد {fmtNum(bb)})</Label><Sel value={b} onChange={setB} list={all} /></div>
          <div><Label>المبلغ</Label><Input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={fmtNum(Math.min(Math.abs(ba), Math.abs(bb)))} /></div>
          <div><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        {allowed && <Button onClick={() => offset.mutate()} disabled={offset.isPending}>ترحيل المقاصة</Button>}
      </div>
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="font-semibold">تسوية الكسور والأرصدة الصغيرة المعلقة</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>تسوية كل رصيد أقل من</Label><Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
          <div><Label>حساب فروقات الكسور</Label><Sel value={roundAcc} onChange={setRoundAcc} list={all} /></div>
        </div>
        <ul className="max-h-60 divide-y overflow-auto text-sm">
          {small.map((x) => <li key={x.id} className="flex justify-between py-1"><span>{x.code} - {x.name}</span><span className="num">{fmtNum(bals.data?.get(x.id) ?? 0)}</span></li>)}
          {!small.length && <li className="py-2 text-muted-foreground">لا توجد أرصدة صغيرة</li>}
        </ul>
        {allowed && <Button onClick={() => writeOff.mutate()} disabled={writeOff.isPending || !small.length}>إقفال الأرصدة الصغيرة</Button>}
      </div>
    </div>
  );
}

/** Bank reconciliation: tick ledger lines that appear on the bank statement, compare balances. */
export function BankReconciliation({ boxes }: { boxes: Acc[] }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [acc, setAcc] = useState("");
  const [stDate, setStDate] = useState(today());
  const [stBal, setStBal] = useState("");
  const [paste, setPaste] = useState("");
  const lines = useQuery({
    queryKey: ["bank_recon", acc],
    enabled: !!acc,
    queryFn: async () => {
      const [{ data: jl }, { data: marks }] = await Promise.all([
        db.from("journal_lines").select("id,debit,credit,description,journal_entries(entry_no,entry_date,description)").eq("account_id", acc).range(0, 9999),
        db.from("bank_recon_marks").select("journal_line_id,statement_date").eq("account_id", acc).range(0, 99999),
      ]);
      const m = new Map((marks ?? []).map((x: any) => [x.journal_line_id, x.statement_date]));
      return ((jl ?? []) as any[])
        .map((l) => ({ id: l.id, amt: Number(l.debit) - Number(l.credit), date: l.journal_entries?.entry_date ?? "", no: l.journal_entries?.entry_no, desc: l.description || l.journal_entries?.description || "", cleared: m.get(l.id) as string | undefined }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  });
  const rows = lines.data ?? [];
  const book = rows.reduce((t, r) => t + r.amt, 0);
  const cleared = rows.filter((r) => r.cleared).reduce((t, r) => t + r.amt, 0);
  const pendDep = rows.filter((r) => !r.cleared && r.amt > 0).reduce((t, r) => t + r.amt, 0);
  const pendWd = rows.filter((r) => !r.cleared && r.amt < 0).reduce((t, r) => t - r.amt, 0);
  const diff = Math.round(((Number(stBal) || 0) - cleared) * 100) / 100;

  const toggle = useMutation({
    mutationFn: async (r: { id: string; cleared?: string | undefined }) => {
      if (r.cleared) {
        const { error } = await db.from("bank_recon_marks").delete().eq("journal_line_id", r.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("bank_recon_marks").insert({ tenant_id: me!.tenantId!, account_id: acc, journal_line_id: r.id, statement_date: stDate });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank_recon", acc] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const autoMatch = useMutation({
    mutationFn: async () => {
      const amts = paste.split(/\n/).map((ln) => {
        const nums = ln.replace(/,/g, "").match(/-?\d+(\.\d+)?/g);
        return nums ? Number(nums[nums.length - 1]) : NaN;
      }).filter((n) => !isNaN(n) && n !== 0);
      const open = rows.filter((r) => !r.cleared);
      const used = new Set<string>();
      const hits: string[] = [];
      for (const a of amts) {
        const f = open.find((r) => !used.has(r.id) && Math.abs(r.amt - a) < 0.005);
        if (f) { used.add(f.id); hits.push(f.id); }
      }
      if (hits.length) {
        const { error } = await db.from("bank_recon_marks").insert(hits.map((id) => ({ tenant_id: me!.tenantId!, account_id: acc, journal_line_id: id, statement_date: stDate })));
        if (error) throw error;
      }
      return { found: hits.length, total: amts.length };
    },
    onSuccess: (r) => { toast.success(`تمت مطابقة ${r.found} من ${r.total} حركة`); qc.invalidateQueries({ queryKey: ["bank_recon", acc] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label>حساب المصرف</Label><Sel value={acc} onChange={setAcc} list={boxes} /></div>
        <div className="space-y-1"><Label>تاريخ كشف البنك</Label><Input type="date" value={stDate} onChange={(e) => setStDate(e.target.value)} /></div>
        <div className="space-y-1"><Label>الرصيد في كشف البنك</Label><Input type="number" value={stBal} onChange={(e) => setStBal(e.target.value)} /></div>
      </div>
      {acc && (
        <>
          <div className="grid gap-2 text-sm sm:grid-cols-5">
            <div className="rounded border p-2">رصيد الدفاتر<div className="num font-bold">{fmtNum(book)}</div></div>
            <div className="rounded border p-2">إيداعات غير ظاهرة بالبنك<div className="num font-bold">{fmtNum(pendDep)}</div></div>
            <div className="rounded border p-2">مسحوبات/شيكات معلقة<div className="num font-bold">{fmtNum(pendWd)}</div></div>
            <div className="rounded border p-2">المطابَق<div className="num font-bold">{fmtNum(cleared)}</div></div>
            <div className={`rounded border p-2 ${diff ? "text-destructive" : "text-primary"}`}>الفرق مع البنك<div className="num font-bold">{fmtNum(diff)}</div></div>
          </div>
          <details className="rounded border p-2 text-sm">
            <summary className="cursor-pointer">مطابقة تلقائية من كشف البنك (الصق الأسطر، المبلغ آخر رقم في السطر، السحب بالسالب)</summary>
            <div className="mt-2 flex items-center gap-2">
              <Label className="text-xs">أو استورد ملف كشف البنك (Excel / CSV):</Label>
              <Input type="file" accept=".xlsx,.xls,.csv" className="h-8 max-w-xs" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try {
                  const XLSX = await import("xlsx");
                  const wb = XLSX.read(await f.arrayBuffer());
                  const data = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0] ?? ""]!, { header: 1, raw: true });
                  const head = (data[0] ?? []).map((h: any) => String(h ?? "").toLowerCase());
                  const find = (keys: string[]) => head.findIndex((h: string) => keys.some((k) => h.includes(k)));
                  const iDep = find(["إيداع", "دائن", "credit", "deposit"]);
                  const iWd = find(["سحب", "مدين", "debit", "withdraw"]);
                  const iAmt = find(["المبلغ", "amount"]);
                  const num = (v: any) => Number(String(v ?? "").replace(/,/g, "")) || 0;
                  const out = data.slice(1).map((r) => {
                    if (iDep >= 0 || iWd >= 0) return num(r[iDep]) - num(r[iWd]);
                    if (iAmt >= 0) return num(r[iAmt]);
                    const ns = r.map(num).filter((n) => n); return ns[ns.length - 1] ?? 0;
                  }).filter((n) => n);
                  setPaste(out.join("\n"));
                  toast.success(`تمت قراءة ${out.length} حركة من الملف`);
                } catch { toast.error("تعذرت قراءة الملف"); }
                e.target.value = "";
              }} />
            </div>
            <textarea className="mt-2 h-28 w-full rounded border bg-background p-2" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <Button size="sm" className="mt-2" disabled={!paste || autoMatch.isPending} onClick={() => autoMatch.mutate()}>مطابقة</Button>
          </details>
          <div className="max-h-[60vh] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted"><tr>
                <th className="border px-2 py-1">✓</th><th className="border px-2 py-1 text-right">التاريخ</th><th className="border px-2 py-1 text-right">القيد</th>
                <th className="border px-2 py-1 text-right">البيان</th><th className="border px-2 py-1 text-right">إيداع</th><th className="border px-2 py-1 text-right">سحب</th><th className="border px-2 py-1 text-right">تاريخ المطابقة</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.cleared ? "bg-muted/40" : ""}>
                    <td className="border px-2 py-1 text-center"><input type="checkbox" checked={!!r.cleared} disabled={!can(me, "journal", "create")} onChange={() => toggle.mutate(r)} /></td>
                    <td className="border px-2 py-1">{r.date}</td><td className="border px-2 py-1">#{r.no}</td><td className="border px-2 py-1">{r.desc}</td>
                    <td className="num border px-2 py-1">{r.amt > 0 ? fmtNum(r.amt) : ""}</td><td className="num border px-2 py-1">{r.amt < 0 ? fmtNum(-r.amt) : ""}</td>
                    <td className="border px-2 py-1">{r.cleared ?? ""}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">لا توجد حركات</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
