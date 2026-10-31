import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Blocks the app until a user flagged must_change_password picks their own password. */
export function ForcePasswordChange() {
  const qc = useQueryClient();
  const { data: must } = useQuery({
    queryKey: ["must_change_password"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("profiles").select("must_change_password").eq("id", u.user.id).maybeSingle();
      return !!data?.must_change_password;
    },
    staleTime: Infinity,
  });
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (p1.length < 6) { toast.error("كلمة المرور 6 أحرف على الأقل"); return; }
    if (p1 !== p2) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      const { error: e2 } = await supabase.rpc("clear_must_change_password");
      if (e2) throw e2;
      toast.success("تم تغيير كلمة المرور");
      qc.setQueryData(["must_change_password"], false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!must}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>اختر كلمة مرور جديدة</DialogTitle>
          <DialogDescription>لحماية حسابك، يجب تغيير كلمة المرور المؤقتة قبل المتابعة.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>كلمة المرور الجديدة</Label>
            <Input type="password" dir="ltr" value={p1} onChange={(e) => setP1(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>تأكيد كلمة المرور</Label>
            <Input type="password" dir="ltr" value={p2} onChange={(e) => setP2(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
