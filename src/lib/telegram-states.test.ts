import { describe, expect, it } from 'vitest';
import { stateOf } from './telegram-states';

const now = new Date('2026-10-31T09:00:00Z'); // 12:00 Damascus
const fresh = now.toISOString();

describe('telegram status filter', () => {
  it('zero output at Damascus noon is "not producing"', () => {
    expect(stateOf({ status: 'standby', power_kw: 0, alarms: [] }, fresh, now)).toBe('idle');
  });
  it('zero output at night is standby', () => {
    const night = new Date('2026-10-31T19:00:00Z');
    expect(stateOf({ status: 'standby', power_kw: 0, alarms: [] }, night.toISOString(), night)).toBe('standby');
  });
  it('stale reading is offline', () => {
    expect(stateOf({ status: 'running', power_kw: 5, alarms: [] }, '2026-10-30T09:00:00Z', now)).toBe('offline');
  });
  it('producing is running', () => {
    expect(stateOf({ status: 'running', power_kw: 5, alarms: [] }, fresh, now)).toBe('running');
  });
});
