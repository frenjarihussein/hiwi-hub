import { db } from "@/lib/db";
import { getOfflineScope, offlineKey, offlineStore, offlineChanged } from "@/lib/offline-store";
import { enqueue, readQueue, type PosSale } from "@/lib/pos-offline";
import { tableSnapshotKey } from "@/lib/offline-query";

/** Directories and books read by screens; full-table snapshots let any screen query them offline. */
export const PREPARE_TABLES = [
  "accounts", "partners", "products", "warehouses", "currencies", "cost_centers", "projects",
  "documents", "document_lines", "journal_entries", "journal_lines", "tenant_settings",
  "tenants", "profiles", "user_permissions", "tenant_features", "user_prefs", "exchange_rates",
  "branches", "banks", "cheques", "stock_moves", "product_batches", "product_recipes",
  "employees", "employee_advances", "employee_leaves", "employee_adjustments", "payroll_runs",
  "fixed_assets", "recurring_entries", "pos_shifts", "manufacturing_orders", "manufacturing_materials",
  "hotel_rooms", "hotel_reservations", "project_milestones", "project_expenses", "boq_items",
  "record_comments", "attachments", "personal_notes",
];

export async function prepareDevice(onStep?: (done: number, total: number) => void) {
  const failed: string[] = [];
  const scope = offlineKey();
  for (let i = 0; i < PREPARE_TABLES.length; i++) {
    const t = PREPARE_TABLES[i] as string;
    const all: unknown[] = [];
    let error: unknown = null;
    for (let from = 0; ; from += 1000) {
      const r = await db.from(t).select("*").range(from, from + 999);
      if (r.error) { error = r.error; break; }
      all.push(...(r.data ?? []));
      if ((r.data ?? []).length < 1000) break;
    }
    if (error) failed.push(t);
    else if (scope) {
      await offlineStore().responses.put({ key: tableSnapshotKey(scope, t), scope, body: JSON.stringify(all), status: 200, headers: [["content-type", "application/json"]], savedAt: Date.now() }).catch(() => {});
    }
    onStep?.(i + 1, PREPARE_TABLES.length);
  }
  return { failed };
}

export type LocalBackup = { kind: "yousef-local-backup"; version: 1; scope: string; createdAt: string; responses: unknown[]; writes: unknown[]; pos: PosSale[] };

export async function exportLocalBackup(): Promise<LocalBackup> {
  const scope = offlineKey();
  if (!scope) throw new Error("سجّل الدخول أولاً");
  const s = offlineStore();
  return {
    kind: "yousef-local-backup", version: 1, scope, createdAt: new Date().toISOString(),
    responses: await s.responses.where("scope").equals(scope).toArray(),
    writes: await s.writes.where("scope").equals(scope).toArray(),
    pos: readQueue(),
  };
}

/** Restores only into the same user/company/branch; never replays anything automatically. */
export async function importLocalBackup(b: LocalBackup) {
  if (b?.kind !== "yousef-local-backup") throw new Error("ملف غير صالح");
  const scope = offlineKey();
  if (!scope || b.scope !== scope || !getOfflineScope()) throw new Error("النسخة تخص مستخدماً أو شركة أو فرعاً آخر");
  const s = offlineStore();
  await s.responses.bulkPut(b.responses as never[]);
  const existing = new Set((await s.writes.where("scope").equals(scope).primaryKeys()) as string[]);
  await s.writes.bulkPut((b.writes as any[]).filter((w) => !existing.has(w.id)).map((w) => ({ ...w, state: w.state === "sending" ? "review" : w.state })));
  const have = new Set(readQueue().map((x) => x.id));
  for (const p of b.pos) if (!have.has(p.id)) enqueue(p);
  offlineChanged();
}
