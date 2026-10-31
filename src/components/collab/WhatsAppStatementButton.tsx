import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";

/** One click: builds a statement summary (balance + share link) and opens WhatsApp to the partner's phone. */
export function WhatsAppStatementButton({ partnerId, name, phone, withLabel }: { partnerId: string; name: string; phone?: string | null; withLabel?: boolean }) {
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  async function send() {
    if (!digits) { toast.error("لا يوجد رقم هاتف لهذا الطرف، أضفه في بطاقته أولاً"); return; }
    const win = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const { data: lines, error } = await db.from("journal_lines").select("debit,credit,journal_entries(exchange_rate,currency,entry_date)").eq("partner_id", partnerId).limit(50000);
      if (error) throw error;
      let debit = 0, credit = 0, last = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const l of (lines ?? []) as any[]) {
        const r = Number(l.journal_entries?.exchange_rate) || 1;
        debit += Number(l.debit) / r; credit += Number(l.credit) / r;
        if ((l.journal_entries?.entry_date ?? "") > last) last = l.journal_entries.entry_date;
      }
      const bal = debit - credit;
      let token = (await db.from("share_links").select("token").eq("entity_type", "statement").eq("entity_id", partnerId).eq("revoked", false).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle()).data?.token as string | undefined;
      if (!token) {
        const ins = await db.from("share_links").insert({ entity_type: "statement", entity_id: partnerId, label: `كشف حساب ${name}`, created_by: me!.userId, tenant_id: me!.tenantId }).select("token").single();
        if (ins.error) throw ins.error;
        token = ins.data.token;
      }
      const url = `${window.location.origin}/share/${token}`;
      const status = Math.abs(bal) < 0.005 ? "الحساب مسدد بالكامل ✅" : bal > 0 ? `الرصيد المستحق عليكم: *${fmtNum(bal)}*` : `الرصيد المستحق لكم: *${fmtNum(-bal)}*`;
      const msg = `مرحباً ${name}،\nملخص كشف حسابكم لدى ${me?.tenantName ?? "شركتنا"}:\n• إجمالي المدين: ${fmtNum(debit)}\n• إجمالي الدائن: ${fmtNum(credit)}\n• ${status}${last ? `\n• آخر حركة: ${last}` : ""}\n\nلعرض الكشف التفصيلي وإرسال أي استفسار:\n${url}\n\nشكراً لتعاملكم معنا.`;
      const wa = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
      if (win) win.location.href = wa; else window.location.href = wa;
    } catch (e) {
      win?.close();
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }
  return withLabel
    ? <Button variant="outline" disabled={busy} onClick={send}><MessageCircle className="size-4" />إرسال عبر واتساب</Button>
    : <Button size="icon" variant="ghost" title="إرسال كشف الحساب عبر واتساب" disabled={busy} onClick={send}><MessageCircle className="size-4" /></Button>;
}
