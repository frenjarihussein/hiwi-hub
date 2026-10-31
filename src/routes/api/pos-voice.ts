import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai/run-id";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const schema = z.object({
  actions: z.array(z.object({
    action: z.enum(["add", "remove", "set_qty", "clear"]),
    product_id: z.string().nullable(),
    qty: z.number().nullable(),
    price: z.number().nullable(),
  })),
  not_found: z.array(z.string()),
});

/* Turns a spoken POS command ("ثلاث علب حليب وكيلو سكر") into cart actions.
   Products are read with the caller's own access rights, so only their company's items are used. */
export const Route = createFileRoute("/api/pos-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json(401, { error: "يجب تسجيل الدخول" });
        const sb = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return json(401, { error: "انتهت الجلسة" });
        const body = (await request.json().catch(() => null)) as { text?: string } | null;
        const text = body?.text?.trim().slice(0, 1000);
        if (!text) return json(400, { error: "لا يوجد أمر" });

        const { data: products, error } = await sb.from("products").select("id,name,sku").eq("is_group", false).eq("is_active", true).limit(3000);
        if (error) return json(500, { error: error.message });
        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return json(500, { error: "مفتاح الذكاء الاصطناعي غير مُعد" });
        const runIdFetch = createLovableAiGatewayRunIdFetch();
        const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: runIdFetch.fetch });
        const catalog = (products ?? []).map((p) => `${p.id}|${p.name}|${p.sku}`).join("\n");
        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          instructions: `أنت تحوّل أمراً صوتياً لكاشير نقطة بيع إلى إجراءات على السلة. الأعداد العربية المكتوبة كلمات حوّلها لأرقام ("ثلاث"=3، "دزينة"=12، "نص"=0.5). add يضيف الكمية، remove يحذف الصنف، set_qty يضبط الكمية، clear يفرغ السلة (product_id = null). price فقط إذا ذكر السعر صراحة وإلا null. اختر product_id من القائمة فقط بأقرب تطابق للاسم؛ ما لم تجده ضعه في not_found.
قائمة الأصناف (id|الاسم|الرمز):
${catalog}`,
          prompt: text,
          output: Output.object({ schema }),
          abortSignal: request.signal,
          providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", store: false } },
        });
        try {
          const out = await result.output;
          const ids = new Set((products ?? []).map((p) => p.id));
          return json(200, { actions: out.actions.filter((a) => a.action === "clear" || (a.product_id && ids.has(a.product_id))), not_found: out.not_found });
        } catch (e) {
          if (NoObjectGeneratedError.isInstance(e)) return json(502, { error: "لم أفهم الأمر، حاول بصياغة أوضح" });
          const msg = e instanceof Error ? e.message : String(e);
          if (/402|credit/i.test(msg)) return json(402, { error: "نفد رصيد الذكاء الاصطناعي" });
          if (/429|rate/i.test(msg)) return json(429, { error: "ضغط مرتفع على الخدمة، حاول بعد قليل" });
          return json(500, { error: "تعذّر تنفيذ الأمر الصوتي" });
        }
      },
    },
  },
});
