import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (pw.length < 6) { toast.error(t("كلمة السر يجب أن تكون 6 أحرف على الأقل")); return; }
    if (pw !== pw2) { toast.error(t("كلمتا السر غير متطابقتين")); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("تم تغيير كلمة السر"));
    setPw(""); setPw2(""); onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("تغيير كلمة السر")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>{t("كلمة السر الجديدة")}</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("تأكيد كلمة السر")}</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy}>{t("حفظ")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
