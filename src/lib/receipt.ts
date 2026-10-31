import { fmtNum } from "@/lib/format";
import { printDocument } from "@/lib/print";

export type ReceiptData = {
  company: string;
  logoUrl?: string | null;
  title: string;
  docNo?: number | string | null;
  cashier?: string;
  partner?: string;
  lines: { name: string; qty: number; price: number }[];
  paid: boolean;
  date?: string;
  template?: ReceiptTemplate | null;
};

/** Company receipt customisation stored in tenant_settings.receipt_template. */
export type ReceiptTemplate = { width?: "80" | "58"; header?: string; footer?: string; terms?: string; stampUrl?: string; showLogo?: boolean };
export type ReceiptFormat = "thermal" | "thermal58" | "a4";

/** Paper settings for a thermal width: page size, body padding and font scale. */
export function thermalLayout(width: "80" | "58") {
  return width === "58" ? { page: "58mm", pad: "2mm 2.5mm", font: 10, title: 13, total: 15, logo: 22 } : { page: "80mm", pad: "3mm 4mm", font: 12, title: 16, total: 18, logo: 30 };
}

export function printPosReceipt(d: ReceiptData, format: ReceiptFormat) {
  if (format === "thermal58") return printThermalReceipt(d, "58");
  if (format === "thermal") return printThermalReceipt(d, (d.template?.width as "80" | "58") || "80");
  printDocument({
    title: d.title, company: d.company, logo: d.logoUrl,
    meta: [["رقم الفاتورة", String(d.docNo ?? "—")], ["التاريخ", d.date ?? new Date().toLocaleDateString("en-GB")], ["الكاشير", d.cashier ?? ""], ["الطرف", d.partner || "نقدي"], ["الدفع", d.paid ? "نقداً" : "آجل"]],
    columns: ["المادة", "الكمية", "السعر", "المجموع"],
    rows: d.lines.map(l => [l.name, fmtNum(l.qty), fmtNum(l.price), fmtNum(l.qty * l.price)]),
    footer: [["الإجمالي", fmtNum(d.lines.reduce((s, l) => s + l.qty * l.price, 0))]],
    signatures: ["المستلم", "الكاشير"],
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Prints an 80mm thermal receipt straight away through a hidden frame (no popup window). */
export function printThermalReceipt(d: ReceiptData, width: "80" | "58" = "80") {
  printHtml(thermalReceiptHtml(d, width));
}

/** Builds the thermal receipt HTML for the chosen paper width and company template. */
export function thermalReceiptHtml(d: ReceiptData, width: "80" | "58" = "80") {
  const L = thermalLayout(width);
  const tp = d.template ?? {};
  const multi = (t?: string) => (t ? esc(t).replace(/\n/g, "<br>") : "");
  const total = d.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const now = new Date();
  const rows = d.lines
    .map(
      (l) => `<tr><td class="n" colspan="3">${esc(l.name)}</td></tr>
<tr class="q"><td>${fmtNum(l.qty, l.qty % 1 ? 2 : 0)} × ${fmtNum(l.price)}</td><td></td><td class="r">${fmtNum(l.qty * l.price)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@page{size:${L.page} auto;margin:0}
*{box-sizing:border-box}
body{width:${L.page};margin:0;padding:${L.pad};font-family:Tahoma,Arial,sans-serif;font-size:${L.font}px;color:#000}
.c{text-align:center}.r{text-align:left;white-space:nowrap}
h1{font-size:${L.title}px;margin:2px 0}
img{max-width:${L.logo}mm;max-height:18mm}
.st{max-width:${L.logo}mm;max-height:${L.logo}mm;opacity:.85}
.m{font-size:11px;line-height:1.5}
hr{border:0;border-top:1px dashed #000;margin:6px 0}
table{width:100%;border-collapse:collapse}
td{padding:1px 0;vertical-align:top}
.n{font-weight:bold;padding-top:3px}
.q td{font-size:11px}
.t{font-size:${L.total}px;font-weight:bold}
</style></head><body>
<div class="c">${d.logoUrl && tp.showLogo !== false ? `<img src="${esc(d.logoUrl)}">` : ""}<h1>${esc(d.company)}</h1>${tp.header ? `<div class="m">${multi(tp.header)}</div>` : ""}<div>${esc(d.title)}</div></div>
<hr><div class="m">
<div>رقم الفاتورة: <b>${esc(String(d.docNo ?? "-"))}</b></div>
<div>التاريخ: ${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
${d.cashier ? `<div>الكاشير: ${esc(d.cashier)}</div>` : ""}
${d.partner ? `<div>العميل: ${esc(d.partner)}</div>` : ""}
</div><hr>
<table>${rows}</table>
<hr><table>
<tr><td>عدد الأصناف</td><td class="r">${d.lines.length}</td></tr>
<tr class="t"><td>الإجمالي</td><td class="r">${fmtNum(total)}</td></tr>
<tr><td>طريقة الدفع</td><td class="r">${d.paid ? "نقداً" : "آجل"}</td></tr>
</table><hr>
${tp.terms ? `<div class="m">${multi(tp.terms)}</div><hr>` : ""}
${tp.stampUrl ? `<div class="c"><img class="st" src="${esc(tp.stampUrl)}"></div>` : ""}
<div class="c m">${tp.footer ? multi(tp.footer) : "شكراً لزيارتكم"}</div>
</body></html>`;
}

/** Prints raw HTML through a hidden frame. */
function printHtml(html: string) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(f);
   const doc = f.contentDocument;
   if (!doc) { f.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
    setTimeout(() => f.remove(), 2000);
  };
  const img = doc.querySelector("img");
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else setTimeout(go, 100);
}

/** Per-device POS printer choices (browsers can't pick a printer by code, so these name the printer to choose). */
export type PosPrinters = { receiptPrinter: string; orderTicket: boolean; orderPrinter: string; orderCopies: number };
const PRN_KEY = "pos_printers";
export function loadPosPrinters(): PosPrinters {
  const d: PosPrinters = { receiptPrinter: "", orderTicket: false, orderPrinter: "", orderCopies: 1 };
  try { return { ...d, ...JSON.parse(localStorage.getItem(PRN_KEY) || "{}") }; } catch { return d; }
}
export function savePosPrinters(p: PosPrinters) { localStorage.setItem(PRN_KEY, JSON.stringify(p)); }

/** Order details ticket (no prices) for the delivery / preparation section. */
export function printOrderTicket(d: ReceiptData, printerName?: string, copies = 1) {
  const now = new Date();
  const rows = d.lines.map((l) => `<tr><td class="q">${fmtNum(l.qty, l.qty % 1 ? 2 : 0)}</td><td>${esc(l.name)}</td></tr>`).join("");
  const one = `<div class="t">
<div class="c"><h1>تفاصيل الطلب</h1><div class="no">رقم ${esc(String(d.docNo ?? "-"))}</div>${printerName ? `<div class="m">${esc(printerName)}</div>` : ""}</div>
<hr><div class="m"><div>${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
${d.partner ? `<div>العميل: ${esc(d.partner)}</div>` : ""}${d.cashier ? `<div>الكاشير: ${esc(d.cashier)}</div>` : ""}</div><hr>
<table><tr><th class="q">الكمية</th><th>المادة</th></tr>${rows}</table><hr>
<div class="c m">عدد الأصناف: ${d.lines.length}</div></div>`;
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@page{size:80mm auto;margin:0}*{box-sizing:border-box}
body{width:80mm;margin:0;padding:3mm 4mm;font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#000}
.c{text-align:center}h1{font-size:18px;margin:2px 0}.no{font-size:22px;font-weight:bold}.m{font-size:12px}
hr{border:0;border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse}
td,th{padding:3px 0;text-align:right;font-size:15px}.q{width:18mm;font-weight:bold}.t{page-break-after:always}
</style></head><body>${Array.from({ length: Math.max(1, copies) }, () => one).join("")}</body></html>`;
  printHtml(html);
}
