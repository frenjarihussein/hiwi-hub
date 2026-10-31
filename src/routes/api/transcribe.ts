import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const MAX_BYTES = 20 * 1024 * 1024;

/* Arabic voice input for the assistant: signed-in users upload a short WAV clip, we return the text. */
export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json(401, { error: "يجب تسجيل الدخول" });
        const sb = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return json(401, { error: "انتهت الجلسة" });

        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File) || file.size < 1000) return json(400, { error: "التسجيل قصير جداً، حاول مجدداً" });
        if (file.size > MAX_BYTES) return json(400, { error: "التسجيل طويل جداً" });
        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return json(500, { error: "مفتاح الذكاء الاصطناعي غير مُعد" });

        const out = new FormData();
        out.append("model", "openai/gpt-transcribe");
        out.append("file", file, file.name || "voice.wav");
        out.append("response_format", "json");
        out.append("stream", "true");
        out.append("language", "ar");
        let res: Response;
        try {
          res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: out, signal: request.signal });
        } catch {
          return json(499, { error: "أُلغي التحويل" });
        }
        if (!res.ok) {
          const t = await res.text();
          let msg = t;
          try { msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? t; } catch { /* raw */ }
          if (res.status === 402) msg = "نفد رصيد الذكاء الاصطناعي. " + msg;
          if (res.status === 429) msg = "ضغط مرتفع على الخدمة، حاول بعد قليل.";
          return json(res.status, { error: msg });
        }
        // Read the SSE stream to the end and return the final transcript.
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "", text = "", done = false;
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, i); buf = buf.slice(i + 2);
            const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
            if (!data || data === "[DONE]") continue;
            try {
              const ev = JSON.parse(data);
              if (ev.type === "transcript.text.delta") text += ev.delta ?? "";
              else if (ev.type === "transcript.text.done") { text = ev.text ?? text; done = true; }
              else if (ev.type === "error" || ev.error) return json(502, { error: ev.error?.message ?? "تعذّر تحويل الصوت" });
            } catch { /* partial */ }
          }
        }
        if (!done && !text) return json(502, { error: "لم يكتمل تحويل الصوت" });
        return json(200, { text: text.trim() });
      },
    },
  },
});
