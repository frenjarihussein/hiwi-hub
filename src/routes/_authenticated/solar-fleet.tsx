import { fmtSolarTime, plantKindLabel } from '@/lib/solar-fault-codes';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Download, Link2, Printer, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { printDocument } from '@/lib/print';
import { toast } from 'sonner';
import { getSolarFleet, importSolarStations, bindSolarStation, createProjectsForStations, bulkStationsAction, saveTelegramTeam, setTelegramMember, getTelegramMemberEvents } from '@/lib/solar-fleet.functions';
import { BotIdentitySettings } from '@/components/solar/BotIdentitySettings';
import { StationOverview, stationReading } from '@/components/solar/StationOverview';
import { sortSolarRows } from '@/lib/solar-sort';
import { TelegramMemberSettings } from '@/components/solar/TelegramMemberSettings';
import { TelegramLinkCard } from '@/components/solar/TelegramLinkCard';
import { ArrowDownUp } from 'lucide-react';
import { isStale } from '@/lib/solar-monitor';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { pageHead } from '@/lib/page-head';
import { useI18n } from '@/lib/i18n';
import { useMe, can } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SYRIA_GOVERNORATES } from '@/lib/syria-governorates';
import { IntegrationSettings, ClientPortal } from '@/components/solar/IntegrationSettings';
const options = queryOptions({ queryKey: ['solar-fleet'], queryFn: () => getSolarFleet() });
export const Route = createFileRoute('/_authenticated/solar-fleet')({
  head: () => pageHead('مركز المحطات', 'ربط محطات Sungrow وSMA بالمشاريع وإدارة بوت فريق الطاقة في يوسف سوفت.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(options),
  component: Fleet,
});
function Fleet() {
  const { data } = useSuspenseQuery(options);
  const { lang } = useI18n();
  const label = (ar: string, en: string) => lang === 'en' ? en : ar;
  const me = useMe().data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(importSolarStations), bind = useServerFn(bindSolarStation), createFor = useServerFn(createProjectsForStations), bulk = useServerFn(bulkStationsAction);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkProject, setBulkProject] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [linked, setLinked] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [govFilter, setGovFilter] = useState('all');
  const govOf = (projectId?: string | null) => (projectId && (data as any).governorates?.[projectId]) || '';
  const gridOf = (projectId?: string | null) => (projectId && (data as any).gridModes?.[projectId]) || '';
  const [gridFilter, setGridFilter] = useState('all');
  const [sort,setSort] = useState('name');
  const [descending,setDescending] = useState(false);
  const visible = sortSolarRows(data.stations.filter(s => {
    const monitor = data.monitors.find(m => m.fleet_station_id === s.id);
    const reading = stationReading(data, s.id);
    const project = data.projects.find(p => p.id === monitor?.project_id);
    const gov = govOf(monitor?.project_id);
    const text = `${s.name} ${s.plant_id} ${project?.name || ''} ${gov}`.toLowerCase();
    return (gridFilter === 'all' || (gridFilter === 'none' ? !gridOf(monitor?.project_id) : gridOf(monitor?.project_id) === gridFilter)) && (govFilter === 'all' || (govFilter === 'none' ? !gov : gov === govFilter)) && text.includes(search.toLowerCase().trim()) && (providerFilter === 'all' || s.provider === providerFilter) && (kindFilter === 'all' || ((s as any).plant_kind ?? reading?.extra?.plant_kind) === kindFilter) && (linked === 'all' || (linked === 'linked' ? !!monitor : !monitor)) && (status === 'all' || (status === 'stale' ? !!reading && isStale(reading.at, new Date()) : status === 'alarms' ? !!reading?.alarms.length : status === 'none' ? !reading : reading?.status === status));
  }),s => {
    const m = data.monitors.find(m => m.fleet_station_id === s.id);
    const r = stationReading(data,s.id);
    return sort === 'capacity' ? Number(s.capacity_kwp) : sort === 'project' ? data.projects.find(p => p.id === m?.project_id)?.name : sort === 'today' ? r?.today_kwh : sort === 'month' ? r?.month_kwh : sort === 'total' ? r?.total_kwh : sort === 'power' ? r?.power_kw : sort === 'status' ? r?.status : sort === 'updated' ? m?.last_sync : sort === 'governorate' ? govOf(m?.project_id) : s.name;
  },descending);
  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    try { await action(); await qc.invalidateQueries({ queryKey: ['solar-fleet'] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : label('تعذر الحفظ', 'Unable to save')); }
    finally { setBusy(null); }
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <h1 className="flex items-center gap-2 text-xl font-bold"><Link2 className="size-5 text-primary" />{label('مركز المحطات', 'Station Center')}</h1>
      <div className="flex gap-2"><Button variant="outline" onClick={() => { const rows = visible.map(s => { const m = data.monitors.find(x => x.fleet_station_id === s.id); const r = stationReading(data, s.id); return [s.name + (((s as any).plant_kind) ? ` · ${(s as any).plant_kind === 'ess' ? 'بطاريات' : 'أون جريد'}` : ''), data.projects.find(p => p.id === m?.project_id)?.name ?? '—', s.provider === 'sma' ? 'SMA' : 'Sungrow', `${s.capacity_kwp}`, r ? ({ running: 'يعمل', standby: 'استعداد', offline: 'غير متصل', fault: 'عطل' } as Record<string, string>)[r.status] ?? r.status : 'بلا قراءة', r ? r.power_kw.toFixed(1) : '', r ? r.today_kwh.toFixed(1) : '', r ? r.month_kwh.toFixed(0) : '', r ? String(r.alarms.length) : '']; }); const rs = visible.map(s => stationReading(data, s.id)); const sum = (k: 'power_kw'|'today_kwh'|'month_kwh') => rs.reduce((a, r) => a + (r ? Number(r[k]) || 0 : 0), 0); void printDocument({ title: 'تقرير المراقبة الشامل للمحطات', company: me?.tenantName, meta: [['عدد المحطات', String(visible.length)], ['تعمل', String(rs.filter(r => r?.status === 'running').length)], ['أعطال / غير متصلة', String(rs.filter(r => r && (r.status === 'fault' || r.status === 'offline')).length)], ['الاستطاعة الكلية', `${visible.reduce((a, s) => a + Number(s.capacity_kwp || 0), 0).toFixed(1)} kWp`], ['تاريخ التقرير', fmtSolarTime(new Date().toISOString())], ['محطات بإنذارات', String(rs.filter(r => r?.alarms.length).length)]], columns: ['المحطة', 'المشروع', 'المزود', 'kWp', 'الحالة', 'القدرة kW', 'اليوم kWh', 'الشهر kWh', 'إنذارات'], rows, footer: [['إجمالي القدرة اللحظية', `${sum('power_kw').toFixed(1)} kW`], ['إجمالي إنتاج اليوم', `${sum('today_kwh').toFixed(1)} kWh`], ['إجمالي إنتاج الشهر', `${sum('month_kwh').toFixed(0)} kWh`]], signatures: ['مهندس المتابعة', 'مدير المشاريع'] }); }}><Printer className="size-4" />{label('طباعة تقرير المراقبة', 'Print monitoring report')}</Button>
      <Button variant="outline" size="icon" title={label('تحديث', 'Refresh')} aria-label={label('تحديث', 'Refresh')} onClick={() => qc.invalidateQueries({ queryKey: ['solar-fleet'] })}><RefreshCw className="size-4" /></Button></div>
    </header>
    <Tabs defaultValue="stations">
      <TabsList><TabsTrigger value="stations">{label('المحطات والمشاريع', 'Stations & Projects')}</TabsTrigger>{data.isAdmin && <TabsTrigger value="team">{label('بوت فريق العمل', 'Team Bot')}</TabsTrigger>}{data.isAdmin && <TabsTrigger value="clients">{label('بوابة الزبائن', 'Client Portal')}</TabsTrigger>}{data.isAdmin && <TabsTrigger value="integrations">{label('إعدادات الربط', 'Integrations')}</TabsTrigger>}</TabsList>
      {data.isAdmin && <TabsContent value="clients" className="pt-3"><ClientPortal projects={data.projects.filter(p => data.monitors.some(m => m.project_id === p.id))} /></TabsContent>}
      {data.isAdmin && <TabsContent value="integrations" className="pt-3"><IntegrationSettings /></TabsContent>}
      <TabsContent value="stations" className="space-y-4 pt-3">
        {data.isAdmin && <div className="flex flex-wrap gap-2">{(['sungrow'] as const).map(provider => <Button key={provider} disabled={busy !== null} variant="outline" onClick={() => run(provider, async () => { const result = await load({ data: { provider } }); toast.success(`${result.count} ${label('محطة مستوردة', 'stations imported')}`); })}><Download className="size-4" />{label('استيراد محطات', 'Import Stations')} Sungrow</Button>)}</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Input aria-label="بحث عن محطة" placeholder="بحث بالمحطة أو المشروع أو الرقم" value={search} onChange={e => setSearch(e.target.value)} />{[
          { value: status, set: setStatus, title: 'الحالة', values: [['all','كل الحالات'],['running','يعمل'],['standby','استعداد'],['offline','غير متصل'],['fault','عطل'],['alarms','إنذارات'],['stale','قراءة متأخرة'],['none','بلا قراءة']] },
          { value: linked, set: setLinked, title: 'الربط', values: [['all','كل المحطات'],['linked','مرتبطة'],['unlinked','غير مرتبطة']] },
          { value: providerFilter, set: setProviderFilter, title: 'المزود', values: [['all','كل المزودين'],['sungrow','Sungrow'],['sma','SMA']] },
          { value: kindFilter, set: setKindFilter, title: 'نوع المحطة', values: [['all','كل الأنواع'],['ess','🔋 بطاريات منزلي'],['ongrid','⚡ أون جريد']] },
          { value: govFilter, set: setGovFilter, title: 'المحافظة', values: [['all','كل المحافظات'],...SYRIA_GOVERNORATES.map(g => [g, g]),['none','بلا محافظة']] },
          { value: gridFilter, set: setGridFilter, title: 'التوريد للشبكة', values: [['all','الكل (توريد)'],['feed_in','⚡ يورّد للشبكة'],['zero_export','🏭 لا يورّد'],['none','غير محدد']] },
        ].map(f => <Select key={f.title} value={f.value} onValueChange={f.set}><SelectTrigger aria-label={f.title}><SelectValue /></SelectTrigger><SelectContent>{f.values.map(([value,title]) => <SelectItem key={value} value={value || 'all'}>{title}</SelectItem>)}</SelectContent></Select>)}</div>
        <div className="flex flex-wrap items-center gap-2"><Select value={sort} onValueChange={setSort}><SelectTrigger className="w-56" aria-label="ترتيب المحطات"><SelectValue /></SelectTrigger><SelectContent>{[['name','اسم المحطة'],['project','اسم المشروع'],['capacity','الاستطاعة'],['power','القدرة اللحظية'],['today','إنتاج اليوم'],['month','إنتاج الشهر'],['total','الإنتاج التراكمي'],['status','الحالة'],['updated','آخر تحديث'],['governorate','المحافظة']].map(([k,v]) => <SelectItem key={k} value={k || 'name'}>{v}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon" title={descending ? 'ترتيب تنازلي' : 'ترتيب تصاعدي'} aria-label={descending ? 'ترتيب تنازلي' : 'ترتيب تصاعدي'} onClick={() => setDescending(v => !v)}><ArrowDownUp className="size-4" /></Button></div>
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <label className="flex items-center gap-2"><Checkbox checked={visible.length > 0 && visible.every(s => selected.includes(s.id))} onCheckedChange={c => setSelected(c === true ? visible.map(s => s.id) : [])} />تحديد الكل</label>
          <span className="text-muted-foreground">({selected.length} محددة · {visible.length} / {data.stations.length} محطة)</span>
          <span className="font-semibold ms-2">الإجراءات:</span>
          <Button size="sm" variant="outline" disabled={!selected.length || busy !== null || !can(me,'projects','create')} onClick={() => { if (window.confirm(`إنشاء مشروع جديد لكل محطة من ${selected.length} محطة وربطها به؟`)) void run('bulk', async () => { const r = await createFor({ data: { stationIds: selected } }); toast.success(`تم إنشاء ${r.count} مشروع`); setSelected([]); }); }}>إنشاء مشاريع للمحددة</Button>
          <Button size="sm" disabled={!selected.length || busy !== null || !can(me,'projects','create')} onClick={() => { if (window.confirm(`إنشاء ${selected.length} محطة جاهزة للمراقبة؟`)) void run('bulk', async () => { const r = await createFor({ data: { stationIds: selected, ready: true } }); toast.success(`تم إنشاء ${r.count} محطة جاهزة`); setSelected([]); if (r.ids.length === 1) void navigate({ to: '/projects/$projectId', params: { projectId: r.ids[0]! } }); }); }}>إنشاء محطة جاهزة وفتح المراقبة</Button>
          {selected.length === 1 && <Select value={bulkProject} onValueChange={v => { setBulkProject(''); void run('bulk', async () => { await bind({ data: { stationId: selected[0], projectId: v } }); toast.success('تم نقل المحطة'); setSelected([]); }); }}><SelectTrigger className="h-8 w-48"><SelectValue placeholder="نقل إلى مشروع" /></SelectTrigger><SelectContent>{data.projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>}
          <Button size="sm" variant="outline" disabled={!selected.length || busy !== null} onClick={() => run('bulk', async () => { await bulk({ data: { stationIds: selected, action: 'unlink' } }); toast.success('تم فك الربط'); setSelected([]); })}>فك الربط</Button>
          {data.isAdmin && <Button size="sm" variant="destructive" disabled={!selected.length || busy !== null} onClick={() => { if (window.confirm(`حذف ${selected.length} محطة من الموقع؟ (يمكن استيرادها لاحقاً)`)) void run('bulk', async () => { await bulk({ data: { stationIds: selected, action: 'delete' } }); toast.success('تم الحذف'); setSelected([]); }); }}>حذف المحددة</Button>}
        </div>
        {!data.stations.length && <p className="py-8 text-sm text-muted-foreground">{label('لا توجد محطات مستوردة بعد.', 'No stations imported yet.')}</p>}
        <div className="divide-y border-y">{visible.map(station => {
          const monitor = data.monitors.find(m => m.fleet_station_id === station.id);
          return <div key={station.id} className="grid gap-3 py-4 md:grid-cols-[auto_1fr_1fr_1fr]">
            <Checkbox className="mt-1" aria-label={`تحديد ${station.name}`} checked={selected.includes(station.id)} onCheckedChange={c => setSelected(prev => c === true ? [...prev, station.id] : prev.filter(id => id !== station.id))} />
            <div className="min-w-0"><p className="break-words font-semibold">{station.name}</p>{(() => { const k = (station as any).plant_kind ?? stationReading(data, station.id)?.extra?.plant_kind; return k ? <span className="mt-1 inline-block rounded-full border px-2 py-0.5 text-xs">{plantKindLabel(k)}</span> : null; })()}{govOf(monitor?.project_id) && <span className="ms-1 mt-1 inline-block rounded-full border px-2 py-0.5 text-xs">📍 {govOf(monitor?.project_id)}</span>}{gridOf(monitor?.project_id) && <span className="ms-1 mt-1 inline-block rounded-full border px-2 py-0.5 text-xs">{gridOf(monitor?.project_id) === 'feed_in' ? '⚡ يورّد للشبكة' : '🏭 لا يورّد للشبكة'}</span>}<p className="text-xs text-muted-foreground" dir="ltr">{station.provider === 'sma' ? 'SMA' : 'Sungrow'} · {station.plant_id} · {station.capacity_kwp} kWp</p></div>
            <Select value={monitor?.project_id || 'none'} disabled={!can(me,'projects','edit') || busy !== null} onValueChange={projectId => { if (projectId === 'new') { const name = window.prompt('اسم المشروع الجديد', station.name); if (name?.trim()) void run(station.id, async () => { await createFor({ data: { stationIds: [station.id], name: name.trim() } }); toast.success('تم إنشاء المشروع وربط المحطة'); }); return; } void run(station.id, () => bind({ data: { stationId: station.id, projectId: projectId === 'none' ? null : projectId } })); }}>
              <SelectTrigger aria-label={`${label('مشروع المحطة', 'Station Project')} ${station.name}`}><SelectValue placeholder={label('اختر المشروع', 'Select Project')} /></SelectTrigger>
              <SelectContent><SelectItem value="none">{label('غير مرتبط', 'Unlinked')}</SelectItem>{can(me,'projects','create') && <SelectItem value="new">+ {label('إنشاء مشروع جديد', 'Create new project')}</SelectItem>}{data.projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
            </Select>
            <StationOverview data={data} stationId={station.id} />
          </div>;
        })}</div>
      </TabsContent>
      {data.isAdmin && <TabsContent value="team"><Team key={data.team?.id || 'new'} data={data} label={label} run={run} busy={busy} /></TabsContent>}
    </Tabs>
  </div>;
}
function Team({ data, label, run, busy }: { data: Awaited<ReturnType<typeof getSolarFleet>>; label: (ar: string,en: string) => string; run: (key: string, fn: () => Promise<unknown>) => Promise<void>; busy: string | null }) {
  const save = useServerFn(saveTelegramTeam), member = useServerFn(setTelegramMember);
  const events = useServerFn(getTelegramMemberEvents);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof getTelegramMemberEvents>> | null>(null);
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(data.team?.enabled ?? true);
  const [daily, setDaily] = useState(data.team?.daily_enabled ?? false);
  const [alerts, setAlerts] = useState(data.team?.alerts_enabled ?? false);
  const [hour, setHour] = useState(data.team?.report_hour ?? 18);
  const [projects, setProjects] = useState(data.selected);
  const [teamQ, setTeamQ] = useState('');
  const [teamF, setTeamF] = useState<'all' | 'on' | 'off'>('all');
  const teamShown = data.projects.filter(p => (teamF === 'all' || (teamF === 'on') === projects.includes(p.id)) && p.name.toLowerCase().includes(teamQ.trim().toLowerCase()));
  const [templates, setTemplates] = useState<string[]>(data.team?.report_templates ?? ['status']);
  const TEMPLATES: [string, string][] = [['status', label('حالة المحطات الكاملة', 'Full station status')], ['today', label('إنتاج اليوم', 'Today production')], ['alarms', label('ملخص الإنذارات', 'Alarm summary')], ['top', label('أفضل المحطات أداءً', 'Top producers')], ['attention', label('محطات تحتاج انتباهاً', 'Attention needed')], ['finance', label('العوائد وخفض CO₂', 'Income & CO₂')]];
  const url = data.team ? `https://t.me/${data.botUsername}?start=team_${data.team.id}` : null;
  return <div className="space-y-5 pt-5">
    <BotIdentitySettings />
    <TelegramLinkCard />
    <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" />{label('وصول الفريق', 'Team Access')}</h2>
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm"><span>{label('كلمة سر الفريق (12 حرفاً على الأقل)', 'Team Password (at least 12 characters)')}</span><Input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder={data.team ? label('اتركها فارغة للإبقاء عليها', 'Leave blank to keep current password') : ''} /></label>
      <label className="space-y-2 text-sm"><span>{label('ساعة التقرير — توقيت دمشق', 'Report Hour — Damascus Time')}</span><Input type="number" min={0} max={23} value={hour} onChange={e => setHour(Number(e.target.value))} /></label>
    </div>
    <div className="flex flex-wrap gap-6">{[
      { text: label('تفعيل الفريق', 'Enable Team'), value: enabled, set: setEnabled },
      { text: label('تقرير يومي', 'Daily Report'), value: daily, set: setDaily },
      { text: label('تنبيهات الأعطال', 'Fault Alerts'), value: alerts, set: setAlerts },
    ].map(item => <label key={item.text} className="flex items-center gap-2 text-sm"><Switch checked={item.value} onCheckedChange={item.set} />{item.text}</label>)}</div>
    <section className="border-y py-4"><section className="mb-4 border-b pb-4"><h3 className="mb-1 text-sm font-semibold">{label('نماذج التقارير الدورية', 'Periodic report templates')}</h3><p className="mb-3 text-xs text-muted-foreground">{label('تُرسل المفعّلة منها يومياً في ساعة التقرير عند تفعيل التقرير اليومي', 'Enabled templates are sent daily at the report hour')}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{TEMPLATES.map(([k, t]) => <label key={k} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"><span>{t}</span><Switch checked={templates.includes(k)} onCheckedChange={on => setTemplates(prev => on ? [...prev, k] : prev.filter(x => x !== k))} /></label>)}</div></section><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{label('المشاريع المسموحة للفريق', 'Projects Available to the Team')}</h3><label className="flex items-center gap-2 text-sm"><Checkbox checked={teamShown.length > 0 && teamShown.every(p => projects.includes(p.id))} onCheckedChange={c => { const ids = teamShown.map(p => p.id); setProjects(prev => c === true ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id))); }} />{label('تحديد الظاهر', 'Select shown')} ({projects.length}/{data.projects.length})</label></div><div className="mb-3 flex flex-wrap items-center gap-2"><Input className="max-w-xs" aria-label="بحث في مشاريع البوت" placeholder="بحث باسم المشروع" value={teamQ} onChange={e => setTeamQ(e.target.value)} />{([['all', `الكل (${data.projects.length})`], ['on', `✅ مزامن مع البوت (${data.projects.filter(p => projects.includes(p.id)).length})`], ['off', `❌ غير مزامن (${data.projects.filter(p => !projects.includes(p.id)).length})`]] as const).map(([k, t]) => <Button key={k} size="sm" variant={teamF === k ? 'default' : 'outline'} onClick={() => setTeamF(k)}>{t}</Button>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{teamShown.map(p => <label key={p.id} className="flex min-w-0 items-center gap-2 text-sm"><Checkbox checked={projects.includes(p.id)} onCheckedChange={checked => setProjects(prev => checked === true ? [...prev,p.id] : prev.filter(id => id !== p.id))} /><span className="break-words">{p.name}</span></label>)}</div></section>
    <div className="flex flex-wrap items-center gap-3"><Button disabled={busy !== null} onClick={() => run('team', async () => { await save({ data: { password: password || undefined, enabled, daily, hour, alerts, templates: templates as ('status'|'today'|'alarms'|'top'|'attention'|'finance')[], projects } }); setPassword(''); toast.success(label('تم حفظ الفريق', 'Team saved')); })}><Send className="size-4" />{label('حفظ إعدادات الفريق', 'Save Team Settings')}</Button>{url && <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(url); toast.success(label('تم نسخ رابط الفريق', 'Team link copied')); }}>{label('نسخ رابط الفريق', 'Copy Team Link')}</Button>}</div>
    <section className="border-t pt-4"><h3 className="mb-3 font-semibold">{label('أعضاء الفريق', 'Team Members')}</h3>{!data.members.length && <p className="text-sm text-muted-foreground">{label('لا يوجد أعضاء بعد', 'No members yet')}</p>}<div className="divide-y">{data.members.map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{m.display_name || label('عضو الفريق', 'Team Member')}</p><p className="text-xs text-muted-foreground">الانضمام: {new Date(m.joined_at).toLocaleString('ar')}</p><p className="text-xs text-muted-foreground">آخر نشاط: {m.last_seen_at ? new Date(m.last_seen_at).toLocaleString('ar') : '—'} · الخروج: {m.logged_out_at ? new Date(m.logged_out_at).toLocaleString('ar') : '—'}</p></div><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><Switch disabled={busy !== null || m.blocked} checked={m.active} onCheckedChange={active => run(m.id, () => member({ data: { id: m.id, active } }))} />السماح بالدخول</label><label className="flex items-center gap-2 text-sm"><Switch disabled={busy !== null} checked={m.reports_enabled} onCheckedChange={reports_enabled => run(m.id, () => member({ data: { id: m.id, reports_enabled } }))} />التقارير</label><Button size="sm" variant={m.blocked ? 'secondary' : 'outline'} disabled={busy !== null} onClick={() => run(m.id, () => member({ data: { id: m.id, blocked: !m.blocked } }))}>{m.blocked ? 'إلغاء المنع' : 'منع'}</Button><TelegramMemberSettings data={data} member={m} onSaved={() => run(m.id,async () => undefined)} /><Button size="sm" variant="outline" onClick={() => run(m.id, async () => setActivity(await events({ data: { id: m.id } })))}>سجل النشاط</Button><Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => { if (window.confirm('حذف هذا العضو وسجل نشاطه؟')) void run(m.id, () => member({ data: { id: m.id, remove: true } })); }}>حذف</Button></div></div>)}</div></section>
    <Dialog open={activity !== null} onOpenChange={open => { if (!open) setActivity(null); }}><DialogContent className="max-h-[80dvh] overflow-auto"><DialogHeader><DialogTitle>سجل الدخول والخروج والاستعلامات</DialogTitle></DialogHeader>{activity?.map(event => <div key={event.id} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{({ join: 'انضمام', login: 'دخول', logout: 'خروج', query: 'استعلام', report: 'طلب تقرير', blocked: 'منع', unblocked: 'إلغاء المنع', reports_changed: 'تعديل التقارير', access_changed: 'تعديل الدخول' } as Record<string,string>)[event.event] || event.event}</span><time>{new Date(event.created_at).toLocaleString('ar')}</time></div>)}{activity?.length === 0 && <p>لا توجد أحداث مسجلة بعد.</p>}</DialogContent></Dialog>
  </div>;
}