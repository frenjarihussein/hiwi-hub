import { describe, expect, it } from 'vitest';
import { solarSyncDue, syncMinutes } from './solar-sync-policy';
describe('company solar refresh cadence', () => {
  it('supports every offered minute interval', () => {
    for (const m of [1, 5, 10, 15, 30, 60]) expect(syncMinutes(m)).toBe(m);
    expect(syncMinutes(-1)).toBe(15);
  });
  it('waits the company interval, including after a failed attempt', () => {
    const start = '2026-10-31T12:00:00Z';
    expect(solarSyncDue(5, start, Date.parse('2026-10-31T12:04:59Z'))).toBe(false);
    expect(solarSyncDue(5, start, Date.parse('2026-10-31T12:05:00Z'))).toBe(true);
    expect(solarSyncDue(30, start, Date.parse('2026-10-31T12:05:00Z'))).toBe(false);
  });
  it('fetches a first reading without a previous attempt', () => {
    expect(solarSyncDue(60, undefined)).toBe(true);
  });
});