/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Form = { name: string; code: string; contact: string; phone: string; factory: string; site: string; location: string; address: string; maps: string; start: string; end: string; notes: string };

/** Rename a project and edit its contact, site and factory details; survey keys stay shared with the site-survey form. */
export function EditProjectDialog({ row, onClose }: { row: { id: string; name: string }; onClose: () => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState<Form | null>(null);
  const [survey, setSurvey] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data: p }, { data: s }] = await Promise.all([
        (db.from("projects") as any).select("name,code,lead_contact,lead_phone,start_date,end_date,notes").eq("id", row.id).maybeSingle(),
        (db.from("solar_projects") as any).select("survey").eq("project_id", row.id).maybeSingle(),
      ]);
      const sv = (s?.survey ?? {}) as Record<string, any>;
      setSurvey(sv);
      setF({
        name: p?.name ?? row.name, code: p?.code ?? "", contact: p?.lead_contact ?? sv.owner_name ?? sv.client_name ?? "",
        phone: p?.lead_phone ?? sv.phones ?? sv.client_phone ?? "", factory: sv.factory_name ?? "", site: sv.site_type ?? "",
        location: sv.location ?? "", address: sv.address ?? "", maps: sv.maps_url ?? "",
        start: p?.start_date ?? "", end: p?.end_date ?? "", notes: p?.notes ?? "",
      });
    })();
  }, [row.id, row.name]);

  async function save() {
    if (!f || !me?.tenantId) return;
    if (!f.name.trim()) { toast.error("اكتب اسم المشروع"); return; }
    if (f.start && f.end && f.end < f.start) { toast.error("تاريخ النهاية قبل تاريخ البداية"); return; }
    setBusy(true);
    try {
      const { error } = await (db.from("projects") as any).update({
        name: f.name.trim(), code: f.code.trim() || null, lead_contact: f.contact.trim() || null, lead_phone: f.phone.trim() || null,
        start_date: f.start || null, end_date: f.end || null, notes: f.notes.trim() || null,
      }).eq("id", row.id);
      if (error) throw error;
      const next = { ...survey, owner_name: f.contact.trim(), client_name: f.contact.trim(), phones: f.phone.trim(), client_phone: f.phone.trim(), factory_name: f.factory.trim(), site_type: f.site.trim(), location: f.location.trim(), address: f.address.trim(), maps_url: f.maps.trim() };
      const { error: e2 } = await (db.from("solar_projects") as any).upsert({ project_id: row.id, tenant_id: me.tenantId, survey: next }, { onConflict: "project_id" });
      if (e2) throw e2;
      toast.success("تم حفظ بيانات المشروع");
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project", row.id] });
      void qc.invalidateQueries({ queryKey: ["solar", row.id] });
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const fld = (k: keyof Form, label: string, props: Record<string, any> = {}) => (
    <label className="space-y-1 text-sm"><span className="block">{label}</span><Input value={f?.[k] ?? ""} onChange={(e) => setF((s) => s && { ...s, [k]: e.target.value })} {...props} /></label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>تعديل بيانات المشروع</DialogTitle></DialogHeader>
        {!f ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {fld("name", "اسم المشروع *", { autoFocus: true })}
              {fld("code", "رمز المشروع")}
              {fld("contact", "اسم الشخص / المالك")}
              {fld("phone", "رقم الهاتف", { dir: "ltr" })}
              {fld("factory", "اسم المعمل / المنشأة")}
              {fld("site", "نوع المنشأة", { placeholder: "معمل، مزرعة، منزل، بئر…" })}
              {fld("location", "المدينة / المنطقة")}
              {fld("address", "العنوان بالتفصيل")}
              {fld("maps", "رابط الموقع على الخريطة", { dir: "ltr" })}
              <div />
              {fld("start", "تاريخ البداية", { type: "date" })}
              {fld("end", "تاريخ التسليم", { type: "date" })}
            </div>
            <label className="block space-y-1 text-sm"><span>ملاحظات</span><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>إلغاء</Button>
              <Button disabled={busy} onClick={() => void save()}>حفظ</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
