import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FX_MODES, fxRevalDue, postFxRevaluation, type FxRevalMode } from "@/lib/fx-reval";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useCurrencies, useBaseCurrency } from "@/lib/currencies";
import { fmtNum, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { account_id: string; code: string; name: string; currency: string; foreign_balance: number; booked_base: number; revalued_base: number; diff: number; entry_id: string | null };

/** Revalues foreign-currency account balances at chosen rates and posts the gain/loss entry. */
export function FxRevaluationCard({ editable }: { editable: boolean }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const curs = (useCurrencies().data ?? []).filter((c) => c.code !== base);
  const [date, setDate] = useState(today());
  const [rates, setRates] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = useFxSettings(me?.tenantId);
  async function saveMode(mode: FxRevalMode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("tenant_settings") as any).update({ fx_reval_mode: mode }).eq("tenant_id", me!.tenantId!);
    if (error) toast.error(error.message); else { toast.success("تم حفظ طريقة توليد قيد الفروقات"); void settings.refetch(); }
  }

  async function fillLatest() {
    const { data } = await db.from("exchange_rates").select("currency,rate_to_usd,rate_date").eq("tenant_id", me!.tenantId!).lte("rate_date", date).order("rate_date", { ascending: false });
    const m: Record<string, string> = {};
    (data ?? []).forEach((r: { currency: string; rate_to_usd: number }) => { if (!m[r.currency]) m[r.currency] = String(r.rate_to_usd); });
    setRates(m);
  }

  async function run(post: boolean) {
    const r: Record<string, number> = {};
    Object.entries(rates).forEach(([k, v]) => { if (Number(v) > 0) r[k] = Number(v); });
    if (!Object.keys(r).length) { toast.error("أدخل سعر صرف عملة واحدة على الأقل"); return; }
    if (post && !confirm("سيُنشأ قيد إعادة تقييم بفروقات الصرف. متابعة؟")) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).rpc("revalue_fx_balances", { _date: date, _rates: r, _post: post });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as Row[]);
    if (post) {
      toast.success((data ?? []).length ? "تم ترحيل قيد إعادة التقييم" : "لا توجد فروقات لترحيلها");
      qc.invalidateQueries(); 
    }
  }

  const gain = (rows ?? []).filter((x) => x.diff > 0).reduce((s, x) => s + Number(x.diff), 0);
  const loss = (rows ?? []).filter((x) => x.diff < 0).reduce((s, x) => s - Number(x.diff), 0);

  return (
    <section className="mt-6 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">إعادة تقييم أرصدة العملات الأجنبية</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        تحسب الفرق (للحسابات المحددة «نقدية» فقط) بين رصيد كل حساب بعملة أجنبية مقوَّماً بالسعر الجديد ورصيده المسجَّل بـ{base}، وترحّل الفرق إلى حساب أرباح أو خسائر العملة المحدد في بطاقة العملة. تُسجَّل العملية في سجل الصرف.
      </p>
      <div className="mt-3 rounded-md border bg-muted/30 p-3">
        <Label className="text-xs">طريقة توليد قيد فروقات الصرف</Label>
        <div className="mt-1 grid gap-2 sm:grid-cols-4">
          {FX_MODES.map((m) => (
            <button key={m.value} type="button" disabled={!editable} onClick={() => void saveMode(m.value)}
              className={`rounded-md border p-2 text-start text-sm ${(settings.data?.fx_reval_mode ?? "on_demand") === m.value ? "border-primary bg-primary/10" : "bg-background"}`}>
              <div className="font-semibold">{m.label}</div><div className="text-xs text-muted-foreground">{m.hint}</div>
            </button>
          ))}
        </div>
        {settings.data?.fx_reval_last && <p className="mt-2 text-xs text-muted-foreground">آخر توليد تلقائي: {settings.data.fx_reval_last}</p>}
        <p className="mt-2 text-xs text-muted-foreground">الأثر: الحساب المدين (موجود) يربح عند ارتفاع العملة ويخسر عند انخفاضها، والحساب الدائن (مطلوب) بالعكس. الطرف المقابل هو الحساب النقدي نفسه بالعملة الأساسية.</p>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">بتاريخ</Label><Input type="date" className="mt-1 w-40" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {curs.map((c) => (
          <div key={c.code}><Label className="text-xs">{c.code} لكل 1 {base}</Label>
            <Input className="mt-1 w-32" inputMode="decimal" value={rates[c.code] ?? ""} onChange={(e) => setRates({ ...rates, [c.code]: e.target.value })} /></div>
        ))}
        <Button variant="outline" onClick={fillLatest}>آخر الأسعار</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(false)}>معاينة</Button>
        {editable && <Button disabled={busy || !rows?.length} onClick={() => run(true)}>ترحيل القيد</Button>}
      </div>
      {rows && (
        <div className="mt-4 overflow-x-auto">
          {!rows.length ? <p className="text-sm text-muted-foreground">لا توجد فروقات بهذه الأسعار.</p> : (
            <table className="w-full min-w-[600px] border text-sm">
              <thead className="bg-secondary"><tr>
                <th className="border px-2 py-1 text-right">الحساب</th><th className="border px-2 py-1">العملة</th>
                <th className="border px-2 py-1">الرصيد بالعملة</th><th className="border px-2 py-1">المسجَّل ({base})</th>
                <th className="border px-2 py-1">بعد التقييم ({base})</th><th className="border px-2 py-1">الفرق</th>
              </tr></thead>
              <tbody>{rows.map((x) => (
                <tr key={x.account_id}>
                  <td className="border px-2 py-1">{x.code} — {x.name}</td><td className="border px-2 py-1 text-center">{x.currency}</td>
                  <td className="num border px-2 py-1">{fmtNum(x.foreign_balance)}</td><td className="num border px-2 py-1">{fmtNum(x.booked_base)}</td>
                  <td className="num border px-2 py-1">{fmtNum(x.revalued_base)}</td>
                  <td className={"num border px-2 py-1 font-semibold " + (x.diff >= 0 ? "text-success" : "text-destructive")}>{fmtNum(x.diff)}</td>
                </tr>))}</tbody>
              <tfoot><tr className="bg-muted/50"><td colSpan={6} className="border px-2 py-1 text-sm">أرباح: {fmtNum(gain)} {base} — خسائر: {fmtNum(loss)} {base} — الصافي: {fmtNum(gain - loss)} {base}</td></tr></tfoot>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function useFxSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["fx-reval-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db.from("tenant_settings") as any).select("fx_reval_mode,fx_reval_last").eq("tenant_id", tenantId).maybeSingle();
      return (data ?? null) as { fx_reval_mode: FxRevalMode; fx_reval_last: string | null } | null;
    },
  });
}

/** Runs daily/monthly automatic revaluation once per session for company admins. */
export function FxAutoRevaluation() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const s = useFxSettings(me?.isTenantAdmin ? me.tenantId : null);
  const done = useRef(false);
  useEffect(() => {
    const d = s.data;
    if (done.current || !d || !me?.tenantId || !navigator.onLine) return;
    if (!fxRevalDue(d.fx_reval_mode, d.fx_reval_last, today())) return;
    done.current = true;
    postFxRevaluation(me.tenantId, today())
      .then((n) => { if (n) { toast.success(`تم توليد قيد فروقات الصرف تلقائياً (${n} حساب)`); void qc.invalidateQueries(); } })
      .catch((e: Error) => toast.error("تعذّر توليد قيد فروقات الصرف: " + e.message));
  }, [s.data, me?.tenantId, qc]);
  return null;
}
