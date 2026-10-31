import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordWav } from "@/lib/ai/record-wav";

/** Press once to record, again to stop; the Arabic transcript is passed to onText. */
export function useVoiceInput(onText: (t: string) => void) {
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const rec = useRef<{ stop: () => Promise<File> } | null>(null);
  async function toggle() {
    if (state === "busy") return;
    if (state === "idle") {
      try { rec.current = await recordWav(); setState("rec"); }
      catch { toast.error("تعذّر الوصول إلى الميكروفون، اسمح للمتصفح باستخدامه"); }
      return;
    }
    setState("busy");
    try {
      const file = await rec.current!.stop();
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const fd = new FormData();
      fd.append("file", file, file.name || "voice.wav");
      const res = await fetch("/api/transcribe", { method: "POST", body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "تعذّر تحويل الصوت");
      if (j.text) onText(j.text); else toast.message("لم يُلتقط كلام، حاول مجدداً");
    } catch (e) { toast.error((e as Error).message); }
    finally { rec.current = null; setState("idle"); }
  }
  return { state, toggle };
}
