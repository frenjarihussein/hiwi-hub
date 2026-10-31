import { useEffect, useRef, useState } from "react";
import { Download, Upload, Wifi, WifiOff, ClipboardList, Send, Trash2 } from "lucide-react";
import { sendDraft, sendAllDrafts, importDrafts, discardDraft } from "@/lib/offline-replay";
import { readQueue as readPosQueue, subscribeQueue as subscribePosQueue, syncQueue as syncPosQueue } from "@/lib/pos-offline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { offlineKey, offlineStore, type PendingWrite } from "@/lib/offline-store";
import { useMe } from "@/lib/session";
import { useExtra } from "@/lib/prefs";
import { describeAudit, changedFields } from "@/lib/audit-describe";
import { useQueryClient } from "@tanstack/react-query";
import { OperatingModeGuard } from "@/components/OperatingModeGuard";

function explainDraft(w: { method: string; table: string; createdAt: number; error?: string; state: string }) {
  const what = describeAudit({ action: w.method === "POST" ? "INSERT" : "UPDATE", table_name: w.table, new_data: {} });
  const when = new Date(w.createdAt).toLocaleString("ar");
  const status = w.state === "sending" ? "أُرسلت ولم يصل رد الخادم بعد؛ تحقق من السجل قبل إعادة الإدخال."
    : w.error ? `حاول البرنامج إرسالها فرفضها الخادم: «${w.error}». ستُعاد المحاولة تلقائياً كل دقيقة عند الاتصال، أو يمكنك رفضها.`
    : "محفوظة على هذا الجهاز وتُرسل تلقائياً فور توفر الإنترنت.";
  return `${what} أُدخلت دون اتصال بتاريخ ${when}. ${status}`;
}

export function OfflineStatus() {
  const { data: me } = useMe();
  const extra = useExtra(me);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const [online, setOnline] = useState(true);
  const [open, setOpen] = useState(false);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    let live = true;
    const update = async () => {
      setOnline(navigator.onLine);
      const scope = offlineKey();
      if (!scope) { setWrites([]); return; }
      const [rows, last] = await Promise.all([
        offlineStore().writes.where("scope").equals(scope).sortBy("createdAt"),
        offlineStore().responses.where("scope").equals(scope).sortBy("savedAt"),
      ]);
      if (live) { setWrites(rows); setSaved(last.at(-1)?.savedAt ?? 0); }
    };
    const onChange = () => { void update().catch(() => toast.error("تعذّر الوصول إلى التخزين المحلي")); };
    onChange();
    for (const event of ["online", "offline", "offline-data-changed"]) window.addEventListener(event, onChange);
    const timer = window.setInterval(onChange, 15000);
    return () => { live = false; clearInterval(timer); for (const event of ["online", "offline", "offline-data-changed"]) window.removeEventListener(event, onChange); };
  }, [me?.userId, me?.tenantId, me?.activeBranchId]);
  const lastAuto = useRef(0);
  const [posCount, setPosCount] = useState(0);
  const posRunning = useRef(false);
  useEffect(() => {
    const refresh = () => setPosCount(readPosQueue().length);
    refresh();
    const unsub = subscribePosQueue(refresh);
    const trySync = () => {
      if (!me || !navigator.onLine || posRunning.current || !readPosQueue().length) return;
      posRunning.current = true;
      void syncPosQueue().then((r) => {
        if (r.sent) { toast.success(`عاد الاتصال: رُحّلت ${r.sent} فاتورة من نقطة البيع`); void qc.invalidateQueries(); }
        if (r.failed.length) toast.error(`فاتورة تحتاج مراجعة في نقطة البيع: ${r.failed[0]}`);
      }).catch(() => {}).finally(() => { posRunning.current = false; refresh(); });
    };
    trySync();
    window.addEventListener("online", trySync);
    const timer = window.setInterval(trySync, 60000);
    return () => { unsub(); window.removeEventListener("online", trySync); clearInterval(timer); };
  }, [me?.userId, me?.tenantId, me?.activeBranchId, qc]);
  useEffect(() => {
    if (!me || extra.data?.offlineAutoSync === false || !online || running.current || !writes.some((w) => w.state !== "sending")) return;
    // Retry failed drafts at most once a minute so a rejected one doesn't loop.
    if (Date.now() - lastAuto.current < 60000 && writes.every((w) => w.error)) return;
    lastAuto.current = Date.now();
    running.current = true;
    setBusy(true);
    void sendAllDrafts(true).then((r) => {
      if (r.sent) { toast.success(`تم تنفيذ ${r.sent} عملية`); void qc.invalidateQueries(); }
    }).catch(() => toast.error("تعذر تنفيذ المزامنة؛ راجع المسودات")).finally(() => { running.current = false; setBusy(false); });
  }, [me, extra.data?.offlineAutoSync, online, writes, qc]);
  if (!me) return null;
  function exportDrafts() {
    const blob = new Blob([JSON.stringify({ version: 2, company: me?.tenantName, exportedAt: new Date().toISOString(), drafts: writes.map(({ headers: _headers, ...row }) => ({ ...row, headers: [] })) }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = href; a.download = "offline-drafts.json"; a.click(); URL.revokeObjectURL(href);
  }
  return <>
    <OperatingModeGuard />
    <div className="no-print flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 text-xs" role="status">
      {online ? <Wifi className="size-4 text-success" /> : <WifiOff className="size-4 text-warning-foreground" />}
      <span>{online ? "متصل" : "دون اتصال — البيانات آخر نسخة محفوظة"}</span>{posCount > 0 && <span className="rounded bg-warning/20 px-2 py-0.5">{posCount} فاتورة نقطة بيع بانتظار الترحيل{online ? " — جارٍ الإرسال تلقائياً" : " — تُرسل تلقائياً عند عودة الإنترنت"}</span>}
      <Button size="sm" variant="ghost" className="ms-auto h-7 gap-2" onClick={() => setOpen(true)}><ClipboardList className="size-4" />العمل دون اتصال{writes.length ? ` (${writes.length})` : ""}</Button>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogTitle>العمل دون اتصال</DialogTitle>
        <DialogDescription>النسخة المحفوظة: {saved ? new Date(saved).toLocaleString("ar") : "لم تُحفظ بيانات بعد"}. الأرصدة والتقارير لا تشمل تغييرات الأجهزة الأخرى.</DialogDescription>
        <p className="text-sm text-muted-foreground">هذه عمليات غير منفذة. راجعها للموافقة على إرسالها أو رفضها. المزامنة التلقائية {extra.data?.offlineAutoSync !== false ? "مفعّلة" : "متوقفة"}، وتغييرها من الإعدادات ← الحساب الشخصي ← المزامنة.</p>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
          const selected = e.target.files?.[0]; e.target.value = "";
          if (!selected) return;
          if (selected.size > 5 * 1024 * 1024) { toast.error("الملف أكبر من الحد المسموح (5 ميغابايت)"); return; }
          void selected.text().then(JSON.parse).then(importDrafts).then((n) => toast.success(`استُوردت ${n} مسودة جديدة؛ المنفذ والمكرر على هذا الجهاز لم يُستورد`), (e) => toast.error(e.message));
        }} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => file.current?.click()}><Upload className="size-4" />استيراد المسودات</Button>
          <Button disabled={!online || busy || !writes.some((w) => w.state !== "sending")} onClick={() => {
            if (!confirm(`تنفيذ جميع المسودات غير المعلقة (${writes.filter((w) => w.state !== "sending").length})؟`)) return;
            setBusy(true);
            void sendAllDrafts().then((r) => { toast[r.failed ? "error" : "success"](`نُفذت ${r.sent} عملية${r.failed ? "؛ توقّف الإرسال عند العملية التي تحتاج مراجعة" : ""}`); void qc.invalidateQueries(); }).finally(() => setBusy(false));
          }}><Send className="size-4" />{busy ? "جارٍ التنفيذ…" : "تنفيذ الكل"}</Button>
        </div>
        {writes.length ? <>
          <Button variant="outline" onClick={exportDrafts}><Download className="size-4" />تصدير المسودات</Button>
          <div className="divide-y divide-border">{writes.map(w => <details key={w.id} className="py-3">
            <summary className="cursor-pointer text-sm">{describeAudit({ action: w.method === "POST" ? "INSERT" : "UPDATE", table_name: w.table, new_data: Array.isArray(w.body) ? w.body[0] : w.body })} — {new Date(w.createdAt).toLocaleString("ar")} — {w.state === "sending" ? "قيد الإرسال أو التحقق من النتيجة" : w.error ? "رُفضت — تحتاج مراجعة" : "بانتظار الإرسال"}</summary>
            <p className="mt-2 rounded-md bg-muted p-2 text-sm">{explainDraft(w)}</p>
            {Array.isArray(w.body) && <p className="mt-2 text-sm">عدد السجلات: {w.body.length}</p>}
            {(Array.isArray(w.body) ? w.body : [w.body]).map((row, i) => <dl key={i} className="mt-3 space-y-2 border-t pt-2 text-sm">{changedFields(null, row as Record<string, unknown>).map((f) => <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2"><dt className="break-words text-muted-foreground">{f.label}</dt><dd className="break-all">{f.after}</dd></div>)}</dl>)}
            {w.method === "PATCH" && <p className="mt-2 break-all text-xs text-muted-foreground">السجل المستهدف: {new URL(w.url).searchParams.toString()}</p>}
            {w.error && <p className="mt-2 text-sm text-destructive">آخر محاولة: {w.error}</p>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={!online || busy || w.state === "sending"} onClick={() => { setBusy(true); void sendDraft(w).then(() => { toast.success("أُرسلت العملية بنجاح"); void qc.invalidateQueries(); }, (e) => toast.error((e as Error).message)).finally(() => setBusy(false)); }}><Send className="size-4" />الموافقة والتنفيذ</Button>
              <Button size="sm" variant="outline" disabled={busy || (w.state === "sending" && !w.error)} onClick={() => { if (confirm(w.state === "sending" ? "قد تكون هذه العملية نُفذت بالفعل. هل تحققت من السجل وتريد إزالة المسودة المحلية فقط؟" : "رفض هذه المسودة وحذفها من الجهاز؟")) void discardDraft(w.id).catch(() => toast.error("تعذر حذف المسودة")); }}><Trash2 className="size-4" />رفض وإزالة</Button>
            </div>
          </details>)}</div>
        </> : <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مسودات محلية بانتظار المراجعة</p>}
        <p className="text-xs text-muted-foreground">الدخول الجديد، إدارة الصلاحيات، الحذف، الترحيل والإقفال، الذكاء الاصطناعي والرفع تحتاج الإنترنت. نقطة البيع لها قائمة إرسال الفواتير الخاصة بها.</p>
      </DialogContent>
    </Dialog>
  </>;
}