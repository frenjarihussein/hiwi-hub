import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { pageHead } from "@/lib/page-head";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useColleagues } from "@/components/collab/RecordNotes";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => pageHead("الاعتمادات والموافقات", "طلبات اعتماد المستندات والقيود المالية والبت فيها."),
  component: ApprovalsPage,
});

type Req = { id: string; entity_type: string; entity_id: string; title: string; amount: number | null; note: string | null; status: string; requested_by: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string };
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "بانتظار الاعتماد", cls: "bg-warning/15 text-warning-foreground" },
  approved: { label: "معتمد", cls: "bg-status-posted text-status-posted-foreground" },
  rejected: { label: "مرفوض", cls: "bg-destructive/10 text-destructive" },
};

function ApprovalsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const people = useColleagues();
  const [tab, setTab] = useState<"pending" | "all" | "mine">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: ["approvals", tab],
    enabled: !!me,
    queryFn: async () => {
      let q = db.from("approval_requests").select("*").order("created_at", { ascending: false }).limit(200);
      if (tab === "pending") q = q.eq("status", "pending");
      if (tab === "mine") q = q.eq("requested_by", me!.userId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Req[];
    },
  });
  const canDecide = me?.isTenantAdmin || me?.isSuperAdmin;
  const nameOf = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name || "—";
  async function decide(id: string, approve: boolean) {
    const { error } = await db.rpc("decide_approval", { _id: id, _approve: approve, _note: notes[id] ?? "" });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? "تم الاعتماد" : "تم الرفض");
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["approval_state"] });
  }
  return (
    <div>
      <PageHeader title="الاعتمادات والموافقات" subtitle={canDecide ? "راجع الطلبات واعتمدها أو ارفضها؛ يصل للمرسل إشعار بالنتيجة" : "تابع طلبات الاعتماد التي أرسلتها"} />
      <div className="mb-3 flex gap-2">
        {([["pending", "بانتظار الاعتماد"], ["mine", "طلباتي"], ["all", "الكل"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>
      <div className="space-y-2">
        {list.data?.map((r) => (
          <div key={r.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{r.title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.entity_type === "document" ? "مستند" : "قيد يومية"} · طلبه {nameOf(r.requested_by)} · {fmtDateTime(r.created_at)}
                  {r.amount != null && <> · المبلغ <span className="num">{fmtNum(r.amount)}</span></>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS[r.status]?.cls}`}>{STATUS[r.status]?.label}</span>
                {r.entity_type === "journal_entry"
                  ? <Button asChild size="sm" variant="outline"><Link to="/journal/$entryId" params={{ entryId: r.entity_id }}>فتح القيد</Link></Button>
                  : <Button asChild size="sm" variant="outline"><Link to="/documents">المستندات</Link></Button>}
              </div>
            </div>
            {r.note && <p className="mt-2 text-sm"><span className="text-muted-foreground">ملاحظة الطلب: </span>{r.note}</p>}
            {r.status !== "pending" && <p className="mt-2 text-sm text-muted-foreground">{STATUS[r.status]?.label} بواسطة {nameOf(r.decided_by)}{r.decided_at && " · " + fmtDateTime(r.decided_at)}{r.decision_note && ` — ${r.decision_note}`}</p>}
            {r.status === "pending" && canDecide && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Input className="max-w-sm flex-1" placeholder="ملاحظة القرار (اختياري)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                <Button size="sm" onClick={() => decide(r.id, true)}><Check className="size-4" />اعتماد</Button>
                <Button size="sm" variant="destructive" onClick={() => decide(r.id, false)}><X className="size-4" />رفض</Button>
              </div>
            )}
          </div>
        ))}
        {!list.data?.length && <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">لا توجد طلبات</p>}
      </div>
    </div>
  );
}
