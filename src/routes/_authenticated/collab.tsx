import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { pageHead } from "@/lib/page-head";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesTasksBoard } from "@/components/collab/NotesTasksBoard";
import { KIND_LABEL, RecordNotesPanel, useColleagues, type NoteEntity, type RecordComment } from "@/components/collab/RecordNotes";

export const Route = createFileRoute("/_authenticated/collab")({
  head: () => pageHead("الملاحظات واستفسارات الشركاء", "سجل الملاحظات الداخلية وملاحظات التدقيق واستفسارات العملاء والموردين."),
  component: CollabPage,
});

const ENTITY_LABEL: Record<string, string> = { journal_entry: "قيد", document: "مستند", account: "حساب", cheque: "شيك", partner: "شريك" };

function CollabPage() {
  return (
    <div>
      <PageHeader title="الملاحظات واستفسارات الشركاء" subtitle="كل الملاحظات الداخلية وملاحظات التدقيق، واستفسارات العملاء والموردين الواردة عبر روابط المشاركة" />
      <Tabs defaultValue="notes">
        <TabsList className="mb-4">
          <TabsTrigger value="notes">الملاحظات والتدقيق</TabsTrigger>
          <TabsTrigger value="inquiries">استفسارات الشركاء</TabsTrigger>
          <TabsTrigger value="tasks">الملاحظات والمهام (F8)</TabsTrigger>
        </TabsList>
        <TabsContent value="notes"><NotesFeed /></TabsContent>
        <TabsContent value="inquiries"><Inquiries /></TabsContent>
        <TabsContent value="tasks"><NotesTasksBoard /></TabsContent>
      </Tabs>
    </div>
  );
}

function NotesFeed() {
  const { data: me } = useMe();
  const people = useColleagues();
  const [filter, setFilter] = useState<"open" | "audit" | "mentions" | "all">("open");
  const [sel, setSel] = useState<RecordComment | null>(null);
  const feed = useQuery({
    queryKey: ["record_comments_feed", filter],
    enabled: !!me,
    queryFn: async () => {
      let q = db.from("record_comments").select("*").order("created_at", { ascending: false }).limit(200);
      if (filter === "open") q = q.eq("resolved", false);
      if (filter === "audit") q = q.eq("kind", "audit_note");
      if (filter === "mentions") q = q.contains("mentions", [me!.userId]);
      return ((await q).data ?? []) as RecordComment[];
    },
  });
  const nameOf = (id: string) => people.data?.find((p) => p.id === id)?.full_name || "مستخدم";
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_24rem]">
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {([["open", "غير معالجة"], ["audit", "ملاحظات التدقيق"], ["mentions", "أُشير إليّ"], ["all", "الكل"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{l}</Button>
          ))}
        </div>
        <div className="space-y-2">
          {feed.data?.map((c) => (
            <button key={c.id} onClick={() => setSel(c)} className={`w-full rounded-lg border p-3 text-start text-sm ${sel?.entity_id === c.entity_id ? "border-primary" : ""} ${c.kind === "audit_note" ? "bg-warning/5" : "bg-card"} ${c.resolved ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-medium text-foreground">
                  {c.kind === "audit_note" && <ShieldCheck className="size-3.5" />}
                  {ENTITY_LABEL[c.entity_type]}: {c.entity_label}
                </span>
                <span>{fmtDateTime(c.created_at)}</span>
              </div>
              <p className="mt-1 line-clamp-2">{c.body}</p>
              <div className="mt-1 text-xs text-muted-foreground">{nameOf(c.created_by)} · {KIND_LABEL[c.kind]}{c.resolved && " · تمت المعالجة"}</div>
            </button>
          ))}
          {!feed.data?.length && <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">لا توجد ملاحظات. أضف ملاحظة من زر الملاحظات بجانب أي قيد أو مستند أو حساب أو شيك.</p>}
        </div>
      </div>
      <div className="h-[70vh] rounded-lg border bg-card p-3">
        {sel ? <RecordNotesPanel key={sel.entity_id} entityType={sel.entity_type as NoteEntity} entityId={sel.entity_id} label={sel.entity_label ?? ""} />
          : <p className="py-10 text-center text-sm text-muted-foreground">اختر ملاحظة لعرض النقاش كاملاً والرد عليه</p>}
      </div>
    </div>
  );
}

type Link = { id: string; label: string | null; entity_type: string; revoked: boolean; expires_at: string; created_at: string };
type Inq = { id: string; link_id: string; from_partner: boolean; author_name: string | null; body: string; created_at: string };

function Inquiries() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const data = useQuery({
    queryKey: ["partner_inquiries"],
    enabled: !!me,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [l, i] = await Promise.all([
        db.from("share_links").select("*").order("created_at", { ascending: false }).limit(200),
        db.from("partner_inquiries").select("*").order("created_at").limit(2000),
      ]);
      return { links: (l.data ?? []) as Link[], inq: (i.data ?? []) as Inq[] };
    },
  });
  const links = (data.data?.links ?? []).map((l) => {
    const msgs = (data.data?.inq ?? []).filter((m) => m.link_id === l.id);
    const lastMsg = msgs[msgs.length - 1];
    return { ...l, msgs, last: lastMsg, waiting: !!lastMsg?.from_partner };
  }).sort((a, b) => (b.last?.created_at ?? b.created_at).localeCompare(a.last?.created_at ?? a.created_at));
  const cur = links.find((l) => l.id === sel);
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("partner_inquiries").insert({ link_id: sel, tenant_id: me!.tenantId, body: reply.trim(), from_partner: false, created_by: me!.userId, author_name: me!.tenantName });
      if (error) throw error;
    },
    onSuccess: () => { setReply(""); qc.invalidateQueries({ queryKey: ["partner_inquiries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  async function revoke(id: string) {
    const { error } = await db.from("share_links").update({ revoked: true }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم إيقاف الرابط"); qc.invalidateQueries({ queryKey: ["partner_inquiries"] }); }
  }
  return (
    <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
      <div className="space-y-2">
        {links.map((l) => (
          <button key={l.id} onClick={() => setSel(l.id)} className={`w-full rounded-lg border p-3 text-start text-sm ${sel === l.id ? "border-primary bg-accent" : "bg-card hover:bg-muted"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{l.label}</span>
              {l.waiting && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning-foreground">بانتظار الرد</span>}
              {l.revoked && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">موقوف</span>}
            </div>
            <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{l.last ? l.last.body : "لا توجد رسائل بعد"}</div>
          </button>
        ))}
        {!links.length && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">أنشئ رابط استفسار من زر الرابط بجانب أي فاتورة أو كشف حساب، وأرسله للعميل أو المورد.</p>}
      </div>
      {cur ? (
        <div className="flex h-[70vh] flex-col rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">{cur.label}</span>
            {!cur.revoked && <Button size="sm" variant="outline" onClick={() => revoke(cur.id)}><Ban className="size-4" />إيقاف الرابط</Button>}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {cur.msgs.map((m) => (
              <div key={m.id} className={`flex ${m.from_partner ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.from_partner ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>
                  <div className="mb-0.5 text-[11px] opacity-80">{m.author_name ?? (m.from_partner ? "الشريك" : "الشركة")} · {fmtDateTime(m.created_at)}</div>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            ))}
            {!cur.msgs.length && <p className="text-center text-sm text-muted-foreground">لم يرسل الشريك أي استفسار بعد</p>}
          </div>
          <div className="flex gap-2 border-t p-3">
            <Textarea rows={2} className="min-h-0 flex-1" placeholder="اكتب ردك للشريك (سيظهر له على صفحة الرابط)..." value={reply} onChange={(e) => setReply(e.target.value)} />
            <Button disabled={!reply.trim() || send.isPending || cur.revoked} onClick={() => send.mutate()}><Send className="size-4" /></Button>
          </div>
        </div>
      ) : <div className="flex min-h-80 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">اختر استفساراً لعرضه والرد عليه</div>}
    </div>
  );
}
