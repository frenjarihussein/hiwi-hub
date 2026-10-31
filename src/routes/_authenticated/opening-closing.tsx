import { baseCurrencyOf, useBaseCurrency, useLatestRates } from "@/lib/currencies";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtMoney, isProfitLoss } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OpeningEntryEditor } from "@/components/OpeningEntryEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/opening-closing")({
  component: OpeningClosingPage,
  head: () => ({
    meta: [
      { title: "القيد الافتتاحي وقيد الإقفال | يوسف سوفت" },
      { name: "description", content: "إدخال القيد الافتتاحي من ميزان المراجعة وتوليد قيد إقفال السنة تلقائياً" },
      { property: "og:title", content: "القيد الافتتاحي وقيد الإقفال | يوسف سوفت" },
      { property: "og:description", content: "قيد افتتاحي وقيد إقفال السنة المالية" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Acc = { id: string; code: string; name: string; nature: string; is_group: boolean; currency?: string | null };
type Line = { debit: number; credit: number; fc?: number; rate?: number; cur?: string };

async function balancesUntil(tenantId: string, from: string | null, to: string) {
  let q = db
    .from("journal_lines")
    .select("account_id, debit, credit, journal_entries!inner(entry_date, exchange_rate)")
    .eq("tenant_id", tenantId)
    .lte("journal_entries.entry_date", to);
  if (from) q = q.gte("journal_entries.entry_date", from);
  const { data, error } = await q;
  if (error) throw error;
  const m = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data ?? []).forEach((l: any) => {
    const r = Number(l.journal_entries?.exchange_rate ?? 1) || 1;
    m.set(l.account_id, (m.get(l.account_id) ?? 0) + (Number(l.debit) - Number(l.credit)) / r);
  });
  return m;
}

async function saveEntry(tenantId: string, userId: string, date: string, desc: string, docType: string, lines: { account_id: string; debit: number; credit: number; description?: string; line_currency?: string | null; line_rate?: number | null; fc_amount?: number | null }[]) {
  const rows = lines.filter((l) => l.debit > 0.0001 || l.credit > 0.0001);
  if (!rows.length) throw new Error("لا توجد مبالغ");
  const d = rows.reduce((s, l) => s + l.debit, 0), c = rows.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(d - c) > 0.01) throw new Error("القيد غير متوازن");
  const { data: maxRow } = await db.from("journal_entries").select("entry_no").eq("tenant_id", tenantId).order("entry_no", { ascending: false }).limit(1);
  const { data: entry, error } = await db
    .from("journal_entries")
    .insert({ tenant_id: tenantId, entry_no: (maxRow?.[0]?.entry_no ?? 0) + 1, entry_date: date, description: desc, currency: await baseCurrencyOf(tenantId), exchange_rate: 1, doc_type: docType, created_by: userId })
    .select("id").single();
  if (error) throw error;
  const { error: e2 } = await db.from("journal_lines").insert(rows.map((l) => ({ tenant_id: tenantId, entry_id: entry.id, ...l })));
  if (e2) { await db.from("journal_entries").delete().eq("id", entry.id); throw e2; }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function OpeningClosingPage() {
  const baseCur = useBaseCurrency();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const tenantId = me?.tenantId ?? "";
  const base = useQuery({
    queryKey: ["oc-base", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [{ data: accs }, { data: ts }] = await Promise.all([
        db.from("accounts").select("id,code,name,nature,is_group,currency").eq("tenant_id", tenantId).eq("is_active", true).order("code"),
        db.from("tenant_settings").select("fiscal_start,fiscal_end,retained_earnings_account_id,capital_account_id").eq("tenant_id", tenantId).maybeSingle(),
      ]);
      return { accs: (accs ?? []) as Acc[], ts: ts ?? {} };
    },
  });
  const accs = (base.data?.accs ?? []).filter((a) => !a.is_group);
  const ts = (base.data?.ts ?? {}) as { fiscal_start?: string; fiscal_end?: string; retained_earnings_account_id?: string; capital_account_id?: string };
  const year = new Date().getFullYear();
  const [busy, setBusy] = useState(false);

  // Closing
  const [cFrom, setCFrom] = useState(`${year}-01-01`);
  const [cTo, setCTo] = useState(`${year}-12-31`);
  const [closing, setClosing] = useState<{ account_id: string; code: string; name: string; debit: number; credit: number; description?: string }[]>([]);
  const fetchClosing = async () => {
    if (!ts.retained_earnings_account_id) { toast.error("حدد حساب الأرباح المحتجزة في الإعدادات أولاً"); return; }
    setBusy(true);
    try {
      const m = await balancesUntil(tenantId, cFrom, cTo);
      const lines = accs.filter((a) => isProfitLoss(a.nature)).map((a) => {
        const b = r2(m.get(a.id) ?? 0);
        return { account_id: a.id, code: a.code, name: a.name, debit: b < 0 ? -b : 0, credit: b > 0 ? b : 0 };
      }).filter((l) => l.debit || l.credit);
      const net = r2(lines.reduce((s, l) => s + l.debit - l.credit, 0));
      const re = base.data!.accs.find((a) => a.id === ts.retained_earnings_account_id);
      if (net) lines.push({ account_id: ts.retained_earnings_account_id, code: re?.code ?? "", name: `${re?.name ?? "الأرباح المحتجزة"} — صافي نتيجة السنة`, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0 });
      setClosing(lines);
      if (!lines.length) toast.info("لا توجد أرصدة أرباح وخسائر في هذه الفترة");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const post = async () => {
    setBusy(true);
    try {
      await saveEntry(tenantId, me!.userId, cTo, "قيد إقفال السنة المالية", "closing", closing.map(({ account_id, debit, credit }) => ({ account_id, debit, credit })));
      toast.success("تم ترحيل القيد");
      qc.invalidateQueries();
      setClosing([]);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const th = "border px-2 py-2 text-right";
  return (
    <div>
      <PageHeader title="القيد الافتتاحي وقيد الإقفال" subtitle="أدخل الأرصدة الافتتاحية يدوياً أو من ميزان المراجعة، وولّد قيد إقفال حسابات الأرباح والخسائر تلقائياً" />
      <Tabs defaultValue="open">
        <TabsList className="mb-4">
          <TabsTrigger value="open">القيد الافتتاحي</TabsTrigger>
          <TabsTrigger value="close">قيد إقفال السنة</TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <OpeningEntryEditor accs={base.data?.accs ?? []} capitalId={ts.capital_account_id} balancesUntil={(to) => balancesUntil(tenantId, null, to)} />
        </TabsContent>

        <TabsContent value="close">
          <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
            <div><Label className="text-xs">من تاريخ</Label><Input type="date" className="mt-1" value={cFrom} onChange={(e) => setCFrom(e.target.value)} /></div>
            <div><Label className="text-xs">إلى تاريخ (تاريخ الإقفال)</Label><Input type="date" className="mt-1" value={cTo} onChange={(e) => setCTo(e.target.value)} /></div>
            <Button className="self-end" onClick={fetchClosing} disabled={busy}>جلب قيد الإقفال</Button>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card p-4">
            <table className="w-full min-w-[640px] table-fixed border text-sm"><colgroup><col className="w-32" /><col /><col className="w-40" /><col className="w-40" /></colgroup>
              <thead className="bg-secondary"><tr><th className={th}>الرمز</th><th className={th}>الحساب</th><th className={th}>مدين</th><th className={th}>دائن</th></tr></thead>
              <tbody>
                {closing.length === 0 && <tr><td colSpan={4} className="border px-2 py-6 text-center text-muted-foreground">اضغط "جلب قيد الإقفال"</td></tr>}
                {closing.map((l, i) => (
                  <tr key={`${l.account_id}-${i}`} className={i === closing.length - 1 && l.account_id === ts.retained_earnings_account_id ? "bg-muted/50 font-semibold" : ""}>
                    <td className="num whitespace-nowrap border px-2 py-1">{l.code}</td>
                    <td className="border px-2 py-1">{l.name}</td>
                    <td className="num whitespace-nowrap border px-2 py-1 text-left">{l.debit ? fmtMoney(l.debit, baseCur) : "—"}</td>
                    <td className="num whitespace-nowrap border px-2 py-1 text-left">{l.credit ? fmtMoney(l.credit, baseCur) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {closing.length > 0 && (
                <tfoot className="bg-muted font-bold">
                  <tr>
                    <td colSpan={2} className="border px-2 py-2">الإجمالي</td>
                    <td className="num whitespace-nowrap border px-2 py-2 text-left">{fmtMoney(closing.reduce((s, l) => s + l.debit, 0), baseCur)}</td>
                    <td className="num whitespace-nowrap border px-2 py-2 text-left">{fmtMoney(closing.reduce((s, l) => s + l.credit, 0), baseCur)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            <p className="mt-2 text-xs text-muted-foreground">المبالغ محوّلة إلى الدولار الأمريكي بسعر صرف كل قيد.</p>
            <Button className="mt-4" disabled={busy || !closing.length} onClick={() => post()}>ترحيل قيد الإقفال</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
