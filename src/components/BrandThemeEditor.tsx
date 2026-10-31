import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { processLogo, useBranding } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const DEFAULTS = ["#1f3a5f", "#0f766e", "#b45309", "#7c2d12", "#334155", "#15803d"];
const ROLES = ["رئيسي", "ثانوي", "مميّز", "إضافي", "إضافي", "إضافي"];

/** Shared logo + multi-colour theme editor for every company type; saves through set_tenant_theme. */
export function BrandThemeEditor({ editable = true, onSaved }: { editable?: boolean; onSaved?: () => void }) {
  const qc = useQueryClient();
  const brand = useBranding();
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [picked, setPicked] = useState<string[] | undefined>(undefined);
  const [suggest, setSuggest] = useState<string[]>([]);
  const curLogo = logo === undefined ? brand.data?.logo_url ?? null : logo;
  const saved = (brand.data?.theme_colors ?? []).filter(Boolean) as string[];
  const curColors = picked ?? (saved.length ? saved : brand.data?.primary_color ? [brand.data.primary_color] : []);
  const toggle = (c: string) => setPicked(curColors.includes(c) ? curColors.filter((x) => x !== c) : curColors.length >= 6 ? curColors : [...curColors, c]);
  const save = useMutation({
    mutationFn: async (reset: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("set_tenant_theme", { _logo: reset ? null : curLogo, _colors: reset ? [] : curColors });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حفظ الشعار والألوان"); setLogo(undefined); setPicked(undefined); void qc.invalidateQueries({ queryKey: ["branding"] }); onSaved?.(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const wl = useMutation({
    mutationFn: async (on: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("set_tenant_white_label", { _on: on });
      if (error) throw error;
    },
    onSuccess: (_d, on) => { toast.success(on ? "التطبيق يستخدم الآن هوية شركتك" : "التطبيق يستخدم الآن هوية يوسف سوفت"); void qc.invalidateQueries({ queryKey: ["branding"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <label className="flex items-start justify-between gap-3 rounded-lg border bg-muted/40 p-3">
        <span className="space-y-0.5"><span className="block text-sm font-medium">استخدام اسم وشعار الشركة كهوية للتطبيق</span><span className="block text-xs text-muted-foreground">عند التفعيل يظهر اسم وشعار شركتك في واجهة البرنامج وشاشة الدخول وأيقونة التطبيق على الموبايل والكمبيوتر. عند الإيقاف تظهر هوية يوسف سوفت (المطبوعات تبقى بشعار الشركة).</span></span>
        <Switch checked={brand.data?.white_label !== false} disabled={!editable || wl.isPending} onCheckedChange={(v) => wl.mutate(v)} />
      </label>
      <p className="text-xs text-muted-foreground">ارفع الشعار فتُستخرج ألوانه تلقائيًا. اختر من 3 إلى 6 ألوان بالترتيب: الأول رئيسي، الثاني ثانوي، الثالث مميّز. تُطبّق على البرنامج وكل المطبوعات وأيقونة التطبيق.</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border bg-muted">{curLogo ? <img src={curLogo} alt="الشعار" className="size-full object-contain" /> : <span className="text-xs text-muted-foreground">بلا شعار</span>}</div>
        <div className="space-y-2">
          <Input type="file" accept="image/*" disabled={!editable} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const r = await processLogo(file); setLogo(r.dataUrl); setSuggest(r.colors); setPicked(r.colors.slice(0, Math.min(4, r.colors.length))); } catch { toast.error("تعذّر قراءة الصورة"); } }} />
          {curLogo && editable && <Button size="sm" variant="ghost" onClick={() => setLogo(null)}>إزالة الشعار</Button>}
        </div>
      </div>
      {curColors.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium">ألوان الثيمة المختارة</div>
          <div className="flex overflow-hidden rounded-lg border">{curColors.map((c, i) => <div key={c + i} className="flex-1 p-2 text-center text-[10px]" style={{ background: c }}><span className="rounded bg-background/80 px-1">{ROLES[i]}</span></div>)}</div>
        </div>
      )}
      <div className="space-y-1">
        <div className="text-xs font-medium">{suggest.length ? "ألوان الشعار — اضغط للإضافة أو الإزالة" : "ألوان مقترحة"}</div>
        <div className="flex flex-wrap items-center gap-2">
          {[...new Set([...suggest, ...curColors, ...DEFAULTS])].map((c) => { const i = curColors.indexOf(c); return <Button variant="ghost" size="icon" key={c} type="button" disabled={!editable} title={c} aria-label={c} aria-pressed={i >= 0} onClick={() => toggle(c)} className={`relative size-8 rounded-full border-2 ${i >= 0 ? "border-foreground" : "border-transparent"}`} style={{ background: c }}>{i >= 0 && <span className="rounded-full bg-background px-1 text-[10px] text-foreground">{i + 1}</span>}</Button>; })}
          <input type="color" aria-label="إضافة لون" disabled={!editable} onChange={(e) => { const c = e.target.value; if (!curColors.includes(c) && curColors.length < 6) setPicked([...curColors, c]); }} className="size-8 rounded" />
        </div>
        {curColors.length > 0 && curColors.length < 3 && <p className="text-xs text-muted-foreground">يُفضّل اختيار 3 ألوان على الأقل لثيمة متناسقة.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save.mutate(false)} disabled={!editable || save.isPending}>حفظ الشعار والألوان</Button>
        <Button variant="outline" onClick={() => save.mutate(true)} disabled={!editable || save.isPending}>الهوية الافتراضية</Button>
      </div>
    </div>
  );
}
