import type { PendingWrite } from "./offline-store";

type Row = { id?: unknown; created_at?: unknown; [k: string]: unknown };

/** Single-device mode: give offline inserts stable client UUIDs so dependent rows replay in order. */
export function prepareLocalInsert(body: unknown): Row[] {
  const rows = (Array.isArray(body) ? body : [body]) as Row[];
  // No created_at: not every table has it (e.g. user_prefs), and the server sets it anyway.
  return rows.map((r) => ({ ...r, id: r.id ?? crypto.randomUUID() }));
}

function eqFilters(url: URL): [string, string][] {
  const out: [string, string][] = [];
  url.searchParams.forEach((v, k) => {
    if (["select", "order", "limit", "offset", "or", "and"].includes(k)) return;
    if (v.startsWith("eq.")) out.push([k, v.slice(3)]);
  });
  return out;
}
const matches = (row: Row, filters: [string, string][]) => filters.every(([k, v]) => !(k in row) || String(row[k]) === v);

/** Overlays not-yet-uploaded local inserts/edits for a table onto a cached list response. */
export function overlayRows(base: Row[], writes: PendingWrite[], table: string, url: URL): Row[] {
  const filters = eqFilters(url);
  let rows = [...base];
  for (const w of writes) {
    if (w.table !== table) continue;
    if (w.method === "POST") {
      for (const r of (Array.isArray(w.body) ? w.body : [w.body]) as Row[]) {
        if (!matches(r, filters)) continue;
        rows = rows.filter((x) => x.id !== r.id);
        rows.unshift({ ...r, _local: true });
      }
    } else if (w.method === "PATCH") {
      const id = new URL(w.url).searchParams.get("id")?.replace(/^eq\./, "");
      rows = rows.map((x) => (id && String(x.id) === id ? { ...x, ...(w.body as Row), _local: true } : x));
    }
  }
  return rows;
}

export function isLocalSingleDevice(tenantId: string | null | undefined): boolean {
  if (!tenantId || typeof localStorage === "undefined") return false;
  return localStorage.getItem(`op-mode:${tenantId}`) === "single_device";
}
