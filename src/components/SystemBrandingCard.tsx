import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { processLogo, useSystemBrand } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** System owner sets the program's own name and logo, replacing the default identity everywhere. */
export function SystemBrandingCard() {
  const qc = useQueryClient();
  const sys = useSystemBrand();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [mark, setMark] = useState<string | null>(null);
  useEffect(() => {
    if (!sys.data) return;
    setName(sys.data.system_name ?? ""); setNameEn(sys.data.system_name_en ?? "");
    setLogo(sys.data.logo_url); setMark(sys.data.mark_url);
  }, [sys.data]);

  const save = useMutation({
    mutationFn: async (reset: boolean) => {
      const row = reset
        ? { id: true, system_name: null, system_name_en: null, logo_url: null, mark_url: null, updated_at: new Date().toISOString() }
        : { id: true, system_name: name.trim() || null, system_name_en: nameEn.trim() || null, logo_url: logo, mark_url: mark, updated_at: new Date().toISOString() };
      const { error } = await (db.from("system_branding" as never) as any).upsert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حفظ هوية النظام"); void qc.invalidateQueries({ queryKey: ["system_branding"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pick = (set: (v: string) => void) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { set((await processLogo(f)).dataUrl); } catch { toast.error("تعذر قراءة الصورة"); }
  };

  return (
    <div className="mt-8 rounded-lg border bg-card p-5 shadow-soft">
      <h2 className="font-bold">هوية النظام (الاسم والشعار)</h2>
      <p className="mb-4 text-sm text-muted-foreground">تظهر في شاشة الدخول والقائمة لكل الشركات التي لم تضع شعارها الخاص.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div><Label>اسم النظام</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="يوسف سوفت" /></div>
        <div><Label>اسم النظام بالإنجليزية</Label><Input dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Yousef Soft" /></div>
        <div><Label>الشعار الكامل</Label><Input type="file" accept="image/*" onChange={pick(setLogo)} />{logo && <img src={logo} alt="" className="mt-2 max-h-20 object-contain" />}</div>
        <div><Label>الأيقونة الصغيرة</Label><Input type="file" accept="image/*" onChange={pick(setMark)} />{mark && <img src={mark} alt="" className="mt-2 size-12 object-contain" />}</div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => save.mutate(false)} disabled={save.isPending}>حفظ</Button>
        <Button variant="outline" onClick={() => save.mutate(true)} disabled={save.isPending}>استعادة الافتراضي</Button>
      </div>
    </div>
  );
}
