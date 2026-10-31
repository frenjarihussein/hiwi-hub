import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Activity, FileText, Link2, Plus, RefreshCw, Zap } from "lucide-react";
import { printDocument } from "@/lib/print";
import { describeFault, fmtSolarTime, plantKindLabel } from "@/lib/solar-fault-codes";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { getSolarHistory, setSolarPortalPassword, syncSolarMonitor } from "@/lib/solar-monitor.functions";
import { type SolarUnit, cleaningDue, co2Kg, dailyProduction, electricalLines, energyFlow, isStale, liveCurve, matchingReading, performanceRatio, roi, savings, type SolarReading, type SolarTicket } from "@/lib/solar-monitor";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FaultAnalysisButton } from "./FaultAnalysisButton";
import { TelegramLinkCard } from "./TelegramLinkCard";
import { StationCardButton } from "./StationCard";
import { ClientTelegramCard } from "./ClientTelegramCard";

const STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: "يعمل", cls: "bg-success/15 text-success" },
  standby: { label: "استعداد", cls: "bg-warning/15 text-warning" },
  offline: { label: "غير متصل", cls: "bg-muted text-muted-foreground" },
  fault: { label: "عطل", cls: "bg-destructive/15 text-destructive" },
};
const TICKET: Record<SolarTicket["status"], string> = { open: "مفتوحة", progress: "قيد التنفيذ", done: "منجزة" };

const EMPTY = { provider: "sungrow", plant_id: "", inverter_sn: "", capacity_kwp: "", tariff: "", system_cost: "", peak_sun_hours: "5", cleaning_days: "30", last_cleaned: "", demo: true };

export function SolarMonitor({ projectId, tenantId, canEdit }: { projectId: string; tenantId: string; canEdit: boolean }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const me = useMe().data;
  const loadHistory = useServerFn(getSolarHistory);
  const sync = useServerFn(syncSolarMonitor);
  const cfg = useQuery({
    queryKey: ["solar-monitoring", projectId],
    queryFn: async () => (await db.from("solar_monitoring").select("*").eq("project_id", projectId).maybeSingle()).data ?? null,
    refetchInterval: 5 * 60_000,
  });
  const history = useQuery({
    queryKey: ["solar-history", projectId],
    queryFn: () => loadHistory({ data: { projectId } }),
    enabled: Boolean(cfg.data),
  });
  const projName = useQuery({
    queryKey: ["project-name", projectId],
    queryFn: async () => ((await db.from("projects").select("name").eq("id", projectId).maybeSingle()).data as { name?: string } | null)?.name ?? "",
  });
  const [form, setForm] = useState(EMPTY);
  const [extras, setExtras] = useState<SolarUnit[]>([]);
  const [reading, setReading] = useState<SolarReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ticket, setTicket] = useState("");
  const [portal, setPortal] = useState<string | null>(null);
  const [portalPass, setPortalPass] = useState("");
  const setPortalPasswordFn = useServerFn(setSolarPortalPassword);
  async function savePortalPassword() {
    const token = portal?.split("/solar/")[1];
    if (!token) return;
    try { await setPortalPasswordFn({ data: { token, password: portalPass.trim() } }); toast.success(portalPass.trim() ? "تم حفظ كلمة سر العميل" : "تم إلغاء كلمة السر"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "تعذر الحفظ"); }
  }
  const [syncError, setSyncError] = useState<string | null>(null);
  const [historySaveError, setHistorySaveError] = useState(false);

  useEffect(() => {
    const c = cfg.data as any;
    if (!c) return;
    setForm({
      provider: c.provider ?? "sungrow", plant_id: c.plant_id ?? "", inverter_sn: c.inverter_sn ?? "",
      capacity_kwp: String(c.capacity_kwp ?? ""), tariff: String(c.tariff ?? ""), system_cost: String(c.system_cost ?? ""),
      peak_sun_hours: String(c.peak_sun_hours ?? 5), cleaning_days: String(c.cleaning_days ?? 30), last_cleaned: c.last_cleaned ?? "", demo: c.demo,
    });
    setExtras(Array.isArray(c.extra_units) ? c.extra_units : []);
    setReading(matchingReading(c.last_data, c.demo === true, c.provider || "sungrow"));
  }, [cfg.data]);

  async function refresh() {
    setBusy(true);
    try {
      const r = await sync({ data: { projectId } });
      setReading(r.reading);
      setSyncError(r.error);
      setHistorySaveError(r.historyError);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["solar-history", projectId] }),
        qc.invalidateQueries({ queryKey: ["solar-monitoring", projectId] }),
      ]);
    } catch (e) {
      setSyncError("Unable to refresh inverter readings. Last successful reading is unchanged.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!cfg.data || !canEdit) return undefined;
    void refresh();
    const t = setInterval(() => void refresh(), 5 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data?.project_id, canEdit]);

  async function patch(values: Record<string, unknown>) {
    const { error } = await db.from("solar_monitoring").update({ ...values, updated_at: new Date().toISOString() }).eq("project_id", projectId);
    if (error) { toast.error(error.message); return false; }
    qc.invalidateQueries({ queryKey: ["solar-monitoring", projectId] });
    return true;
  }

  async function save() {
    const { error } = await db.from("solar_monitoring").upsert(
      {
        project_id: projectId, tenant_id: tenantId, provider: form.provider,
        plant_id: form.plant_id || null, inverter_sn: form.inverter_sn || null,
        capacity_kwp: Number(form.capacity_kwp) || 0, tariff: Number(form.tariff) || 0,
        system_cost: Number(form.system_cost) || 0, peak_sun_hours: Number(form.peak_sun_hours) || 5,
        cleaning_days: Number(form.cleaning_days) || 30, last_cleaned: form.last_cleaned || null,
        demo: form.demo, updated_at: new Date().toISOString(),
        extra_units: extras.filter((u) => u.plant_id.trim()) as never,
        ...((cfg.data as any)?.provider !== form.provider || (cfg.data as any)?.plant_id !== (form.plant_id || null) || (cfg.data as any)?.demo !== form.demo || JSON.stringify((cfg.data as any)?.extra_units ?? []) !== JSON.stringify(extras.filter((u) => u.plant_id.trim())) ? { last_data: null, last_sync: null } : {}),
      },
      { onConflict: "project_id" },
    );
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ ربط الإنفرتر");
    setSyncError(null);
    setReading(null);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["solar-monitoring", projectId] });
  }

  async function sharePortal() {
    const existing = (await db.from("share_links").select("token").eq("entity_type", "solar").eq("entity_id", projectId).eq("revoked", false).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle()).data;
    let token = existing?.token as string | undefined;
    if (!token) {
      const { data, error } = await db.from("share_links").insert({ entity_type: "solar", entity_id: projectId, label: "متابعة المحطة", created_by: me?.userId, tenant_id: tenantId }).select("token").single();
      if (error) { toast.error(error.message); return; }
      token = data.token;
    }
    const url = `${window.location.origin}/solar/${token}`;
    setPortal(url);
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.success("تم نسخ رابط العميل");
  }

  if (cfg.isLoading) return null;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  if (!cfg.data || editing) {
    if (!canEdit) return <p className="text-sm text-muted-foreground">لم يتم ربط هذا المشروع بإنفرتر بعد.</p>;
    const sma = form.provider === "sma";
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">نوع الإنفرتر
          <select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={form.provider} onChange={set("provider")}>
            <option value="sungrow">سن غرو (iSolarCloud)</option>
            <option value="sma">SMA (Sunny Portal / ennexOS)</option>
          </select>
        </label>
        <label className="text-sm">{sma ? "معرّف المحطة في Sunny Portal (Plant ID)" : "معرّف المحطة في iSolarCloud (Plant ID)"}<Input value={form.plant_id} onChange={set("plant_id")} /></label>
        <label className="text-sm">الرقم التسلسلي للإنفرتر (S/N)<Input value={form.inverter_sn} onChange={set("inverter_sn")} /></label>
        <label className="text-sm">استطاعة المحطة (kWp)<Input type="number" value={form.capacity_kwp} onChange={set("capacity_kwp")} /></label>
        <label className="text-sm">سعر الكيلوواط ساعي $ (مصانع 0.02 · مزارع شمسية 0.04)<Input type="number" step="0.01" value={form.tariff} onChange={set("tariff")} /></label>
        <label className="text-sm">تكلفة المنظومة (لحساب الاسترداد)<Input type="number" value={form.system_cost} onChange={set("system_cost")} /></label>
        <label className="text-sm">ساعات الذروة الشمسية اليومية<Input type="number" step="0.1" value={form.peak_sun_hours} onChange={set("peak_sun_hours")} /></label>
        <label className="text-sm">التنظيف كل (يوم)<Input type="number" value={form.cleaning_days} onChange={set("cleaning_days")} /></label>
        <label className="text-sm">تاريخ آخر تنظيف<Input type="date" value={form.last_cleaned} onChange={set("last_cleaned")} /></label>
        <div className="space-y-2 rounded-md border p-3 sm:col-span-2">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">إنفرترات / محطات إضافية في نفس المشروع</p>
            <Button size="sm" variant="outline" onClick={() => setExtras([...extras, { id: crypto.randomUUID(), label: `إنفرتر ${extras.length + 2}`, provider: "sungrow", plant_id: "", capacity_kwp: 0 }])}><Plus className="size-4" />إضافة إنفرتر</Button></div>
          {extras.length === 0 && <p className="text-xs text-muted-foreground">يُجمع إنتاج كل الإنفرترات المضافة مع الإنفرتر الرئيسي في قراءة واحدة للمشروع.</p>}
          {extras.map((u, i) => {
            const up = (v: Partial<SolarUnit>) => setExtras(extras.map((x, j) => (j === i ? { ...x, ...v } : x)));
            return (
              <div key={u.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_6rem_auto]">
                <Input aria-label="اسم الإنفرتر" value={u.label} onChange={(e) => up({ label: e.target.value })} />
                <select aria-label="نوع الإنفرتر" className="h-9 rounded-md border bg-background px-2 text-sm" value={u.provider} onChange={(e) => up({ provider: e.target.value as SolarUnit["provider"] })}><option value="sungrow">سن غرو</option><option value="sma">SMA</option></select>
                <Input aria-label="معرّف المحطة" placeholder="Plant ID" value={u.plant_id} onChange={(e) => up({ plant_id: e.target.value })} />
                <Input aria-label="الاستطاعة" type="number" placeholder="kWp" value={u.capacity_kwp || ""} onChange={(e) => up({ capacity_kwp: Number(e.target.value) || 0 })} />
                <Button size="sm" variant="ghost" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>حذف</Button>
              </div>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.demo} onChange={(e) => setForm({ ...form, demo: e.target.checked })} />
          وضع تجريبي (بيانات محاكاة إلى أن يتم ربط حساب المنصة)
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button onClick={() => void save()}><Zap className="size-4" />حفظ الربط</Button>
          {cfg.data && <Button variant="outline" onClick={() => setEditing(false)}>إلغاء</Button>}
        </div>
      </div>
    );
  }

  const c = cfg.data as any;
  const r = matchingReading(reading, c.demo === true, c.provider || "sungrow");
  const st = STATUS[r?.status ?? "offline"] ?? { label: "غير متصل", cls: "bg-muted text-muted-foreground" };
  const pct = r && r.capacity_kwp ? Math.min(100, (r.power_kw / r.capacity_kwp) * 100) : 0;
  const tariff = Number(c.tariff);
  const ret = r ? roi(r.total_kwh, tariff, Number(c.system_cost), r.today_kwh) : null;
  const pr = r ? performanceRatio(r.today_kwh, Number(c.capacity_kwp), Number(c.peak_sun_hours)) : 0;
  const due = cleaningDue(c.last_cleaned, Number(c.cleaning_days), new Date());
  const tickets: SolarTicket[] = Array.isArray(c.tickets) ? c.tickets : [];
  const daily = dailyProduction(history.data ?? [], new Date());
  const staleNow = !c.demo && isStale(r?.at ?? null, new Date());

  async function addTicket() {
    if (!ticket.trim()) return;
    const t: SolarTicket = { id: crypto.randomUUID(), title: ticket.trim(), status: "open", cost: 0, at: new Date().toISOString() };
    if (await patch({ tickets: [t, ...tickets] })) setTicket("");
  }
  function monthlyReport() {
    if (!r) return;
    const days = dailyProduction(history.data ?? [], new Date(), 30);
    const sumKwh = days.reduce((s, d) => s + d.kwh, 0);
    const kwp = Number(c.capacity_kwp) + (Array.isArray(c.extra_units) ? c.extra_units.reduce((s: number, u: SolarUnit) => s + (Number(u.capacity_kwp) || 0), 0) : 0);
    printDocument({
      title: "تقرير المراقبة الشامل للمحطة",
      company: me?.tenantName,
      meta: [
        ["الفترة", days.length ? `${days[0]!.day} — ${days[days.length - 1]!.day}` : "—"],
        ["الاستطاعة", `${kwp} kWp`],
        ["الحالة الآن", st.label],
        ["إنتاج الشهر الجاري", `${r.month_kwh.toFixed(0)} kWh`],
        ["الإنتاج التراكمي", `${(r.total_kwh / 1000).toFixed(1)} MWh`],
        ["CO₂ المتجنَّب", `${(co2Kg(r.total_kwh) / 1000).toFixed(1)} طن`],
        ["كفاءة الأداء اليوم (PR)", `${pr}%`],
        ["استرداد رأس المال", ret && Number(c.system_cost) > 0 ? `${ret.pct}%` : "—"],
        ["عدد الإنفرترات", String(1 + (Array.isArray(c.extra_units) ? c.extra_units.length : 0))],
      ],
      columns: ["اليوم", "الإنتاج (kWh)", "الوفر", "الكفاءة PR"],
      rows: days.map((d) => [d.day, d.kwh.toFixed(1), String(savings(d.kwh, tariff)), `${performanceRatio(d.kwh, kwp, Number(c.peak_sun_hours))}%`]),
      footer: [["إجمالي إنتاج الفترة", `${sumKwh.toFixed(1)} kWh`], ["إجمالي الوفر", String(savings(sumKwh, tariff))]],
      sections: [
        { title: "الحالة اللحظية", columns: ["البند", "القيمة"], rows: [["المحطة", projName.data || "—"], ["المزود", c.provider === "sma" ? "SMA" : "Sungrow"], ["القدرة اللحظية", `${Number(r.power_kw ?? 0).toFixed(2)} kW`], ["إنتاج اليوم", `${Number(r.today_kwh ?? 0).toFixed(1)} kWh`], ["آخر قراءة", fmtSolarTime(r.at)], ["نوع المحطة", plantKindLabel(r.extra?.plant_kind) || "—"]] },
        { title: "الإنذارات في آخر قراءة", columns: ["رمز العطل", "الوصف", "الشرح", "الاقتراح", "الوقت"], rows: (r.alarms ?? []).map((a: any) => { const f = describeFault(a.code, a.text); return [f.code + (f.name ? ` (${f.name})` : ""), f.text, f.explain, f.advice, fmtSolarTime(a.at)]; }) },
        { title: "تذاكر الصيانة", columns: ["العنوان", "الحالة", "الكلفة", "التاريخ"], rows: tickets.map((x) => [x.title, x.status === "open" ? "مفتوحة" : x.status === "progress" ? "قيد المعالجة" : "منجزة", String(x.cost ?? 0), new Date(x.at).toLocaleDateString("ar")]) },
      ],
      notes: r.source === "demo" ? "تنبيه: هذه بيانات تجريبية وليست قراءات حقيقية." : null,
      signatures: ["مهندس المتابعة", "العميل"],
    });
  }
  const nextStatus = (s: SolarTicket["status"]): SolarTicket["status"] => (s === "open" ? "progress" : s === "progress" ? "done" : "open");

  return (
    <div className="space-y-4">
      <TelegramLinkCard />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Activity className="size-4" />
          <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.provider === "sma" ? "SMA" : "سن غرو"}</span>
          {Array.isArray(c.extra_units) && c.extra_units.length > 0 && <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.extra_units.length + 1} إنفرترات مجمّعة</span>}
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{r ? st.label : t("لا توجد قراءات بعد.")}</span>
          {r?.source === "demo" && <span className="rounded bg-muted px-2 py-0.5 text-xs">بيانات تجريبية</span>}
          {r && <span className="text-muted-foreground">{t("آخر قراءة ناجحة")} {fmtSolarTime(r.at)}</span>}
          {r?.extra?.plant_kind && <span className="rounded-full border px-2 py-0.5 text-xs">{plantKindLabel(r.extra.plant_kind)}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => canEdit ? void refresh() : void qc.invalidateQueries({ queryKey: ["solar-monitoring", projectId] })}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />تحديث</Button>
          {r && <Button size="sm" variant="outline" onClick={monthlyReport}><FileText className="size-4" />تقرير المراقبة الشامل</Button>}
          {r && <StationCardButton data={{
            name: projName.data || "محطة شمسية", company: me?.tenantName, provider: c.provider === "sma" ? "SMA" : "سن غرو", status: st.label,
            inverters: Math.max(r.electrical?.filter((e: any) => e.kind !== "meter").length ?? 0, 1 + (Array.isArray(c.extra_units) ? c.extra_units.length : 0)),
            capacityKwp: Number(r.capacity_kwp) || Number(c.capacity_kwp) || 0, powerKw: r.power_kw, todayKwh: r.today_kwh, monthKwh: r.month_kwh, totalKwh: r.total_kwh,
            co2Ton: co2Kg(r.total_kwh) / 1000, at: r.at, demo: r.source === "demo",
          }} />}
          {canEdit && <Button size="sm" variant="outline" onClick={() => void sharePortal()}><Link2 className="size-4" />رابط العميل</Button>}
          {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>إعدادات الربط</Button>}
        </div>
      </div>
      {canEdit && <ClientTelegramCard projectId={projectId} />}
      {syncError && <p role="alert" className="border-s-2 border-warning ps-3 text-sm text-warning">{t(syncError === "Live connection settings are incomplete." ? "إعدادات الربط الحقيقي غير مكتملة." : "تعذر تحديث قراءات الإنفرتر. آخر قراءة ناجحة لم تتغير.")}</p>}
      {staleNow && !syncError && <p role="alert" className="border-s-2 border-warning ps-3 text-sm text-warning">{t("لم تصل قراءات جديدة من الإنفرتر لفترة أطول من المعتاد — قد يكون الربط أو الإنفرتر متوقفاً.")}</p>}
      {!r && <p className="text-sm text-muted-foreground">{t("لا توجد قراءات بعد.")}</p>}
      {(history.isError || historySaveError) && <p role="alert" className="text-sm text-warning">{lang === "en" ? "Reading history is unavailable. Current readings are shown separately." : "تعذر تحميل أو حفظ سجل القراءات؛ القراءة الحالية معروضة بشكل مستقل."}</p>}
      {portal && (
        <div className="space-y-2 rounded-md border p-3">
          <Input readOnly value={portal} onFocus={(e) => e.currentTarget.select()} dir="ltr" />
          <div className="flex flex-wrap items-center gap-2">
            <Input type="text" placeholder="كلمة سر العميل (اتركها فارغة لإلغائها)" value={portalPass} onChange={(e) => setPortalPass(e.target.value)} maxLength={64} className="max-w-xs" />
            <Button size="sm" onClick={() => void savePortalPassword()}>حفظ كلمة السر</Button>
          </div>
          <p className="text-xs text-muted-foreground">أرسل الرابط وكلمة السر للعميل؛ يرى محطته فقط دون أي بيانات أخرى.</p>
        </div>
      )}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Kpi label="القدرة اللحظية" value={`${r.power_kw.toFixed(2)} kW`} sub={`${pct.toFixed(0)}% من ${r.capacity_kwp} kWp`} />
            <Kpi label="إنتاج اليوم" value={`${r.today_kwh.toFixed(1)} kWh`} sub={`وفر ${savings(r.today_kwh, tariff)}`} />
            <Kpi label="إنتاج الشهر" value={`${(r.month_kwh / 1000).toFixed(2)} MWh`} sub={`وفر ${savings(r.month_kwh, tariff)}`} />
            <Kpi label="الإنتاج التراكمي" value={`${(r.total_kwh / 1000).toFixed(1)} MWh`} sub={`وفر ${savings(r.total_kwh, tariff)}`} />
            <Kpi label="CO₂ المتجنَّب" value={`${(co2Kg(r.total_kwh) / 1000).toFixed(1)} طن`} />
          </div>
          <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Kpi label="استرداد رأس المال" value={ret && Number(c.system_cost) > 0 ? `${ret.pct}%` : "—"} sub={ret && ret.yearsLeft ? `متبقٍ تقريباً ${ret.yearsLeft} سنة` : Number(c.system_cost) > 0 ? "تم الاسترداد" : "أدخل تكلفة المنظومة"} />
            <Kpi label="كفاءة الأداء اليوم (PR)" value={`${pr}%`} sub={pr && pr < 70 ? "أقل من المتوقع — افحص الألواح" : "ضمن المعدل"} />
            <Kpi label="تنظيف الألواح" value={!c.last_cleaned ? "—" : due < 0 ? `متأخر ${-due} يوم` : `بعد ${due} يوم`} />
          </div>
          {(() => { const fl = energyFlow(r.electrical, r.power_kw); return fl && (
            <div className="grid grid-cols-3 gap-2">
              <Kpi label="إنتاج الألواح" value={`${fl.pv_kw} kW`} />
              <Kpi label="استهلاك المنشأة" value={`${fl.load_kw} kW`} />
              <Kpi label={fl.grid_kw >= 0 ? "سحب من الشبكة" : "توريد للشبكة"} value={`${Math.abs(fl.grid_kw)} kW`} />
            </div>); })()}
          {r.electrical && r.electrical.length > 0 && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="mb-2 font-semibold">{t("القياسات الكهربائية اللحظية")}</p>
              <ul className="space-y-1 text-muted-foreground" dir="auto">{electricalLines(r.electrical).map((l, i) => <li key={i} className={/^(إنفرتر|عداد):/.test(l) ? "pt-1 font-medium text-foreground" : ""}>{l}</li>)}</ul>
            </div>
          )}
          {canEdit && c.last_cleaned !== new Date().toISOString().slice(0, 10) && (
            <Button size="sm" variant="outline" onClick={() => void patch({ last_cleaned: new Date().toISOString().slice(0, 10) })}>تسجيل تنظيف اليوم</Button>
          )}
          {liveCurve(r, history.data ?? []).length > 1 && (
            <div className="h-56 rounded-lg border p-2" dir="ltr">
              <ResponsiveContainer>
                <AreaChart data={liveCurve(r, history.data ?? [])}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="t" fontSize={11} />
                  <YAxis fontSize={11} unit=" kW" />
                  <Tooltip />
                  <Area dataKey="kw" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
      {daily.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold">{lang === "en" ? "Daily production — last 7 days (UTC)" : "مقارنة الإنتاج اليومي — آخر ٧ أيام (UTC)"}</p>
          <div className="h-40 rounded-lg border p-2" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} unit=" kWh" />
                <Tooltip />
                <Bar dataKey="kwh" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div>
        <p className="mb-1 text-sm font-semibold">{t("الأعطال والتنبيهات")}</p>
            {r.alarms.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أعطال حالياً.</p>
            ) : (
              <ul className="space-y-1 text-sm">{r.alarms.map((a, i) => <li key={i} className="rounded border border-destructive/40 p-2"><FaultDetail a={a} />{!cfg.data?.demo && <FaultAnalysisButton projectId={projectId} index={i} />}</li>)}</ul>
            )}
          </div>
        </>
      )}
      <div>
        <p className="mb-1 text-sm font-semibold">تذاكر الصيانة</p>
        {canEdit && (
          <div className="mb-2 flex gap-2">
            <Input placeholder="وصف المشكلة أو الزيارة" value={ticket} onChange={(e) => setTicket(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addTicket()} />
            <Button size="sm" onClick={() => void addTicket()}><Plus className="size-4" />إضافة</Button>
          </div>
        )}
        {tickets.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد تذاكر.</p> : (
          <ul className="space-y-1 text-sm">
            {tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded border p-2">
                <span>{t.title} <span className="text-xs text-muted-foreground">{new Date(t.at).toLocaleDateString("ar")}</span></span>
                <button disabled={!canEdit} className="rounded bg-muted px-2 py-0.5 text-xs" onClick={() => void patch({ tickets: tickets.map((x) => (x.id === t.id ? { ...x, status: nextStatus(x.status) } : x)) })}>{TICKET[t.status]}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FaultDetail({ a }: { a: { code: string; text: string; at: string } }) {
  const f = describeFault(a.code, a.text);
  return (
    <div className="mb-2 space-y-1">
      <div><b>رمز العطل:</b> {f.code}{f.name ? ` (${f.name})` : ""} — {f.text}</div>
      <div><b>الشرح:</b> {f.explain}</div>
      <div><b>الاقتراحات:</b><p className="whitespace-pre-line">{f.advice}</p></div>
      <div className="text-xs text-muted-foreground">الوقت: {fmtSolarTime(a.at)}</div>
    </div>
  );
}
