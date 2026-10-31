import { describe, it, expect } from "vitest";
import { overlayRows, prepareLocalInsert } from "./offline-local-rows";
const w = (method: string, body: unknown, url = "https://x/rest/v1/partners") => ({ id: "w", scope: "s", table: "partners", method, url, body, headers: [], createdAt: 1, state: "pending" as const });
describe("single-device local rows", () => {
  it("assigns ids to offline inserts", () => { expect(prepareLocalInsert({ name: "a" })[0]?.id).toBeTruthy(); });
  it("shows a locally added row in the cached list", () => {
    const rows = overlayRows([{ id: "1", name: "old" }], [w("POST", [{ id: "2", name: "new" }])], "partners", new URL("https://x/rest/v1/partners"));
    expect(rows.map((r) => r.id)).toEqual(["2", "1"]);
  });
  it("applies local edits", () => {
    const rows = overlayRows([{ id: "1", name: "old" }], [w("PATCH", { name: "edited" }, "https://x/rest/v1/partners?id=eq.1")], "partners", new URL("https://x/rest/v1/partners"));
    expect(rows[0]?.["name"]).toBe("edited");
  });
});
