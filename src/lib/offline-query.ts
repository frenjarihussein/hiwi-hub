type Row = Record<string, unknown>;

export const tableSnapshotKey = (scope: string, table: string) => `table-snapshot|${scope}|${table}`;

const RESERVED = new Set(["select", "order", "limit", "offset", "or", "and", "columns", "on_conflict"]);

function parseList(v: string): string[] {
  return v.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
}

function test(value: unknown, op: string, arg: string): boolean {
  const s = value == null ? null : String(value);
  const n = Number(value), a = Number(arg);
  const num = !Number.isNaN(n) && !Number.isNaN(a) && value !== "" && value != null;
  switch (op) {
    case "eq": return s === arg;
    case "neq": return s !== arg;
    case "gt": return num ? n > a : (s ?? "") > arg;
    case "gte": return num ? n >= a : (s ?? "") >= arg;
    case "lt": return num ? n < a : (s ?? "") < arg;
    case "lte": return num ? n <= a : (s ?? "") <= arg;
    case "in": return s != null && parseList(arg).includes(s);
    case "is": return arg === "null" ? value == null : arg === "true" ? value === true : arg === "false" ? value === false : true;
    case "like": case "ilike": {
      const re = new RegExp("^" + arg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*") + "$", op === "ilike" ? "i" : "");
      return s != null && re.test(s);
    }
    default: return true; // unknown operators never hide data
  }
}

function cond(row: Row, key: string, expr: string): boolean {
  let negate = false, e = expr;
  if (e.startsWith("not.")) { negate = true; e = e.slice(4); }
  const dot = e.indexOf(".");
  if (dot < 0) return true;
  const r = test(row[key], e.slice(0, dot), e.slice(dot + 1));
  return negate ? !r : r;
}

function orGroup(row: Row, expr: string): boolean {
  const parts = expr.replace(/^\(|\)$/g, "").split(/,(?![^(]*\))/);
  return parts.some((p) => { const i = p.indexOf("."); return i < 0 || cond(row, p.slice(0, i), p.slice(i + 1)); });
}

/** Evaluates simple PostgREST list queries (filters/order/limit) against a full-table snapshot. */
export function applyRestQuery(rows: Row[], url: URL): Row[] {
  let out = rows;
  url.searchParams.forEach((v, k) => {
    if (k === "or") out = out.filter((r) => orGroup(r, v));
    else if (!RESERVED.has(k) && !k.includes(".")) out = out.filter((r) => cond(r, k, v));
  });
  const order = url.searchParams.get("order");
  if (order) {
    const keys = order.split(",").map((o) => { const [c, dir] = o.split("."); return { c, desc: dir === "desc" }; });
    out = [...out].sort((a, b) => {
      for (const { c = "", desc } of keys) {
        const x = a[c], y = b[c];
        if (x === y) continue;
        if (x == null) return 1; if (y == null) return -1;
        const r = x < y ? -1 : 1;
        return desc ? -r : r;
      }
      return 0;
    });
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.get("limit");
  return out.slice(offset, limit ? offset + Number(limit) : undefined);
}
