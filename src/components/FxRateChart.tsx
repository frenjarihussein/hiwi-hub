import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { today } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Range = "1m" | "1y" | "5y" | "custom";
const RANGES: { v: Range; l: string }[] = [{ v: "1m", l: "آخر شهر" }, { v: "1y", l: "آخر سنة" }, { v: "5y", l: "آخر 5 سنوات" }, { v: "custom", l: "من تاريخ لتاريخ" }];

function shift(r: Range) {
  const d = new Date();
  if (r === "1m") d.setMonth(d.getMonth() - 1);
  else if (r === "1y") d.setFullYear(d.getFullYear() - 1);
  else d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
}
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 6 });

/** Daily exchange-rate curve for one currency against the base currency. */
export function FxRateChart({ base, currencies }: { base: string; currencies: { code: string; name: string }[] }) {
  const { data: me } = useMe();
  const [cur, setCur] = useState("");
  const [range, setRange] = useState<Range>("1y");
  const [from, setFrom] = useState(shift("1y"));
  const [to, setTo] = useState(today());
  const code = cur || currencies[0]?.code || "";
  const f = range === "custom" ? from : shift(range);
  const t = range === "custom" ? to : today();

  const q = useQuery({
    queryKey: ["fx_chart", me?.tenantId, code, f, t],
    enabled: !!me?.tenantId && !!code,
    queryFn: async () => {
      const { data } = await db.from("exchange_rates").select("rate_date,rate_to_usd").eq("tenant_id", me!.tenantId).eq("currency", code)
        .gte("rate_date", f).lte("rate_date", t).order("rate_date", { ascending: true }).limit(5000);
      return (data ?? []).map((r: { rate_date: string; rate_to_usd: number }) => ({ d: r.rate_date, v: Number(r.rate_to_usd) }));
    },
  });
  const rows: { d: string; v: number }[] = q.data ?? [];
  const stats = useMemo(() => {
    if (!rows.length) return null;
    const vs = rows.map((r) => r.v);
    const first = vs[0]!, last = vs[vs.length - 1]!;
    return { min: Math.min(...vs), max: Math.max(...vs), avg: vs.reduce((a, b) => a + b, 0) / vs.length, last, chg: first ? ((last - first) / first) * 100 : 0 };
  }, [rows]);

  return (
    <div className="mt-6 max-w-3xl rounded-lg border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">منحني سعر الصرف: {code} مقابل 1 {base}</h3>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={code} onChange={(e) => setCur(e.target.value)}>
          {currencies.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
        </select>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {RANGES.map((r) => <Button key={r.v} size="sm" variant={range === r.v ? "default" : "outline"} onClick={() => setRange(r.v)}>{r.l}</Button>)}
        {range === "custom" && (
          <>
            <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-sm">إلى</span>
            <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>
      {stats && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          {[["آخر سعر", fmt(stats.last)], ["أعلى", fmt(stats.max)], ["أدنى", fmt(stats.min)], ["المتوسط", fmt(stats.avg)], ["التغير", `${stats.chg >= 0 ? "+" : ""}${stats.chg.toFixed(2)}%`]].map(([l, v]) => (
            <div key={l} className="rounded-md border p-2"><div className="text-muted-foreground">{l}</div><div className="num font-semibold">{v}</div></div>
          ))}
        </div>
      )}
      <div className="h-64">
        {rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="d" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} width={60} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => [fmt(v), "السعر"]} labelStyle={{ color: "var(--foreground)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="v" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} dot={rows.length < 40} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{q.isLoading ? "جارٍ التحميل..." : "لا توجد أسعار محفوظة في هذه الفترة"}</div>
        )}
      </div>
    </div>
  );
}
