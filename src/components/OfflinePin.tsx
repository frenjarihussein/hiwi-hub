import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { KeyRound, CloudOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  savePinVault, readVault, clearPinVault, unlockWithPin, enterPinOfflineMode, isPinOfflineMode, validPin, MAX_PIN_ATTEMPTS, type VaultRecord,
} from "@/lib/pin-vault";
import { rememberVerifiedUser } from "@/lib/offline-auth";
import { offlineStore } from "@/lib/offline-store";

/** Settings card: set or remove the offline PIN on this trusted device. */
export function PinSetupCard() {
  const [vault, setVault] = useState<VaultRecord | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void readVault().then(setVault); }, []);

  async function save() {
    if (!validPin(pin)) { toast.error("الرمز من 4 إلى 8 أرقام"); return; }
    if (pin !== pin2) { toast.error("الرمزان غير متطابقين"); return; }
    if (!navigator.onLine || isPinOfflineMode()) { toast.error("يجب أن تكون متصلاً ومسجلاً بكلمة المرور"); return; }
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("سجّل الدخول أولاً");
      await savePinVault(pin, data.session as never);
      setVault(await readVault()); setPin(""); setPin2("");
      toast.success("تم حفظ الرمز السري لهذا الجهاز");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" />الدخول برمز سري دون إنترنت</h3>
      <p className="text-sm text-muted-foreground">إذا أُغلق البرنامج وانقطع الإنترنت، تفتحه بهذا الرمز على هذا الجهاز فقط. لا تُرفع أي عملية للسحابة حتى تدخل بكلمة المرور مع الإنترنت. بعد {MAX_PIN_ATTEMPTS} محاولات خاطئة يُمسح الرمز.</p>
      {vault ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">الرمز مفعّل لـ {vault.email}</span>
          <Button variant="outline" size="sm" onClick={async () => { await clearPinVault(); setVault(null); toast.success("أُلغي الرمز"); }}>إلغاء الرمز</Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1"><Label>الرمز</Label><Input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></div>
          <div className="space-y-1"><Label>تأكيد الرمز</Label><Input type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} /></div>
          <div className="flex items-end"><Button onClick={save} disabled={busy}>حفظ الرمز</Button></div>
        </div>
      )}
    </div>
  );
}

/** Sign-in screen: unlock with the PIN when there is no internet. */
export function PinUnlock() {
  const navigate = useNavigate();
  const [vault, setVault] = useState<VaultRecord | null>(null);
  const [offline, setOffline] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void readVault().then(setVault);
    const upd = () => setOffline(!navigator.onLine);
    upd(); window.addEventListener("online", upd); window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  if (!vault) return null;

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await unlockWithPin(pin);
      if (!r.ok) {
        if (r.reason === "wrong") toast.error(`رمز خاطئ، بقي ${r.left} محاولات`);
        else { toast.error("أُقفل الرمز بعد المحاولات الخاطئة؛ ادخل بكلمة المرور عند توفر الإنترنت"); setVault(null); }
        setPin("");
        return;
      }
      const s = r.session;
      // The PIN re-verifies this trusted device; the app stays in offline mode until a real online refresh.
      rememberVerifiedUser(s.user);
      enterPinOfflineMode(s);
      const snap = await offlineStore().values.get(`me:${s.user.id}`);
      if (snap?.value) await offlineStore().values.put({ key: `me:${s.user.id}`, value: { ...(snap.value as object), savedAt: Date.now() } });
      await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
      toast.success("فُتح البرنامج دون اتصال");
      void navigate({ to: "/home" });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={unlock} className="mb-4 space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium"><CloudOff className="size-4" />{offline ? "لا يوجد إنترنت — " : ""}الدخول بالرمز السري ({vault.email})</p>
      <div className="flex gap-2">
        <Input type="password" inputMode="numeric" autoComplete="off" aria-label="الرمز السري" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        <Button type="submit" disabled={busy || pin.length < 4}>فتح</Button>
      </div>
    </form>
  );
}
