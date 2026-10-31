import { startWork } from "./work-progress";
import { db } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = Record<string, any>[];
export type RestoreReport = { ok: number; skipped: number; bad: number; errors: string[] };

const CHUNK = 300;

/**
 * Restores one company's backup in small steps (empty → insert rows table by table → fill links → settings)
 * so large companies never hit the server time limit and one bad row never cancels the whole company.
 */
export async function restoreCompanyData(
  tenantId: string,
  data: Record<string, Rows>,
  onProgress?: (msg: string) => void,
): Promise<RestoreReport> {
  const rep: RestoreReport = { ok: 0, skipped: 0, bad: 0, errors: [] };
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data: r, error } = await db.rpc(fn as never, args as never);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return r as any;
  };

  const { data: plan, error } = await db.rpc("company_backup_plan" as never);
  if (error) throw new Error(error.message);
  const steps = (plan as unknown as { table: string; late: string[] }[]).filter((p) => Array.isArray(data[p.table]) && (data[p.table]?.length ?? 0));

  const total = 2 + steps.reduce((sum, step) => sum + Math.ceil((data[step.table]?.length ?? 0) / CHUNK) * (step.late.length ? 2 : 1), 0);
  const work = startWork("استرجاع بيانات الشركة", total);
  let completed = 0;
  try {
  onProgress?.("تفريغ بيانات الشركة الحالية...");
  const begin = await call("restore_company_begin", { _id: tenantId });
  rep.errors.push(...(begin?.errors ?? []));
  work.update("استرجاع بيانات الشركة", ++completed);

  for (const phase of ["insert", "link"] as const) {
    for (const s of steps) {
      if (phase === "link" && !s.late.length) continue;
      const rows = data[s.table] ?? [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        onProgress?.(`${phase === "insert" ? "إدخال" : "ربط"} ${s.table}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
        work.update(`${phase === "insert" ? "إدخال" : "ربط"} ${s.table}`, completed);
        const r = await call("restore_company_rows", { _id: tenantId, _table: s.table, _rows: rows.slice(i, i + CHUNK), _phase: phase });
        if (phase === "insert") { rep.ok += r.ok; rep.skipped += r.skipped; }
        work.update("استرجاع بيانات الشركة", ++completed);
        rep.bad += r.bad;
        for (const e of r.errors ?? []) if (rep.errors.length < 20) rep.errors.push(`${s.table}: ${e}`);
      }
    }
  }

  onProgress?.("استرجاع الإعدادات...");
  const fin = await call("restore_company_finish", {
    _id: tenantId,
    _settings: data["tenant_settings"]?.[0] ?? null,
    _tenant: data["tenants"]?.[0] ?? null,
  });
  rep.errors.push(...(fin?.errors ?? []));
  work.update("استرجاع الإعدادات", ++completed);
  return rep;
  } finally { work.finish(); }
}
