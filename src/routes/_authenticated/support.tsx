import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LifeBuoy, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { pageHead } from "@/lib/page-head";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => pageHead("الدعم الفني", "تواصل مباشر بين الشركات وفريق الدعم الفني لإدارة النظام."),
  component: SupportPage,
});

type Ticket = { id: string; tenant_id: string; subject: string; status: string; created_by: string; updated_at: string; tenants?: { name: string } | null };
type Msg = { id: string; ticket_id: string; sender_id: string; is_staff: boolean; body: string; created_at: string };

function SupportPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const tickets = useQuery({
    queryKey: ["support_tickets"],
    enabled: !!me,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db.from("support_tickets").select("*, tenants(name)").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Ticket[];
    },
  });
  const current = tickets.data?.find((t) => t.id === active) ?? null;
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.from("support_tickets").insert({ subject: subject.trim(), tenant_id: me!.tenantId, created_by: me!.userId }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { setSubject(""); setCreating(false); setActive(id); qc.invalidateQueries({ queryKey: ["support_tickets"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="الدعم الفني" subtitle={me?.isSuperAdmin ? "رسائل الشركات إلى فريق الدعم" : "تواصل مباشرة مع فريق الدعم وإدارة النظام"}
        actions={!me?.isSuperAdmin && <Button onClick={() => setCreating(true)}><Plus className="size-4" />محادثة دعم جديدة</Button>} />
      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <div className="space-y-2">
          {creating && (
            <div className="space-y-2 rounded-lg border bg-card p-3">
              <Input autoFocus placeholder="موضوع المشكلة أو الطلب" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <div className="flex gap-2"><Button size="sm" disabled={!subject.trim() || create.isPending} onClick={() => create.mutate()}>بدء</Button><Button size="sm" variant="ghost" onClick={() => setCreating(false)}>إلغاء</Button></div>
            </div>
          )}
          {tickets.data?.map((t) => (
            <button key={t.id} onClick={() => setActive(t.id)} className={`w-full rounded-lg border p-3 text-start text-sm ${active === t.id ? "border-primary bg-accent" : "bg-card hover:bg-muted"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{t.subject}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${t.status === "open" ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>{t.status === "open" ? "مفتوحة" : "مغلقة"}</span>
              </div>
              {me?.isSuperAdmin && <div className="mt-1 text-xs text-muted-foreground">{t.tenants?.name}</div>}
              <div className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(t.updated_at)}</div>
            </button>
          ))}
          {!tickets.data?.length && !creating && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">لا توجد محادثات دعم بعد</p>}
        </div>
        {current ? <TicketThread key={current.id} ticket={current} /> : (
          <div className="flex min-h-80 flex-col items-center justify-center gap-2 rounded-lg border bg-card text-muted-foreground"><LifeBuoy className="size-8" />اختر محادثة أو ابدأ واحدة جديدة</div>
        )}
      </div>
    </div>
  );
}

function TicketThread({ ticket }: { ticket: Ticket }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const key = ["support_messages", ticket.id];
  const msgs = useQuery({
    queryKey: key,
    queryFn: async () => ((await db.from("support_messages").select("*").eq("ticket_id", ticket.id).order("created_at")).data ?? []) as Msg[],
  });
  useEffect(() => {
    const ch = supabase.channel(`support-${ticket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticket.id}` }, () => qc.invalidateQueries({ queryKey: key }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.data?.length]);
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("support_messages").insert({ ticket_id: ticket.id, body: text.trim(), sender_id: me!.userId, is_staff: !!me?.isSuperAdmin });
      if (error) throw error;
    },
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["support_tickets"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  async function close() {
    const { error } = await db.from("support_tickets").update({ status: ticket.status === "open" ? "closed" : "open" }).eq("id", ticket.id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["support_tickets"] });
  }
  return (
    <div className="flex h-[70vh] flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="font-semibold">{ticket.subject}</div>
        <Button size="sm" variant="outline" onClick={close}><CheckCircle2 className="size-4" />{ticket.status === "open" ? "إغلاق المحادثة" : "إعادة فتح"}</Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.data?.length === 0 && <p className="text-center text-sm text-muted-foreground">اكتب رسالتك الأولى لفريق الدعم</p>}
        {msgs.data?.map((m) => {
          const mine = m.sender_id === me?.userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                <div className="mb-0.5 text-[11px] opacity-80">{m.is_staff ? "فريق الدعم" : "الشركة"} · {fmtDateTime(m.created_at)}</div>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
        <Textarea rows={2} className="min-h-0 flex-1" placeholder="اكتب رسالتك..." value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) send.mutate(); } }} />
        <Button type="submit" disabled={!text.trim() || send.isPending}><Send className="size-4" /></Button>
      </form>
    </div>
  );
}
