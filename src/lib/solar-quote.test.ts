import { describe, it, expect } from "vitest";
import { newSolarQuote, groupTotal, quoteTotal, lineTotal, validateQuote, quotePermissions, studyFileAllowed } from "./solar-quote";
import { createQuoteWorkbook } from "./solar-quote-export";
import { writeFile } from "node:fs/promises";

describe("solar quotation calculations from uploaded workbook", () => {
  it("adds the template's 5% to the panels", () => {
    const q = newSolarQuote(); const g = q.groups[0]; if (!g) throw new Error("missing panels");
    expect(lineTotal(g.lines[0] ?? { description: "", unit: "", qty: 0, price: 0, installation: 0 })).toBe(27360);
    expect(groupTotal(g)).toBe(28728);
  });
  it("includes installation per unit and preserves the original main total", () => {
    const q = newSolarQuote(); expect(quoteTotal(q)).toBe(48838.72);
    expect(lineTotal({ description: "كابل", unit: "م", qty: 60, price: 18, installation: 2.5 })).toBe(1230);
  });
  it("keeps the earthing offer separate unless explicitly included", () => {
    const q = newSolarQuote(); const g = q.groups[5]; if (!g) throw new Error("missing earthing");
    expect(groupTotal(g)).toBe(1186); g.included = true; expect(quoteTotal(q)).toBe(50024.72);
  });
  it("rejects negative and non-finite inputs", () => {
    const q = newSolarQuote(); const l = q.groups[0]?.lines[0]; if (!l) throw new Error("missing line");
    l.price = -1; expect(validateQuote(q)).not.toBeNull(); l.price = NaN; expect(validateQuote(q)).not.toBeNull(); l.price = 0; expect(validateQuote(q)).toBeNull();
  });
  it("does not grant edit or delete to a create-only user", () => {
    const p = { view: true, create: true, edit: false, delete: false };
    expect(quotePermissions(p, "edit", false)).toEqual({ create: true, edit: true, delete: false });
    expect(quotePermissions(p, "edit", true)).toEqual({ create: true, edit: false, delete: false });
  });
  it("accepts PDF and PowerPoint for technical offers, CAD for drawings only", () => {
    for (const f of ["offer.pdf", "offer.ppt", "offer.PPTX"]) expect(studyFileAllowed(f, "survey:technical_offer")).toBe(true);
    expect(studyFileAllowed("drawing.dwg", "survey:technical_offer")).toBe(false);
    expect(studyFileAllowed("drawing.dwg", "survey:drawings")).toBe(true);
    expect(studyFileAllowed("offer.exe", "survey:technical_offer")).toBe(false);
  });
  it("exports live formulas with the same main total", async () => {
    const w = await createQuoteWorkbook(newSolarQuote("عميل تجريبي"), { title: "عرض اختبار", date: "2026-10-22", currency: "USD", projectName: "مشروع اختبار", company: "يوسف سوفت" });
    const s = w.getWorksheet("العرض المالي"); if (!s) throw new Error("missing sheet");
    const totalRow = s.getRows(1, s.rowCount)?.find((r) => r.getCell(2).value === "المجموع الإجمالي المشمول بالعرض");
    expect(totalRow?.getCell(8).value).toMatchObject({ result: 48838.72 });
    expect(s.getCell("G7").value).toEqual({ formula: "E7+F7", result: 95 });
    expect(s.views[0]?.rightToLeft).toBe(true);
    await writeFile("/tmp/solar-quote-check.xlsx", Buffer.from(await w.xlsx.writeBuffer()));
  });
});