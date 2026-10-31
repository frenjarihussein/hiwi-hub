import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { buildAssistantTools } from "@/lib/ai/assistant-tools";
import { buildProjectTools } from "@/lib/ai/assistant-project-tools";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "@/lib/ai/run-id";

const MODEL = "openai/gpt-6-astra";

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json(401, "يجب تسجيل الدخول");
        const sb = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: u, error: uerr } = await sb.auth.getUser(token);
        if (uerr || !u.user) return json(401, "انتهت الجلسة، سجّل الدخول مجدداً");
        const userId = u.user.id;

        const body = (await request.json().catch(() => null)) as { threadId?: string; messages?: UIMessage[] } | null;
        const threadId = body?.threadId;
        const messages = body?.messages;
        if (!threadId || !Array.isArray(messages) || !messages.length) return json(400, "طلب غير صالح");

        const th = await sb.from("ai_threads").select("id,title").eq("id", threadId).eq("user_id", userId).maybeSingle();
        if (!th.data) return json(404, "المحادثة غير موجودة");

        const last = messages[messages.length - 1]!;
        if (last.role === "user") {
          const ins = await sb.from("ai_messages").upsert({ thread_id: threadId, user_id: userId, msg_id: last.id, role: "user", parts: last.parts }, { onConflict: "thread_id,msg_id" });
          if (ins.error) return json(500, "تعذّر حفظ الرسالة: " + ins.error.message);
          const firstText = last.parts.find((p) => p.type === "text") as { text?: string } | undefined;
          await sb.from("ai_threads").update({
            updated_at: new Date().toISOString(),
            ...(th.data.title === "محادثة جديدة" && firstText?.text ? { title: firstText.text.slice(0, 60) } : {}),
          }).eq("id", threadId);
        }

        const prof = await sb.from("profiles").select("full_name,tenant_id,account_kind").eq("id", userId).maybeSingle();
        const tenant = prof.data?.tenant_id ? (await sb.from("tenants").select("name").eq("id", prof.data.tenant_id).maybeSingle()).data : null;
        const projectsOnly = prof.data?.account_kind === "projects_only";

        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return json(500, "مفتاح الذكاء الاصطناعي غير مُعد");
        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const today = new Date().toISOString().slice(0, 10);
        const result = streamText({
          model: provider.responses(MODEL),
          instructions: projectsOnly ? `أنت "مساعد إدارة ومتابعة المشاريع" في نظام يوسف سوفت. تجيب بالعربية بإيجاز ووضوح وتستخدم جداول Markdown.
الشركة: ${tenant?.name ?? "غير محددة"}. المستخدم: ${prof.data?.full_name ?? ""}. تاريخ اليوم: ${today}.
تساعد فقط في أمور المشاريع: حالتها ونسب إنجازها ومراحلها وبنودها والعملاء المهتمين والتخطيط والمتابعة والنصائح الهندسية والتنظيمية. استخدم الأدوات للحصول على بيانات حقيقية ولا تخترع أرقاماً.
إذا سُئلت عن أمور محاسبية أو مالية عامة للشركة (قيود، أرصدة، فواتير، صندوق، أرباح، رواتب) فاعتذر بلباقة وأوضح أن صلاحيتك تقتصر على المشاريع.` : `أنت "المستشار المالي" في نظام يوسف سوفت المحاسبي. تجيب بالعربية بإيجاز ووضوح، وتستخدم جداول Markdown للأرقام.
الشركة: ${tenant?.name ?? "غير محددة"}. المستخدم: ${prof.data?.full_name ?? ""}. تاريخ اليوم: ${today}.
استخدم الأدوات المتاحة دائماً للحصول على أرقام حقيقية من دفاتر الشركة، ولا تخترع أرقاماً. إذا لم تتوفر بيانات فقل ذلك.
عند تحليل الأداء: الإيرادات = دائن - مدين لحسابات الإيرادات، والمصاريف = مدين - دائن لحسابات المصاريف. اذكر العملة.
أنت أيضاً مساعد تنفيذي: يمكنك تجهيز مسودات (قيود يومية، فواتير بيع وشراء ومرتجعات، سندات قبض ودفع، زبائن وموردين جدد، أصناف جديدة) باستخدام أدوات draft_*. ابحث أولاً عن الحسابات والجهات والأصناف بأدوات lookup للحصول على المعرّفات الصحيحة، ولا تخمّن معرّفاً. إذا نقصت معلومة جوهرية (المبلغ، الجهة، الحساب) فاسأل المستخدم. المسودات لا تؤثر على الدفاتر حتى يراجعها المستخدم ويعتمدها من صفحة "مسودات المساعد الذكي" (/ai-drafts)؛ أخبره بذلك بعد إنشاء كل مسودة.
للتحليل استخدم inventory_analysis (النفاد، الراكد، الأكثر مبيعاً)، وcash_flow_forecast (توقع التدفق النقدي من الفواتير الآجلة والشيكات)، وdetect_anomalies (الفواتير المكررة والمصاريف غير المعتادة)، ونبّه بوضوح على ما يحتاج تصرفاً.
إذا أرفق المستخدم صورة فاتورة أو إيصال: استخرج المورد والتاريخ والأصناف (الاسم، الكمية، السعر) والإجمالي والعملة واعرضها في جدول، وقارن مجموع البنود بالإجمالي. ثم ابحث عن المورد بـ lookup_partners وعن كل صنف بـ lookup_products؛ ما لم يوجد جهّز له draft_partner أو draft_product واطلب من المستخدم اعتماده أولاً، وما وُجد استخدم معرّفه في draft_document بنوع purchase. لا تخمّن أرقاماً غير مقروءة؛ اسأل عنها.
المطابقة البنكية: إذا أرفق المستخدم كشف حساب بنكي (صورة أو PDF أو جدول)، اقرأ كل الحركات (التاريخ، البيان، المبلغ موجب للإيداع وسالب للسحب) والرصيد الختامي، حدّد حساب البنك بـ lookup_accounts (اسأل إن تعدد)، ثم استدعِ bank_reconcile. اعرض النتيجة في جداول، واقترح لكل حركة ناقصة قيداً مناسباً (رسوم بنكية، فوائد، تحويل من زبون...) وجهّزه بـ draft_journal_entry بعد موافقة المستخدم أو مباشرة إذا طلب ذلك.
حماية الهامش: عند تجهيز فاتورة بيع أو عرض سعر، إذا أعادت الأداة margin_warnings فابدأ ردك بتنبيه واضح ⚠ واقترح سعراً أدنى مقبولاً. استخدم margin_review لمراجعة هوامش المبيعات السابقة.
الخطابات: عند طلب خطاب مطالبة، احصل على رصيد الزبون وفواتيره غير المسددة (partner_balances و search_documents و cash_flow_forecast)، ثم اكتب خطاباً مهنياً مهذباً بالعربية يتضمن: التحية، المبلغ المستحق والعملة، الفواتير وتواريخها، مهلة السداد، طرق الدفع، والختام باسم الشركة. اجعل النبرة حسب طلب المستخدم (تذكير ودي، ثانٍ، نهائي). لعروض الأسعار: جهّز مسودة quote بـ draft_document، ثم اكتب نص العرض المهني مع جدول الأصناف والشروط ومدة الصلاحية.`,
          messages: await convertToModelMessages(messages),
          tools: projectsOnly ? buildProjectTools(sb) : buildAssistantTools(sb, { userId, tenantId: prof.data?.tenant_id ?? null, threadId }),
          stopWhen: isStepCount(50),
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        return withLovableAiGatewayRunIdHeader(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            sendReasoning: true,
            onFinish: async ({ responseMessage }) => {
              const { error } = await sb.from("ai_messages").upsert(
                { thread_id: threadId, user_id: userId, msg_id: responseMessage.id, role: "assistant", parts: responseMessage.parts },
                { onConflict: "thread_id,msg_id" },
              );
              if (error) console.error("assistant message save failed", error.message);
              await sb.from("ai_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
            },
            onError: (e) => {
              const msg = e instanceof Error ? e.message : String(e);
              if (/402|credit/i.test(msg)) return "نفد رصيد الذكاء الاصطناعي. يرجى إضافة رصيد ثم المحاولة.";
              if (/429|rate/i.test(msg)) return "ضغط مرتفع على الخدمة، حاول بعد قليل.";
              return "حدث خطأ أثناء توليد الرد: " + msg;
            },
          }),
          runIdFetch,
        );
      },
    },
  },
});
