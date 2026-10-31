import { describe, it, expect } from 'vitest';
import { lowPerformanceStations, completeDays } from './solar-performance';

const days = ['2026-10-24', '2026-10-25', '2026-10-26'];
const st = (id: string, cap: number, kwh: number[], faulty = false) => ({ id, capacity_kwp: cap, faulty, daily: Object.fromEntries(days.map((d, i) => [d, kwh[i]!])) });

describe('lowPerformanceStations', () => {
  it('flags a station 30% below the fleet median for 3 days', () => {
    const flags = lowPerformanceStations([st('a', 10, [50, 50, 50]), st('b', 20, [100, 100, 100]), st('c', 10, [35, 35, 35])], days);
    expect(flags.map((f) => f.id)).toEqual(['c']);
    expect(flags[0]!.ratio).toBe(0.7);
  });
  it('does not flag when only one of the 3 days is low', () => {
    expect(lowPerformanceStations([st('a', 10, [50, 50, 50]), st('b', 10, [50, 50, 50]), st('c', 10, [35, 50, 50])], days)).toEqual([]);
  });
  it('does not flag a station with an inverter fault', () => {
    expect(lowPerformanceStations([st('a', 10, [50, 50, 50]), st('b', 10, [50, 50, 50]), st('c', 10, [30, 30, 30], true)], days)).toEqual([]);
  });
  it('does not flag offline days with zero production', () => {
    expect(lowPerformanceStations([st('a', 10, [50, 50, 50]), st('b', 10, [50, 50, 50]), st('c', 10, [0, 0, 0])], days)).toEqual([]);
  });
  it('needs at least 3 stations to compare', () => {
    expect(lowPerformanceStations([st('a', 10, [50, 50, 50]), st('c', 10, [30, 30, 30])], days)).toEqual([]);
  });
  it('returns the 3 complete days before today', () => {
    expect(completeDays(new Date('2026-10-27T10:00:00Z'))).toEqual(days);
  });
});
