import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getSolarPortal } from "@/lib/solar-monitor.functions";
import { co2Kg, savings } from "@/lib/solar-monitor";

export const Route = createFileRoute("/solar/$token")({
  head: () => ({ meta: [
    { title: "متابعة محطتي الشمسية | يوسف سوفت" },
    { name: "description", content: "إنتاج المحطة الشمسية والوفر المحقق بشكل مباشر." },
    { property: "og:title", content: "متابعة محطتي الشمسية | يوسف سوفت" },
    { property: "og:description", content: "إنتاج المحطة الشمسية والوفر المحقق بشكل مباشر." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Portal,
});

const STATUS: Record<string, { label: string; dot: string }> = {
  running: { label: "تعمل", dot: "bg-success" },
  standby: { label: "استعداد", dot: "bg-warning" },
  fault: { label: "عطل", dot: "bg-destructive" },
  offline: { label: "غير متصلة بالإنترنت", dot: "bg-muted-foreground" },
};

function Portal() {
  const { token } = Route.useParams();
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState<string | undefined>(undefined);
  const q = useQuery({
    queryKey: ["solar-portal", token, submitted],
    queryFn: () => getSolarPortal({ data: submitted ? { token, password: submitted } : { token } }),
    refetchInterval: 5 * 60_000,
  });
  if (q.isLoading) return <p className="p-8 text-center text-muted-foreground">جارٍ التحميل…</p>;
  const d = q.data;
  if (d && !d.ok && "needsPassword" in d && d.needsPassword) {
    return (
      <main dir="rtl" className="mx-auto max-w-sm space-y-4 p-6 pt-20">
        <h1 className="text-xl font-bold">متابعة محطتي الشمسية</h1>
        <p className="text-sm text-muted-foreground">أدخل كلمة السر التي زودتك بها الشركة.</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setSubmitted(password); }}>
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64}
            className="h-10 w-full rounded-md border bg-background px-3" aria-label="كلمة السر" />
          {"wrong" in d && d.wrong && <p role="alert" className="text-sm text-destructive">كلمة السر غير صحيحة.</p>}
          <button type="submit" className="h-10 w-full rounded-md bg-primary font-medium text-primary-foreground">دخول</button>
        </form>
      </main>
    );
  }
  if (!d || !d.ok) return <p className="p-8 text-center text-muted-foreground">الرابط غير صالح أو منتهي.</p>;
  const r = d.reading;
  const st = r ? STATUS[r.status] : null;
  return (
    <main dir="rtl" className="mx-auto max-w-2xl space-y-4 p-4">
      <header>
        <p className="text-sm text-muted-foreground">{d.company}</p>
        <h1 className="text-2xl font-bold">{d.project}</h1>
        {st && <p className="mt-1 flex items-center gap-2 text-sm"><span className={`size-2.5 rounded-full ${st.dot}`} />{st.label}</p>}
        {d.lastSync && <p className="text-xs text-muted-foreground">آخر تحديث {new Date(d.lastSync).toLocaleString("ar")}</p>}
      </header>
      {d.stale && r?.source !== "demo" && <p role="alert" className="text-sm text-warning">القراءة متأخرة؛ المعروض هو آخر إنتاج مسجل وليس قراءة حية جديدة.</p>}
      {!r ? <p className="text-muted-foreground">لا توجد قراءات بعد.</p> : (
        <div className="space-y-3">
          {r.source === "demo" && <p className="text-sm text-warning">بيانات تجريبية</p>}
          <div className="grid grid-cols-2 gap-3">
          <Box label="القدرة الآن" value={`${r.power_kw.toFixed(2)} kW`} />
          <Box label="إنتاج اليوم" value={`${r.today_kwh.toFixed(1)} kWh`} />
          <Box label="إنتاج الشهر" value={`${r.month_kwh.toFixed(0)} kWh`} />
          <Box label="الإنتاج التراكمي" value={`${r.total_kwh.toFixed(0)} kWh`} />
          <Box label="الوفر الكلي" value={String(savings(r.total_kwh, d.tariff))} />
          <Box label="CO₂ المتجنَّب" value={`${(co2Kg(r.total_kwh) / 1000).toFixed(1)} طن`} />
          </div>
        </div>
      )}
      {d.daily.length > 0 && (() => {
        const max = Math.max(...d.daily.map((x) => x.kwh), 1);
        const total = d.daily.reduce((s, x) => s + x.kwh, 0);
        return (
          <section className="space-y-2 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">إنتاج آخر 30 يوماً</h2>
              <button onClick={() => window.print()} className="rounded-md border px-3 py-1 text-sm print:hidden">طباعة / حفظ PDF</button>
            </div>
            <p className="text-sm text-muted-foreground">المجموع {total.toFixed(1)} kWh · الوفر {savings(total, d.tariff)}</p>
            <ul className="space-y-1">
              {d.daily.map((x) => (
                <li key={x.day} className="flex items-center gap-2 text-xs">
                  <span className="num w-20 shrink-0">{x.day}</span>
                  <span className="h-3 rounded bg-primary" style={{ width: `${(x.kwh / max) * 60}%` }} />
                  <span className="num">{x.kwh}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}
    </main>
  );
}
function Box({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="num text-xl font-bold">{value}</p></div>;
}
