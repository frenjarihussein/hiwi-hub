import { useMe } from "@/lib/session";
import { formatDeviceInfo } from "@/lib/device";
import { useExtra, useSaveExtra } from "@/lib/prefs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { PinSetupCard } from "@/components/OfflinePin";
import { Button } from "@/components/ui/button";
import { prepareDevice, exportLocalBackup, importLocalBackup } from "@/lib/single-device";
import { getStorageStatus, requestPersistentStorage, type StorageStatus } from "@/lib/persistent-storage";
import { useQueryClient } from "@tanstack/react-query";
import { OPERATING_MODES, useOperatingMode, setOperatingMode, saveBoundDeviceInfo, thisDeviceId, type OperatingMode } from "@/lib/operating-mode";

export function OfflineSyncSettings() {
  const { data: me } = useMe();
  const extra = useExtra(me);
  const save = useSaveExtra(me);
  const mode = extra.data?.navMode ?? "single";
  const modes = [
    { v: "windows", l: "نظام النوافذ", d: "كل شاشة تفتح بنافذة مستقلة داخل البرنامج" },
    { v: "single", l: "الصفحة الواحدة", d: "كل شاشة تفتح مكان الشاشة الحالية" },
    { v: "hybrid", l: "النظام الهجين", d: "تفتح مكان الحالية مع زر بجانبها لفتحها بنافذة جديدة" },
  ] as const;
  return <section className="max-w-3xl space-y-4">
    <h2 className="text-lg font-semibold">طريقة فتح الشاشات (على الكمبيوتر)</h2>
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="طريقة فتح الشاشات">
      {modes.map((m) => (
        <button key={m.v} type="button" role="radio" aria-checked={mode === m.v} disabled={!extra.isSuccess || save.isPending}
          onClick={() => save.mutate({ navMode: m.v }, { onSuccess: () => toast.success("تم حفظ طريقة الفتح"), onError: (e) => toast.error(e.message) })}
          className={"rounded-lg border p-3 text-start transition " + (mode === m.v ? "border-primary bg-primary/10" : "hover:bg-accent")}>
          <span className="block font-semibold">{m.l}</span><span className="block text-xs text-muted-foreground">{m.d}</span>
        </button>
      ))}
    </div>
    <p className="text-sm text-muted-foreground">على الموبايل تفتح كل الشاشات دائماً في الصفحة نفسها.</p>
    <h2 className="text-lg font-semibold">المزامنة دون اتصال</h2>
    <div className="flex items-center justify-between gap-4 border-y py-4">
      <Label htmlFor="offline-auto-sync">تنفيذ المسودات تلقائياً عند عودة الإنترنت</Label>
      <Switch id="offline-auto-sync" checked={extra.data?.offlineAutoSync !== false} disabled={!extra.isSuccess || save.isPending} onCheckedChange={(checked) => {
        if (checked && !confirm("الموافقة على إرسال المسودات تلقائياً عند الاتصال؟ العمليات المالية المترابطة والاعتماد النهائي لا يشملها هذا الخيار.")) return;
        save.mutate({ offlineAutoSync: checked }, { onSuccess: () => toast.success("تم حفظ خيار المزامنة"), onError: (e) => toast.error(e.message) });
      }} />
    </div>
    <p className="text-sm text-muted-foreground">المسودات غير منفذة حتى يقبلها الخادم. العمليات ذات الرد المفقود أو التي رُفضت تبقى للمراجعة دون إعادة تلقائية.</p>
    <OperatingModeCard />
    <PinSetupCard />
    <StorageProtection />
  </section>;
}

function OperatingModeCard() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useOperatingMode(me?.tenantId);
  const admin = !!(me?.isTenantAdmin || me?.isSuperAdmin);
  const [busy, setBusy] = useState(false);
  const cur = q.data?.mode;
  const apply = async (m: OperatingMode, msg: string) => {
    if (!confirm(msg)) return;
    setBusy(true);
    try { await setOperatingMode(m); toast.success("تم حفظ نمط التشغيل"); await qc.invalidateQueries({ queryKey: ["operating-mode"] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="space-y-3 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">نوع النسخة (نمط التشغيل)</h2>
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="نمط التشغيل">
      {OPERATING_MODES.map((m) => (
        <button key={m.v} type="button" role="radio" aria-checked={cur === m.v} disabled={!admin || busy || !q.isSuccess}
          onClick={() => cur !== m.v && apply(m.v, m.v === "single_device" ? "سيُربط البرنامج بهذا الجهاز فقط وتُمنع الأجهزة الأخرى. متابعة؟" : "سيحتاج البرنامج إنترنت دائماً. متابعة؟")}
          className={"rounded-lg border p-3 text-start transition disabled:opacity-70 " + (cur === m.v ? "border-primary bg-primary/10" : "hover:bg-accent")}>
          <span className="block font-semibold">{m.l}</span><span className="block text-xs text-muted-foreground">{m.d}</span>
        </button>
      ))}
    </div>
    {cur === "single_device" && <p className="text-sm">الجهاز المعتمد: <span dir="ltr" className="font-mono">{q.data?.boundDevice ? q.data.boundDevice.slice(0, 8) : "لم يُحدد بعد (أول جهاز يدخل يُعتمد)"}</span> — هذا الجهاز: <span dir="ltr" className="font-mono">{thisDeviceId().slice(0, 8)}</span> {q.data?.boundDevice === thisDeviceId() && <span className="text-primary">(هذا هو المعتمد)</span>}. سجل الأجهزة في صفحة المستخدمين ← سجل الدخول والخروج ← الأجهزة.</p>}
    {cur === "single_device" && q.data?.boundDevice && <div className="rounded-md bg-muted p-3 text-sm">
      <p className="font-semibold">بيانات الجهاز المعتمد</p>
      <p>{formatDeviceInfo(q.data.boundInfo)}</p>
      {q.data.boundAt && <p className="text-xs text-muted-foreground">تاريخ الاعتماد: {new Date(q.data.boundAt).toLocaleString("ar")}</p>}
      <p className="mt-1 text-xs text-muted-foreground">ملاحظة: المتصفحات تمنع قراءة عنوان MAC، لذلك نعتمد رمزاً دائماً للجهاز مع بيانات النظام والشاشة والمعالج.</p>
      {admin && q.data.boundDevice === thisDeviceId() && <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
        const n = prompt("اسم هذا الجهاز (مثال: جهاز المحاسبة الرئيسي)", localStorage.getItem("device_name") ?? "");
        if (n === null) return;
        localStorage.setItem("device_name", n.trim());
        await saveBoundDeviceInfo(); toast.success("تم حفظ بيانات الجهاز"); void qc.invalidateQueries({ queryKey: ["operating-mode"] });
      }}>تسمية الجهاز وتحديث بياناته</Button>}
    </div>}
    {!admin && <p className="text-sm text-muted-foreground">مدير النظام فقط يستطيع تغيير نمط التشغيل.</p>}
    {admin && cur === "single_device" && q.data?.boundDevice !== thisDeviceId() && (
      <Button size="sm" variant="outline" disabled={busy} onClick={() => apply("single_device", "نقل الشركة إلى هذا الجهاز؟ سيُمنع الجهاز السابق.")}>اعتماد هذا الجهاز بدلاً من السابق</Button>
    )}
    {cur === "single_device" && <SingleDeviceKit />}
  </div>;
}

function StorageProtection() {
  const [st, setSt] = useState<StorageStatus | null>(null);
  const refresh = () => { void getStorageStatus().then(setSt); };
  useEffect(refresh, []);
  const mb = (n: number) => (n / 1048576).toFixed(1) + " MB";
  return <div className="space-y-2 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">حماية التخزين المحلي</h2>
    {!st ? <p className="text-sm text-muted-foreground">جارٍ الفحص…</p> : !st.supported ? <p className="text-sm text-destructive">هذا المتصفح لا يدعم التخزين الدائم.</p> : <>
      <p className={"text-sm font-medium " + (st.persisted ? "text-primary" : "text-destructive")}>
        {st.persisted ? "✓ التخزين دائم ومحمي من المسح التلقائي" : "التخزين غير محمي — قد يمسحه المتصفح عند امتلاء القرص"}
      </p>
      {st.quota > 0 && <p className="text-sm text-muted-foreground">المستخدم: {mb(st.usage)} من {mb(st.quota)}</p>}
      {!st.persisted && <Button size="sm" onClick={async () => {
        const ok = await requestPersistentStorage(); refresh();
        ok ? toast.success("تم تفعيل الحماية") : toast.error("رفض المتصفح الطلب. ثبّت البرنامج على الجهاز ثم أعد المحاولة.");
      }}>تفعيل الحماية</Button>}
    </>}
  </div>;
}

function SingleDeviceKit() {
  const [step, setStep] = useState<string | null>(null);
  const prepare = async () => {
    if (!navigator.onLine) { toast.error("التجهيز يحتاج إنترنت مرة واحدة"); return; }
    const { failed } = await prepareDevice((d, t) => setStep(`${d}/${t}`));
    setStep(null);
    failed.length ? toast.warning("تم التجهيز مع تعذر بعض البيانات") : toast.success("أصبح الجهاز جاهزاً للعمل دون إنترنت");
  };
  const download = async () => {
    try {
      const b = await exportLocalBackup();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: "application/json" }));
      a.download = `نسخة-الجهاز-${b.createdAt.slice(0, 10)}.json`; a.click();
    } catch (e) { toast.error((e as Error).message); }
  };
  const restore = async (f?: File) => {
    if (!f) return;
    try { await importLocalBackup(JSON.parse(await f.text())); toast.success("تمت استعادة بيانات الجهاز"); }
    catch (e) { toast.error((e as Error).message); }
  };
  return <div className="space-y-3 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">وضع الجهاز الواحد</h2>
    <p className="text-sm text-muted-foreground">جهّز الجهاز وهو متصل لتُحفظ الأدلة والفواتير والقيود محلياً وتفتح لاحقاً دون إنترنت. خذ نسخة من بيانات الجهاز دورياً لحمايتها من مسح المتصفح.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={prepare} disabled={!!step}>{step ? `جارٍ التجهيز ${step}` : "تجهيز الجهاز للعمل دون إنترنت"}</Button>
      <Button size="sm" variant="outline" onClick={download}>تنزيل نسخة من بيانات الجهاز</Button>
      <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-accent">
        استعادة نسخة<input type="file" accept="application/json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
      </label>
    </div>
  </div>;
}