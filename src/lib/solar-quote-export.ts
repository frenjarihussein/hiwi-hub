import type { SolarQuote } from "./solar-quote";
import { groupSubtotal, groupTotal, lineTotal, quoteTotal } from "./solar-quote";

export type QuoteMeta = { title: string; date: string; currency: string; projectName: string; company: string; logo?: string | null };
const moneyFormat = '#,##0.00;(#,##0.00);"-"';
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
export async function createQuoteWorkbook(q: SolarQuote, meta: QuoteMeta) {
  const { default: ExcelJS } = await import("exceljs");
  const w = new ExcelJS.Workbook();
  w.creator = meta.company; w.calcProperties.fullCalcOnLoad = true;
  const s = w.addWorksheet("العرض المالي", { views: [{ rightToLeft: true }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
  s.columns = [8, 48, 13, 12, 14, 14, 14, 17].map((width) => ({ width }));
  const mergeRow = (text: string) => { const r = s.addRow([text]); s.mergeCells(r.number, 1, r.number, 8); r.height = 27; return r; };
  mergeRow(meta.company); mergeRow(meta.title);
  mergeRow(`${meta.projectName} — ${q.client} — ${q.location}`);
  mergeRow(`التاريخ: ${meta.date} | العملة: ${meta.currency} | استطاعة المحطة: ${q.capacity} kWp`);
  s.addRow(["البند", "التجهيزة", "الواحدة", "الكمية", `السعر الإفرادي (${meta.currency})`, "أجور التركيب", "الإفرادي مع التركيب", "السعر الإجمالي"]).height = 35;
  const included: string[] = [];
  const summaries: { label: string; ref: string; total: number }[] = [];
  q.groups.forEach((g, gi) => {
    const title = mergeRow(`${gi + 1}. ${g.name}${g.optional ? " (اختياري)" : ""}${!g.included ? " — غير مشمول بالإجمالي" : ""}`);
    title.font = { bold: true, name: "Arial", size: 12 };
    const first = s.rowCount + 1;
    g.lines.forEach((l, li) => {
      const n = s.rowCount + 1;
      const r = s.addRow([`${gi + 1}_${li + 1}`, l.description, l.unit, l.qty, l.price, l.installation,
        { formula: `E${n}+F${n}`, result: l.price + l.installation }, { formula: `ROUND(D${n}*G${n},2)`, result: lineTotal(l) }]);
      r.height = Math.max(30, Math.ceil(l.description.length / 46) * 16);
      [4, 5, 6].forEach((c) => { r.getCell(c).font = { name: "Arial", size: 11, color: { argb: "FF0000FF" } }; r.getCell(c).note = "Source: نموذج العرض المالي المرفق من المستخدم، 2026-10-22؛ قيم مرجعية قابلة للتعديل وليست أسعار السوق الحالية."; });
    });
    const last = s.rowCount;
    const subtotal = s.addRow(["", "مجموع المجموعة", "", "", "", "", "", { formula: g.lines.length ? `SUM(H${first}:H${last})` : "0", result: groupSubtotal(g) }]);
    s.mergeCells(subtotal.number, 2, subtotal.number, 7);
    const n = s.rowCount + 1;
    const total = s.addRow(["", "نسبة الإضافة", "", "", g.markup / 100, "الإجمالي", "", { formula: `ROUND(H${subtotal.number}*(1+E${n}),2)`, result: groupTotal(g) }]);
    s.mergeCells(n, 2, n, 4); s.mergeCells(n, 6, n, 7);
    total.getCell(5).numFmt = '0.0%;(0.0%);"-"';
    total.getCell(5).font = { color: { argb: "FF0000FF" }, name: "Arial" };
    if (g.included) included.push(`H${n}`);
    summaries.push({ label: g.name, ref: `H${n}`, total: groupTotal(g) });
  });
  const total = s.addRow(["", "المجموع الإجمالي المشمول بالعرض", "", "", "", "", "", { formula: included.length ? included.join("+") : "0", result: quoteTotal(q) }]);
  s.mergeCells(total.number, 2, total.number, 7); total.height = 30;
  mergeRow(q.notes).height = Math.max(45, Math.ceil(q.notes.length / 105) * 16);
  if (q.terms) mergeRow(`الشروط: ${q.terms}`).height = Math.max(35, Math.ceil(q.terms.length / 105) * 16);
  s.eachRow((r) => r.eachCell({ includeEmpty: true }, (c) => {
    c.font = { name: "Arial", size: 11, ...c.font };
    c.alignment = { vertical: "middle", horizontal: c.col === "2" ? "right" : "center", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    if ((typeof c.value === "number" || (c.value && typeof c.value === "object" && "formula" in c.value)) && (!c.numFmt || c.numFmt === "General")) c.numFmt = moneyFormat;
  }));
  // Neutral grid and blue group bands follow the supplied workbook's printed table.
  s.eachRow((r) => { if (r.getCell(1).isMerged || r.number === 5) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEAF5" } }; }); });
  s.pageSetup.printArea = `A1:H${s.rowCount}`; s.pageSetup.printTitlesRow = "1:5";
  const summary = w.addWorksheet("ملخص", { views: [{ rightToLeft: true }] });
  summary.columns = [{ width: 50 }, { width: 22 }]; summary.addRow(["المجموعة", `الإجمالي (${meta.currency})`]);
  summaries.forEach((x) => { const r = summary.addRow([x.label, { formula: `'العرض المالي'!${x.ref}`, result: x.total }]); r.getCell(2).font = { name: "Arial", color: { argb: "FF008000" } }; r.getCell(2).numFmt = moneyFormat; });
  return w;
}
export async function exportQuoteExcel(q: SolarQuote, meta: QuoteMeta) {
  const w = await createQuoteWorkbook(q, meta);
  const buffer = await w.xlsx.writeBuffer();
  download(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${meta.title}.xlsx`);
}
export async function exportQuotePdf(el: HTMLElement, meta: QuoteMeta) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pages = Array.from(el.querySelectorAll<HTMLElement>(".quote-print-page"));
  if (!pages.length) throw new Error("لا توجد صفحات للتصدير");
  for (const [i, page] of pages.entries()) {
    const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: getComputedStyle(page).backgroundColor });
    if (i) pdf.addPage();
    const width = 190; const height = canvas.height * width / canvas.width;
    const scale = Math.min(1, 275 / height);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 10 + (width - width * scale) / 2, 10, width * scale, height * scale);
  }
  pdf.save(`${meta.title}.pdf`);
}