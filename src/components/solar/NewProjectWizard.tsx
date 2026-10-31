import { SYRIA_GOVERNORATES } from "@/lib/syria-governorates";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Droplets, Factory, FileStack, LayoutTemplate, Sun, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { today } from "@/lib/format";
import { templateRows } from "@/lib/solar";
import { BUILTIN_TEMPLATES, taskCount, type ProjectTemplate, type TSection } from "@/lib/project-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategorySelect, useProjectCategories } from "@/components/solar/ProjectCategories";

const ICONS: Record<string, typeof Sun> = { solar_industrial: Factory, solar_hybrid: Zap, water_home: Droplets, water_industrial: Droplets, blank: LayoutTemplate };
const STEPS = ["البيانات الأساسية", "القالب", "المواصفات", "المراجعة"];
const COLORS = ["#1f3a5f", "#2e7d32", "#0277bd", "#ef6c00", "#6a1b9a", "#c62828"];

export function NewProjectWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", code: "", client: "", phone: "", location: "", gov: "", site: "", start: today(), end: "", value: "", currency: "USD", capacity: "", grid: "no", color: COLORS[0]!, notes: "" });
  const [tplKey, setTplKey] = useState("solar_industrial");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const custom = useQuery({
    queryKey: ["project-templates", me?.tenantId],
    enabled: open && !!me?.tenantId,
    queryFn: async () => {
      const { data } = await db.from("project_templates").select("id,name,description,tree").order("created_at");
      return ((data ?? []) as { id: string; name: string; description: string | null; tree: unknown }[]).map((r) => ({ key: r.id, name: r.name, description: r.description ?? "قالب خاص بشركتك", tree: r.tree as unknown as TSection[], custom: true })) as ProjectTemplate[];
    },
  });
  const all = [...BUILTIN_TEMPLATES, ...(custom.data ?? [])];
  const cats = useProjectCategories(open ? me?.tenantId : undefined).data ?? [];
  const [category, setCategory] = useState("");
  const tpl = all.find((t) => t.key === tplKey) ?? BUILTIN_TEMPLATES[0]!;
  const water = tplKey.startsWith("water");

  function next() {
    if (step === 0 && !f.name.trim()) { toast.error("اكتب اسم المشروع"); return; }
    if (step === 0 && f.end && f.end < f.start) { toast.error("تاريخ النهاية قبل تاريخ البداية"); return; }
    setStep((s) => Math.min(3, s + 1));
  }

  async function create() {
    if (!me?.tenantId) return;
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const { error } = await db.from("projects").insert({
        id, tenant_id: me.tenantId, name: f.name.trim(), code: f.code.trim() || null, status: "active", is_active: true, is_group: false, parent_id: category || null,
        start_date: f.start || null, end_date: f.end || null, contract_value: Number(f.value) || 0,
        currency: f.currency as never, lead_contact: f.client.trim() || null, lead_phone: f.phone.trim() || null,
        brand_color: f.color, notes: f.notes.trim() || null,
      });
      if (error) throw error;
      const grid = f.grid === "yes";
      const rows = templateRows(id, me.tenantId, grid, tpl.tree);
      if (rows.length) {
        const { error: e2 } = await db.from("project_wbs").insert(rows as never);
        if (e2) throw e2;
      }
      const { error: e3 } = await db.from("solar_projects").upsert({
        project_id: id, tenant_id: me.tenantId,
        survey: { template: tpl.key, template_name: tpl.name, client_name: f.client, client_phone: f.phone, location: f.location, governorate: f.gov || null, site_type: f.site, capacity: f.capacity, export_to_grid: grid ? "yes" : "no" },
      }, { onConflict: "project_id" });
      if (e3) throw e3;
      toast.success("تم إنشاء المشروع وبناء مراحله");
      void qc.invalidateQueries({ queryKey: ["projects"] });
      onClose();
      void nav({ to: "/projects/$projectId", params: { projectId: id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sun className="size-5 text-primary" />معالج إعداد مشروع جديد</DialogTitle></DialogHeader>
        <ol className="flex gap-1">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <div className={`mt-1 truncate text-[11px] ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{i + 1}. {s}</div>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <F l="اسم المشروع *"><Input value={f.name} onChange={set("name")} autoFocus /></F>
            <F l="رمز المشروع"><Input value={f.code} onChange={set("code")} /></F>
            <F l="العميل / الجهة"><Input value={f.client} onChange={set("client")} /></F>
            <F l="رقم الهاتف"><Input value={f.phone} onChange={set("phone")} dir="ltr" /></F>
            <F l="الموقع"><Input value={f.location} onChange={set("location")} placeholder="المدينة / المنطقة" /></F>
            <F l="المحافظة"><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.gov} onChange={set("gov")}><option value="">— اختر المحافظة —</option>{SYRIA_GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}</select></F>
            <F l="نوع المنشأة"><Input value={f.site} onChange={set("site")} placeholder="منزل، معمل، مزرعة، بئر…" /></F>
            <F l="تاريخ البداية"><Input type="date" value={f.start} onChange={set("start")} /></F>
            <F l="تاريخ التسليم المتوقع"><Input type="date" value={f.end} onChange={set("end")} /></F>
            <F l="قيمة العقد التقديرية"><Input type="number" min="0" value={f.value} onChange={set("value")} /></F>
            <F l="العملة"><select value={f.currency} onChange={set("currency")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">{["USD", "SYP", "TRY", "EUR"].map((c) => <option key={c}>{c}</option>)}</select></F>
            <F l="التصنيف"><CategorySelect cats={cats} value={category} onChange={setCategory} /></F>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {all.map((t) => {
              const Icon = t.custom ? FileStack : ICONS[t.key] ?? Sun;
              const on = t.key === tplKey;
              return (
                <button key={t.key} type="button" onClick={() => setTplKey(t.key)} className={`flex gap-3 rounded-xl border p-3 text-start transition hover:shadow ${on ? "border-primary ring-2 ring-primary" : ""}`}>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 font-semibold">{t.name}{on && <Check className="size-4 text-primary" />}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{t.tree.length} أقسام · {taskCount(t.tree)} مهمة</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <F l={water ? "استطاعة المضخة (حصان) / سعة التسخين" : "الاستطاعة التقديرية (kWp)"}><Input value={f.capacity} onChange={set("capacity")} /></F>
            <F l="الربط مع الشبكة"><select value={f.grid} onChange={set("grid")} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="no">بدون تصدير للشبكة</option><option value="yes">تصدير للشبكة (يُفعّل قسم التراخيص)</option></select></F>
            <F l="لون المشروع"><div className="flex flex-wrap gap-2">{COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setF((s) => ({ ...s, color: c }))} className={`size-8 rounded-full border-2 ${f.color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />)}<input type="color" value={f.color} onChange={set("color")} className="size-8 rounded" /></div></F>
            <F l="ملاحظات"><Input value={f.notes} onChange={set("notes")} /></F>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
            <Row k="المشروع" v={`${f.name}${f.code ? ` (${f.code})` : ""}`} />
            <Row k="العميل" v={[f.client, f.phone].filter(Boolean).join(" · ") || "—"} />
            <Row k="الموقع" v={[f.location, f.site].filter(Boolean).join(" · ") || "—"} />
            <Row k="المدة" v={`${f.start || "—"} ← ${f.end || "—"}`} />
            <Row k="القالب" v={`${tpl.name} (${taskCount(tpl.tree)} مهمة)`} />
            <Row k="الاستطاعة" v={f.capacity || "—"} />
            <Row k="قيمة العقد" v={f.value ? `${f.value} ${f.currency}` : "—"} />
            <p className="pt-2 text-xs text-muted-foreground">بعد الإنشاء تقدر تضيف أو تحذف أو تعدّل أي مرحلة ومهمة داخل المشروع.</p>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="outline" onClick={() => (step ? setStep(step - 1) : onClose())}><ChevronRight className="size-4" />{step ? "السابق" : "إلغاء"}</Button>
          {step < 3 ? <Button onClick={next}>التالي<ChevronLeft className="size-4" /></Button> : <Button onClick={create} disabled={busy}><Check className="size-4" />{busy ? "جارٍ الإنشاء…" : "إنشاء المشروع"}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{l}</Label>{children}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
