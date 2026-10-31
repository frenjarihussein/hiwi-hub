import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lock, Plus, Scale, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBaseCurrency, useLatestRates } from "@/lib/currencies";
import { fmtMoney, isProfitLoss } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Acc = { id: string; code: string; name: string; nature: string; is_group: boolean; currency?: string | null };
type Row = { key: string; account_id: string; locked: boolean; cd: number; cc: number; rate: number; description: string; doc?: string | null };

const r4 = (n: number) => Math.round(n * 10000) / 10000;
let seq = 0;
const nk = () => `r${++seq}`;

/** Single opening entry (number 1): editable lines, warehouse lines from opening-inventory invoices stay locked. */
export function OpeningEntryEditor({ accs, capitalId, balancesUntil }: { accs: Acc[]; capitalId?: string | null | undefined; balancesUntil: (to: string) => Promise<Map<string, number>> }) {
  const base = useBaseCurrency();
  const rates = useLatestRates();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const tenantId = me?.tenantId ?? "";
  const year = new Date().getFullYear();
  const [date, setDate] = useState(`${year}-01-01`);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [tbDate, setTbDate] = useState(`${year - 1}-12-31`);
  const leaves = useMemo(() => accs.filter((a) => !a.is_group && !isProfitLoss(a.nature) && a.nature !== "closing" && a.nature !== "cost_centers"), [accs]);
  const accOf = (id: string) => accs.find((a) => a.id === id);
  const curOf = (id: string) => accOf(id)?.currency || base;

  const entry = useQuery({
    queryKey: ["opening-entry", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await db.from("journal_entries").select("id,entry_no,entry_date,audited,journal_lines(*)").eq("tenant_id", tenantId).eq("doc_type", "opening").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const e = entry.data;
    if (!e) return;
    setDate(e.entry_date);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRows(((e.journal_lines ?? []) as any[]).map((l) => {
      const foreign = l.line_currency && l.line_currency !== base && Number(l.line_rate);
      const rate = foreign ? Number(l.line_rate) : 1;
      const fc = foreign ? Number(l.fc_amount) || 0 : 0;
      return { key: nk(), account_id: l.account_id, locked: !!l.source_document_id, doc: l.source_document_id ?? null, rate,
        cd: Number(l.debit) > 0 ? (foreign ? fc : Number(l.debit)) : 0, cc: Number(l.credit) > 0 ? (foreign ? fc : Number(l.credit)) : 0, description: l.description ?? "" };
    }));
  }, [entry.data, base]);

  const baseOf = (r: Row) => ({ d: r4(r.cd / (r.rate || 1)), c: r4(r.cc / (r.rate || 1)) });
  const totD = rows.reduce((s, r) => s + baseOf(r).d, 0);
  const totC = rows.reduce((s, r) => s + baseOf(r).c, 0);
  const diff = r4(totD - totC);

  const upd = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const newRow = (account_id = ""): Row => ({ key: nk(), account_id, locked: false, cd: 0, cc: 0, rate: account_id && curOf(account_id) !== base ? rates[curOf(account_id)] ?? 1 : 1, description: "" });
  const setAccount = (key: string, id: string) => upd(key, { account_id: id, rate: curOf(id) !== base ? rates[curOf(id)] ?? 1 : 1 });

  const loadAll = () => {
    const have = new Set(rows.map((r) => r.account_id));
    setRows((rs) => [...rs, ...leaves.filter((a) => !have.has(a.id)).map((a) => newRow(a.id))]);
  };
  const fromTb = async () => {
    setBusy(true);
    try {
      const m = await balancesUntil(tbDate);
      const locked = rows.filter((r) => r.locked);
      // Opening-inventory invoices are already posted into this entry: exclude them so they are not duplicated.
      const posted = new Map<string, number>();
      for (const r of locked) { const b = baseOf(r); posted.set(r.account_id, (posted.get(r.account_id) ?? 0) + b.d - b.c); }
      const next = leaves.map((a) => {
        const b = r4((m.get(a.id) ?? 0) - (posted.get(a.id) ?? 0));
        return b ? { ...newRow(a.id), rate: 1, cd: b > 0 ? b : 0, cc: b < 0 ? -b : 0 } : null;
      }).filter(Boolean) as Row[];
      setRows([...locked, ...next]);
      toast.success("تم جلب أرصدة ميزان المراجعة");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const balance = () => {
    if (!diff) return;
    const target = rows.find((r) => !r.locked && capitalId && r.account_id === capitalId);
    if (target) {
      const b = baseOf(target);
      const net = r4(b.c - b.d + diff); // capital side absorbs the difference
      upd(target.key, { rate: 1, cd: net < 0 ? -net : 0, cc: net > 0 ? net : 0 });
    } else {
      setRows((rs) => [...rs, { ...newRow(capitalId ?? ""), rate: 1, cd: diff < 0 ? -diff : 0, cc: diff > 0 ? diff : 0, description: "فرق موازنة" }]);
    }
  };

  const save = async () => {
    const editable = rows.filter((r) => !r.locked && (r.cd > 0 || r.cc > 0));
    if (editable.some((r) => !r.account_id)) { toast.error("اختر الحساب لكل سطر فيه مبلغ"); return; }
    if (Math.abs(diff) > 0.01) { toast.error("القيد غير متوازن — اضغط «موازنة القيد»"); return; }
    setBusy(true);
    try {
      const lines = editable.map((r) => {
        const b = baseOf(r);
        const foreign = curOf(r.account_id) !== base;
        return { account_id: r.account_id, debit: b.d, credit: b.c, description: r.description, ...(foreign ? { line_currency: curOf(r.account_id), line_rate: r.rate, fc_amount: r.cd || r.cc } : {}) };
      });
      const { error } = await db.rpc("save_opening_entry", { _date: date, _lines: lines });
      if (error) throw error;
      toast.success("تم حفظ القيد الافتتاحي");
      await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const removeLocked = async (r: Row) => {
    if (!r.doc) return;
    if (!confirm("سيتم حذف فاتورة بضاعة أول المدة المرتبطة بهذا السطر وإلغاء أثرها على المخزون. متابعة؟")) return;
    setBusy(true);
    try {
      const { error: uErr } = await db.rpc("unpost_document", { _id: r.doc });
      if (uErr) throw uErr;
      const { error: lErr } = await db.from("document_lines").delete().eq("document_id", r.doc);
      if (lErr) throw lErr;
      const { error } = await db.from("documents").delete().eq("id", r.doc);
      if (error) throw error;
      toast.success("تم حذف فاتورة بضاعة أول المدة وسطرها من القيد الافتتاحي");
      await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const th = "border px-2 py-2 text-right";
  return (
    <div>
      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
        <div><Label className="text-xs">تاريخ القيد الافتتاحي</Label><Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex items-end text-sm text-muted-foreground">رقم القيد: <b className="ms-1 text-foreground">{entry.data?.entry_no ?? 1}</b></div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <div className="flex-1"><Label className="text-xs">جلب الأرصدة من ميزان المراجعة حتى</Label><Input type="date" className="mt-1" value={tbDate} onChange={(e) => setTbDate(e.target.value)} /></div>
          <Button variant="outline" onClick={fromTb} disabled={busy}>جلب الأرصدة</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, newRow()])}><Plus className="size-4" />إضافة سطر</Button>
          <Button size="sm" variant="outline" onClick={loadAll}>جلب كافة الحسابات</Button>
          <Button size="sm" variant="outline" onClick={balance} disabled={!diff}><Scale className="size-4" />موازنة القيد</Button>
          <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((r) => r.locked || r.cd || r.cc))}>حذف الأسطر الفارغة</Button>
        </div>
        <table className="w-full min-w-[900px] border text-sm">
          <thead className="bg-secondary"><tr>
            <th className={th}>الحساب</th><th className={th}>العملة</th><th className={th}>مدين (عملة الحساب)</th><th className={th}>دائن (عملة الحساب)</th><th className={th}>سعر الصرف</th><th className={th}>مدين ({base})</th><th className={th}>دائن ({base})</th><th className={th}>البيان</th><th className={th}></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="border px-2 py-6 text-center text-muted-foreground">أضف سطراً أو اضغط «جلب كافة الحسابات»</td></tr>}
            {rows.map((r) => {
              const cur = curOf(r.account_id); const b = baseOf(r); const a = accOf(r.account_id);
              return (
                <tr key={r.key} className={r.locked ? "bg-muted/50" : ""}>
                  <td className="border px-1 py-1">{r.locked ? <span className="flex items-center gap-1"><Lock className="size-3" />{a ? `${a.code} - ${a.name}` : "حساب المستودع"}</span> : (
                    <select className="h-8 w-full rounded-md border bg-background px-1" value={r.account_id} onChange={(e) => setAccount(r.key, e.target.value)}>
                      <option value="">—</option>
                      {leaves.map((x) => <option key={x.id} value={x.id}>{x.code} - {x.name} ({x.currency || base})</option>)}
                    </select>)}</td>
                  <td className="border px-2 py-1">{cur}</td>
                  <td className="border px-1 py-1"><Input type="number" className="h-8" disabled={r.locked} value={r.cd || ""} onChange={(e) => upd(r.key, { cd: Number(e.target.value), cc: 0 })} /></td>
                  <td className="border px-1 py-1"><Input type="number" className="h-8" disabled={r.locked} value={r.cc || ""} onChange={(e) => upd(r.key, { cc: Number(e.target.value), cd: 0 })} /></td>
                  <td className="border px-1 py-1">{cur !== base && !r.locked ? <Input type="number" className="h-8 w-24" title={`كم ${cur} = 1 ${base}`} value={r.rate || ""} onChange={(e) => upd(r.key, { rate: Number(e.target.value) })} /> : <span className="text-muted-foreground">1</span>}</td>
                  <td className="num border px-2 py-1">{b.d ? fmtMoney(b.d, base) : ""}</td>
                  <td className="num border px-2 py-1">{b.c ? fmtMoney(b.c, base) : ""}</td>
                  <td className="border px-1 py-1"><Input className="h-8" disabled={r.locked} value={r.description} onChange={(e) => upd(r.key, { description: e.target.value })} /></td>
                  <td className="border px-1 py-1">{r.locked ? (r.doc && <Button size="icon" variant="ghost" title="حذف فاتورة بضاعة أول المدة" disabled={busy} onClick={() => removeLocked(r)}><Trash2 className="size-4 text-destructive" /></Button>) : <Button size="icon" variant="ghost" title="حذف" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="size-4 text-destructive" /></Button>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted font-bold"><tr>
            <td colSpan={5} className="border px-2 py-2">الإجمالي — الفرق: <span className="num">{fmtMoney(diff, base)}</span></td>
            <td className="num border px-2 py-2">{fmtMoney(totD, base)}</td><td className="num border px-2 py-2">{fmtMoney(totC, base)}</td><td colSpan={2} className="border" />
          </tr></tfoot>
        </table>
        <p className="mt-2 text-xs text-muted-foreground"><Lock className="inline size-3" /> أسطر المستودعات تأتي من فواتير بضاعة أول المدة ولا تُعدّل إلا من <Link to="/documents" className="underline">الفواتير</Link>؛ وكل فاتورة تضيف مبلغها لرأس المال في هذا القيد نفسه.</p>
        <Button className="mt-4" disabled={busy || entry.data?.audited || Math.abs(diff) > 0.01} onClick={save}>حفظ القيد الافتتاحي</Button>
      </div>
    </div>
  );
}
