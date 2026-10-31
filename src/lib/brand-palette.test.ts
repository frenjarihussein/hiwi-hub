import { describe, expect, it } from "vitest";
import { brandTheme, contrastRatio, extractLogoPalette } from "./brand-palette";

describe("multi-colour logo theme", () => {
  it("keeps all distinct logo colours including neutral ink, excluding transparent pixels", () => {
    const palette = extractLogoPalette([220, 30, 30, 255, 20, 140, 65, 255, 20, 60, 220, 255, 0, 0, 0, 255, 255, 255, 255, 255, 150, 0, 150, 0]);
    expect(new Set(palette)).toEqual(new Set(["#dc1e1e", "#148c41", "#143cdc", "#000000", "#ffffff"]));
  });
  it("maps multiple logo colours to separate theme roles and charts", () => {
    const theme = brandTheme("#dc1e1e", ["#dc1e1e", "#148c41", "#143cdc"]);
    expect(theme["--primary"]).toBe("#dc1e1e");
    expect(theme["--highlight"]).toBe("#148c41");
    expect(theme["--accent"]).toContain("#143cdc");
    expect(theme["--chart-3"]).toBe("#143cdc");
    expect(theme["--destructive"]).toBeUndefined();
  });
  it("maintains readable foregrounds and removes the custom theme when reset", () => {
    for (const color of ["#ffee00", "#000000", "#cc2222", "#ffffff"]) {
      const theme = brandTheme(color, []);
      expect(contrastRatio(color, theme["--primary-foreground"] ?? "")).toBeGreaterThanOrEqual(4.5);
    }
    expect(brandTheme(null, [])).toEqual({});
    expect(brandTheme("#cc2222", ["#22cc22"], true)["--secondary"]).toContain("#181818");
  });
});