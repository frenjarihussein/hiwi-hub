import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMe } from "@/lib/session";
import { useBranding } from "@/lib/branding";
import defaultLogo from "@/assets/yousef-soft-logo.png.asset.json";

/** Faint company logo (or the Yousef Soft logo by default) behind every signed-in page. */
export function Watermark() {
  const { data: me } = useMe();
  const { data: brand } = useBranding();
  const custom = brand?.logo_url;
  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-0 z-0 flex select-none flex-col items-center justify-center gap-4 opacity-[0.06]">
      <img src={custom || defaultLogo.url} alt="" className="max-h-72 max-w-[60vw] object-contain" />
      {custom && me?.tenantName && <div className="text-center text-5xl font-black text-foreground md:text-7xl">{me.tenantName}</div>}
    </div>
  );
}

/** Goes back to the previous screen. Shortcut: Alt + ← (or Alt + Backspace). */
export function BackButton() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "Backspace")) {
        e.preventDefault();
        router.history.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return (
    <button
      type="button"
      onClick={() => router.history.back()}
      title="رجوع للنافذة السابقة (Alt + ←)"
      aria-label="رجوع للنافذة السابقة"
      className="no-print flex h-9 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      <ArrowRight className="size-4 ltr:rotate-180" />
      <span className="hidden sm:inline">رجوع</span>
      <kbd dir="ltr" className="hidden rounded border bg-muted px-1 font-mono text-[10px] md:inline">Alt+←</kbd>
    </button>
  );
}
