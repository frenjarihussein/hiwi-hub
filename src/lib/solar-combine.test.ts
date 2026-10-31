import { describe, expect, it } from "vitest";
import { combineReadings, type SolarReading } from "./solar-monitor";
const r = (p: Partial<SolarReading>): SolarReading => ({ at: "2026-10-25T10:00:00Z", power_kw: 0, capacity_kwp: 0, today_kwh: 0, month_kwh: 0, total_kwh: 0, status: "running", curve: [], alarms: [], source: "sungrow", ...p });
describe("combineReadings", () => {
  it("adds production of two inverters", () => {
    const c = combineReadings([r({ power_kw: 3, capacity_kwp: 5, today_kwh: 10, curve: [{ t: "10:00", kw: 3 }] }), r({ power_kw: 2, capacity_kwp: 5, today_kwh: 8, curve: [{ t: "10:00", kw: 2 }] })])!;
    expect(c.power_kw).toBe(5); expect(c.capacity_kwp).toBe(10); expect(c.today_kwh).toBe(18); expect(c.curve).toEqual([{ t: "10:00", kw: 5 }]);
  });
  it("reports fault when any inverter faults", () => {
    expect(combineReadings([r({}), r({ status: "fault" })])!.status).toBe("fault");
  });
});
