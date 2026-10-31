import { describe, expect, it } from "vitest";
import { PROJECT_PRESETS, keepProjectPerms, projectsOnlyFeatures } from "./project-presets";

const get = (id: string) => PROJECT_PRESETS.find((p) => p.id === id)!.perms;

describe("Project user presets", () => {
  it("offers the eight requested roles", () => {
    expect(PROJECT_PRESETS.map((p) => p.id)).toEqual(["surveyor", "study", "electrical", "mechanical", "civil", "manager", "finance", "permits"]);
  });
  it("surveyor can add new projects", () => {
    expect(get("surveyor")["projects"]?.can_create).toBe(true);
  });
  it("electrical lead edits only the electrical section", () => {
    expect(get("electrical")["project_electrical"]?.can_edit).toBe(true);
    expect(get("electrical")["project_civil"]).toBeUndefined();
    expect(get("electrical")["project_finance"]).toBeUndefined();
  });
  it("project manager has full access to every section", () => {
    for (const s of ["survey", "procurement", "civil", "mechanical", "electrical", "finance", "permits"]) expect(get("manager")[`project_${s}`]?.can_delete).toBe(true);
  });
  it("only the project manager can manage the project team", () => {
    expect(get("manager")["project_users"]?.can_create).toBe(true);
    for (const p of PROJECT_PRESETS.filter((x) => x.id !== "manager")) expect(p.perms["project_users"]).toBeUndefined();
  });
  it("permits lead cannot see finance", () => {
    expect(get("permits")["project_finance"]).toBeUndefined();
    expect(get("permits")["project_permits"]?.can_edit).toBe(true);
  });
});

describe("Project-only user permissions", () => {
  const rows = [
    { module: "projects" }, { module: "project_civil" }, { module: "project_users" },
    { module: "journal" }, { module: "accounts" }, { module: "documents" }, { module: "users" },
  ];
  it("drops every accounting permission", () => {
    expect(keepProjectPerms(rows, true).map((r) => r.module)).toEqual(["projects", "project_civil", "project_users"]);
  });
  it("project manager cannot grant team management", () => {
    expect(keepProjectPerms(rows, false).map((r) => r.module)).toEqual(["projects", "project_civil"]);
  });
  it("detects a projects-only company", () => {
    expect(projectsOnlyFeatures({ accounts: false, journal: false })).toBe(true);
    expect(projectsOnlyFeatures({ accounts: false })).toBe(false);
    expect(projectsOnlyFeatures({ projects: false, accounts: false, journal: false })).toBe(false);
  });
});
