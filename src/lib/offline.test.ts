import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { offlineStore, scopeKey, setOfflineScope, canQueueWrite } from "./offline-store";
import { offlineTransport, requestCacheKey } from "./offline-transport";
import { refuseServiceWorker } from "./pwa";

const scope = { userId: "user-a", tenantId: "company-a", branchId: "branch-a" };
const url = "https://example.test/rest/v1/products?select=id,name";
function online(value: boolean) { Object.defineProperty(navigator, "onLine", { configurable: true, value }); }
beforeEach(async () => {
  online(true); setOfflineScope(scope);
  await offlineStore().responses.clear(); await offlineStore().writes.clear();
});
describe("offline data", () => {
  it("reads the last successful response without a network request", async () => {
    const network = vi.fn(async () => new Response('[{"id":"1","name":"sugar"}]', { headers: { "content-type": "application/json" } }));
    const transport = offlineTransport(network);
    await transport(url);
    online(false);
    expect(await (await transport(url)).json()).toEqual([{ id: "1", name: "sugar" }]);
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("never exposes another user's company or branch response", async () => {
    const transport = offlineTransport(async () => new Response('[{"id":"private"}]'));
    await transport(url); online(false);
    for (const other of [{ ...scope, userId: "user-b" }, { ...scope, tenantId: "company-b" }, { ...scope, branchId: "branch-b" }]) {
      setOfflineScope(other); expect((await transport(url)).status).toBe(503);
    }
  });
  it("does not cache failed responses or credentials", async () => {
    const headers = { authorization: "Bearer test-only", apikey: "test-only" };
    await offlineTransport(async () => new Response('{}', { status: 403 }))(url, { headers });
    expect(await offlineStore().responses.count()).toBe(0);
    await offlineTransport(async () => new Response('[]'))(url, { headers });
    const row = (await offlineStore().responses.toArray())[0];
    expect(JSON.stringify(row)).not.toContain("test-only");
  });
  it("captures additions as review-only drafts, never fake successful rows", async () => {
    online(false);
    const network = vi.fn();
    const response = await offlineTransport(network)(url, { method: "POST", body: '{"name":"sugar"}', headers: { authorization: "Bearer test-only" } });
    expect(response.status).toBe(503);
    expect(network).not.toHaveBeenCalled();
    const drafts = await offlineStore().writes.toArray();
    expect(drafts).toHaveLength(1); expect(drafts[0]?.state).toBe("review");
    expect(JSON.stringify(drafts)).not.toContain("test-only");
  });
  it("never queues permission changes, deletion or posting (multi-device)", async () => {
    online(false);
    const transport = offlineTransport(vi.fn());
    for (const [path, method] of [["user_permissions", "POST"], ["products", "DELETE"], ["rpc/post_document", "POST"]] as const) {
      expect((await transport(`https://example.test/rest/v1/${path}`, { method, body: '{}' })).status).toBe(503);
    }
    expect(await offlineStore().writes.count()).toBe(0);
    expect(canQueueWrite("profiles", "PATCH")).toBe(false);
  });
  it("never silently retries an ambiguous write after a network failure", async () => {
    const transport = offlineTransport(async () => { throw new TypeError("Failed to fetch"); });
    await expect(transport(url, { method: "POST", body: '{}' })).rejects.toThrow("Failed to fetch");
    expect(await offlineStore().writes.count()).toBe(0);
  });
  it("uses cached reads on gateway failures, never on permission rejection", async () => {
    let status = 200;
    const transport = offlineTransport(async () => new Response(status === 200 ? '[{"id":"saved"}]' : '{}', { status }));
    await transport(url);
    status = 503;
    expect(await (await transport(url)).json()).toEqual([{ id: "saved" }]);
    status = 403;
    expect((await transport(url)).status).toBe(403);
  });
  it("keeps exact filter and response shape in cache keys", () => {
    const key = scopeKey(scope);
    expect(requestCacheKey(key, url, new Headers())).not.toBe(requestCacheKey(key, url, new Headers({ accept: "application/vnd.pgrst.object+json" })));
    expect(requestCacheKey(key, url, new Headers())).not.toBe(requestCacheKey(key, url + "&id=eq.1", new Headers()));
  });
});
describe("PWA preview safety", () => {
  it("refuses every preview and development context and the kill switch", () => {
    for (const host of ["id-preview--123.lovable.app", "preview--123.lovable.app", "lovableproject.com", "x.lovableproject.com", "lovableproject-dev.com", "x.lovableproject-dev.com", "beta.lovable.dev", "x.beta.lovable.dev"]) expect(refuseServiceWorker(true, host, false, "")).toBe(true);
    expect(refuseServiceWorker(false, "app.example", false, "")).toBe(true);
    expect(refuseServiceWorker(true, "app.example", true, "")).toBe(true);
    expect(refuseServiceWorker(true, "app.example", false, "?sw=off")).toBe(true);
    expect(refuseServiceWorker(true, "app.example", false, "")).toBe(false);
  });
  it("single-device: issues the next official number and posts locally as an estimate", async () => {
    localStorage.setItem(`op-mode:${scope.tenantId}`, "single_device");
    const key = scopeKey(scope);
    const snap = (t: string, rows: unknown[]) => offlineStore().responses.put({ key: `table-snapshot|${key}|${t}`, scope: key, body: JSON.stringify(rows), status: 200, headers: [], savedAt: 1 });
    await snap("journal_entries", [{ id: "e1", tenant_id: "company-a", entry_no: 7 }]);
    await snap("documents", []); await snap("document_lines", []); await snap("journal_lines", []);
    await snap("tenant_settings", [{ tenant_id: "company-a", customers_account_id: "AR", sales_account_id: "SALES" }]);
    online(false);
    const t = offlineTransport(vi.fn());
    const post = (path: string, body: unknown) => t(`https://example.test/rest/v1/${path}`, { method: "POST", body: JSON.stringify(body), headers: { prefer: "return=representation" } });
    const a = await (await post("journal_entries", { tenant_id: "company-a" })).json();
    const b = await (await post("journal_entries", { tenant_id: "company-a" })).json();
    expect([a[0].entry_no, b[0].entry_no]).toEqual([8, 9]);
    const doc = (await (await post("documents", { tenant_id: "company-a", doc_type: "sale", amount: 50 })).json())[0];
    expect((await post("rpc/post_document", { _id: doc.id })).status).toBe(200);
    const lines = await (await t("https://example.test/rest/v1/journal_lines?select=account_id,debit,credit")).json();
    expect(lines.filter((l: { _estimate?: boolean }) => l._estimate).map((l: { account_id: string; debit: number }) => [l.account_id, l.debit])).toEqual([["SALES", 0], ["AR", 50]]);
    localStorage.removeItem(`op-mode:${scope.tenantId}`);
  });
});
