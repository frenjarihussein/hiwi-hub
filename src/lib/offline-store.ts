import Dexie, { type Table } from "dexie";

export type OfflineScope = { userId: string; tenantId: string | null; branchId: string | null };
export const scopeKey = (s: OfflineScope) => JSON.stringify([s.userId, s.tenantId, s.branchId]);
export type CachedResponse = { key: string; scope: string; body: string; status: number; headers: [string, string][]; savedAt: number };
export type PendingWrite = {
  id: string; scope: string; table: string; method: string; url: string;
  body: unknown; headers: [string, string][]; createdAt: number;
  state: "pending" | "review" | "sending"; error?: string;
  /** Single-device local posting estimate (journal lines / stock moves) for offline reports. */
  estimate?: { documentId: string; date: string; currency: string; rate: number; lines: Record<string, unknown>[]; moves: Record<string, unknown>[] };
};
class OfflineDatabase extends Dexie {
  declare responses: Table<CachedResponse, string>;
  declare writes: Table<PendingWrite, string>;
  declare values: Table<{ key: string; value: unknown }, string>;
  constructor() {
    super("yousef-offline-v1");
    this.version(1).stores({ responses: "key,scope,savedAt", writes: "id,scope,createdAt,state", values: "key" });
  }
}
let instance: OfflineDatabase | undefined;
export function offlineStore() { return instance ??= new OfflineDatabase(); }
let current: OfflineScope | null = null;
export function setOfflineScope(scope: OfflineScope | null) { current = scope; }
export function getOfflineScope() { return current; }
export function offlineKey() { return current ? scopeKey(current) : null; }
export function offlineChanged() { window.dispatchEvent(new Event("offline-data-changed")); }

// Security and server-managed records must never become local permissions.
export const ONLINE_ONLY_TABLES = new Set([
  "profiles", "user_permissions", "user_roles", "tenant_features", "tenant_members",
  "tenants", "app_config", "notifications", "audit_log", "login_events", "pos_shifts",
  "user_cash_drawers", "backups", "subscription_history", "tenant_payments", "share_links",
]);
/** Server posting calls that may be queued; the server re-runs them authoritatively on upload. */
export const QUEUEABLE_RPCS = new Set(["rpc/post_document"]);
export function canQueueWrite(table: string, method: string) {
  if (QUEUEABLE_RPCS.has(table)) return method === "POST";
  return /^[a-z_]+$/.test(table) && !ONLINE_ONLY_TABLES.has(table) && ["POST", "PATCH"].includes(method);
}