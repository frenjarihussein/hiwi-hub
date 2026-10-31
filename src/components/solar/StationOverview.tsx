import { FaultAnalysisButton } from './FaultAnalysisButton';
import { describeFault, fmtSolarTime } from '@/lib/solar-fault-codes';
import { useState } from 'react';
import { getSolarFleet } from '@/lib/solar-fleet.functions';
import { matchingReading, isStale } from '@/lib/solar-monitor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, AlertTriangle } from 'lucide-react';
import { fmtNum } from '@/lib/format';
const labels = { running: 'يعمل', standby: 'استعداد / لا إنتاج', offline: 'غير متصل', fault: 'عطل' };
export function stationReading(data: Awaited<ReturnType<typeof getSolarFleet>>, stationId: string) {
  const m = data.monitors.find(x => x.fleet_station_id === stationId);
  return m ? matchingReading(m.last_data, m.demo, m.provider) : null;
}
export function StationOverview({ data, stationId }: { data: Awaited<ReturnType<typeof getSolarFleet>>; stationId: string }) {
  const [open, setOpen] = useState(false);
  const station = data.stations.find(s => s.id === stationId);
  const reading = stationReading(data, stationId);
  const projectId = data.monitors.find(m => m.fleet_station_id === stationId)?.project_id;
  if (!station) return null;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-3 text-sm"><span className={`inline-flex items-center gap-1.5 ${reading?.status === 'fault' ? 'text-destructive font-semibold' : reading?.status === 'offline' ? 'text-muted-foreground font-semibold' : 'font-semibold'}`}><span aria-hidden className={`size-2.5 rounded-full ${!reading || reading.status === 'offline' ? 'bg-muted-foreground/60' : reading.status === 'fault' ? 'bg-destructive' : reading.status === 'standby' ? 'bg-warning' : 'bg-success'}`} />{reading ? (reading.status === 'offline' ? 'غير متصل بالإنترنت' : labels[reading.status]) : 'لا توجد قراءة'}</span>{reading && <><span dir="ltr">{fmtNum(reading.power_kw)} kW</span><span>اليوم: {fmtNum(reading.today_kwh)} kWh</span><span>الشهر: {fmtNum(reading.month_kwh)} kWh</span><span>التراكمي: {fmtNum(reading.total_kwh)} kWh</span>{isStale(reading.at, new Date()) && <span className="text-destructive">قراءة متأخرة</span>}{reading.alarms.length > 0 && <AlertTriangle className="size-4 text-destructive" />}</>}</div>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Eye className="size-4" />تفاصيل المحطة</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{station.name}</DialogTitle></DialogHeader><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">رقم المحطة</dt><dd>{station.plant_id}</dd></div><div><dt className="text-muted-foreground">المزود</dt><dd>{station.provider}</dd></div><div><dt className="text-muted-foreground">استطاعة المحطة</dt><dd>{fmtNum(station.capacity_kwp)} kWp</dd></div>{reading && <>{[['الحالة', labels[reading.status]], ['القدرة اللحظية', `${fmtNum(reading.power_kw)} kW`], ['إنتاج اليوم', `${fmtNum(reading.today_kwh)} kWh`], ['إنتاج الشهر', `${fmtNum(reading.month_kwh)} kWh`], ['الإنتاج التراكمي', `${fmtNum(reading.total_kwh)} kWh`], ['آخر قراءة', fmtSolarTime(reading.at)]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</>}</dl><section className="border-t pt-4"><h3 className="mb-3 font-semibold">الإنذارات</h3>{!reading ? <p className="text-muted-foreground">لم تصل بيانات تشغيل بعد.</p> : !reading.alarms.length ? <p>لا توجد إنذارات في آخر قراءة.</p> : reading.alarms.map((alarm, i) => { const f = describeFault(alarm.code, alarm.text); return <div key={i} className="space-y-1 border-b py-2 text-sm"><p className="font-semibold text-destructive">{f.text}</p><p><b>رمز العطل:</b> {f.code}{f.name ? ` (${f.name})` : ""}</p><p><b>سبب العطل:</b> {f.explain}</p><div><b>الاقتراحات:</b><p className="whitespace-pre-line">{f.advice}</p></div><p className="text-muted-foreground">الوقت: {fmtSolarTime(alarm.at)}</p>{projectId && !data.monitors.find(m => m.project_id === projectId)?.demo && <FaultAnalysisButton projectId={projectId} index={i} />}</div>; })}</section></DialogContent></Dialog>
  </div>;
}