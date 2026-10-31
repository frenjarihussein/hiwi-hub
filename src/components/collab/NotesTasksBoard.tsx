import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Note = {
  id: string; user_id: string; title: string; body: string; remind_at: string | null; repeat: string; done: boolean; created_at: string;
  assigned_to: string | null; kind: string; priority: string; pinned: boolean; due_at: string | null; status: string; reply: string;
};
const KINDS: Record<string, string> = { note: "ملاحظة", task: "مهمة", request: "طلب" };
const PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة" };
const STATUS: Record<string, string> = { open: "جديدة", in_progress: "قيد التنفيذ", done: "منجزة" };
const PRI_CLS: Record<string, string> = { low: "text-muted-foreground", normal: "", high: "text-warning-foreground font-medium", urgent: "text-destructive font-semibold" };
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" }) : "—");

/** Detailed table of personal notes, tasks and requests (same data as the F8 panel). */
export function NotesTasksBoard() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const uid = me?.userId;
  const notes = useQuery({
    queryKey: ["personal_notes", uid],
    enabled: !!uid,
    queryFn: async () => ((await db.from("personal_notes").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false })).data ?? []) as Note[],
  });
  const people = useQuery({
    queryKey: ["tenant_colleagues"],
    queryFn: async () => ((await db.rpc("tenant_colleagues")).data ?? []) as { id: string; full_name: string; email: string | null }[],
  });
  const nameOf = (id: string | null) => (id === uid ? "أنا" : people.data?.find((p) => p.id === id)?.full_name || people.data?.find((p) => p.id === id)?.email || "زميل");

  const [tab, setTab] = useState<"all" | "mine" | "inbox" | "sent">("all");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (notes.data ?? []).filter((n) => {
      const mine = n.user_id === uid && (!n.assigned_to || n.assigned_to === uid);
      const inbox = n.assigned_to === uid && n.user_id !== uid;
      const sent = n.user_id === uid && !!n.assigned_to && n.assigned_to !== uid;
      if (tab === "mine" && !mine) return false;
      if (tab === "inbox" && !inbox) return false;
      if (tab === "sent" && !sent) return false;
      if (kind && n.kind !== kind) return false;
      const st = n.done ? "done" : n.status;
      if (status && st !== status) return false;
      return !s || `${n.title} ${n.body} ${n.reply}`.toLowerCase().includes(s);
    });
  }, [notes.data, tab, kind, status, q, uid]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["personal_notes"] });
  const upd = async (id: string, patch: Partial<Note>) => {
    const { error } = await db.from("personal_notes").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  };
  const del = async (id: string) => {
    if (!confirm("حذف هذا البند؟")) return;
    await db.from("personal_notes").delete().eq("id", id);
    refresh();
  };
  const sel = "h-9 rounded-md border bg-background px-2 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {([["all", "الكل"], ["mine", "ملاحظاتي"], ["inbox", "مطلوب مني"], ["sent", "أرسلتها"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>
        ))}
        <select className={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">كل الأنواع</option>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="relative min-w-48 flex-1">
          <Search className="absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-8" placeholder="بحث في العنوان والنص والرد..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => window.dispatchEvent(new Event("open-notes"))}><Plus className="size-4" /> إضافة (F8)</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="text-start">
              {["النوع", "العنوان والنص", "من", "إلى", "الأولوية", "الحالة", "الموعد النهائي", "التذكير", "الرد", "التاريخ", ""].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((n) => {
              const st = n.done ? "done" : n.status;
              const canStatus = n.user_id === uid || n.assigned_to === uid;
              const overdue = n.due_at && st !== "done" && new Date(n.due_at).getTime() < Date.now();
              return (
                <tr key={n.id} className={cn("border-t align-top", st === "done" && "opacity-60")}>
                  <td className="px-3 py-2 whitespace-nowrap">{KINDS[n.kind] ?? n.kind}</td>
                  <td className="max-w-80 px-3 py-2"><div className="font-medium">{n.title || "—"}</div><div className="whitespace-pre-wrap text-xs text-muted-foreground">{n.body}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap">{nameOf(n.user_id)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{n.assigned_to ? nameOf(n.assigned_to) : "—"}</td>
                  <td className={cn("px-3 py-2 whitespace-nowrap", PRI_CLS[n.priority])}>{PRIORITY[n.priority] ?? n.priority}</td>
                  <td className="px-3 py-2">
                    <select className="rounded-md border bg-background px-1 py-1 text-xs" disabled={!canStatus} value={st}
                      onChange={(e) => upd(n.id, { status: e.target.value, done: e.target.value === "done" })}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className={cn("px-3 py-2 whitespace-nowrap text-xs", overdue && "font-semibold text-destructive")}>{fmt(n.due_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{fmt(n.remind_at)}</td>
                  <td className="max-w-56 px-3 py-2">
                    {n.assigned_to === uid && n.user_id !== uid ? (
                      <input className="w-full rounded-md border bg-background px-2 py-1 text-xs" defaultValue={n.reply} placeholder="اكتب ردك..."
                        onBlur={(e) => e.target.value !== n.reply && upd(n.id, { reply: e.target.value })} />
                    ) : <span className="text-xs">{n.reply || "—"}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmt(n.created_at)}</td>
                  <td className="px-3 py-2">
                    {n.user_id === uid && <Button size="icon" variant="ghost" title="حذف" onClick={() => del(n.id)}><Trash2 className="size-4" /></Button>}
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">{notes.isLoading ? "جارٍ التحميل..." : "لا توجد ملاحظات أو مهام"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
