import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { dropColumn } from "./offline-replay";
describe("draft column repair", () => {
  it("drops a column the table lacks from every row", () => {
    expect(dropColumn([{ a: 1, created_at: "x" }], "created_at")).toEqual([{ a: 1 }]);
  });
});
