import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";

type Line = { qty: number; unit_price: number; products?: { name?: string; unit?: string } | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Standalone invoice file (opens in any browser/phone) attached to the WhatsApp share. */
function invoiceHtml(d: Doc, lines: Line[], title: string, company: string) {
  const rows = lines.map((l) => `<tr><td>${esc(l.products?.name)}</td><td>${fmtNum(l.qty)} ${esc(l.products?.unit)}</td><td>${fmtNum(l.unit_price)}</td><td>${fmtNum(l.qty * l.unit_price)}</td></tr>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,Tahoma,sans-serif;margin:24px;color:#1b2a41}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #ccd;padding:6px;text-align:right}th{background:#eef2f7}.t{margin-top:12px;font-size:18px;font-weight:700}</style></head><body>
<h1>${esc(company)}</h1><h2>${esc(title)}</h2>
<p>التاريخ: ${esc(fmtDate(d.doc_date))}<br>الجهة: ${esc(d.partners?.name ?? "—")}<br>الحالة: ${d.status === "posted" ? "مرحّل" : "غير مرحّل"}</p>
<table><thead><tr><th>المادة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
<p class="t">الإجمالي: ${fmtNum(d.amount)} ${esc(d.currency)}</p>${d.notes ? `<p>${esc(d.notes)}</p>` : ""}</body></html>`;
}

/** Renders the invoice HTML offscreen and converts it to an A4 PDF (keeps Arabic text shaping). */
async function invoicePdf(html: string, name: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0";
  document.body.appendChild(frame);
  try {
    const d = frame.contentDocument!;
    d.open(); d.write(html); d.close();
    await new Promise((r) => setTimeout(r, 150));
    const canvas = await html2canvas(d.body, { scale: 2, backgroundColor: "#ffffff", windowWidth: 794 });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const w = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const h = (canvas.height * w) / canvas.width;
    const img = canvas.toDataURL("image/jpeg", 0.92);
    for (let y = 0; y < h; y += ph) { if (y) pdf.addPage(); pdf.addImage(img, "JPEG", 0, -y, w, h); }
    return new File([pdf.output("blob")], name, { type: "application/pdf" });
  } finally { frame.remove(); }
}

export function WhatsAppDocumentButton({ doc, lines, title }: { doc: Doc; lines: Line[]; title: string }) {
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const digits = String(doc.partners?.phone ?? "").replace(/\D/g, "").replace(/^00/, "");

  async function send() {
    setBusy(true);
    try {
      let token = (await db.from("share_links").select("token").eq("entity_type", "document").eq("entity_id", doc.id).eq("revoked", false).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle()).data?.token as string | undefined;
      if (!token) {
        const ins = await db.from("share_links").insert({ entity_type: "document", entity_id: doc.id, label: title, created_by: me!.userId, tenant_id: me!.tenantId }).select("token").single();
        if (ins.error) throw ins.error;
        token = ins.data.token;
      }
      const url = `${window.location.origin}/share/${token}`;
      const msg = `مرحباً ${doc.partners?.name ?? ""}،\n${title} من ${me?.tenantName ?? "شركتنا"}\nالتاريخ: ${fmtDate(doc.doc_date)}\nالإجمالي: *${fmtNum(doc.amount)} ${doc.currency}*\n\nعرض الفاتورة:\n${url}\n\nشكراً لتعاملكم معنا.`;
      const file = await invoicePdf(invoiceHtml(doc, lines, title, me?.tenantName ?? ""), `${title}.pdf`);
      // Phones (and supporting desktops): share the PDF itself — pick WhatsApp in the share sheet.
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], text: msg, title }); return; }
        catch (e) { if ((e as Error).name === "AbortError") return; }
      }
      // Fallback: download the PDF to attach, and open WhatsApp with the text and invoice link.
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file); a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, "_blank");
      toast.success("نُزّل ملف PDF للفاتورة — اسحبه إلى محادثة واتساب لإرفاقه، والرابط مضاف للرسالة");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }
  return <Button variant="outline" disabled={busy} onClick={send}><MessageCircle className="size-4" />إرسال عبر واتساب</Button>;
}
