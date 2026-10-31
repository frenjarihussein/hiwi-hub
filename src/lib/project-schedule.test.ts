import { describe, expect, it } from "vitest";
import { barSpan, daysUntil, taskSchedule } from "./project-schedule";

describe("project schedule", () => {
  it("counts days left until delivery", () => {
    expect(daysUntil("2026-11-02", "2026-10-23")).toBe(10);
    expect(daysUntil("2026-10-20", "2026-10-23")).toBe(-3);
  });
  it("marks a task past its end date and unfinished as late", () => {
    const s = taskSchedule("2026-10-01", "2026-10-10", 60, "2026-10-15");
    expect(s.overdue).toBe(true);
    expect(s.late).toBe(true);
  });
  it("a finished task is never late", () => {
    expect(taskSchedule("2026-10-01", "2026-10-10", 100, "2026-10-15").late).toBe(false);
  });
  it("flags a task behind its expected progress", () => {
    // halfway through the window, expected 50%
    expect(taskSchedule("2026-10-01", "2026-10-11", 20, "2026-10-06").late).toBe(true);
    expect(taskSchedule("2026-10-01", "2026-10-11", 50, "2026-10-06").late).toBe(false);
  });
  it("positions gantt bars inside the window", () => {
    const b = barSpan("2026-10-01", "2026-10-10", "2026-10-01", "2026-10-20");
    expect(b.left).toBe(0);
    expect(b.width).toBe(50);
  });
});
