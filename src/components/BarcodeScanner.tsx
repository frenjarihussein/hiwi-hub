import { useEffect, useId, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Cam = { id: string; label: string };

/**
 * Barcode scanner dialog with two inputs: a handheld USB/Bluetooth reader, or a camera.
 * Laptop webcams: we pick the available camera directly (no rear-camera request),
 * ask for HD video so 1D barcode bars are sharp, and offer a photo fallback.
 * `compact` renders an icon-only trigger for table cells.
 */
export function BarcodeScanner({ onScan, compact }: { onScan: (code: string) => void; compact?: boolean }) {
  const regionId = "bc-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [cams, setCams] = useState<Cam[]>([]);
  const [camId, setCamId] = useState<string>(() => (typeof localStorage !== "undefined" ? localStorage.getItem("barcode-cam") ?? "" : ""));
  const lastScan = useRef({ code: "", at: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"device" | "camera">(() => (typeof localStorage !== "undefined" && localStorage.getItem("barcode-mode") === "device" ? "device" : "camera"));
  const [typed, setTyped] = useState("");
  const pick = (m: "device" | "camera") => { setMode(m); localStorage.setItem("barcode-mode", m); setErr(""); };

  const accept = (raw: string) => {
    const code = raw.trim();
    const now = Date.now();
    if (!code || (lastScan.current.code === code && now - lastScan.current.at < 1500)) return;
    lastScan.current = { code, at: now };
    onScanRef.current(code); setLastCode(code); navigator.vibrate?.(80);
    try {
      const audio = new AudioContext(); const o = audio.createOscillator();
      o.frequency.value = 880; o.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.08);
    } catch { /* optional */ }
    if (compact) setOpen(false);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeScanner = async (): Promise<any> => {
    const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import("html5-qrcode");
    return new Html5Qrcode(regionId, {
      verbose: false,
      // Native BarcodeDetector is missing on Windows/Linux Chrome; zxing fallback handles those.
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      formatsToSupport: [F.EAN_13, F.EAN_8, F.CODE_128, F.CODE_39, F.CODE_93, F.UPC_A, F.UPC_E, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX],
    });
  };

  useEffect(() => {
    if (!open || mode !== "camera") return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scanner: any;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
        for (let i = 0; i < 40 && !document.getElementById(regionId); i++) await new Promise((r) => setTimeout(r, 50));
        if (cancelled || !document.getElementById(regionId)) return;
        const { Html5Qrcode } = await import("html5-qrcode");
        const list = (await Html5Qrcode.getCameras()).map((c, i) => ({ id: c.id, label: c.label || `كاميرا ${i + 1}` }));
        if (cancelled) return;
        if (!list.length) throw new Error("no camera");
        setCams(list);
        // Prefer saved camera, else a rear one on phones, else the first (laptop webcam).
        const chosen = list.find((c) => c.id === camId) ?? list.find((c) => /back|rear|environment|خلف/i.test(c.label)) ?? list[0]!;
        scanner = await makeScanner();
        const cfg = {
          fps: 15,
          qrbox: (w: number, h: number) => ({ width: Math.max(220, Math.floor(w * 0.9)), height: Math.max(140, Math.floor(h * 0.6)) }),
          videoConstraints: { deviceId: { exact: chosen.id }, width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] },
        };
        try { await scanner.start(chosen.id, cfg, accept, () => {}); }
        catch {
          // Some webcams reject HD constraints: retry with plain defaults.
          await scanner.start(chosen.id, { fps: 15, qrbox: cfg.qrbox }, accept, () => {});
        }
      } catch (e) {
        if (cancelled) return;
        const m = (e as Error)?.message ?? String(e);
        setErr(/Permission|NotAllowed/i.test(m) ? "تم رفض إذن الكاميرا — اسمح بالوصول من أيقونة القفل بجانب عنوان الموقع ثم أعد المحاولة."
          : /no camera|NotFound/i.test(m) ? "لم يُعثر على كاميرا في هذا الجهاز. استخدم جهاز القارئ أو التقط صورة."
          : /NotReadable|in use/i.test(m) ? "الكاميرا مستخدمة من برنامج آخر (Zoom/Teams…) — أغلقه ثم أعد المحاولة."
          : /insecure/.test(m) ? "الكاميرا تعمل فقط عبر رابط آمن (https)."
          : "تعذّر فتح الكاميرا: " + m);
      }
    })();
    return () => {
      cancelled = true;
      if (scanner) scanner.stop().catch(() => {}).then(() => { try { scanner.clear(); } catch { /* */ } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, camId]);

  const scanPhoto = async (f: File) => {
    setErr("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const tmpId = regionId + "-file";
      let el = document.getElementById(tmpId);
      if (!el) { el = document.createElement("div"); el.id = tmpId; el.style.display = "none"; document.body.appendChild(el); }
      const s = new Html5Qrcode(tmpId, false);
      const code = await s.scanFile(f, false);
      s.clear(); accept(code);
    } catch { setErr("لم يُقرأ باركود من الصورة — قرّب الرمز واجعله واضحاً ومستقيماً."); }
  };

  return (
    <>
      {compact ? (
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" title="مسح باركود" onClick={() => { setErr(""); setLastCode(""); setOpen(true); }}>
          <ScanBarcode className="size-4" />
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => { setErr(""); setLastCode(""); setOpen(true); }}>
          <Camera className="size-4" />قراءة باركود
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>مسح الباركود</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={mode === "device" ? "default" : "outline"} onClick={() => pick("device")}>جهاز قارئ باركود</Button>
            <Button type="button" size="sm" variant={mode === "camera" ? "default" : "outline"} onClick={() => pick("camera")}>الكاميرا</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><ImageUp className="size-4" />من صورة</Button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanPhoto(f); e.target.value = ""; }} />
          </div>
          {mode === "device" ? (
            <form onSubmit={(e) => { e.preventDefault(); accept(typed); setTyped(""); }}>
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="امسح الرمز بالجهاز القارئ هنا…" dir="ltr"
                className="h-12 w-full rounded-md border border-input bg-background px-3 text-lg" />
              <p className="mt-1 text-xs text-muted-foreground">يكتب الجهاز القارئ الرمز ويضغط إدخال تلقائياً.</p>
            </form>
          ) : (
            <>
              {cams.length > 1 && (
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={camId || cams[0]?.id} onChange={(e) => { setCamId(e.target.value); localStorage.setItem("barcode-cam", e.target.value); }}>
                  {cams.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              )}
              <div id={regionId} className="min-h-48 w-full overflow-hidden rounded-md bg-muted [&_video]:w-full [&_video]:rounded-md" />
              <p className="text-xs text-muted-foreground">كاميرا اللابتوب: أبعد الباركود 15–25 سم، في إضاءة جيدة، واجعل خطوطه أفقية داخل الإطار. إن لم تُقرأ استخدم «من صورة».</p>
            </>
          )}
          {lastCode && <p className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm text-success"><CheckCircle2 className="size-4" />تمت إضافة {lastCode}</p>}
          {err && <p className="text-sm text-destructive">{err}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
