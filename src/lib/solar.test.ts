import { describe, expect, it } from "vitest";
import { milestoneDue, requiredPermits, rollup, sectionAccess, templateRows } from "./solar";

describe("solar progress roll-up", () => {
  it("weights leaves into branch, department and project", () => {
    const n = [
      { id: "d", parent_id: null, weight: 35, progress: 0 },
      { id: "b", parent_id: "d", weight: 50, progress: 0 },
      { id: "t1", parent_id: "b", weight: 60, progress: 100 },
      { id: "t2", parent_id: "b", weight: 40, progress: 50 },
      { id: "b2", parent_id: "d", weight: 50, progress: 40 },
      { id: "d2", parent_id: null, weight: 65, progress: 0 },
    ];
    const r = rollup(n);
    expect(r.byId.get("b")).toBe(80);
    expect(r.byId.get("d")).toBe(60);
    expect(r.total).toBeCloseTo(21);
  });
  it("zero-weight permits department does not affect total", () => {
    const r = rollup([
      { id: "a", parent_id: null, weight: 10, progress: 100 },
      { id: "p", parent_id: null, weight: 0, progress: 0 },
    ]);
    expect(r.total).toBe(100);
  });
});

describe("solar roles", () => {
  it("sales edits survey but only views finance", () => {
    expect(sectionAccess("sales", "survey", true)).toBe("edit");
    expect(sectionAccess("sales", "finance", true)).toBe("view");
    expect(sectionAccess("sales", "civil", true)).toBe("hidden");
  });
  it("engineers never see finance or permits", () => {
    for (const r of ["civil", "electrical"] as const) {
      expect(sectionAccess(r, "finance", true)).toBe("hidden");
      expect(sectionAccess(r, "permits", true)).toBe("hidden");
    }
  });
  it("permits hidden for everyone when not exporting to grid", () => {
    expect(sectionAccess("admin", "permits", false)).toBe("edit");
  });
});

describe("solar rules", () => {
  it("agricultural site requires ministry of agriculture approval", () => {
    expect(requiredPermits(true).map((d) => d.key)).toEqual(["municipality_approval", "agri_approval"]);
    expect(requiredPermits(false)).toEqual([]);
    expect(requiredPermits(true, false)).toEqual([]);
  });
  it("milestone becomes due at its trigger percent", () => {
    expect(milestoneDue(30, 30)).toBe(true);
    expect(milestoneDue(29.9, 30)).toBe(false);
  });
  it("template: procurement follows survey and permits weight 2 without export", () => {
    const rows = templateRows("p", "t", false).filter((r) => r["parent_id"] === null);
    expect(rows.map((r) => r["section"]).slice(0, 2)).toEqual(["survey", "procurement"]);
    expect(rows.find((r) => r["section"] === "permits")?.["weight"]).toBe(2);
  });
});

import { sectionPermsFor as spf, accessFromPerms as afp } from "./solar";
describe("project section permissions", () => {
  const row = (module: string, v: boolean, c: boolean, e: boolean, d: boolean) =>
    ({ module, can_view: v, can_create: c, can_edit: e, can_delete: d });
  it("view-only section stays read-only and other sections hide", () => {
    const perms = [row("projects", true, false, false, false), row("project_survey", true, false, false, false)];
    expect(afp(spf(perms, "survey", false)!)).toBe("view");
    expect(afp(spf(perms, "finance", false)!)).toBe("hidden");
  });
  it("delete is granted independently from create", () => {
    const p = spf([row("project_civil", true, false, true, true)], "civil", false)!;
    expect(p).toEqual({ view: true, create: false, edit: true, delete: true });
  });
  it("no section rows falls back to the role matrix", () => {
    expect(spf([row("projects", true, true, true, true)], "civil", false)).toBeNull();
  });
});
