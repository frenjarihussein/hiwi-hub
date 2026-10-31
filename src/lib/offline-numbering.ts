/**
 * Single-device official numbering while offline. The bound device continues each series from the
 * highest number it knows (server snapshot, local pending rows, and a persisted high-water mark), so
 * numbers stay continuous and never repeat. Server triggers remain authoritative on upload.
 */
type Row = Record<string, unknown>;

export const NUMBER_FIELDS: Record<string, { field: string; series: (r: Row) => string }> = {
  journal_entries: { field: "entry_no", series: (r) => `je:${r["tenant_id"] ?? ""}` },
  documents: { field: "doc_no", series: (r) => `doc:${r["tenant_id"] ?? ""}:${r["doc_type"] ?? ""}` },
};

/** Next number after everything already used in the series. */
export function nextNumber(used: Iterable<unknown>, highWater = 0): number {
  let max = Number(highWater) || 0;
  for (const v of used) { const n = Number(v); if (Number.isFinite(n) && n > max) max = n; }
  return Math.floor(max) + 1;
}

/** Assigns numbers to a batch of rows; returns the rows and the new high-water marks per series. */
export function assignNumbers(table: string, rows: Row[], known: Row[], highWater: Record<string, number>) {
  const spec = NUMBER_FIELDS[table];
  if (!spec) return { rows, highWater };
  const marks = { ...highWater };
  const out = rows.map((r) => {
    const s = spec.series(r);
    const used = known.filter((k) => spec.series(k) === s).map((k) => k[spec.field]);
    const n = nextNumber(used, marks[s] ?? 0);
    marks[s] = n;
    return { ...r, [spec.field]: n, _local_no: n };
  });
  return { rows: out, highWater: marks };
}

/** On a unique-number conflict the row was NOT inserted; resend without the number so the server trigger assigns it. */
export function withoutNumber(table: string, body: unknown): unknown {
  const spec = NUMBER_FIELDS[table];
  if (!spec) return body;
  const strip = (r: Row) => { const { [spec.field]: _n, _local_no: _l, ...rest } = r; return rest; };
  return Array.isArray(body) ? body.map(strip) : strip(body as Row);
}

export const isNumberConflict = (status: number, code?: string | null, message?: string | null) =>
  status === 409 && (code === "23505" || /entry_no|doc_no/.test(message ?? ""));

/** Removes client-only markers before a row is sent to the server. */
export function serverBody(body: unknown): unknown {
  const clean = (r: Row) => { const { _local_no: _l, _local: _x, ...rest } = r; return rest; };
  return Array.isArray(body) ? body.map(clean) : body && typeof body === "object" ? clean(body as Row) : body;
}
