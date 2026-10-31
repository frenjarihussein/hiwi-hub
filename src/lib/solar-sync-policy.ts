export const SOLAR_SYNC_MINUTES = [1, 5, 10, 15, 30, 60] as const;
export function syncMinutes(value: unknown): number {
  return typeof value === 'number' && SOLAR_SYNC_MINUTES.some(m => m === value) ? value : 15;
}
export function solarSyncDue(minutes: unknown, lastAttempt: string | undefined, now = Date.now()): boolean {
  const last = lastAttempt ? Date.parse(lastAttempt) : NaN;
  return !Number.isFinite(last) || now - last >= syncMinutes(minutes) * 60_000;
}