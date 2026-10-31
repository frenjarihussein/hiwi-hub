import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "المحادثات الداخلية | يوسف سوفت" },
      { name: "description", content: "محادثات خاصة وجماعية بين مستخدمي الشركة نفسها" },
      { property: "og:title", content: "المحادثات الداخلية | يوسف سوفت" },
      { property: "og:description", content: "تواصل فوري بين حسابات الشركة" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

type Msg = { id: string; sender_id: string; recipient_id: string | null; body: string; created_at: string };

function ChatPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [room, setRoom] = useState<string | null>(null); // null = company group
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const people = useQuery({
    queryKey: ["colleagues", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => ((await db.rpc("tenant_colleagues")).data ?? []) as { id: string; full_name: string; email: string | null }[],
  });
  const msgs = useQuery({
    queryKey: ["chat", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await db.from("chat_messages").select("*").eq("tenant_id", me!.tenantId).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return ((data ?? []) as Msg[]).reverse();
    },
  });

  useEffect(() => {
    if (!me?.tenantId) return;
    const ch = supabase
      .channel(`chat-${me.tenantId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `tenant_id=eq.${me.tenantId}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat", me.tenantId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me?.tenantId, qc]);

  const shown = (msgs.data ?? []).filter((m) =>
    room === null ? m.recipient_id === null : (m.sender_id === room && m.recipient_id === me?.userId) || (m.sender_id === me?.userId && m.recipient_id === room),
  );
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [shown.length, room]);

  const send = useMutation({
    mutationFn: async () => {
      const body = text.trim();
      if (!body) return;
      const { error } = await db.from("chat_messages").insert({ tenant_id: me!.tenantId, sender_id: me!.userId, recipient_id: room, body });
      if (error) throw error;
    },
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["chat", me?.tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (id: string) => (id === me?.userId ? "أنا" : people.data?.find((p) => p.id === id)?.full_name || "مستخدم");
  const others = (people.data ?? []).filter((p) => p.id !== me?.userId);
  const lastFrom = (id: string) => [...(msgs.data ?? [])].reverse().find((m) => m.recipient_id === me?.userId && m.sender_id === id);

  return (
    <div>
      <PageHeader title="المحادثات الداخلية" subtitle="غرفة عامة لكل مستخدمي الشركة، ورسائل خاصة بين شخصين" />
      <div className="grid h-[70vh] gap-3 md:grid-cols-[260px_1fr]">
        <aside className="overflow-y-auto rounded-lg border bg-card">
          <button onClick={() => setRoom(null)} className={cn("flex w-full items-center gap-2 border-b p-3 text-start hover:bg-accent", room === null && "bg-accent")}>
            <Users className="size-4" /> غرفة الشركة العامة
          </button>
          {others.map((p) => (
            <button key={p.id} onClick={() => setRoom(p.id)} className={cn("block w-full border-b p-3 text-start hover:bg-accent", room === p.id && "bg-accent")}>
              <div className="font-medium">{p.full_name || p.email}</div>
              {lastFrom(p.id) && <div className="truncate text-xs text-muted-foreground">{lastFrom(p.id)!.body}</div>}
            </button>
          ))}
          {others.length === 0 && <p className="p-3 text-sm text-muted-foreground">لا يوجد مستخدمون آخرون في الشركة</p>}
        </aside>
        <section className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="border-b p-3 font-semibold">{room === null ? "غرفة الشركة العامة" : nameOf(room)}</div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {shown.length === 0 && <p className="p-6 text-center text-muted-foreground">لا توجد رسائل بعد</p>}
            {shown.map((m) => {
              const mine = m.sender_id === me?.userId;
              return (
                <div key={m.id} className={cn("max-w-[75%] rounded-xl px-3 py-2 text-sm", mine ? "ms-auto bg-primary text-primary-foreground" : "bg-muted")}>
                  {!mine && room === null && <div className="mb-0.5 text-xs font-semibold opacity-80">{nameOf(m.sender_id)}</div>}
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}</div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
            <Textarea rows={2} className="flex-1" value={text} placeholder="اكتب رسالتك..." onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send.mutate(); } }} />
            <Button type="submit" disabled={send.isPending || !text.trim()}><Send className="size-4" />إرسال</Button>
          </form>
        </section>
      </div>
    </div>
  );
}
