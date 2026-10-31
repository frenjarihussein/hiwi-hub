import { describe, expect, it } from "vitest";
import { liveCurve, newAlertText, simulateReading, type SolarReading } from "./solar-monitor";
const base = (p: Partial<SolarReading>): SolarReading => ({ ...simulateReading(10, new Date("2026-10-25T10:00:00Z")), curve: [], alarms: [], status: "running", ...p });
describe("solar alerts", () => {
  it("alerts once when a station turns faulty", () => {
    const f = base({ status: "fault", alarms: [{ code: "1", text: "x", at: "" }] });
    expect(newAlertText(base({}), f)).toContain("عطل");
    expect(newAlertText(f, f)).toBeNull();
  });
  it("builds today's curve from snapshots", () => {
    const r = base({ at: "2026-10-25T10:00:00Z", power_kw: 5 });
    const c = liveCurve(r, [{ read_at: "2026-10-25T09:00:00Z", data: base({ power_kw: 3 }) }, { read_at: "2026-10-24T09:00:00Z", data: base({ power_kw: 9 }) }]);
    expect(c.map((p) => p.kw)).toEqual([3, 5]);
  });
});
