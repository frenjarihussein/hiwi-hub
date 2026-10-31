import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Printer, Download } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBaseCurrency, useCurrencies, useLatestRates } from "@/lib/currencies";
import { balanceLabel, ledgerAmounts, ledgerDescription } from "@/lib/ledger-display";
import { fmtDate, fmtNum, today } from "@/lib/format";
import { printPage, exportCsv } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CashJournal({ accounts }: { accounts: { id: string; code: string; name: string; currency: string }[] }) {
  const { data: me } = useMe();
  const base = useBaseCurrency();
  const currencies = useCurrencies().data ?? [];
  const rates = useLatestRates();
  const [id, setId] = useState("");
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today());
  const account = accounts.find((a) => a.id === id);
  const cur = account?.currency || base;
  const sym = (c: string) => currencies.find((x) => x.code === c)?.symbol || c;
  const q = useQuery({
    queryKey: ["cash-journal", me?.tenantId, me?.activeBranchId, id, to, me?.isAuditor], enabled: !!me?.tenantId && !!id,
    queryFn: async () => {
      let query = db.from("journal_lines").select("*,journal_entries!inner(entry_no,entry_date,description,currency,exchange_rate,audited)").eq("tenant_id", me?.tenantId).eq("account_id", id).lte("journal_entries.entry_date", to).order("created_at");
      if (me?.isAuditor) query = query.eq("journal_entries.audited", true);
      const all: any[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await query.range(start, start + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      return all.sort((a,b) => a.journal_entries.entry_date.localeCompare(b.journal_entries.entry_date));
    },
  });
  let running = 0, runningBase = 0;
  let missing = false;
  const money = (v: number | undefined, c: string) => v === undefined ? "—" : `${fmtNum(v)} ${sym(c)}`;
  const rows: Record<string,string>[] = [];
  const apply = (l: any) => { const a = ledgerAmounts(l,base,cur,rates); runningBase += a.debitBase - a.creditBase; if (a.debit === undefined || a.credit === undefined) missing = true; else running += a.debit - a.credit; return a; };
  (q.data ?? []).filter((l) => l.journal_entries.entry_date < from).forEach(apply);
  rows.push({ date: fmtDate(from), entry: "", description: "رصيد أول المدة", receipt: "", payment: "", receiptBase: "", paymentBase: "", balance: missing ? "—" : balanceLabel(running,sym(cur)), balanceBase: balanceLabel(runningBase,sym(base)) });
  (q.data ?? []).filter((l) => l.journal_entries.entry_date >= from).forEach((l) => { const a = apply(l); rows.push({ id: l.entry_id, date: fmtDate(l.journal_entries.entry_date), entry: String(l.journal_entries.entry_no), description: ledgerDescription(l.description,l.journal_entries.description,true), receipt: money(a.debit,cur), payment: money(a.credit,cur), receiptBase: money(a.debitBase,base), paymentBase: money(a.creditBase,base), balance: missing ? "—" : balanceLabel(running,sym(cur)), balanceBase: balanceLabel(runningBase,sym(base)) }); });
  const columns = [{ key: "date", label: "التاريخ" },{ key: "entry", label: "رقم القيد" },{ key: "description", label: "البيان" },{ key: "receipt", label: `المقبوض (${sym(cur)})` },{ key: "payment", label: `المدفوع (${sym(cur)})` },{ key: "balance", label: `الرصيد (${sym(cur)})` }, ...(cur !== base ? [{ key: "receiptBase", label: `المقبوض (${sym(base)})` }, { key: "paymentBase", label: `المدفوع (${sym(base)})` }, { key: "balanceBase", label: `الرصيد (${sym(base)})` }] : [])];
  return <section>
    <div className="no-print mb-4 grid gap-3 sm:grid-cols-3">
      <label><Label>الصندوق / المصرف</Label><select aria-label="صندوق اليومية" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={id} onChange={(e) => setId(e.target.value)}><option value="">اختر الصندوق</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name} ({sym(a.currency)})</option>)}</select></label>
      <label><Label>من تاريخ</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label><Label>إلى تاريخ</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    </div>
    {id && <div className="print-area">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">يومية صندوق — {account?.name} ({sym(cur)})</h2><div className="no-print flex gap-2"><Button variant="outline" onClick={() => exportCsv("يومية صندوق",columns,rows)}><Download className="size-4" />تصدير</Button><Button onClick={printPage}><Printer className="size-4" />طباعة</Button></div></div>
      {q.isError && <p className="text-destructive">تعذر تحميل الحركات</p>}
      {q.isLoading ? <p>جارٍ التحميل...</p> : <div className="overflow-x-auto"><table className="w-full border text-sm"><thead className="bg-secondary"><tr>{columns.map((c) => <th key={c.key} className="border px-2 py-2 text-start">{c.label}</th>)}</tr></thead><tbody>{rows.map((r,i) => { const eid = r["id"]; return <tr key={i}>{columns.map((c) => <td key={c.key} className="whitespace-nowrap border px-2 py-2">{eid && ["entry","description"].includes(c.key) ? <Link to="/journal/$entryId" params={{ entryId: eid }} className="text-primary underline">{r[c.key]}</Link> : r[c.key]}</td>)}</tr>; })}</tbody><tfoot className="bg-muted font-bold"><tr><td colSpan={columns.length} className="border p-2">الرصيد: {missing ? "سعر الصرف غير متوفر" : balanceLabel(running,sym(cur))}{cur !== base ? ` · ${balanceLabel(runningBase,sym(base))}` : ""}</td></tr></tfoot></table></div>}
    </div>}
  </section>;
}