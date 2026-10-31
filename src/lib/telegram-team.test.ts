import { describe, expect, it } from 'vitest';
import { teamReportRows, reportClock, alarmKey } from './telegram-team';
import { simulateReading } from './solar-monitor';
describe('Telegram team rules', () => {
  const now = new Date('2026-10-25T15:00:00Z');
  const reading = { ...simulateReading(10, now), source: 'sungrow' as const };
  const row = { project_id: 'allowed', tenant_id: 'tenant', provider: 'sungrow', demo: false, last_data: reading, last_sync: now.toISOString(), projects: { name: 'Plant' } };
  it('only exposes explicitly selected projects', () => {
    expect(teamReportRows([row, { ...row, project_id: 'private' }], ['allowed']).map(r => r.id)).toEqual(['allowed']);
  });
  it('does not label demonstration readings as live', () => {
    expect(teamReportRows([{ ...row, last_data: simulateReading(10, now) }], ['allowed'])[0]?.data).toBeNull();
  });
  it('schedules reports in Damascus time', () => {
    expect(reportClock(now)).toEqual({ day: '2026-10-25', hour: 18 });
  });
  it('does not alert on stale faults', () => {
    const rows = teamReportRows([{ ...row, last_data: { ...reading, status: 'fault', at: '2026-10-24T15:00:00Z' } }], ['allowed']);
    expect(alarmKey(rows, now)).toBe('');
  });
  it('detects a fresh fault for immediate sync alerts', () => {
    const rows = teamReportRows([{ ...row, last_data: { ...reading, status: 'fault', alarms: [{ code: '2', text: 'Fault', at: now.toISOString() }] } }], ['allowed']);
    expect(alarmKey(rows, now)).toBe('allowed:fault:["2"]');
  });
  it('alerts on disconnected stations, not ordinary standby', () => {
    expect(alarmKey(teamReportRows([{ ...row, last_data: { ...reading, status: 'offline' } }], ['allowed']), now)).toBe('allowed:offline:[]');
    expect(alarmKey(teamReportRows([{ ...row, last_data: { ...reading, status: 'standby' } }], ['allowed']), now)).toBe('');
  });
});