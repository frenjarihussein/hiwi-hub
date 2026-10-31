import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AtSign, CheckCircle2, MessageSquareText, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type NoteEntity = "journal_entry" | "document" | "account" | "cheque" | "partner";

export type RecordComment = {
  id: string; entity_type: string; entity_id: string; entity_label: string | null; kind: string; body: string;
  mentions: string[]; resolved: boolean; created_by: string; created_at: string;
};

export function useColleagues() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["colleagues", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => ((await db.from("profiles").select("id,full_name,email").eq("tenant_id", me!.tenantId)).data ?? []) as { id: string; full_name: string; email: string | null }[],
  });
}

export const KIND_LABEL: Record<string, string> = { comment: "ملاحظة", audit_note: "ملاحظة تدقيق" };

export function RecordNotesPanel({ entityType, entityId, label }: { entityType: NoteEntity; entityId: string; label: string }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const people = useColleagues();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"comment" | "audit_note">(entityType === "account" || entityType === "cheque" ? "audit_note" : "comment");
  const [mentions, setMentions] = useState<string[]>([]);
  const [showPeople, setShowPeople] = useState(false);
  const key = ["record_comments", entityType, entityId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db.from("record_comments").select("*").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at");
      if (error) throw error;
      return data as RecordComment[];
    },
  });
  const nameOf = (id: string) => people.data?.find((p) => p.id === id)?.full_name || "مستخدم";
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["record_comments_feed"] }); };
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("record_comments").insert({ entity_type: entityType, entity_id: entityId, entity_label: label, kind, body: body.trim(), mentions, created_by: me!.userId, tenant_id: me!.tenantId });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); setMentions([]); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  async function toggleResolved(c: RecordComment) {
    const { error } = await db.from("record_comments").update({ resolved: !c.resolved, resolved_by: me!.userId, resolved_at: new Date().toISOString() }).eq("id", c.id);
    if (error) toast.error(error.message); else refresh();
  }
  async function remove(id: string) {
    const { error } = await db.from("record_comments").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex-1 space-y-2 overflow-y-auto">
        {list.data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">لا توجد ملاحظات على هذا السجل بعد</p>}
        {list.data?.map((c) => (
          <div key={c.id} className={`rounded-lg border p-3 text-sm ${c.resolved ? "opacity-60" : ""} ${c.kind === "audit_note" ? "border-warning/50 bg-warning/5" : "bg-card"}`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground">
                {c.kind === "audit_note" && <ShieldCheck className="size-3.5 text-warning-foreground" />}
                {nameOf(c.created_by)} · {KIND_LABEL[c.kind]}
              </span>
              <span>{fmtDateTime(c.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
            {c.mentions.length > 0 && <p className="mt-1 text-xs text-primary">{c.mentions.map((m) => "@" + nameOf(m)).join("  ")}</p>}
            <div className="mt-2 flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleResolved(c)}>
                <CheckCircle2 className="size-3.5" />{c.resolved ? "إعادة فتح" : "تمت المعالجة"}
              </Button>
              {(c.created_by === me?.userId || me?.isTenantAdmin) && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => remove(c.id)}><Trash2 className="size-3.5" />حذف</Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t pt-3">
        <div className="flex gap-1">
          {(["comment", "audit_note"] as const).map((k) => (
            <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Button>
          ))}
          <Button size="sm" variant="outline" className="ms-auto" onClick={() => setShowPeople((v) => !v)}><AtSign className="size-4" />إشارة لزميل</Button>
        </div>
        {showPeople && (
          <div className="flex flex-wrap gap-1 rounded-md border p-2">
            {(people.data ?? []).filter((p) => p.id !== me?.userId).map((p) => (
              <button key={p.id} type="button" onClick={() => setMentions((m) => (m.includes(p.id) ? m.filter((x) => x !== p.id) : [...m, p.id]))}
                className={`rounded-full border px-2 py-0.5 text-xs ${mentions.includes(p.id) ? "border-primary bg-primary text-primary-foreground" : ""}`}>
                {p.full_name || p.email}
              </button>
            ))}
            {!people.data?.filter((p) => p.id !== me?.userId).length && <span className="text-xs text-muted-foreground">لا يوجد زملاء آخرون</span>}
          </div>
        )}
        <Textarea rows={3} placeholder={kind === "audit_note" ? "اكتب ملاحظة التدقيق..." : "اكتب ملاحظة داخلية للفريق..."} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button className="w-full" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>إضافة</Button>
      </div>
    </div>
  );
}

export function RecordNotesButton({ entityType, entityId, label, variant = "ghost" }: { entityType: NoteEntity; entityId: string; label: string; variant?: "ghost" | "outline" }) {
  const [open, setOpen] = useState(false);
  const count = useQuery({
    queryKey: ["record_comments_count", entityType, entityId],
    queryFn: async () => (await db.from("record_comments").select("id", { count: "exact", head: true }).eq("entity_type", entityType).eq("entity_id", entityId).eq("resolved", false)).count ?? 0,
  });
  return (
    <>
      <Button size="icon" variant={variant} title="الملاحظات والتدقيق" className="relative" onClick={() => setOpen(true)}>
        <MessageSquareText className="size-4" />
        {!!count.data && <span className="absolute -top-1 -end-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{count.data}</span>}
      </Button>
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) count.refetch(); }}>
        <SheetContent side="left" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader><SheetTitle>ملاحظات: {label}</SheetTitle></SheetHeader>
          <div className="min-h-0 flex-1 px-4 pb-4">{open && <RecordNotesPanel entityType={entityType} entityId={entityId} label={label} />}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
