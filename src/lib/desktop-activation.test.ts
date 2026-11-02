import { describe, it, expect } from "vitest";
import { ACTIVATION_CODE, clampBatch, cleanSpecs, newActivationCode, normalizeCode } from "./desktop-activation";
import { requiresMainPc } from "../../desktop/server/proxy-access";
import { startupSnapshot } from "../../desktop/server/progress";

describe("desktop activation rules", () => {
  it("allows the requested batch maximum of 200", () => { expect(clampBatch(200)).toBe(200); expect(() => clampBatch(201)).toThrow(); });
  it("requires at least one activation code", () => { expect(clampBatch(1)).toBe(1); expect(() => clampBatch(0)).toThrow(); });
  it("generates and normalizes redeemable codes", () => { const code = newActivationCode(() => new Uint8Array(20).fill(15)); expect(ACTIVATION_CODE.test(code)).toBe(true); expect(normalizeCode(` ${code.toLowerCase()} `)).toBe(code); expect(ACTIVATION_CODE.test("wrong")).toBe(false); });
  it("keeps device specs bounded", () => { const s = cleanSpecs({ hostname: "PC\u0000", ram_gb: 16, cores: 8, cpu: "x".repeat(200) }); expect(s.hostname).toBe("PC"); expect(s.ram_gb).toBe(16); expect(s.cores).toBe(8); expect(s.cpu.length).toBe(120); expect(cleanSpecs({ ram_gb: Infinity }).ram_gb).toBe(0); });
  it("restricts online activation to the main PC", () => expect(requiresMainPc("/__activate", "POST")).toBe(true));
  it("restricts replacement licenses to the main PC", () => { expect(requiresMainPc("/__license", "POST")).toBe(true); expect(requiresMainPc("/__license", "GET")).toBe(false); });
});
describe("startup progress", () => {
  const state = { step: 4, stepStart: 1000, skip: new Set<string>(), done: false, error: "", started: 1000 };
  it("advances only on completed stages, not an elapsed timer", () => { expect(startupSnapshot(state, 1000).pct).toBe(57); expect(startupSnapshot(state, 31000).pct).toBe(57); });
  it("does not invent remaining duration after an overrun", () => { expect(startupSnapshot(state, 1000).remaining).toBe(76); expect(startupSnapshot(state, 62000).remaining).toBeNull(); });
  it("reaches 100 only after services and app are ready", () => { expect(startupSnapshot({ ...state, done: true }, 62000).pct).toBe(100); expect(startupSnapshot(state, 62000).pct).toBeLessThan(100); });
});