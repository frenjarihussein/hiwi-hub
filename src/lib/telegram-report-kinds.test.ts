import { describe, expect, it } from "vitest";
import { formatReport } from "./telegram.server";
const now = new Date().toISOString();
const row = (name: string, today: number, cap: number, status = "running") => ({ name, demo: false, last_sync: now, data: { today_kwh: today, capacity_kwp: cap, status, total_kwh: 1000 } });
describe("report templates", () => {
  it("ranks top producers by today kWh (equivalent hours removed)", () => {
    const t = formatReport("top", [row("Big", 50, 100), row("Small", 30, 10)]);
    expect(t.indexOf("Big")).toBeLessThan(t.indexOf("Small")); expect(t).not.toContain("مكافئة");
  });
  it("flags offline and low-output stations for attention", () => {
    const t = formatReport("attention", [row("Ok", 40, 10), row("Off", 0, 10, "offline"), row("Low", 5, 10)]);
    expect(t).toContain("Off"); expect(t).toContain("Low"); expect(t).not.toContain("Ok");
  });
});
