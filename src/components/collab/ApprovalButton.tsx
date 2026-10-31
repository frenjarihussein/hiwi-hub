import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Clock, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows the latest approval state of a record and lets staff send it for approval. */
export function ApprovalButton({ entityType, entityId, title, amount }: { entityType: "document" | "journal_entry"; entityId: string; title: string; amount?: number | null }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const key = ["approval_state", entityType, entityId];
  const state = useQuery({
    queryKey: key,
    queryFn: async () => (await db.from("approval_requests").select("status,decision_note").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data as { status: string; decision_note: string | null } | null,
  });
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("approval_requests").insert({ entity_type: entityType, entity_id: entityId, title, amount: amount ?? null, note: note || null, requested_by: me!.userId, tenant_id: me!.tenantId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("أُرسل طلب الاعتماد إلى مدير الشركة"); setOpen(false); setNote(""); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["approvals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const s = state.data?.status;
  const icon = s === "approved" ? <BadgeCheck className="size-4 text-success" /> : s === "rejected" ? <XCircle className="size-4 text-destructive" /> : s === "pending" ? <Clock className="size-4 text-warning-foreground" /> : <Send className="size-4" />;
  const tip = s === "approved" ? "معتمد" : s === "rejected" ? `مرفوض${state.data?.decision_note ? ": " + state.data.decision_note : ""} — إعادة الإرسال` : s === "pending" ? "بانتظار الاعتماد" : "طلب اعتماد";
  return (
    <>
      <Button size="icon" variant="ghost" title={tip} disabled={s === "pending" || s === "approved"} onClick={() => setOpen(true)}>{icon}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>طلب اعتماد: {title}</DialogTitle></DialogHeader>
          <Textarea rows={3} placeholder="ملاحظة للمعتمِد (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter><Button disabled={send.isPending} onClick={() => send.mutate()}><Send className="size-4" />إرسال للاعتماد</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
