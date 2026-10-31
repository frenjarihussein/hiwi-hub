// Opens a professional printable page (invoice / voucher) in a new window with Print + Save-as-PDF actions.
import defaultLogo from "@/assets/yousef-soft-logo.png.asset.json";
export type PrintDoc = {
  title: string;
  company?: string | null | undefined;
  logo?: string | null | undefined;
  meta: [string, string][];
  columns: string[];
  rows: (string | number)[][];
  footer?: [string, string][];
  notes?: string | null | undefined;
  signatures?: string[];
  dir?: "rtl" | "ltr";
  /** classic | modern | thermal */
  template?: string | null | undefined;
  taxNumber?: string | null | undefined;
  /** Text encoded into the e-invoice QR code. */
  qr?: string | null | undefined;
  footerText?: string | null | undefined;
  /** Extra report sections printed after the main table (multi-section reports). */
  sections?: PrintSection[];
};
export type PrintSection = { title: string; text?: string | null; columns?: string[]; rows?: (string | number)[][]; footer?: [string, string][] };

/** ZATCA-style TLV (base64) e-invoice QR payload: seller, tax no, timestamp, total, tax. */
export function einvoiceQr(seller: string, taxNo: string, iso: string, total: number, tax: number) {
  const enc = new TextEncoder();
  const parts = [seller, taxNo, iso, total.toFixed(2), tax.toFixed(2)].map((v, i) => {
    const b = enc.encode(v);
    return [i + 1, b.length, ...b];
  });
  const bytes = new Uint8Array(parts.flat());
  let bin = "";
  bytes.forEach((x) => (bin += String.fromCharCode(x)));
  return btoa(bin);
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Resolves any CSS color (incl. oklch) to rgb() so the PDF renderer understands it. */
function toRgb(cssColor: string): string {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0f766e";
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  } catch {
    return "rgb(15,118,110)";
  }
}

export type Letterhead = { legal_name?: string; cr_number?: string; phones?: string; address?: string; email?: string; header_note?: string; footer_note?: string };

/** Loads the current company's official letterhead (and logo when the caller didn't pass one). */
async function loadLetterhead(): Promise<{ lh: Letterhead; logo: string | null; footer: string | null; tax: string | null; colors?: string[] }> {
  try {
    const { db } = await import("@/lib/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tid } = await (db as any).rpc("current_tenant_id");
    if (!tid) return { lh: {}, logo: null, footer: null, tax: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db.from("tenant_settings") as any).select("letterhead,logo_url,print_footer,tax_number,theme_colors").eq("tenant_id", tid).maybeSingle();
    return { lh: (data?.letterhead ?? {}) as Letterhead, logo: data?.logo_url ?? null, footer: data?.print_footer ?? null, tax: data?.tax_number ?? null, colors: Array.isArray(data?.theme_colors) ? data.theme_colors : [] };
  } catch { return { lh: {}, logo: null, footer: null, tax: null }; }
}

export async function printDocument(doc: PrintDoc, win?: Window | null) {
  const w = win ?? window.open("", "_blank", "width=960,height=1000");
  if (!w) return;
  const L = await loadLetterhead();
  const lh = L.lh;
  doc = { ...doc, logo: doc.logo || L.logo, footerText: doc.footerText ?? L.footer, taxNumber: doc.taxNumber ?? L.tax };
  const coName = lh.legal_name?.trim() || doc.company || "";
  const lhLines = [lh.cr_number ? `السجل التجاري: ${lh.cr_number}` : "", doc.taxNumber ? `الرقم الضريبي: ${doc.taxNumber}` : "", lh.phones ? `هاتف: ${lh.phones}` : "", lh.email ?? "", lh.address ?? ""].filter(Boolean);
  const lhFooter = lh.footer_note?.trim() || "";
  let qrImg = "";
  if (doc.qr) {
    try { const QR = (await import("qrcode")).default; qrImg = await QR.toDataURL(doc.qr, { margin: 1, width: 260, errorCorrectionLevel: "L" }); } catch { qrImg = ""; }
  }
  const tpl = ["classic", "modern", "thermal"].includes(doc.template ?? "") ? doc.template! : "modern";
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  const pal = (L.colors ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const color = pal[0] ?? toRgb(raw ? (raw.includes("(") || raw.startsWith("#") ? raw : `hsl(${raw})`) : "#0f766e");
  const color2 = pal[1] ?? color;
  const color3 = pal[2] ?? color2;
  const fileName = `${doc.title}-${doc.meta.find((m) => m[0].includes("رقم"))?.[1] ?? ""}`.replace(/[\\/:*?"<>|\s]+/g, "_");
  const wmSrc = doc.logo || new URL(defaultLogo.url, window.location.origin).href;
  const watermark = `<img src="${esc(wmSrc)}" crossorigin="anonymous"/>`;
  const html = `<!doctype html><html dir="${doc.dir ?? "rtl"}" lang="ar"><head><meta charset="utf-8"><title>${esc(fileName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
html,body{margin:0;background:#e9ecef;color:#1f2937;font-family:Cairo,Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.toolbar{position:sticky;top:0;z-index:10;display:flex;gap:8px;justify-content:center;padding:10px;background:#1f2937}
.toolbar button{font-family:inherit;font-size:13px;font-weight:600;border:0;border-radius:6px;padding:8px 18px;cursor:pointer;background:#fff;color:#1f2937}
.toolbar button.pri{background:${color};color:#fff}
.page{position:relative;width:210mm;min-height:297mm;margin:16px auto;background:#fff;padding:14mm 14mm 18mm;box-shadow:0 4px 24px rgba(0,0,0,.12);overflow:hidden;display:flex;flex-direction:column}
.wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0}
.wm img{width:60%;max-height:60%;object-fit:contain;opacity:.07}
.wm span{font-size:64px;font-weight:800;color:${color};opacity:.06;transform:rotate(-30deg);white-space:nowrap}
.content{position:relative;z-index:1;flex:1;display:flex;flex-direction:column}
.band{height:8px;background:linear-gradient(90deg,${color},${color2},${color3});margin:-14mm -14mm 10mm}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:2px solid ${color3}}
header img{max-height:72px;max-width:170px;object-fit:contain}
.co{font-size:18px;font-weight:800;margin:0}
.lhn{font-size:12px;font-weight:600;color:#4b5563}
.lhl{margin-top:3px;font-size:11px;color:#6b7280;line-height:1.6}
.lhf{margin-top:14px;padding:6px 10px;border-top:2px solid ${color3};font-size:11px;text-align:center;color:#374151;white-space:pre-wrap}
.doctitle{text-align:end}
.doctitle .t{display:inline-block;font-size:16px;font-weight:800;color:#fff;background:${color};padding:4px 18px;border-radius:4px}
.doctitle .n{margin-top:6px;font-size:13px;color:#6b7280}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin:16px 0;border:1px solid ${color2};border-top:3px solid ${color2};border-radius:6px;overflow:hidden}
.meta div{padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px}
.meta b{display:block;font-size:11px;font-weight:600;color:${color2}}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{background:${color};color:#fff;font-weight:700;padding:9px 8px;text-align:start}
tbody td{padding:8px;border-bottom:1px solid #eef0f3}
tbody tr:nth-child(even) td{background:rgba(0,0,0,.025)}
.totals{display:flex;justify-content:flex-end;margin-top:12px}
.totals table{width:auto;min-width:45%}
.totals td{padding:9px 14px;font-weight:700;border:1px solid #e5e7eb}
.totals td:last-child{background:${color2};color:#fff;font-size:15px}
.notes{margin-top:16px;padding:10px 14px;border-inline-start:4px solid ${color3};background:#f8fafc;font-size:12.5px;white-space:pre-wrap}
.notes b{display:block;margin-bottom:4px}
.sig{display:flex;justify-content:space-between;gap:24px;margin-top:auto;padding-top:56px;font-size:13px}
.sig div{flex:1;text-align:center}
.sig div:before{content:"";display:block;border-top:1px solid #9ca3af;margin-bottom:6px}
.foot{margin-top:18px;padding-top:8px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af}
.qr{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:11px;color:#6b7280}.qr img{width:140px;height:140px}
.sec{margin-top:18px;break-inside:auto}.sec h3{margin:0 0 8px;padding:6px 12px;font-size:14px;color:${color};border-inline-start:5px solid ${color3};background:#f8fafc}.stx{font-size:12.5px;line-height:1.8;white-space:pre-wrap;margin:6px 0}tr{break-inside:avoid}thead{display:table-header-group}
.ftxt{margin-top:10px;font-size:11.5px;text-align:center;white-space:pre-wrap;color:#4b5563}
.toolbar select{font-family:inherit;border-radius:6px;padding:6px}
body.classic .band,body.classic .wm{display:none}
body.classic thead th{background:#fff;color:#111;border:1px solid #111}
body.classic tbody td,body.classic .meta div{border:1px solid #111}
body.classic .doctitle .t{background:#fff;color:#111;border:2px solid #111}
body.classic .totals td:last-child{background:#fff;color:#111}
body.thermal .page{width:80mm;min-height:auto;padding:4mm;font-size:11px}
body.thermal .band,body.thermal .wm,body.thermal .sig{display:none}
body.thermal header{flex-direction:column;text-align:center}
body.thermal .doctitle{text-align:center}
body.thermal .meta{grid-template-columns:1fr;margin:8px 0}
body.thermal .meta div{padding:3px 6px}
body.thermal table{font-size:11px}
body.thermal thead th,body.thermal tbody td{padding:3px}
body.thermal .totals table{min-width:100%}
body.thermal .qr{justify-content:center;flex-direction:column}
@page{size:A4;margin:8mm 0}
@media print{html,body{background:#fff}.toolbar{display:none}.page{margin:0;box-shadow:none;width:auto;min-height:297mm;overflow:visible}}
</style><style id="pg"></style></head><body class="${tpl}">
<div class="toolbar"><select id="tpl" onchange="setTpl(this.value)"><option value="modern">قالب حديث</option><option value="classic">قالب رسمي</option><option value="thermal">إيصال حراري 80mm</option></select><button class="pri" onclick="window.print()">طباعة</button><button id="pdf" onclick="savePdf()">حفظ PDF</button><button onclick="window.close()">إغلاق</button></div>
<div class="page" id="doc"><div class="wm">${watermark}</div><div class="content">
<div class="band"></div>
<header><div style="display:flex;align-items:center;gap:14px">${doc.logo ? `<img src="${esc(doc.logo)}" crossorigin="anonymous"/>` : ""}<div><p class="co">${esc(coName)}</p>${lh.header_note ? `<div class="lhn">${esc(lh.header_note)}</div>` : ""}${lhLines.length ? `<div class="lhl">${lhLines.map((x) => esc(x)).join(" &nbsp;|&nbsp; ")}</div>` : ""}</div></div>
<div class="doctitle"><div class="t">${esc(doc.title)}</div></div></header>
<div class="meta">${doc.meta.map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v)}</div>`).join("")}</div>
${doc.columns.length ? `<table><thead><tr>${doc.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${doc.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}
${doc.footer?.length ? `<div class="totals"><table>${doc.footer.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table></div>` : ""}
${(doc.sections ?? []).map((x) => `<section class="sec"><h3>${esc(x.title)}</h3>${x.text ? `<p class="stx">${esc(x.text)}</p>` : ""}${x.columns?.length ? (x.rows?.length ? `<table><thead><tr>${x.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${x.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p class="stx">لا توجد بيانات</p>`) : ""}${x.footer?.length ? `<div class="totals"><table>${x.footer.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table></div>` : ""}</section>`).join("")}
${doc.notes ? `<div class="notes"><b>ملاحظات</b>${esc(doc.notes)}</div>` : ""}
${doc.footerText ? `<div class="ftxt">${esc(doc.footerText)}</div>` : ""}
${qrImg ? `<div class="qr"><img src="${qrImg}" alt="QR"/><div>${doc.taxNumber ? `الرقم الضريبي: ${esc(doc.taxNumber)}<br/>` : ""}رمز الفاتورة الإلكترونية</div></div>` : ""}
<div class="sig">${(doc.signatures ?? ["المحاسب", "المدير المالي", "المستلم"]).map((s) => `<div>${esc(s)}</div>`).join("")}</div>
${lhFooter ? `<div class="lhf">${esc(lhFooter)}</div>` : ""}
<div class="foot"><span>${esc(coName)}</span><span>تاريخ الطباعة: ${esc(new Date().toLocaleString("ar"))}</span><span>يوسف سوفت</span></div>
</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
function setTpl(t){document.body.className=t;document.getElementById('tpl').value=t;document.getElementById('pg').textContent=t==='thermal'?'@page{size:80mm auto;margin:0}':'';fit();}
function fit(){var p=document.getElementById('doc');p.style.zoom=1;var s=Math.min(1,(window.innerWidth-24)/p.offsetWidth);p.style.zoom=s;var t=document.querySelector('.toolbar');if(t)t.style.zoom=s;}
window.addEventListener('resize',fit);window.addEventListener('load',fit);setTpl(${JSON.stringify(tpl)});
window.addEventListener('beforeprint',function(){document.getElementById('doc').style.zoom=1;});
window.addEventListener('afterprint',fit);
function savePdf(){
  var b=document.getElementById('pdf');
  if(!window.html2pdf){alert('اختر "حفظ كـ PDF" من نافذة الطباعة');window.print();return;}
  b.disabled=true;b.textContent='جاري الحفظ...';
  var el=document.getElementById('doc');el.style.zoom=1;el.style.boxShadow='none';el.style.margin='0';
  html2pdf().set({margin:0,filename:${JSON.stringify(fileName + ".pdf")},image:{type:'jpeg',quality:0.98},
    html2canvas:{scale:2,useCORS:true,letterRendering:false},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy']}})
    .from(el).save().then(function(){el.style.boxShadow='';el.style.margin='';fit();b.disabled=false;b.textContent='حفظ PDF';});
}
</script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
