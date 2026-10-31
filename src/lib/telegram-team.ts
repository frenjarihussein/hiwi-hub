import { isStale, matchingReading } from './solar-monitor';

export type TeamMonitor = { project_id: string; tenant_id: string; provider: string; demo: boolean; last_data: unknown; last_sync: string | null; projects: { name: string } | { name: string }[] | null };
export function teamReportRows(monitors: TeamMonitor[], allowed: string[]) {
  return monitors.filter(m => allowed.includes(m.project_id)).map(m => {
    const reading = matchingReading(m.last_data, m.demo, m.provider);
    const project = Array.isArray(m.projects) ? m.projects[0] : m.projects;
    return { id: m.project_id, name: project?.name || m.project_id, demo: m.demo, last_sync: reading?.at ?? null, data: reading as unknown as Record<string, unknown> | null };
  });
}
export function reportClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Damascus', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (key: string) => parts.find(p => p.type === key)?.value || '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}
export function alarmKey(rows: ReturnType<typeof teamReportRows>, now: Date) {
  return rows.filter(r => !r.demo && !isStale(r.last_sync, now) && (r.data?.['status'] === 'fault' || r.data?.['status'] === 'offline' || (Array.isArray(r.data?.['alarms']) && r.data['alarms'].length > 0)))
    .map(r => `${r.id}:${r.data?.['status']}:${JSON.stringify((r.data?.['alarms'] as { code?: string }[] || []).map(a => a.code).sort())}`).sort().join('|');
}