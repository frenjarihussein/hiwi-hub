import { describe, expect, it } from "vitest";
import { suggestCode, suggestFreeCode, validateCode } from "./coding";

describe("standard coding", () => {
  it("starts an empty directory at 01", () => {
    expect(suggestFreeCode("", [], [])).toBe("01");
  });
  it("leaf under 8-digit parent becomes 12 digits", () => {
    expect(suggestCode("01010101", [], false)).toBe("010101010001");
  });
  it("group adds two digits", () => {
    expect(suggestCode("01", ["0101"], true)).toBe("0102");
  });
  it("rejects leaf codes that are not 12 digits", () => {
    expect(validateCode("01010101001", "01010101", false)).not.toBeNull();
    expect(validateCode("010101010001", "01010101", false)).toBeNull();
  });
});
