/** Schedule helpers for WBS tasks and project delivery countdown. Dates are ISO yyyy-mm-dd. */
const DAY = 86_400_000;
const toDay = (d: string | Date) => {
  const x = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d;
  return Math.floor(x.getTime() / DAY);
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days from `today` until `end` (negative when overdue). */
export function daysUntil(end: string, today: string = todayIso()) {
  return toDay(end) - toDay(today);
}

export type TaskSchedule = {
  /** Expected progress % by today, linear between start and end. */
  expected: number;
  late: boolean;
  overdue: boolean;
  daysLeft: number | null;
};

export function taskSchedule(
  start: string | null | undefined,
  end: string | null | undefined,
  progress: number,
  today: string = todayIso(),
): TaskSchedule {
  if (!end) return { expected: 0, late: false, overdue: false, daysLeft: null };
  const e = toDay(end);
  const s = start ? toDay(start) : e;
  const t = toDay(today);
  const expected = t >= e ? 100 : t <= s ? 0 : ((t - s) / Math.max(1, e - s)) * 100;
  const done = progress >= 100;
  const overdue = !done && t > e;
  return {
    expected,
    overdue,
    late: !done && (overdue || progress + 0.001 < expected - 10),
    daysLeft: e - t,
  };
}

/** Position (0-100%) of a bar within a [min,max] window for the Gantt chart. */
export function barSpan(start: string, end: string, min: string, max: string) {
  const a = toDay(min);
  const total = Math.max(1, toDay(max) - a + 1);
  const left = ((toDay(start) - a) / total) * 100;
  const width = ((toDay(end) - toDay(start) + 1) / total) * 100;
  return { left: Math.max(0, left), width: Math.max(1, width) };
}
