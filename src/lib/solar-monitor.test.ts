import { describe, expect, it } from "vitest";
import { co2Kg, dailyProduction, isStale, savings, sunFactor } from "./solar-monitor";
import { acquireSolarReading, matchingReading, simulateReading } from "./solar-monitor";

describe("solar monitor", () => {
  it("produces nothing at night", () => {
    expect(sunFactor(3)).toBe(0);
    expect(sunFactor(20)).toBe(0);
  });
  it("savings = kWh × tariff", () => {
    expect(savings(100, 0.15)).toBe(15);
  });
  it("CO2 avoided is 0.7 kg per kWh", () => {
    expect(co2Kg(1000)).toBe(700);
  });
});

describe("live monitoring failure safety", () => {
  const now = new Date("2026-10-25T06:06:00Z");
  const previous = { ...simulateReading(10, new Date("2026-10-24T10:00:00Z")), source: "sungrow" as const };
  const options = { demo: false, provider: "sungrow", configured: true, capacity: 10, previous, now, fetchLive: async () => { throw new Error("Provider unavailable"); } };
  it("keeps the actual measurement timestamp and forbids a cache update on failure", async () => {
    const result = await acquireSolarReading(options);
    expect(result.reading?.at).toBe("2026-10-24T10:00:00.000Z");
    expect(result.reading?.source).toBe("sungrow");
    expect(result.cache).toBe(false);
    expect(result.error).not.toBeNull();
  });
  it("never fabricates a first reading for an unconfigured real connection", async () => {
    const result = await acquireSolarReading({ ...options, configured: false, previous: null });
    expect(result.reading).toBeNull();
    expect(result.cache).toBe(false);
  });
  it("hides legacy demo data when real mode is enabled", async () => {
    const result = await acquireSolarReading({ ...options, previous: simulateReading(10, now) });
    expect(result.reading).toBeNull();
    expect(result.cache).toBe(false);
  });
  it("does not reuse a Sungrow measurement for an SMA connection", () => {
    expect(matchingReading(previous, false, "sma")).toBeNull();
  });
  it("records a successful real reading without replacing it by simulation", async () => {
    const live = { ...previous, at: now.toISOString(), power_kw: 2.5 };
    const result = await acquireSolarReading({ ...options, fetchLive: async () => live });
    expect(result.reading).toEqual(live);
    expect(result.cache).toBe(true);
    expect(result.error).toBeNull();
  });
  it("generates demo measurements only in explicit demo mode", async () => {
    const result = await acquireSolarReading({ ...options, demo: true, configured: false });
    expect(result.reading?.source).toBe("demo");
    expect(result.reading?.at).toBe(now.toISOString());
    expect(result.cache).toBe(true);
  });
});

import { cleaningDue, performanceRatio, roi } from "./solar-monitor";
describe("solar O&M", () => {
  it("ROI: 5000 kWh × 0.2 = 1000 saved of 4000 cost = 25%", () => {
    const r = roi(5000, 0.2, 4000, 10);
    expect(r.saved).toBe(1000);
    expect(r.pct).toBe(25);
    expect(r.yearsLeft).toBe(4.1);
  });
  it("PR = 40 kWh / (10 kWp × 5h) = 80%", () => {
    expect(performanceRatio(40, 10, 5)).toBe(80);
  });
  it("cleaning due 30 days after last cleaning", () => {
    expect(cleaningDue("2026-01-01", 30, new Date("2026-01-21"))).toBe(10);
  });
});

describe("solar reading history", () => {
  const now = new Date("2026-10-25T06:51:00Z");
  it("flags missing or invalid timestamps as stale", () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale("invalid", now)).toBe(true);
  });
  it("only flags readings older than 30 minutes", () => {
    expect(isStale("2026-10-25T06:21:00Z", now)).toBe(false);
    expect(isStale("2026-10-25T06:20:59Z", now)).toBe(true);
  });
  it("takes the maximum daily total rather than adding cumulative snapshots", () => {
    const history = [10, 25, 20].map((kwh) => ({ read_at: "2026-10-24T12:00:00Z", data: { today_kwh: kwh } }));
    expect(dailyProduction(history, now)).toEqual([{ day: "2026-10-24", kwh: 25 }]);
  });
  it("includes seven UTC calendar days and excludes old and future readings", () => {
    const history = ["2026-10-18T23:59:59Z", "2026-10-19T00:00:00Z", "2026-10-25T06:00:00Z", "2026-10-25T07:00:00Z"].map((at) => ({ read_at: at, data: { today_kwh: 12 } }));
    expect(dailyProduction(history, now)).toEqual([{ day: "2026-10-19", kwh: 12 }, { day: "2026-10-25", kwh: 12 }]);
  });
  it("rejects invalid measurements and keeps real zero production", () => {
    const history = [null, undefined, "12", -1, NaN, 0].map((kwh) => ({ read_at: "2026-10-25T06:00:00Z", data: { today_kwh: kwh } }));
    expect(dailyProduction(history, now)).toEqual([{ day: "2026-10-25", kwh: 0 }]);
  });
});
