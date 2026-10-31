import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Plus, Trash2, Mic, Square, Paperclip, X, Loader2 } from "lucide-react";
import { useVoiceInput } from "@/lib/ai/use-voice-input";
import type { FileUIPart } from "ai";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/page-head";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools, PromptInputButton, PromptInputHeader, usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/_authenticated/assistant/$threadId")({
  head: () => pageHead("المساعد المالي الذكي", "اسأل عن أداء شركتك وتقاريرها المالية ومواعيد استحقاق الشيكات."),
  component: AssistantPage,
});

type Thread = { id: string; title: string; updated_at: string };

const TOOL_TITLE: Record<string, string> = {
  financial_summary: "ملخص الأداء المالي",
  upcoming_cheques: "الشيكات المستحقة",
  partner_balances: "أرصدة الشركاء",
  account_balance: "رصيد حساب",
  search_documents: "البحث في المستندات",
  inventory_analysis: "تحليل المخزون",
  cash_flow_forecast: "توقع التدفق النقدي",
  detect_anomalies: "كشف الشذوذ",
  lookup_accounts: "بحث في الحسابات",
  lookup_partners: "بحث في الزبائن والموردين",
  lookup_products: "بحث في الأصناف",
  draft_journal_entry: "مسودة قيد",
  draft_document: "مسودة مستند",
  draft_partner: "مسودة زبون/مورد",
  draft_product: "مسودة صنف",
  bank_reconcile: "المطابقة البنكية",
  margin_review: "مراجعة هوامش الربح",
  lookup_projects: "بحث في المشاريع",
  get_project_wbs: "مراحل المشروع",
  get_project_leads: "العملاء المهتمون",
};

const PROJECT_SUGGESTIONS = [
  "ما المشاريع قيد التنفيذ ونسب إنجازها؟",
  "ما المشاريع المتأخرة أو المتوقفة؟",
  "اعرض مراحل أحدث مشروع ونسبة كل مرحلة",
  "من العملاء المهتمون الجدد؟",
];

const SUGGESTIONS = [
  "ما هي الشيكات المستحقة خلال الأسبوعين القادمين؟",
  "لخّص أداء الشركة هذا الشهر مقارنة بالشهر الماضي",
  "من هم أكبر الزبائن مديونية؟",
  "ما رصيد الصندوق؟",
  "ما الأصناف التي قاربت على النفاد والأصناف الراكدة؟",
  "توقع التدفق النقدي للشهرين القادمين",
  "هل توجد فواتير مكررة أو مصاريف غير معتادة؟",
  "هل بعنا أصنافاً بأقل من التكلفة هذا الشهر؟",
  "اكتب خطاب مطالبة ودّي لأكبر زبون مديونية",
];

function AssistantPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const threads = useQuery({
    queryKey: ["ai_threads"],
    queryFn: async () => ((await db.from("ai_threads").select("id,title,updated_at").order("updated_at", { ascending: false })).data ?? []) as Thread[],
  });
  const history = useQuery({
    queryKey: ["ai_messages", threadId],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await db.from("ai_messages").select("msg_id,role,parts").eq("thread_id", threadId).order("created_at");
      if (error) throw error;
      return (data ?? []).map((m: { msg_id: string; role: UIMessage["role"]; parts: UIMessage["parts"] }) => ({ id: m.msg_id, role: m.role, parts: m.parts })) as UIMessage[];
    },
  });
  async function newThread() {
    const { data, error } = await db.from("ai_threads").insert({}).select("id").single();
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["ai_threads"] });
    navigate({ to: "/assistant/$threadId", params: { threadId: data.id } });
  }
  async function remove(id: string) {
    if (!window.confirm("حذف هذه المحادثة؟")) return;
    await db.from("ai_threads").delete().eq("id", id);
    await qc.invalidateQueries({ queryKey: ["ai_threads"] });
    if (id === threadId) navigate({ to: "/assistant" });
  }
  return (
    <div className="grid h-[calc(100vh-7rem)] gap-4 md:grid-cols-[16rem_1fr]">
      <aside className="flex min-h-0 flex-col gap-2 rounded-lg border bg-card p-2">
        <Button onClick={newThread} className="w-full"><Plus className="size-4" />محادثة جديدة</Button>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {threads.data?.map((t) => (
            <div key={t.id} className={`group flex items-center rounded-md text-sm ${t.id === threadId ? "bg-accent" : "hover:bg-muted"}`}>
              <Link to="/assistant/$threadId" params={{ threadId: t.id }} className="min-w-0 flex-1 truncate px-2 py-2">{t.title}</Link>
              <button type="button" title="حذف" onClick={() => remove(t.id)} className="p-2 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
        </div>
      </aside>
      <section className="flex min-h-0 flex-col rounded-lg border bg-card">
        {history.isLoading ? <div className="p-6"><Shimmer>جارٍ تحميل المحادثة...</Shimmer></div>
          : history.error ? <p className="p-6 text-destructive">تعذّر تحميل المحادثة</p>
          : <ChatWindow key={threadId} threadId={threadId} initial={history.data ?? []} onActivity={() => qc.invalidateQueries({ queryKey: ["ai_threads"] })} />}
      </section>
    </div>
  );
}

function ChatWindow({ threadId, initial, onActivity }: { threadId: string; initial: UIMessage[]; onActivity: () => void }) {
  const { data: me } = useMe();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    body: { threadId },
    headers: async (): Promise<Record<string, string>> => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  }), [threadId]);
  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onError: (e) => toast.error(e.message || "تعذّر الاتصال بالمساعد"),
    onFinish: () => onActivity(),
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => { if (!busy) inputRef.current?.focus(); }, [busy]);
  async function ask(q: string, files: FileUIPart[] = []) {
    if ((!q.trim() && !files.length) || busy) return;
    const { media, tables } = await splitAttachments(files);
    const def = tables || files.some((f) => f.mediaType === "application/pdf") ? "هذا كشف حساب بنكي، طابقه مع الدفاتر واقترح القيود الناقصة" : "اقرأ هذه الفاتورة وجهّز منها فاتورة شراء كمسودة";
    sendMessage({ text: (q.trim() || def) + tables, files: media });
    setText("");
    setTimeout(onActivity, 1500);
  }
  const lastIsUser = messages[messages.length - 1]?.role === "user";
  return (
    <>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState icon={<Calculator className="size-10 text-primary" />} title="المستشار المالي" description="اسألني عن أداء الشركة، التقارير، أرصدة الشركاء أو مواعيد استحقاق الشيكات.">
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {(me?.accountKind === "projects_only" ? PROJECT_SUGGESTIONS : SUGGESTIONS).map((s) => <Button key={s} variant="outline" className="h-auto whitespace-normal py-2 text-start" onClick={() => ask(s)}>{s}</Button>)}
              </div>
            </ConversationEmptyState>
          ) : messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent className={m.role === "user" ? "bg-primary text-primary-foreground" : "bg-transparent"}>
                {m.parts.map((p, i) => {
                  if (p.type === "text") return m.role === "assistant" ? <MessageResponse key={i}>{p.text}</MessageResponse> : <p key={i} className="whitespace-pre-wrap">{p.text}</p>;
                  if (p.type === "file" && p.mediaType?.startsWith("image/")) return <img key={i} src={p.url} alt="مرفق" className="max-h-60 rounded-md" />;
                  if (p.type === "reasoning" && p.text) return <p key={i} className="border-s-2 ps-2 text-xs text-muted-foreground">{p.text}</p>;
                  if (p.type.startsWith("tool-")) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const tp = p as any;
                    const name = p.type.slice(5);
                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader type={tp.type} state={tp.state} title={TOOL_TITLE[name] ?? name} />
                        <ToolContent>
                          <ToolInput input={tp.input} />
                          <ToolOutput output={tp.output} errorText={tp.errorText} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {busy && lastIsUser && <Shimmer className="text-sm">يحلّل الدفاتر...</Shimmer>}
          {error && !busy && <p className="text-sm text-destructive">{error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t p-3">
        <PromptInput accept="image/*,application/pdf,.csv,text/csv,.xlsx,.xls" multiple maxFiles={4} maxFileSize={8 * 1024 * 1024} onError={(e) => toast.error(e.code === "accept" ? "يمكن إرفاق الصور أو PDF أو ملفات Excel/CSV" : "الصورة كبيرة جداً أو عدد الصور كثير")} onSubmit={(msg) => ask(msg.text ?? text, msg.files)}>
          <AttachmentPreview />
          <PromptInputBody>
            <PromptInputTextarea ref={inputRef} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب سؤالك، أو أرفق صورة فاتورة، أو تحدّث بالميكروفون..." />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <AttachButton />
              <MicButton disabled={busy} onText={(t) => { setText((v) => (v ? v + " " : "") + t); inputRef.current?.focus(); }} />
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={stop} disabled={busy ? false : undefined} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}

function AttachButton() {
  const a = usePromptInputAttachments();
  return <PromptInputButton aria-label="إرفاق ملف" title="إرفاق صورة فاتورة أو إيصال، أو كشف حساب بنكي (PDF / Excel / CSV)" onClick={() => a.openFileDialog()}><Paperclip className="size-4" /></PromptInputButton>;
}

function AttachmentPreview() {
  const a = usePromptInputAttachments();
  if (!a.files.length) return null;
  return (
    <PromptInputHeader className="flex flex-wrap gap-2 p-2">
      {a.files.map((f) => (
        <div key={f.id} className="relative">
          {f.mediaType?.startsWith("image/") ? <img src={f.url} alt={f.filename ?? "مرفق"} className="size-16 rounded-md border object-cover" />
            : <div className="flex size-16 items-center justify-center rounded-md border p-1 text-center text-[10px] break-all">{f.filename ?? "ملف"}</div>}
          <button type="button" aria-label="إزالة" onClick={() => a.remove(f.id)} className="absolute -top-1.5 -end-1.5 rounded-full bg-background border p-0.5"><X className="size-3" /></button>
        </div>
      ))}
    </PromptInputHeader>
  );
}

function MicButton({ onText, disabled }: { onText: (t: string) => void; disabled?: boolean }) {
  const { state, toggle } = useVoiceInput(onText);
  return (
    <PromptInputButton aria-label={state === "rec" ? "إيقاف التسجيل" : "إدخال صوتي"} title={state === "rec" ? "إيقاف التسجيل" : "تحدّث بالعربية"} disabled={disabled && state === "idle"} onClick={toggle} className={state === "rec" ? "text-destructive animate-pulse" : ""}>
      {state === "busy" ? <Loader2 className="size-4 animate-spin" /> : state === "rec" ? <Square className="size-4" /> : <Mic className="size-4" />}
    </PromptInputButton>
  );
}

/** Spreadsheets go to the assistant as text tables; images and PDFs stay as files. */
async function splitAttachments(files: FileUIPart[]) {
  const media: FileUIPart[] = [];
  let tables = "";
  for (const f of files) {
    const name = f.filename ?? "";
    if (/\.(csv|xlsx|xls)$/i.test(name) || /csv|spreadsheet|excel/.test(f.mediaType ?? "")) {
      try {
        const XLSX = await import("xlsx");
        const buf = await (await fetch(f.url)).arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        for (const sn of wb.SheetNames) tables += `\n\n[ملف ${name} - ${sn}]\n` + XLSX.utils.sheet_to_csv(wb.Sheets[sn]!).slice(0, 60000);
      } catch { toast.error("تعذّرت قراءة الملف " + name); }
    } else media.push(f);
  }
  return { media, tables };
}
