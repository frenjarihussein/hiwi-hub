import { describe, expect, it } from "vitest";
import { combineReadings, electricalLines, type SolarReading } from "./solar-monitor";
const base: SolarReading = { at: "2026-10-25T10:00:00Z", power_kw: 1, capacity_kwp: 5, today_kwh: 1, month_kwh: 1, total_kwh: 1, status: "running", curve: [], alarms: [], source: "sungrow" } as SolarReading;
describe("electrical telemetry", () => {
  it("keeps every inverter's telemetry when combining", () => {
    const a = { ...base, electrical: [{ device: "A", kind: "inverter" as const }] };
    const b = { ...base, electrical: [{ device: "B", kind: "inverter" as const }] };
    expect(combineReadings([a, b])?.electrical?.map((d) => d.device)).toEqual(["A", "B"]);
  });
  it("computes MPPT power from voltage and current", () => {
    expect(electricalLines([{ device: "A", kind: "inverter", dc: [{ v: 500, i: 10 }] }])).toContain("MPPT1: 500.0 V · 10.0 A · 5.00 kW");
  });
});
