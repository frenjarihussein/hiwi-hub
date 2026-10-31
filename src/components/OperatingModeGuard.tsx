import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMe } from "@/lib/session";
import { useOperatingMode, claimDevice, setOperatingMode, thisDeviceId, type OperatingMode } from "@/lib/operating-mode";
import { collectDeviceInfo, formatDeviceInfo } from "@/lib/device";
import { Button } from "@/components/ui/button";
import { prepareDevice } from "@/lib/single-device";
import { sendAllDrafts } from "@/lib/offline-replay";
import { syncQueue } from "@/lib/pos-offline";

/** Enforces the company operating mode: single-device binding + full cloud upload/refresh when online. */
export function OperatingModeGuard() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const mode = useOperatingMode(me?.tenantId);
  const [blocked, setBlocked] = useState(false);
  const [online, setOnline] = useState(true);
  const running = useRef(false);
  const single = mode.data?.mode === "single_device";

  useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    u(); window.addEventListener("online", u); window.addEventListener("offline", u);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", u); };
  }, []);

  useEffect(() => {
    if (!single || !online) return;
    void claimDevice().then((ok) => setBlocked(!ok));
  }, [single, online, me?.tenantId]);

  useEffect(() => {
    if (!single || blocked || !me) return;
    const sync = async () => {
      if (!navigator.onLine || running.current) return;
      running.current = true;
      try {
        const pos = await syncQueue().catch(() => ({ sent: 0, failed: [] as string[] }));
        const drafts = await sendAllDrafts(true).catch(() => ({ sent: 0 }));
        await prepareDevice();
        const sent = pos.sent + (drafts as { sent: number }).sent;
        if (sent) { toast.success(`تم رفع ${sent} عملية إلى السحابة`); void qc.invalidateQueries(); }
      } finally { running.current = false; }
    };
    void sync();
    window.addEventListener("online", sync);
    const t = window.setInterval(sync, 10 * 60000);
    return () => { window.removeEventListener("online", sync); clearInterval(t); };
  }, [single, blocked, me?.tenantId, qc]);

  if (!me) return null;
  const admin = !!(me.isTenantAdmin || me.isSuperAdmin);
  const act = async (m: OperatingMode, msg: string) => {
    if (!confirm(msg)) return;
    try {
      await setOperatingMode(m);
      toast.success(m === "single_device" ? "أصبح هذا الجهاز هو المعتمد" : "تم التحويل لنمط الأجهزة المتعددة");
      setBlocked(false);
      await qc.invalidateQueries({ queryKey: ["operating-mode"] });
    } catch (e) { toast.error((e as Error).message); }
  };
  if (blocked) return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/95 p-6 text-center">
      <div className="max-w-md space-y-3">
        <h2 className="text-xl font-bold">هذه الشركة تعمل بنمط الجهاز الواحد</h2>
        <p className="text-muted-foreground">الشركة مربوطة بجهاز آخر لمنع تضارب أرقام الفواتير. اعمل من الجهاز المعتمد، أو اطلب من مدير النظام تغيير النمط أو نقل الجهاز من الإعدادات.</p>
        <p className="text-xs text-muted-foreground">الجهاز المعتمد: {formatDeviceInfo(mode.data?.boundInfo)}</p>
        <p className="text-xs text-muted-foreground">هذا الجهاز: {formatDeviceInfo(collectDeviceInfo())} <span dir="ltr">({thisDeviceId().slice(0, 8)})</span></p>
        {admin && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button onClick={() => act("single_device", "اعتماد هذا الجهاز؟ سيُمنع الجهاز السابق. تأكد أن عملياته غير المرفوعة رُفعت أولاً.")}>اعتماد هذا الجهاز</Button>
            <Button variant="outline" onClick={() => act("multi_device", "التحويل لنمط الأجهزة المتعددة؟ سيحتاج البرنامج إنترنت دائماً.")}>التحويل لأجهزة متعددة</Button>
          </div>
        )}
      </div>
    </div>
  );
  if (mode.data?.mode === "multi_device" && !online) return (
    <div className="bg-destructive/10 px-3 py-1 text-center text-sm text-destructive">نمط الأجهزة المتعددة يحتاج إنترنت دائماً — أعد الاتصال قبل إدخال العمليات.</div>
  );
  return null;
}
