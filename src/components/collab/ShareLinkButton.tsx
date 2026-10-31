import { useState } from "react";
import { Copy, Link2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Creates a private link a customer/supplier can open to view the record and send an inquiry. */
export function ShareLinkButton({ entityType, entityId, label, phone }: { entityType: "document" | "statement"; entityId: string; label: string; phone?: string | null }) {
  const { data: me } = useMe();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const existing = (await db.from("share_links").select("token,expires_at").eq("entity_type", entityType).eq("entity_id", entityId).eq("revoked", false).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle()).data;
    let token = existing?.token as string | undefined;
    if (!token) {
      const { data, error } = await db.from("share_links").insert({ entity_type: entityType, entity_id: entityId, label, created_by: me!.userId, tenant_id: me!.tenantId }).select("token").single();
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      token = data.token;
    }
    setBusy(false);
    setUrl(`${window.location.origin}/share/${token}`);
  }
  const wa = url ? `https://wa.me/${(phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(`${label}\nيمكنك الاطلاع وإرسال أي استفسار عبر الرابط:\n${url}`)}` : "";
  return (
    <>
      <Button size="icon" variant="ghost" title="رابط استفسار للشريك" disabled={busy} onClick={create}><Link2 className="size-4" /></Button>
      <Dialog open={!!url} onOpenChange={(o) => !o && setUrl(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>رابط مشاركة: {label}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">يستطيع العميل أو المورد فتح هذا الرابط دون حساب، والاطلاع على المستند وإرسال استفساره. يصلك الاستفسار في صفحة "الملاحظات واستفسارات الشركاء". صالح لمدة 60 يوماً.</p>
          <div className="flex gap-2">
            <Input readOnly value={url ?? ""} dir="ltr" />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(url ?? ""); toast.success("تم نسخ الرابط"); }}><Copy className="size-4" /></Button>
          </div>
          <Button asChild variant="outline"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />إرسال عبر واتساب</a></Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
