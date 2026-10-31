import "fake-indexeddb/auto";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { offlineQuery } from "./offline-client";
import { offlineStore, setOfflineScope } from "./offline-store";

it("preserves a real PostgREST select/filter chain and reads it offline", async () => {
  await offlineStore().responses.clear();
  setOfflineScope({ userId: "test-user", tenantId: "test-company", branchId: null });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  const network = vi.fn(async () => new Response('[{"id":"1","name":"sugar"}]', { headers: { "content-type": "application/json" } }));
  const client = createClient("https://test.example", "test-public-key", { global: { fetch: network }, auth: { persistSession: false, autoRefreshToken: false } });
  const query = () => offlineQuery(client.from("products")).select("id,name").eq("tenant_id", "test-company");
  expect((await query()).data).toEqual([{ id: "1", name: "sugar" }]);
  expect(await offlineStore().responses.count()).toBe(1);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  expect((await query()).data).toEqual([{ id: "1", name: "sugar" }]);
  expect(network).toHaveBeenCalledTimes(1);
});