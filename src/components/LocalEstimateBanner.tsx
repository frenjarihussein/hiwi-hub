import { useEffect, useState } from "react";
import { offlineKey, offlineStore } from "@/lib/offline-store";

/** Marks reports computed on this device from unsynced operations as local estimates. */
export function LocalEstimateBanner() {
  const [state, setState] = useState<{ offline: boolean; pending: number }>({ offline: false, pending: 0 });
  useEffect(() => {
    const upd = async () => {
      const scope = offlineKey();
      const pending = scope ? await offlineStore().writes.where("scope").equals(scope).count().catch(() => 0) : 0;
      setState({ offline: !navigator.onLine, pending });
    };
    void upd();
    const evs = ["online", "offline", "offline-data-changed"];
    evs.forEach((e) => window.addEventListener(e, upd));
    return () => evs.forEach((e) => window.removeEventListener(e, upd));
  }, []);
  if (!state.offline && state.pending === 0) return null;
  return (
    <div role="status" className="no-print mb-3 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
      <b>تقدير محلي:</b> {state.offline ? "لا يوجد اتصال، " : ""}الأرقام محسوبة على هذا الجهاز
      {state.pending ? ` وتشمل ${state.pending} عملية لم تُرفع بعد` : ""}، وتصبح رسمية بعد المزامنة.
    </div>
  );
}
