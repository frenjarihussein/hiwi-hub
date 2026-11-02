import { useEffect, useState, type ReactNode } from "react";
import { Copy, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLAN_LABEL, type LicenseCheck } from "@/lib/desktop-license";
import { ACTIVATION_CODE, normalizeCode } from "@/lib/desktop-activation";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    if (busy) return;
    const code = normalizeCode(input);
    if (!ACTIVATION_CODE.test(code)) { setError("كود التنشيط غير صحيح"); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch(`${baseUrl()}/__activate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error("فعّل النسخة من جهاز ويندوز الرئيسي");
      const result = await r.json() as { ok: boolean; reason?: string };
      if (!result.ok) {
        const messages: Record<string, string> = { offline: "التفعيل الأول يحتاج الإنترنت. تحقق من الاتصال ثم أعد المحاولة.", used: "هذا الكود مستخدم على جهاز آخر", revoked: "تم إيقاف هذا الكود", not_found: "كود التنشيط غير موجود", invalid: "كود التنشيط غير صحيح", unavailable: "خدمة التفعيل غير متاحة حالياً. أعد المحاولة.", expired: "انتهت صلاحية هذا الترخيص", clock: "صحّح تاريخ الجهاز والوقت" };
        throw new Error(messages[result.reason ?? ""] ?? "تعذر التفعيل. أعد المحاولة.");
      }
      await evaluate();
      toast.success("تم تفعيل الجهاز");
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر التفعيل"); }
    finally { setBusy(false); }
  };

  const msg = state === "loading" ? "جارٍ التحقق من الترخيص…"
    : state === "revoked" ? "تم إيقاف ترخيص هذا الجهاز. تواصل مع المورد."
    : state.reason === "expired" ? `انتهى الترخيص (${PLAN_LABEL[state.payload?.p ?? ""] ?? ""}). أدخل مفتاح تجديد.`
    : state.reason === "clock" ? "تاريخ الجهاز غير صحيح. صحّح التاريخ والوقت ثم أعد التشغيل."
    : state.reason === "device" ? "المفتاح المحفوظ لا يخص هذا الجهاز."
    : "هذه النسخة غير مفعّلة. أدخل كود التنشيط المرسل من المورد. يلزم الإنترنت للتفعيل الأول فقط.";

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-5 rounded-lg border bg-card p-6 shadow-sm">
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
              <label htmlFor="activation-code" className="text-sm font-medium text-foreground">كود التنشيط</label>
              <Input id="activation-code" dir="ltr" className="font-mono text-sm" value={input} disabled={busy} onChange={(e) => setInput(e.target.value)} placeholder="YSA-XXXXX-XXXXX-XXXXX-XXXXX" autoComplete="off" maxLength={80} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={activate} disabled={busy || !input.trim() || !device}><KeyRound className="ml-2 h-4 w-4" />{busy ? "جارٍ التحقق…" : "تفعيل عبر الإنترنت"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
