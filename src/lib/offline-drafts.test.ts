import { describe, expect, it } from "vitest";
import { draftPath, parseDraftExport } from "./offline-drafts";

const base = "https://example.test";
const scope = JSON.stringify(["user", "company", "branch"]);
const row = { id: "draft-1", scope, table: "partners", method: "POST", url: `${base}/rest/v1/partners`, createdAt: 1000, body: { name: "أحمد" }, state: "review", headers: [] };
describe("draft import", () => {
  it("imports only pending unique drafts", () => {
    expect(parseDraftExport({ drafts: [row, row, { ...row, id: "sent", state: "sending" }] }, scope, base).map((draft) => draft.id)).toEqual(["draft-1"]);
  });
  it("rejects another user company or branch", () => {
    for (const other of [["other", "company", "branch"], ["user", "other", "branch"], ["user", "company", "other"]]) expect(() => parseDraftExport({ drafts: [{ ...row, scope: JSON.stringify(other) }] }, scope, base)).toThrow();
  });
  it("rejects external destinations and privileged operations", () => {
    expect(() => draftPath({ ...row, url: "https://external.test/rest/v1/partners" }, base)).toThrow();
    expect(() => draftPath({ ...row, table: "profiles", url: `${base}/rest/v1/profiles` }, base)).toThrow();
    expect(() => draftPath({ ...row, method: "DELETE" }, base)).toThrow();
  });
  it("requires record IDs for updates, not merely tenant filters", () => {
    expect(() => draftPath({ ...row, method: "PATCH", url: `${row.url}?tenant_id=eq.company` }, base)).toThrow();
    expect(draftPath({ ...row, method: "PATCH", url: `${row.url}?id=eq.partner1` }, base)).toBe(`${row.url}?id=eq.partner1`);
  });
  it("rejects old exports without ownership information", () => expect(() => parseDraftExport({ drafts: [{ ...row, scope: undefined }] }, scope, base)).toThrow());
});