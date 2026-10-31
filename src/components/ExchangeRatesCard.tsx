import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useCurrencies, useBaseCurrency } from "@/lib/currencies";
import { fetchLiveRates } from "@/lib/rates.functions";
import { postFxRevaluation } from "@/lib/fx-reval";
import { today } from "@/lib/format";
import { convertLiveRates, readAutoFetch, writeAutoFetch } from "@/lib/live-rates";
import { FxRateChart } from "@/components/FxRateChart";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Daily exchange-rate bulletin: rate = units of a currency per 1 base unit. */
export function ExchangeRatesCard({ editable }: { editable: boolean }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const curs = (useCurrencies().data ?? []).filter((c) => c.code !== base);
  const live = useServerFn(fetchLiveRates);
  const [date, setDate] = useState(today());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [newLira, setNewLira] = useState(true);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);

  const latest = useQuery({
    queryKey: ["exchange_rates_latest", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data } = await db.from("exchange_rates").select("currency,rate_to_usd,rate_date,source").eq("tenant_id", me!.tenantId).order("rate_date", { ascending: false }).limit(200);
      const m: Record<string, { rate: number; date: string; source: string | null }> = {};
      (data ?? []).forEach((r: { currency: string; rate_to_usd: number; rate_date: string; source: string | null }) => {
        if (!m[r.currency]) m[r.currency] = { rate: Number(r.rate_to_usd), date: r.rate_date, source: r.source };
      });
      return m;
    },
  });

  useEffect(() => { if (me?.tenantId) { const p = readAutoFetch(me.tenantId); setAuto(p.on); setNewLira(p.newLira); } }, [me?.tenantId]);
  function setPref(on: boolean, nl: boolean) { setAuto(on); setNewLira(nl); if (me?.tenantId) writeAutoFetch(me.tenantId, { on, newLira: nl }); }

  async function pull() {
    setBusy(true);
    const r = await live();
    setBusy(false);
    if (r.error) { toast.error(r.error); return; }
    const c = convertLiveRates(r.rates, base, curs.map((x) => x.code), newLira);
    if (c.baseMissing) { toast.error(`لا يوجد سعر للعملة الأساسية ${base} في الموقع`); return; }
    const next: Record<string, string> = {};
    Object.entries(c.rates).forEach(([k, v]) => { next[k] = String(v); });
    setVals((v) => ({ ...v, ...next }));
    toast.success(`تم جلب الأسعار${r.updatedAt ? " — آخر تحديث " + new Date(r.updatedAt).toLocaleString("ar-SY") : ""}. عدّلها إن لزم ثم اضغط حفظ`);
    if (c.missing.length) toast.info(`لا توجد أسعار لـ: ${c.missing.join("، ")}`);
  }

  async function save() {
    const rows = Object.entries(vals).filter(([, v]) => Number(v) > 0).map(([currency, v]) => ({
      tenant_id: me!.tenantId, rate_date: date, currency, rate_to_usd: Number(v), source: "manual", updated_at: new Date().toISOString(),
    }));
    if (!rows.length) { toast.error("أدخل سعراً واحداً على الأقل"); return; }
    setBusy(true);
    const { error } = await db.from("exchange_rates").upsert(rows, { onConflict: "tenant_id,rate_date,currency" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ نشرة الأسعار");
    setVals({});
    qc.invalidateQueries({ queryKey: ["exchange_rates_latest"] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: st } = await (db.from("tenant_settings") as any).select("fx_reval_mode").eq("tenant_id", me!.tenantId).maybeSingle();
    if (st?.fx_reval_mode === "on_rate_change") {
      try {
        const n = await postFxRevaluation(me!.tenantId!, date);
        toast.success(n ? `تم ترحيل قيد فروقات الصرف تلقائياً (${n} حساب)` : "لا توجد فروقات صرف لترحيلها");
        qc.invalidateQueries();
      } catch (e) { toast.error("تعذّر توليد قيد فروقات الصرف: " + (e as Error).message); }
    }
  }

  return (
    <div className="mb-8">
      <PageHeader title="نشرة أسعار الصرف" subtitle={`السعر = كم وحدة من العملة مقابل 1 ${base}. تُملأ تلقائياً في الفواتير والسندات حسب آخر سعر محفوظ`} />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {editable && (
            <>
              <Button variant="outline" onClick={pull} disabled={busy}>{busy ? "جارٍ..." : "سحب الأسعار من الليرة اليوم (دمشق)"}</Button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newLira} onChange={(e) => setPref(auto, e.target.checked)} />
                الليرة الجديدة (حذف صفرين)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={auto} onChange={(e) => setPref(e.target.checked, newLira)} />
                تحديث تلقائي من الليرة اليوم عند كل فتح للبرنامج
              </label>
            </>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-2 text-right">العملة</th>
              <th className="py-2 text-right">آخر سعر محفوظ</th>
              <th className="py-2 text-right">التاريخ</th>
              <th className="py-2 text-right">السعر الجديد (كم مقابل 1 {base})</th>
            </tr>
          </thead>
          <tbody>
            {curs.map((c) => {
              const l = latest.data?.[c.code];
              return (
                <tr key={c.code} className="border-b">
                  <td className="py-2">{c.name} ({c.code})</td>
                  <td className="num py-2">{l ? l.rate.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—"}</td>
                  <td className="num py-2">{l?.date ?? "—"}</td>
                  <td className="py-2">
                    <Input type="number" disabled={!editable} value={vals[c.code] ?? ""} placeholder={l ? String(l.rate) : ""}
                      onChange={(e) => setVals({ ...vals, [c.code]: e.target.value })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {editable && <Button onClick={save} disabled={busy}>حفظ النشرة</Button>}
      </div>
      <FxRateChart base={base} currencies={curs} />
    </div>
  );
}

/** Saves live sp-today rates automatically (once per hour) when the company enabled auto-fetch. */
export function FxAutoFetch() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const curs = (useCurrencies().data ?? []).filter((c) => c.code !== base);
  const live = useServerFn(fetchLiveRates);
  const ran = useRef(false);
  useEffect(() => {
    const tid = me?.tenantId;
    if (!tid || !curs.length || ran.current || !navigator.onLine) return;
    const p = readAutoFetch(tid);
    if (!p.on) return;
    const k = `fx-auto-fetch-last:${tid}`;
    if (Date.now() - Number(localStorage.getItem(k) || 0) < 3600_000) return;
    ran.current = true;
    (async () => {
      const r = await live();
      if (r.error) return;
      const c = convertLiveRates(r.rates, base, curs.map((x) => x.code), p.newLira);
      const date = today();
      const rows = Object.entries(c.rates).map(([currency, v]) => ({ tenant_id: tid, rate_date: date, currency, rate_to_usd: v, source: "sp-today", updated_at: new Date().toISOString() }));
      if (!rows.length) return;
      const { error } = await db.from("exchange_rates").upsert(rows, { onConflict: "tenant_id,rate_date,currency" });
      if (error) return;
      localStorage.setItem(k, String(Date.now()));
      qc.invalidateQueries({ queryKey: ["exchange_rates_latest"] });
      toast.success("تم تحديث أسعار الصرف تلقائياً من الليرة اليوم");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: st } = await (db.from("tenant_settings") as any).select("fx_reval_mode").eq("tenant_id", tid).maybeSingle();
      if (st?.fx_reval_mode === "on_rate_change") { try { await postFxRevaluation(tid, date); qc.invalidateQueries(); } catch { /* shown on manual run */ } }
    })();
  }, [me?.tenantId, curs.length, base]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
