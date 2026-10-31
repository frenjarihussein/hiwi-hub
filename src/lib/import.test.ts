import { describe, expect, it } from "vitest";
import { mapRows } from "./import";

describe("import mapped values", () => {
  it("accepts an exported label like 'دولار أمريكي ($)'", () => {
    const cols = [{ key: "currency", label: "العملة", required: true, map: { "دولار أمريكي": "USD" } }];
    const r = mapRows([["العملة"], ["دولار أمريكي ($)"]], cols as never);
    expect(JSON.stringify(r)).toContain("USD");
  });
});
