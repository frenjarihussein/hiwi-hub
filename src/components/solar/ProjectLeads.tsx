import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeftRight, Phone, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtDate, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Lead = { id: string; name: string; lead_contact: string | null; lead_phone: string | null; lead_source: string | null; notes: string | null; created_at: string };
const EMPTY = { name: "", lead_contact: "", lead_phone: "", lead_source: "", notes: "" };

/** Interested customers (projects with status "lead") and one-click conversion to an active project. */
export function ProjectLeads() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const canAdd = can(me, "projects", "create");
  const canEdit = can(me, "projects", "edit");
  const canDel = can(me, "projects", "delete");
  const q = useQuery({
    queryKey: ["project-leads", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db.from("projects") as any).select("id,name,lead_contact,lead_phone,lead_source,notes,created_at").eq("tenant_id", me!.tenantId).eq("status", "lead").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["project-leads"] }); void qc.invalidateQueries({ queryKey: ["projects"] }); };
  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("اكتب اسم العميل أو المشروع المقترح");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from("projects") as any).insert({ tenant_id: me!.tenantId, name: form.name.trim(), lead_contact: form.lead_contact || null, lead_phone: form.lead_phone || null, lead_source: form.lead_source || null, notes: form.notes || null, status: "lead", is_active: true, is_group: false, contract_value: 0 });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تمت إضافة العميل المهتم"); setForm(EMPTY); setOpen(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const convert = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from("projects") as any).update({ status: "active", start_date: today() }).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => { toast.success("تم تحويل العميل إلى مشروع قيد التنفيذ"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("projects").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("تم الحذف"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const leads = q.data ?? [];
  return (
    <section className="mb-6 rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">العملاء المهتمون ({leads.length})</h2>
          <p className="text-xs text-muted-foreground">سجّل العميل المهتم ثم حوّله إلى مشروع بضغطة واحدة عند الاتفاق.</p>
        </div>
        {canAdd && <Button size="sm" onClick={() => setOpen((v) => !v)}><Plus className="size-4" />عميل مهتم</Button>}
      </div>
      {open && (
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <div><Label className="text-xs">اسم العميل / المشروع المقترح</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label className="text-xs">الشخص المسؤول</Label><Input className="mt-1" value={form.lead_contact} onChange={(e) => setForm({ ...form, lead_contact: e.target.value })} /></div>
          <div><Label className="text-xs">الهاتف</Label><Input className="mt-1" inputMode="tel" dir="ltr" value={form.lead_phone} onChange={(e) => setForm({ ...form, lead_phone: e.target.value })} /></div>
          <div><Label className="text-xs">مصدر العميل</Label><Input className="mt-1" placeholder="معرض، إحالة، إعلان..." value={form.lead_source} onChange={(e) => setForm({ ...form, lead_source: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label className="text-xs">ملاحظات (الاستطاعة المطلوبة، الموقع...)</Label><Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={add.isPending}>حفظ</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button></div>
        </form>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {leads.map((l) => (
          <article key={l.id} className="rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <Link to="/projects/$projectId" params={{ projectId: l.id }} className="font-semibold text-primary hover:underline">{l.name}</Link>
              <span className="text-xs text-muted-foreground">{fmtDate(l.created_at.slice(0, 10))}</span>
            </div>
            {(l.lead_contact || l.lead_phone) && <p className="mt-1 flex items-center gap-1 text-sm">{l.lead_contact}{l.lead_phone && <a className="ms-auto flex items-center gap-1 text-primary" href={`tel:${l.lead_phone}`} dir="ltr"><Phone className="size-3" />{l.lead_phone}</a>}</p>}
            {l.lead_source && <p className="text-xs text-muted-foreground">المصدر: {l.lead_source}</p>}
            {l.notes && <p className="mt-1 line-clamp-2 text-xs">{l.notes}</p>}
            <div className="mt-2 flex gap-2">
              {canEdit && <Button size="sm" className="flex-1" disabled={convert.isPending} onClick={() => convert.mutate(l.id)}><ArrowLeftRight className="size-4" />تحويل لمشروع</Button>}
              {canDel && <Button size="icon" variant="ghost" title="حذف" onClick={() => { if (confirm("حذف هذا العميل المهتم؟")) remove.mutate(l.id); }}><Trash2 className="size-4" /></Button>}
            </div>
          </article>
        ))}
        {!leads.length && !q.isLoading && <p className="text-sm text-muted-foreground">لا يوجد عملاء مهتمون حالياً.</p>}
      </div>
    </section>
  );
}
