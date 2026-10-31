import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/currencies", () => ({ baseCurrencyOf: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
import { enqueue, newSale, readQueue, refsKey } from "./pos-offline";
import { setOfflineScope } from "./offline-store";
const scope = { userId: "seller-a", tenantId: "company-a", branchId: "branch-a" };
beforeEach(() => { localStorage.clear(); setOfflineScope(scope); });
const sale = () => newSale({ tenantId: scope.tenantId, userId: scope.userId, mode: "sale", partnerId: null, warehouseId: "warehouse-a", paid: true, total: 10, lines: [{ product_id: "product-a", qty: 1, unit_price: 10 }] });
it("captures the sale branch and does not duplicate local enqueue", () => {
  const s = sale(); enqueue(s); enqueue(s);
  expect(s.branchId).toBe("branch-a"); expect(readQueue()).toHaveLength(1);
});
it("isolates the queue and product cache for each seller/company/branch", () => {
  enqueue(sale()); const key = refsKey("company-a");
  for (const other of [{ ...scope, userId: "seller-b" }, { ...scope, tenantId: "company-b" }, { ...scope, branchId: "branch-b" }]) {
    setOfflineScope(other); expect(readQueue()).toHaveLength(0); expect(refsKey("company-a")).not.toBe(key);
  }
  setOfflineScope(scope); expect(readQueue()).toHaveLength(1);
});
it("rejects a sale for a different identity and hides all rows after sign-out", () => {
  const s = sale(); setOfflineScope({ ...scope, userId: "seller-b" });
  expect(() => enqueue(s)).toThrow();
  setOfflineScope(null); expect(readQueue()).toEqual([]);
});
it("keeps device-local numbers unique across captures and reloads", () => {
  const first = sale(); const device = localStorage.getItem("pos_device_id"); const second = sale();
  expect(first.localNo).toContain(device?.slice(0, 8));
  expect(second.localNo).not.toBe(first.localNo);
  enqueue(first);
  expect(readQueue()[0]?.localNo).toBe(first.localNo);
});
it("rejects enqueue after a branch switch", () => {
  const first = sale(); setOfflineScope({ ...scope, branchId: "branch-b" });
  expect(() => enqueue(first)).toThrow();
});
it("uses another device prefix when device storage is new", () => {
  const first = sale(); const device = localStorage.getItem("pos_device_id");
  localStorage.clear(); const second = sale();
  expect(localStorage.getItem("pos_device_id")).not.toBe(device);
  expect(second.localNo).not.toBe(first.localNo);
});