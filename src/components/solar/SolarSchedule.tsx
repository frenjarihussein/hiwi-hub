/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { barSpan, daysUntil, taskSchedule, todayIso } from "@/lib/project-schedule";
import { SECTION_LABEL, type SolarSection } from "@/lib/solar";
import { fmtDate } from "@/lib/format";

/** Delivery countdown card shown at the top of the project workspace. */
export function DeliveryCountdown({ end, completion }: { end?: string | null; completion: number }) {
  if (!end) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <CalendarClock className="size-5 shrink-0" />
        حدّد تاريخ نهاية المشروع ليظهر العداد التنازلي للتسليم
      </div>
    );
  }
  const d = daysUntil(end);
  const done = completion >= 100;
  const tone = done
    ? "border-success/40 bg-success/10 text-success"
    : d < 0
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : d <= 14
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-primary/30 bg-primary/5 text-primary";
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${tone}`}>
      <CalendarClock className="size-8 shrink-0" />
      <div className="min-w-0">
        <p className="text-2xl font-bold num">
          {done ? "تم الإنجاز" : d < 0 ? `متأخر ${-d} يوم` : d === 0 ? "التسليم اليوم" : `${d} يوم`}
        </p>
        <p className="text-xs opacity-80">
          {done || d < 0 ? "موعد التسليم" : "متبقية للتسليم"} · {fmtDate(end)}
        </p>
      </div>
    </div>
  );
}

/** Simple Gantt: one bar per dated WBS task, grouped by section, with a today marker. */
export function SolarGantt({ nodes, byId }: { nodes: any[]; byId: Map<string, number> }) {
  const roots = nodes.filter((n) => !n.parent_id);
  const dated = nodes.filter((n) => n.parent_id && n.end_date);
  const win = useMemo(() => {
    const ds = dated.flatMap((n) => [n.start_date ?? n.end_date, n.end_date]).sort();
    if (!ds.length) return null;
    return { min: ds[0] as string, max: ds[ds.length - 1] as string };
  }, [dated]);
  if (!win) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        أضف تاريخ بداية ونهاية للمهام داخل أقسام المشروع ليظهر المخطط الزمني هنا.
      </p>
    );
  }
  const today = todayIso();
  const t = today >= win.min && today <= win.max ? barSpan(today, today, win.min, win.max).left : null;
  const lateCount = dated.filter((n) => taskSchedule(n.start_date, n.end_date, byId.get(n.id) ?? 0).late).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <span>من {fmtDate(win.min)} إلى {fmtDate(win.max)}</span>
        {lateCount > 0 && (
          <span className="flex items-center gap-1 font-medium text-destructive">
            <AlertTriangle className="size-4" /> {lateCount} مهمة متأخرة
          </span>
        )}
      </div>
      {roots.map((r) => {
        const rows = dated.filter((n) => isUnder(n, r.id, nodes));
        if (!rows.length) return null;
        return (
          <div key={r.id}>
            <h4 className="mb-2 text-sm font-semibold">{SECTION_LABEL[r.section as SolarSection] ?? r.name}</h4>
            <div className="space-y-1.5">
              {rows.map((n) => {
                const pct = byId.get(n.id) ?? 0;
                const s = taskSchedule(n.start_date, n.end_date, pct);
                const b = barSpan(n.start_date ?? n.end_date, n.end_date, win.min, win.max);
                return (
                  <div key={n.id} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-center sm:gap-3">
                    <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                      <span className="truncate">{n.name}</span>
                      <span className={`num shrink-0 ${s.late ? "text-destructive" : "text-muted-foreground"}`}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="relative h-6 rounded bg-muted">
                      {t != null && <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ insetInlineStart: `${t}%` }} title="اليوم" />}
                      <div
                        className={`absolute inset-y-1 overflow-hidden rounded ${s.late ? "bg-destructive/25" : pct >= 100 ? "bg-success/30" : "bg-primary/25"}`}
                        style={{ insetInlineStart: `${b.left}%`, width: `${b.width}%` }}
                        title={`${fmtDate(n.start_date ?? n.end_date)} ← ${fmtDate(n.end_date)}`}
                      >
                        <div className={`h-full ${s.late ? "bg-destructive" : pct >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">الخط العمودي = اليوم · الأحمر = متأخرة عن موعدها أو عن نسبة الإنجاز المتوقعة.</p>
    </div>
  );
}

function isUnder(n: any, rootId: string, nodes: any[]): boolean {
  let p = n.parent_id;
  for (let i = 0; p && i < 20; i++) {
    if (p === rootId) return true;
    p = nodes.find((x) => x.id === p)?.parent_id;
  }
  return false;
}
