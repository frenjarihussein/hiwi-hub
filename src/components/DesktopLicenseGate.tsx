import { useEffect, useState, type ReactNode } from "react";
import { Copy, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_LABEL, verifyLicense, type LicenseCheck } from "@/lib/desktop-license";

export const IS_DESKTOP = import.meta.env["VITE_DESKTOP"] === "1";
const baseUrl = () => window.location.origin + "/__backend";

async function loadDevice(): Promise<string> {
  const r = await fetch(`${baseUrl()}/__device`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("Device unavailable");
  return (await r.json()).device as string;
}

/** Desktop-only feel: no browser zoom, no browser context menu (inputs keep theirs). */
function useNativeFeel() {
  useEffect(() => {
    if (!IS_DESKTOP) return;
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) e.preventDefault();
      if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r") || e.key === "F12") e.preventDefault();
    };
    const wheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    const menu = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("input,textarea,[contenteditable=true]")) e.preventDefault();
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("contextmenu", menu);
    document.documentElement.dataset["desktop"] = "1";
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("contextmenu", menu);
    };
  }, []);
}

export function DesktopLicenseGate({ children }: { children: ReactNode }) {
  useNativeFeel();
  const [device, setDevice] = useState("");
  const [state, setState] = useState<LicenseCheck | "loading" | "revoked">("loading");
  const [input, setInput] = useState("");

  const evaluate = async () => {
    const r = await fetch(`${baseUrl()}/__license`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error("License unavailable");
    const result = await r.json() as LicenseCheck;
    setState(!result.ok && result.reason === "revoked" ? "revoked" : result);
  };

  useEffect(() => {
    if (!IS_DESKTOP) return;
    loadDevice().then((d) => {
      setDevice(d);
      void evaluate().catch(() => setState({ ok: false, reason: "invalid" }));
    }).catch(() => setState({ ok: false, reason: "invalid" }));
    const recheck = () => { void evaluate().catch(() => setState({ ok: false, reason: "invalid" })); };
    const t = setInterval(recheck, 60_000);
    window.addEventListener("online", recheck);
    window.addEventListener("focus", recheck);
    return () => { clearInterval(t); window.removeEventListener("online", recheck); window.removeEventListener("focus", recheck); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!IS_DESKTOP) return <>{children}</>;
  if (state !== "loading" && state !== "revoked" && state.ok) return <>{children}</>;

  const activate = async () => {
    const k = input.trim();
    const res = await verifyLicense(k, device, Date.now());
    if (!res.ok) { toast.error(res.reason === "device" ? "هذا المفتاح لجهاز آخر" : res.reason === "expired" ? "انتهت صلاحية هذا المفتاح" : "مفتاح غير صالح"); return; }
    try {
      const r = await fetch(`${baseUrl()}/__license`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k }) });
      if (!r.ok) throw new Error("تعذر حفظ التفعيل؛ فعّل النسخة من جهاز ويندوز الرئيسي");
      const result = await r.json() as LicenseCheck;
      if (!result.ok) { setState(result.reason === "revoked" ? "revoked" : result); return; }
      setState(result);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ التفعيل"); }
  };

  const msg = state === "loading" ? "جارٍ التحقق من الترخيص…"
    : state === "revoked" ? "تم إيقاف ترخيص هذا الجهاز. تواصل مع المورد."
    : state.reason === "expired" ? `انتهى الترخيص (${PLAN_LABEL[state.payload?.p ?? ""] ?? ""}). أدخل مفتاح تجديد.`
    : state.reason === "clock" ? "تاريخ الجهاز غير صحيح. صحّح التاريخ والوقت ثم أعد التشغيل."
    : state.reason === "device" ? "المفتاح المحفوظ لا يخص هذا الجهاز."
    : "هذه النسخة غير مفعّلة. أرسل رمز الجهاز للمورد لتحصل على مفتاح التفعيل.";

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">تفعيل يوسف سوفت</h1>
            <p className="text-sm text-muted-foreground">{msg}</p>
          </div>
        </div>
        {state !== "loading" && (
          <>
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">رمز هذا الجهاز</div>
              <div className="flex gap-2">
                <code dir="ltr" className="flex-1 rounded-md bg-muted px-3 py-2 text-center font-mono text-lg tracking-wider text-foreground">{device || "—"}</code>
                <Button variant="outline" size="icon" onClick={() => { void navigator.clipboard.writeText(device); toast.success("تم النسخ"); }}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">مفتاح التفعيل</div>
              <Textarea dir="ltr" rows={4} className="font-mono text-xs" value={input} onChange={(e) => setInput(e.target.value)} placeholder="YSL1...." />
            </div>
            <Button className="w-full" onClick={activate} disabled={!input.trim() || !device}><KeyRound className="ml-2 h-4 w-4" />تفعيل</Button>
          </>
        )}
      </div>
    </div>
  );
}
