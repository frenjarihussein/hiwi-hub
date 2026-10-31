/** Shared, browser-safe solar monitoring types and calculations. */
export type SolarStatus = "running" | "standby" | "offline" | "fault";
export type SolarReading = {
  at: string;
  power_kw: number;
  capacity_kwp: number;
  today_kwh: number;
  month_kwh: number;
  total_kwh: number;
  status: SolarStatus;
  curve: { t: string; kw: number }[];
  alarms: { code: string; text: string; at: string }[];
  source: "sungrow" | "sma" | "demo";
  /** Optional provider details (income, CO2, equivalent hours, counters, site info). */
  extra?: { plant_kind?: "ess" | "ongrid" | undefined; today_income?: number | undefined; total_income?: number | undefined; currency?: string | undefined; co2_kg?: number | undefined; equivalent_hours?: number | undefined; alarm_count?: number | undefined; fault_count?: number | undefined; grid?: string | undefined; install_date?: string | undefined; location?: string | undefined };
  /** Per-device live electrical telemetry; only present when the provider returned it. */
  electrical?: ElectricalDevice[] | undefined;
};

/** Bell-shaped sun output between 6:00 and 18:00, as a fraction of capacity. */
export function sunFactor(hour: number): number {
  if (hour <= 6 || hour >= 18) return 0;
  return Math.sin(((hour - 6) / 12) * Math.PI) * 0.82;
}

export function simulateReading(cap: number, now: Date): SolarReading {
  const h = now.getHours() + now.getMinutes() / 60;
  const curve: { t: string; kw: number }[] = [];
  let today = 0;
  for (let x = 6; x <= Math.min(h, 18); x += 0.5) {
    const kw = cap * sunFactor(x);
    curve.push({ t: `${String(Math.floor(x)).padStart(2, "0")}:${x % 1 ? "30" : "00"}`, kw: +kw.toFixed(2) });
    today += kw * 0.5;
  }
  const power = cap * sunFactor(h);
  const dailyFull = cap * 4.9;
  return {
    at: now.toISOString(),
    power_kw: +power.toFixed(2),
    capacity_kwp: cap,
    today_kwh: +today.toFixed(1),
    month_kwh: +(dailyFull * (now.getDate() - 1) + today).toFixed(0),
    total_kwh: +(dailyFull * 365 * 1.3).toFixed(0),
    status: power > 0 ? "running" : "standby",
    curve,
    alarms: [],
    source: "demo",
  };
}

/** Saved money from produced energy at the configured tariff. */
export const savings = (kwh: number, tariff: number) => +(kwh * tariff).toFixed(2);
/** Avoided CO2 in kg (0.7 kg per kWh grid average). */
export const co2Kg = (kwh: number) => +(kwh * 0.7).toFixed(0);

/** Payback progress from cumulative savings against system cost. */
export function roi(totalKwh: number, tariff: number, cost: number, dailyKwh: number) {
  const saved = savings(totalKwh, tariff);
  const pct = cost > 0 ? Math.min(100, (saved / cost) * 100) : 0;
  const yearly = dailyKwh * 365 * tariff;
  const yearsLeft = cost > saved && yearly > 0 ? +((cost - saved) / yearly).toFixed(1) : 0;
  return { saved, pct: +pct.toFixed(1), yearsLeft };
}
/** Performance Ratio = actual kWh ÷ (kWp × peak sun hours), in %. */
export function performanceRatio(kwh: number, kwp: number, psh: number) {
  if (!kwp || !psh) return 0;
  return +Math.min(150, (kwh / (kwp * psh)) * 100).toFixed(1);
}
/** Days until the next panel cleaning (negative = overdue). */
export function cleaningDue(last: string | null, everyDays: number, now: Date) {
  if (!last) return 0;
  const next = new Date(last).getTime() + everyDays * 86400_000;
  return Math.ceil((next - now.getTime()) / 86400_000);
}
export type SolarTicket = { id: string; title: string; status: "open" | "progress" | "done"; cost: number; at: string };

/** True when the last successful sync is older than the allowed gap (missing data / outage). */
export function isStale(lastSync: string | null, now: Date, maxMinutes = 30): boolean {
  if (!lastSync || !Number.isFinite(Date.parse(lastSync))) return true;
  return now.getTime() - Date.parse(lastSync) > maxMinutes * 60_000;
}

/** One row of daily energy from the reading history, oldest first for charts. */
export type DailyProduction = { day: string; kwh: number };

/** Aggregates raw history rows into one entry per day (max today_kwh of the day), limited to the last `days`. */
export function dailyProduction(history: { read_at: string; data: unknown }[], now: Date, days = 7): DailyProduction[] {
  const best = new Map<string, number>();
  const minDate = new Date(now);
  minDate.setUTCHours(0, 0, 0, 0);
  minDate.setUTCDate(minDate.getUTCDate() - Math.max(0, days - 1));
  const minAt = minDate.getTime();
  for (const row of history) {
    const at = Date.parse(row.read_at);
    if (!Number.isFinite(at) || at < minAt || at > now.getTime()) continue;
    const kwh = (row.data as { today_kwh?: unknown } | null)?.today_kwh;
    if (typeof kwh !== "number" || !Number.isFinite(kwh) || kwh < 0) continue;
    const day = new Date(row.read_at).toISOString().slice(0, 10);
    best.set(day, Math.max(best.get(day) ?? 0, kwh));
  }
  return [...best.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, kwh]) => ({ day, kwh: +kwh.toFixed(1) }));
}

/** Never show a cached demonstration or another provider as a real measurement. */
export function matchingReading(value: unknown, demo: boolean, provider: string): SolarReading | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<SolarReading>;
  if (r.source !== (demo ? "demo" : provider) || typeof r.at !== "string" || !Number.isFinite(Date.parse(r.at))) return null;
  if (![r.power_kw, r.capacity_kwp, r.today_kwh, r.month_kwh, r.total_kwh].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null;
  if (!r.status || !["running", "standby", "offline", "fault"].includes(r.status) || !Array.isArray(r.curve) || !Array.isArray(r.alarms)) return null;
  return r as SolarReading;
}

export async function acquireSolarReading(options: {
  demo: boolean; provider: string; configured: boolean; capacity: number;
  previous: unknown; now: Date; fetchLive: () => Promise<SolarReading>;
}): Promise<{ reading: SolarReading | null; error: string | null; cache: boolean }> {
  const previous = matchingReading(options.previous, options.demo, options.provider);
  if (options.demo) return { reading: simulateReading(options.capacity, options.now), error: null, cache: true };
  if (!options.configured) return { reading: previous, error: "Live connection settings are incomplete.", cache: false };
  try {
    const reading = matchingReading(await options.fetchLive(), false, options.provider);
    if (!reading) throw new Error("Invalid inverter measurement");
    return { reading, error: null, cache: true };
  } catch {
    return { reading: previous, error: "Unable to refresh inverter readings. Last successful reading is unchanged.", cache: false };
  }
}

/** Extra inverter/station attached to the same project (beyond the primary plant). */
export type SolarUnit = { id: string; label: string; provider: "sungrow" | "sma"; plant_id: string; capacity_kwp: number };

/** Sums several inverter readings into one project reading; worst status wins, curves add by time slot. */
export function combineReadings(rs: SolarReading[]): SolarReading | null {
  if (!rs.length) return null;
  if (rs.length === 1) return rs[0]!;
  const rank: Record<SolarStatus, number> = { running: 0, standby: 1, offline: 2, fault: 3 };
  const anyRunning = rs.some((r) => r.status === "running");
  const worst = rs.reduce<SolarStatus>((w, r) => (rank[r.status] > rank[w] ? r.status : w), "running");
  const curve = new Map<string, number>();
  rs.forEach((r) => r.curve.forEach((p) => curve.set(p.t, (curve.get(p.t) ?? 0) + p.kw)));
  const sum = (k: "power_kw" | "capacity_kwp" | "today_kwh" | "month_kwh" | "total_kwh") => +rs.reduce((s, r) => s + Number(r[k] || 0), 0).toFixed(2);
  return {
    at: rs.map((r) => r.at).sort()[0]!,
    power_kw: sum("power_kw"), capacity_kwp: sum("capacity_kwp"), today_kwh: sum("today_kwh"), month_kwh: sum("month_kwh"), total_kwh: sum("total_kwh"),
    status: worst === "fault" ? "fault" : anyRunning ? "running" : worst,
    curve: [...curve.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, kw]) => ({ t, kw: +kw.toFixed(2) })),
    alarms: rs.flatMap((r) => r.alarms),
    ...(rs.some((r) => r.electrical?.length) ? { electrical: rs.flatMap((r) => r.electrical ?? []) } : {}),
    source: rs[0]!.source,
  };
}

/** Today's power curve: provider curve when supplied, otherwise built from saved same-day snapshots. */
export function liveCurve(reading: SolarReading, history: { read_at: string; data: SolarReading }[]): { t: string; kw: number }[] {
  if (reading.curve.length > 0) return reading.curve;
  const day = reading.at.slice(0, 10);
  const pts = new Map<string, number>();
  for (const h of history) if (h.read_at.slice(0, 10) === day) pts.set(h.read_at, h.data.power_kw);
  pts.set(reading.at, reading.power_kw);
  return [...pts.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([at, kw]) => ({ t: new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), kw: +kw.toFixed(2) }));
}

/** In-app alert text when a station newly enters a fault/offline state or reports new alarms; null otherwise. */
export function newAlertText(prev: SolarReading | null, next: SolarReading): string | null {
  const bad = (r: SolarReading | null) => !!r && (r.status === "fault" || r.status === "offline");
  const codes = (r: SolarReading | null) => new Set((r?.alarms ?? []).map((a) => a.code + a.text));
  const fresh = next.alarms.filter((a) => !codes(prev).has(a.code + a.text));
  if (!fresh.length && (!bad(next) || bad(prev))) return null;
  const head = next.status === "offline" ? "المحطة غير متصلة" : next.status === "fault" ? "عطل في المحطة" : "إنذار جديد";
  return [head, ...fresh.map((a) => `${a.code} — ${a.text}`)].join("\n").slice(0, 500);
}

export type ElectricalDevice = {
  device: string;
  kind: "inverter" | "meter";
  model?: string | undefined;
  sn?: string | undefined;
  ac_v?: (number | null)[] | undefined; // phase A/B/C voltage (V)
  ac_i?: (number | null)[] | undefined; // phase A/B/C current (A)
  freq_hz?: number | undefined;
  pf?: number | undefined;
  temp_c?: number | undefined;
  active_kw?: number | undefined; // inverter output, or meter grid power (+import / -export per provider)
  dc_kw?: number | undefined;
  reactive_var?: number | undefined;
  today_kwh?: number | undefined;
  grid_hours?: number | undefined;
  day_minutes?: number | undefined;
  insulation_kohm?: number | undefined;
  neg_ground_v?: number | undefined;
  kw_per_kwp?: number | undefined;
  dc?: { v: number; i: number }[] | undefined; // MPPT inputs
  strings?: { v: number; i: number }[] | undefined;
};

/** MPPTs with array-level voltage but no current while the inverter produces — likely open string/fuse. Low-voltage idle inputs are ignored. */
export function deadMppts(d: ElectricalDevice): number[] {
  if (!d.dc?.length || !(d.active_kw && d.active_kw > 0)) return [];
  return d.dc.flatMap((m, i) => (m.v > 400 && m.i <= 0.05 ? [i + 1] : []));
}

/** PV / load / grid split; meter positive = grid import (matches iSolarCloud energy flow). */
export function energyFlow(devs: ElectricalDevice[] | undefined, pvKw: number) {
  const meters = (devs ?? []).filter((d) => d.kind === "meter" && d.active_kw != null);
  if (!meters.length) return null;
  const grid = meters.reduce((a, m) => a + (m.active_kw ?? 0), 0);
  return { pv_kw: +pvKw.toFixed(2), grid_kw: +grid.toFixed(2), load_kw: +Math.max(0, pvKw + grid).toFixed(2) };
}

/** Plain-text telemetry lines shared by the site and Telegram. */
export function electricalLines(devs: ElectricalDevice[] | undefined): string[] {
  const f = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
  return (devs ?? []).flatMap((d) => {
    const out = [`${d.kind === "meter" ? "عداد" : "إنفرتر"}: ${d.device}${d.model ? ` (${d.model})` : ""}`];
    if (d.ac_v?.some((x) => x)) out.push(`جهد الفازات: ${d.ac_v.map((x) => f(x)).join(" / ")} V`);
    if (d.ac_i?.some((x) => x)) out.push(`تيار الفازات: ${d.ac_i.map((x) => f(x)).join(" / ")} A`);
    const misc = [d.active_kw != null ? `${d.kind === "meter" ? "استطاعة الشبكة" : "استطاعة AC"} ${f(d.active_kw, 2)} kW` : "", d.dc_kw != null ? `استطاعة DC ${f(d.dc_kw, 2)} kW` : "", d.freq_hz ? `التردد ${f(d.freq_hz, 2)} Hz` : "", d.pf ? `معامل الاستطاعة ${f(d.pf, 3)}` : "", d.temp_c ? `الحرارة ${f(d.temp_c)}°C` : ""].filter(Boolean);
    if (misc.length) out.push(misc.join(" · "));
    const ops = [d.today_kwh != null ? `إنتاج اليوم ${f(d.today_kwh)} kWh` : "", d.day_minutes != null ? `تشغيل اليوم ${f(d.day_minutes, 0)} د` : "", d.grid_hours != null ? `ساعات التشغيل ${f(d.grid_hours, 0)} h` : "", d.reactive_var != null ? `غير فعالة ${f(d.reactive_var, 0)} var` : ""].filter(Boolean);
    if (ops.length) out.push(ops.join(" · "));
    const safety = [d.insulation_kohm != null ? `مقاومة العزل ${f(d.insulation_kohm, 0)} kΩ` : "", d.neg_ground_v != null ? `جهد السالب للأرض ${f(d.neg_ground_v)} V` : ""].filter(Boolean);
    if (safety.length) out.push(safety.join(" · "));
    d.dc?.forEach((m, i) => out.push(`MPPT${i + 1}: ${f(m.v)} V · ${f(m.i)} A · ${f((m.v * m.i) / 1000, 2)} kW`));
    if (d.strings?.length) out.push(`السترنغات: ${d.strings.map((s, i) => `S${i + 1} ${f(s.i)}A`).join(" · ")}`);
    const dead = deadMppts(d);
    if (dead.length) out.push(`⚠️ مدخلات بجهد بدون تيار: ${dead.map((n) => `MPPT${n}`).join("، ")}`);
    return out;
  });
}
