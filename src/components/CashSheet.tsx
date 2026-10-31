import { useEffect, useMemo, useRef, useState } from "react";
import { saveSharedDraft, loadSharedDraft, deleteSharedDraft } from "@/lib/shared-drafts";
import { downloadElementPdf } from "@/lib/pdf-export";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Printer, Save, Send, FileDown } from "lucide-react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBaseCurrency } from "@/lib/currencies";
import { postEntry, type EntryLine } from "@/lib/post-entry";
import { fmtNum, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Acc = { id: string; code: string; name: string; currency: string };
type Row = { dir: "in" | "out"; account_id: string; amount: string; description: string; cost_center_id: string };
const blank = (): Row => ({ dir: "in", account_id: "", amount: "", description: "", cost_center_id: "" });

/** Totals for a day sheet: receipts add to the box, payments subtract. */
export function sheetTotals(opening: number, rows: { dir: "in" | "out"; amount: string }[]) {
  let inn = 0, out = 0;
  for (const r of rows) { const a = Number(r.amount) || 0; if (a <= 0) continue; if (r.dir === "in") inn += a; else out += a; }
  return { inn, out, net: inn - out, closing: opening + inn - out };
}

export function CashSheet({ boxes }: { boxes: Acc[] }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const [box, setBox] = useState("");
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState("1");
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const B = boxes.find((b) => b.id === box);
  const draftKey = `${box}:${date}`;
  const sheetRef = useRef<HTMLDivElement>(null);

  const accs = useQuery({
    queryKey: ["sheet_accounts", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async (): Promise<Acc[]> => (await scope(db.from("accounts").select("id,code,name,currency").eq("is_group", false), me?.tenantId).order("code")).data ?? [],
  }).data ?? [];
  const centers = useQuery({
    queryKey: ["sheet_centers", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async (): Promise<{ id: string; name: string }[]> => (await scope(db.from("cost_centers").select("id,name").eq("is_group", false), me?.tenantId).order("name")).data ?? [],
  }).data ?? [];
  const opening = useQuery({
    queryKey: ["sheet_opening", box, date],
    enabled: !!box,
    queryFn: async () => {
      const { data } = await db.from("journal_lines").select("debit,credit,journal_entries!inner(entry_date)").eq("account_id", box).lt("journal_entries.entry_date", date).range(0, 99999);
      return (data ?? []).reduce((s: number, l: any) => s + Number(l.debit) - Number(l.credit), 0);
    },
  }).data ?? 0;

  useEffect(() => {
    if (!box) return;
    setRows([blank(), blank(), blank()]);
    void loadSharedDraft<Row[]>("cash_sheet", draftKey).then((d) => { if (d?.length) setRows(d); });
    if (B && B.currency !== base) {
      db.from("exchange_rates").select("rate_to_usd").eq("currency", B.currency).order("rate_date", { ascending: false }).limit(1)
        .then(({ data }: { data: any[] | null }) => setRate(data?.[0]?.rate_to_usd ? String(data[0].rate_to_usd) : ""));
    } else setRate("1");
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useMemo(() => sheetTotals(opening, rows), [opening, rows]);
  const upd = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const filled = rows.filter((r) => r.account_id && Number(r.amount) > 0);

  async function saveDraft() {
    if (!box) { toast.error("اختر الصندوق"); return; }
    const ok = await saveSharedDraft("cash_sheet", draftKey, rows, `يومية ${B?.name ?? ""} ${date}`);
    toast.success(ok ? "حُفظت المسودة وتظهر من أي جهاز" : "حُفظت المسودة على هذا الجهاز (دون اتصال)");
  }

  async function post() {
    if (!B) { toast.error("اختر الصندوق"); return; }
    if (filled.length === 0) { toast.error("أدخل حركة واحدة على الأقل"); return; }
    if (rows.some((r) => (r.account_id && !(Number(r.amount) > 0)) || (!r.account_id && Number(r.amount) > 0))) { toast.error("أكمل الحساب والمبلغ في كل سطر"); return; }
    const r = B.currency === base ? 1 : Number(rate);
    if (!(r > 0)) { toast.error("أدخل سعر الصرف"); return; }
    setBusy(true);
    try {
      const lines: EntryLine[] = [];
      for (const x of filled) {
        const a = Number(x.amount);
        const cc = x.cost_center_id || null;
        const desc = x.description || (x.dir === "in" ? "مقبوض" : "مدفوع");
        lines.push({ account_id: x.account_id, debit: x.dir === "out" ? a : 0, credit: x.dir === "in" ? a : 0, description: desc, ...(cc ? { cost_center_id: cc } : {}) } as EntryLine);
      }
      if (t.inn > 0) lines.push({ account_id: B.id, debit: t.inn, credit: 0, description: "مقبوضات يومية الصندوق" });
      if (t.out > 0) lines.push({ account_id: B.id, debit: 0, credit: t.out, description: "مدفوعات يومية الصندوق" });
      await postEntry(me!.tenantId!, me?.userId, { entry_date: date, description: `يومية ${B.name} ${date}`, currency: B.currency, exchange_rate: r }, lines);
      await deleteSharedDraft("cash_sheet", draftKey);
      setRows([blank(), blank(), blank()]);
      toast.success("رُحّلت اليومية كقيد مجمّع");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const accName = (id: string) => { const a = accs.find((x) => x.id === id); return a ? `${a.code} - ${a.name}` : ""; };

  return (
    <div className="space-y-4">
      <div className="no-print grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
        <div className="space-y-1 sm:col-span-2"><Label>الصندوق</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={box} onChange={(e) => setBox(e.target.value)}>
            <option value="">— اختر —</option>
            {boxes.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name} ({a.currency})</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {B && B.currency !== base
          ? <div className="space-y-1"><Label>سعر الصرف ({B.currency})</Label><Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          : <div className="space-y-1"><Label>الرصيد الافتتاحي</Label><div className="num flex h-9 items-center rounded-md border bg-muted px-2 font-semibold">{fmtNum(opening)}</div></div>}
      </div>

      <div ref={sheetRef} className="print-area rounded-lg border bg-card">
        <div className="hidden p-4 print:block"><h2 className="text-lg font-bold">يومية الصندوق: {B?.name} — {date}</h2><p>الرصيد الافتتاحي: {fmtNum(opening)} {B?.currency}</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              <th className="border px-2 py-2">#</th><th className="border px-2 py-2 text-right">النوع</th><th className="border px-2 py-2 text-right">الحساب المقابل</th>
              <th className="border px-2 py-2 text-right">المبلغ {B ? `(${B.currency})` : ""}</th><th className="border px-2 py-2 text-right">البيان</th>
              <th className="border px-2 py-2 text-right">مركز الكلفة</th><th className="no-print border px-2 py-2" />
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.dir === "in" ? "" : "bg-destructive/5"}>
                  <td className="border px-2 text-center">{i + 1}</td>
                  <td className="border p-1"><select className="h-8 w-full rounded border bg-background px-1" value={r.dir} onChange={(e) => upd(i, { dir: e.target.value as Row["dir"] })}><option value="in">مقبوض (+)</option><option value="out">مدفوع (−)</option></select></td>
                  <td className="min-w-56 border p-1">
                    <select className="h-8 w-full rounded border bg-background px-1 print:hidden" value={r.account_id} onChange={(e) => upd(i, { account_id: e.target.value })}>
                      <option value="">— اختر —</option>
                      {accs.filter((a) => a.id !== box).map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select>
                    <span className="hidden print:inline">{accName(r.account_id)}</span>
                  </td>
                  <td className="w-32 border p-1"><Input className="h-8" type="number" value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && i === rows.length - 1) setRows((rs) => [...rs, blank()]); }} /></td>
                  <td className="min-w-48 border p-1"><Input className="h-8" value={r.description} onChange={(e) => upd(i, { description: e.target.value })} placeholder={i > 0 ? rows[i - 1]?.description : ""} /></td>
                  <td className="border p-1"><select className="h-8 w-full rounded border bg-background px-1" value={r.cost_center_id} onChange={(e) => upd(i, { cost_center_id: e.target.value })}><option value="">—</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                  <td className="no-print border p-1"><button aria-label="حذف السطر" className="grid size-8 place-items-center rounded hover:bg-accent" onClick={() => setRows((rs) => rs.length > 1 ? rs.filter((_, j) => j !== i) : [blank()])}><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 border-t bg-muted/40 p-3 text-sm sm:grid-cols-5">
          <div>الافتتاحي: <b className="num">{fmtNum(opening)}</b></div>
          <div>إجمالي المقبوض: <b className="num text-primary">{fmtNum(t.inn)}</b></div>
          <div>إجمالي المدفوع: <b className="num text-destructive">{fmtNum(t.out)}</b></div>
          <div>صافي الحركة: <b className="num">{fmtNum(t.net)}</b></div>
          <div>رصيد الإغلاق المتوقع: <b className="num">{fmtNum(t.closing)}</b></div>
        </div>
        <div className="hidden grid-cols-2 gap-8 p-8 print:grid"><div>توقيع أمين الصندوق: ..................</div><div>توقيع المحاسب: ..................</div></div>
      </div>

      <div className="no-print flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setRows((rs) => [...rs, blank()])}><Plus className="size-4" />سطر</Button>
        <Button onClick={post} disabled={busy}><Send className="size-4" />ترحيل كقيد مجمّع</Button>
        <Button variant="secondary" onClick={saveDraft}><Save className="size-4" />حفظ كمسودة</Button>
        <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />طباعة للتوقيع</Button>
        <Button variant="outline" onClick={() => sheetRef.current && downloadElementPdf(sheetRef.current, `يومية-صندوق-${date}`).catch((e) => toast.error((e as Error).message))}><FileDown className="size-4" />تنزيل PDF</Button>
      </div>
    </div>
  );
}
