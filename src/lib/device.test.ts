import { describe, it, expect } from "vitest";
import { describeDevice } from "./device";

describe("describeDevice", () => {
  it("labels a Windows Chrome desktop", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36")).toBe("حاسوب · Windows · Chrome");
  });
  it("labels an Android phone", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("جوال · Android · Chrome");
  });
  it("handles missing agent", () => {
    expect(describeDevice(null)).toBe("غير معروف");
  });
});

import { formatDeviceInfo } from "./device";
describe("formatDeviceInfo", () => {
  it("summarizes stored device details", () => {
    expect(formatDeviceInfo({ name: "الإدارة", os: "Windows 10/11", browser: "Chrome 124", screen: "1920×1080", cores: 8 })).toBe("«الإدارة» · Windows 10/11 · Chrome 124 · شاشة 1920×1080 · 8 نواة");
  });
  it("handles missing info", () => { expect(formatDeviceInfo(null)).toBe("لا توجد بيانات"); });
});
