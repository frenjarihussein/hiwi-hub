/** Fleet-relative performance check: flags stations whose specific yield (kWh per kWp)
 * stays well below the fleet median for several complete days while the inverter reports no fault —
 * a typical sign of dirty panels, shading or a partially failed string. */
export type StationDays = { id: string; capacity_kwp: number; faulty: boolean; daily: Record<string, number> };
export type PerformanceFlag = { id: string; ratio: number; days: string[] };

export const LOW_RATIO = 0.8;
export const REQUIRED_DAYS = 3;
const MIN_PEERS = 3;

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** `days` are complete (past) UTC days, oldest first. */
export function lowPerformanceStations(stations: StationDays[], days: string[], threshold = LOW_RATIO): PerformanceFlag[] {
  if (days.length < REQUIRED_DAYS) return [];
  const ratios = new Map<string, number[]>();
  for (const day of days) {
    const yields = stations.flatMap((s) => {
      const kwh = s.daily[day];
      return s.capacity_kwp > 0 && typeof kwh === 'number' && kwh > 0 ? [{ id: s.id, y: kwh / s.capacity_kwp }] : [];
    });
    if (yields.length < MIN_PEERS) return [];
    const med = median(yields.map((x) => x.y));
    if (med <= 0) return [];
    for (const s of stations) {
      const y = yields.find((x) => x.id === s.id);
      // A missing or zero day means offline/no data, not soiling — never flag on it.
      ratios.set(s.id, [...(ratios.get(s.id) ?? []), y ? y.y / med : Number.NaN]);
    }
  }
  return stations.flatMap((s) => {
    const r = ratios.get(s.id) ?? [];
    if (s.faulty || r.length !== days.length || r.some((x) => !Number.isFinite(x) || x >= threshold)) return [];
    return [{ id: s.id, ratio: +(r.reduce((a, b) => a + b, 0) / r.length).toFixed(2), days }];
  });
}

/** Last N complete UTC days before `now`, oldest first. */
export function completeDays(now: Date, n = REQUIRED_DAYS) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (n - i));
    return d.toISOString().slice(0, 10);
  });
}

export function performanceAlertText(name: string, ratio: number) {
  return `انخفاض كفاءة في ${name}: الإنتاج لكل kWp أقل بـ ${Math.round((1 - ratio) * 100)}% من متوسط المحطات خلال آخر ${REQUIRED_DAYS} أيام دون عطل في الإنفرتر. يُقترح غسيل الألواح أو كشف ميداني (ظل، سلسلة ألواح مفصولة).`;
}
