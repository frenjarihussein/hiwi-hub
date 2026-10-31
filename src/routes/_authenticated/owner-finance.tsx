import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate, fmtNum, today } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/owner-finance")({
  head: () => ({ meta: [
    { title: "حسابات شركة البرمجيات | يوسف سوفت" },
    { name: "description", content: "إدارة رواتب ومصروفات شركة البرمجيات." },
    { property: "og:title", content: "حسابات شركة البرمجيات | يوسف سوفت" },
    { property: "og:description", content: "إدارة رواتب ومصروفات شركة البرمجيات." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OwnerFinance,
});

const empty = { kind: "salary", entry_date: today(), title: "", amount: "", currency: "USD", notes: "" };

function OwnerFinance() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const list = useQuery({ queryKey: ["owner-finance"], enabled: !!me?.isSuperAdmin, queryFn: async () => {
    const { data, error } = await db.from("owner_finance_entries").select("*").order("entry_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as { id: string; kind: string; entry_date: string; title: string; amount: number; currency: string; notes: string | null }[];
  }});
  const save = useMutation({ mutationFn: async () => {
    const { error } = await db.from("owner_finance_entries").insert({ kind: form.kind, entry_date: form.entry_date, title: form.title, amount: Number(form.amount), currency: form.currency as "USD" | "SYP", notes: form.notes || null, created_by: me?.userId });
    if (error) throw error;
  }, onSuccess: () => { toast.success("تم حفظ الحركة"); setOpen(false); setForm(empty); qc.invalidateQueries({ queryKey: ["owner-finance"] }); qc.invalidateQueries({ queryKey: ["owner-dashboard"] }); }, onError: (error: Error) => toast.error(error.message) });
  const remove = useMutation({ mutationFn: async (id: string) => { const { error } = await db.from("owner_finance_entries").delete().eq("id", id); if (error) throw error; }, onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-finance"] }) });
  if (me && !me.isSuperAdmin) return <p className="text-muted-foreground">هذه الصفحة مخصصة لمدير النظام فقط.</p>;
  return <div><PageHeader title="حسابات شركة البرمجيات" subtitle="واجهة داخلية بسيطة للرواتب والدفعات والمصروفات، منفصلة عن حسابات العملاء" actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" />حركة جديدة</Button>} />
    <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["التاريخ", "النوع", "البيان", "المبلغ", "ملاحظات", ""].map((label) => <th key={label} className="border-b px-3 py-2 text-right">{label}</th>)}</tr></thead><tbody>
      {(list.data ?? []).map((row) => <tr key={row.id} className="border-b"><td className="px-3 py-3">{fmtDate(row.entry_date)}</td><td className="px-3 py-3"><span className={row.kind === "salary" ? "rounded-full bg-highlight/10 px-2 py-1 text-xs text-highlight" : "rounded-full bg-warning/15 px-2 py-1 text-xs text-warning-foreground"}>{row.kind === "salary" ? "راتب" : "دفعة / مصروف"}</span></td><td className="px-3 py-3 font-medium">{row.title}</td><td className="num px-3 py-3">{fmtNum(row.amount)} {row.currency}</td><td className="px-3 py-3 text-muted-foreground">{row.notes ?? "—"}</td><td className="px-3 py-3"><Button size="icon" variant="ghost" className="text-destructive" title="حذف" onClick={() => window.confirm("حذف الحركة؟") && remove.mutate(row.id)}><Trash2 className="size-4" /></Button></td></tr>)}
      {!list.data?.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد حركات بعد</td></tr>}
    </tbody></table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>حركة مالية جديدة</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div><Label>النوع</Label><select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option value="salary">راتب</option><option value="expense">دفعة / مصروف</option></select></div><div><Label>التاريخ</Label><Input className="mt-1" type="date" value={form.entry_date} onChange={(event) => setForm({ ...form, entry_date: event.target.value })} /></div><div className="sm:col-span-2"><Label>البيان</Label><Input className="mt-1" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div><div><Label>المبلغ</Label><Input className="mt-1" type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></div><div><Label>العملة</Label><select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option value="USD">دولار</option><option value="SYP">ليرة سورية</option></select></div><div className="sm:col-span-2"><Label>ملاحظات</Label><Input className="mt-1" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div></div><DialogFooter><Button disabled={!form.title || !Number(form.amount) || save.isPending} onClick={() => save.mutate()}>حفظ</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}