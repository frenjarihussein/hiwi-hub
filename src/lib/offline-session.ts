export const OFFLINE_SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
export function usableSnapshot<T extends { userId: string }>(userId: string | undefined, snapshot: { me: T; savedAt: number } | undefined, now = Date.now()): T | null {
  if (!userId || !snapshot || snapshot.me.userId !== userId || now < snapshot.savedAt || now - snapshot.savedAt > OFFLINE_SESSION_MAX_AGE) return null;
  return snapshot.me;
}
export function connectivityFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; status?: number; message?: string };
  return e.name === "AuthRetryableFetchError" || (e.status === 0 && /fetch|network|connection/i.test(e.message ?? "")) || (e.name === "TypeError" && /fetch|network/i.test(e.message ?? ""));
}