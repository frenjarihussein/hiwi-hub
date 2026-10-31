import { describe, expect, it } from "vitest";
import { getWork, startWork, workPercent } from "./work-progress";

describe("long running operations", () => {
  it("reports real completed batch counts and keeps concurrent operations visible", () => {
    const deleteWork = startWork("حذف المشاريع", 4);
    const other = startWork("تصدير الشركات");
    deleteWork.update("حذف المشاريع", 2);
    expect(workPercent(getWork()[0] ?? { id: 0, label: "" })).toBe(50);
    deleteWork.finish();
    expect(getWork().map((task) => task.label)).toEqual(["تصدير الشركات"]);
    other.finish();
    expect(getWork()).toEqual([]);
  });
  it("never invents a percentage for an operation with unknown duration", () => {
    const work = startWork("حفظ");
    expect(workPercent(getWork()[0] ?? { id: 0, label: "" })).toBeUndefined();
    work.finish(); work.finish(); work.update("لا تعود");
    expect(getWork()).toEqual([]);
  });
});