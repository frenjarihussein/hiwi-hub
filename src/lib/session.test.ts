import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { can, canDocType, moduleEnabled, type Me } from "./session";

const admin: Me = {
  userId: "admin", email: "", fullName: "", avatarUrl: null, tenantId: "tenant",
  tenantName: "", tenantNameEn: null, isSuperAdmin: false,
  isTenantAdmin: true, isAuditor: false, accountKind: "standard",
  notifSeenAt: null, perms: [], features: {}, businessActivity: null,
  tenantLocked: false,
  hasBranches: false,
  branchId: null,
  activeBranchId: null,
};

describe("Menu permissions", () => {
  it("shows enabled modules for tenant admins without explicit permission rows", () => {
    for (const module of ["accounts", "journal", "documents", "partners", "cheques", "assets", "products", "warehouses", "stock", "projects", "payroll", "reports", "users", "audit"]) {
      expect(moduleEnabled(admin, module)).toBe(true);
      for (const action of ["view", "create", "edit", "delete"] as const) {
        expect(can(admin, module, action)).toBe(true);
      }
    }
  });

  it("keeps disabled tenant features hidden for tenant admins", () => {
    expect(moduleEnabled({ ...admin, features: { stock: false } }, "stock")).toBe(false);
  });

  it("does not grant ordinary users any missing permissions", () => {
    expect(moduleEnabled({ ...admin, isTenantAdmin: false }, "accounts")).toBe(false);
  });

  it("preserves explicit ordinary-user permissions", () => {
    const user = { ...admin, isTenantAdmin: false, perms: [{ module: "accounts", can_view: true, can_create: false, can_edit: false, can_delete: false }] };
    expect(moduleEnabled(user, "accounts")).toBe(true);
    expect(can(user, "accounts", "create")).toBe(false);
  });
});
describe("Work-cycle document permissions", () => {
  const p = (module: string) => ({ module, can_view: true, can_create: true, can_edit: true, can_delete: false });
  const user = (m: string) => ({ ...admin, isTenantAdmin: false, perms: [p(m)] });
  it("purchases user sees only purchase documents", () => {
    const u = user("purchases");
    expect(can(u, "documents", "view")).toBe(true);
    expect(canDocType(u, "purchase_order")).toBe(true);
    expect(canDocType(u, "sale")).toBe(false);
    expect(canDocType(u, "stock_out")).toBe(false);
  });
  it("sales user sees only sales documents", () => {
    expect(canDocType(user("sales"), "quote")).toBe(true);
    expect(canDocType(user("sales"), "purchase")).toBe(false);
  });
  it("storekeeper sees only warehouse documents", () => {
    expect(canDocType(user("inventory"), "stock_in")).toBe(true);
    expect(canDocType(user("inventory"), "opening_inventory", "create")).toBe(true);
    expect(canDocType(user("inventory"), "closing_inventory", "create")).toBe(true);
    expect(canDocType(user("inventory"), "sale")).toBe(false);
  });
  it("full documents permission sees every type", () => {
    expect(canDocType(user("documents"), "payment_order")).toBe(true);
  });
});
