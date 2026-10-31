import {
  canQueueWrite, offlineStore, offlineKey, offlineChanged, getOfflineScope, QUEUEABLE_RPCS,
  type PendingWrite,
} from "./offline-store";
import { isLocalSingleDevice, overlayRows, prepareLocalInsert } from "./offline-local-rows";
import { applyRestQuery, tableSnapshotKey } from "./offline-query";
import { assignNumbers, NUMBER_FIELDS } from "./offline-numbering";
import { estimatePosting } from "./offline-posting";
import { isPinOfflineMode } from "./pin-vault";

type Row = Record<string, unknown>;
type Transport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
function failure(message: string) {
  return new Response(JSON.stringify({ message, code: "OFFLINE_REQUIRED" }), { status: 503, headers: { "content-type": "application/json" } });
}
function safeHeaders(headers: Headers): [string, string][] {
  return [...headers.entries()].filter(([k]) => !["authorization", "apikey", "cookie"].includes(k.toLowerCase()));
}
export function requestCacheKey(scope: string, url: string, headers: Headers) {
  return JSON.stringify([scope, url, headers.get("accept"), headers.get("prefer"), headers.get("range")]);
}

async function snapshotRows(scope: string, table: string): Promise<Row[]> {
  const snap = await offlineStore().responses.get(tableSnapshotKey(scope, table));
  try { return snap ? (JSON.parse(snap.body) as Row[]) : []; } catch { return []; }
}
const bodyRows = (w: PendingWrite): Row[] => (Array.isArray(w.body) ? w.body : [w.body]) as Row[];
const pendingRows = (writes: PendingWrite[], table: string) => writes.filter((w) => w.table === table && w.method === "POST").flatMap(bodyRows);

/** Turns queued local postings into synthetic rows so reports and stock read them as estimates. */
export function expandEstimates(writes: PendingWrite[], tenantId: string | null, base: string): PendingWrite[] {
  const out: PendingWrite[] = [];
  for (const w of writes) {
    out.push(w);
    const e = w.estimate;
    if (!e) continue;
    const entry = { entry_date: e.date, exchange_rate: e.rate, currency: e.currency, audited: false, _estimate: true };
    const mk = (table: string, body: unknown, method = "POST", url = `${base}/rest/v1/${table}`): PendingWrite =>
      { const { estimate: _e, ...rest } = w; return { ...rest, id: `${w.id}:${table}`, table, method, url, body }; };
    out.push(mk("journal_lines", e.lines.map((l, i) => ({ id: `${w.id}-l${i}`, tenant_id: tenantId, entry_id: null, ...l, journal_entries: entry, _estimate: true }))));
    out.push(mk("stock_moves", e.moves.map((m, i) => ({ id: `${w.id}-m${i}`, tenant_id: tenantId, document_id: e.documentId, move_date: e.date, ...m, _estimate: true }))));
    out.push(mk("documents", { status: "posted", _estimate: true }, "PATCH", `${base}/rest/v1/documents?id=eq.${e.documentId}`));
  }
  return out;
}

/** Intercepts only the app's Data API; never caches credentials or auth endpoints. */
export function offlineTransport(network: Transport): Transport {
  return async (input, init) => {
    if (typeof window === "undefined") return network(input, init);
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const scope = offlineKey();
    if (!scope || !url.pathname.includes("/rest/v1/")) return network(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const table = url.pathname.split("/rest/v1/")[1];
    const key = requestCacheKey(scope, url.href, headers);
    const read = method === "GET" || method === "HEAD";
    // A PIN-unlocked app never writes to the server until a real online session refresh.
    const online = navigator.onLine && (read || !isPinOfflineMode());
    if (online) {
      try {
        const response = await network(input, init);
        if (read && response.ok) {
          const copy = response.clone();
          await offlineStore().responses.put({ key, scope, body: await copy.text(), status: response.status, headers: safeHeaders(copy.headers), savedAt: Date.now() }).catch(() => {});
        }
        if (!read || (response.status !== 408 && response.status < 500)) return response;
      } catch (error) {
        // Never enqueue an ambiguous request: it might already have reached the server.
        if (!read) throw error;
      }
    }
    const tenantId = getOfflineScope()?.tenantId ?? null;
    const local = isLocalSingleDevice(tenantId);
    const base = url.origin + url.pathname.split("/rest/v1/")[0];
    if (read) {
      let cached = await offlineStore().responses.get(key);
      if (!cached && table && !table.includes("/")) {
        // Fall back to the prepared full-table snapshot and evaluate the query locally.
        const snap = await offlineStore().responses.get(tableSnapshotKey(scope, table));
        if (snap) {
          try {
            const rows = applyRestQuery(JSON.parse(snap.body), url);
            const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
            cached = { ...snap, key, body: JSON.stringify(single ? rows[0] ?? null : rows) };
          } catch { /* ignore broken snapshot */ }
        }
      }
      const all = local && table ? expandEstimates(await offlineStore().writes.where("scope").equals(scope).sortBy("createdAt"), tenantId, base) : [];
      const pending = all.filter((w) => w.table === table);
      if (!cached && !pending.length) return failure("لا توجد نسخة محفوظة لهذا العرض على الجهاز؛ افتحه أثناء الاتصال أولاً");
      const responseHeaders = new Headers(cached?.headers ?? [["content-type", "application/json"]]);
      responseHeaders.set("x-offline-snapshot", String(cached?.savedAt ?? Date.now()));
      let body = cached?.body ?? "[]";
      if (pending.length) {
        try {
          const parsed = JSON.parse(body);
          const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
          let rows = overlayRows(Array.isArray(parsed) ? parsed : parsed ? [parsed] : [], pending, table!, url);
          if (table === "journal_lines" && (url.searchParams.get("select") ?? "").includes("journal_entries")) {
            // Local lines need their (local) entry header embedded like the server join.
            const entries = new Map(pendingRows(all, "journal_entries").map((e) => [String(e["id"]), e]));
            rows = rows.map((r) => (r["journal_entries"] || !r["entry_id"] ? r : { ...r, journal_entries: entries.get(String(r["entry_id"])) ?? null }));
          }
          body = JSON.stringify(single ? rows[0] ?? null : rows);
          responseHeaders.set("x-offline-local", "1");
        } catch { /* keep cached body */ }
      }
      return new Response(method === "HEAD" ? null : body, { status: cached?.status ?? 200, headers: responseHeaders });
    }
    const isRpc = !!table && QUEUEABLE_RPCS.has(table);
    // Posting is accepted locally only on the bound single device; multi-device never queues it.
    if (!table || (table.includes("/") && !isRpc) || (isRpc && !local) || !canQueueWrite(table, method)) {
      return failure("هذه العملية تتطلب الإنترنت للتحقق من الصلاحيات والأرصدة؛ لم يتم تنفيذها");
    }
    let body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    if (!body) return failure("تعذّر حفظ العملية محلياً");
    const store = offlineStore();
    let estimate: PendingWrite["estimate"];
    if (local && method === "POST" && !isRpc) {
      body = prepareLocalInsert(body);
      if (NUMBER_FIELDS[table]) {
        // Official numbers are issued locally and immediately on the bound device.
        const writes = await store.writes.where("scope").equals(scope).toArray();
        const known = [...await snapshotRows(scope, table), ...pendingRows(writes, table)];
        const hwKey = `num-hwm:${scope}:${table}`;
        const hw = ((await store.values.get(hwKey))?.value ?? {}) as Record<string, number>;
        const res = assignNumbers(table, body as Row[], known, hw);
        body = res.rows;
        await store.values.put({ key: hwKey, value: res.highWater });
      }
    }
    if (local && isRpc) {
      const docId = String((body as Row)["_id"] ?? "");
      const writes = await store.writes.where("scope").equals(scope).toArray();
      const doc = [...pendingRows(writes, "documents"), ...await snapshotRows(scope, "documents")].find((d) => String(d["id"]) === docId);
      if (!doc) return failure("المستند غير موجود على الجهاز؛ لا يمكن ترحيله دون اتصال");
      const lines = [...pendingRows(writes, "document_lines"), ...await snapshotRows(scope, "document_lines")].filter((l) => String(l["document_id"]) === docId);
      const settings = (await snapshotRows(scope, "tenant_settings")).find((s) => s["tenant_id"] === tenantId) ?? {};
      const est = estimatePosting(doc, lines, settings);
      estimate = { documentId: docId, date: String(doc["doc_date"] ?? new Date().toISOString().slice(0, 10)), currency: String(doc["currency"] ?? ""), rate: Number(doc["exchange_rate"]) || 1, lines: est.lines, moves: est.moves };
    }
    // Multi-device: proposals for review. Single-device: accepted locally and uploaded in order on reconnect.
    const write: PendingWrite = { id: crypto.randomUUID(), scope, table, method, url: url.href, body, headers: safeHeaders(headers), createdAt: Date.now(), state: local ? "pending" : "review", ...(estimate ? { estimate } : {}) };
    await store.writes.add(write);
    offlineChanged();
    if (local) {
      if (isRpc) return new Response(JSON.stringify(null), { status: 200, headers: { "content-type": "application/json", "x-offline-local": "1" } });
      const rows = method === "POST" ? (body as Row[]).map((r) => ({ ...r, _local: true })) : [{ ...(body as object), _local: true }];
      const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
      const wantsBody = (headers.get("prefer") ?? "").includes("return=representation");
      return new Response(wantsBody ? JSON.stringify(single ? rows[0] : rows) : null, { status: wantsBody ? 201 : 204, headers: { "content-type": "application/json", "x-offline-local": "1" } });
    }
    return failure("حُفظ الطلب كمسودة على الجهاز، ولم يُنفّذ بعد؛ راجعه من «العمل دون اتصال» عند عودة الإنترنت");
  };
}
