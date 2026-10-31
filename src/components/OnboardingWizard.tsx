import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { seedMyCompany, applyBusinessActivity } from "@/lib/admin.functions";
import { ActivityPicker } from "@/components/BusinessActivityCard";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TaxSettingsFields } from "@/components/TaxSettingsCard";
import { emptyTaxSettings, validateTaxSettings, type TaxSettings } from "@/lib/taxes";
import { useCurrencies, WORLD_CURRENCIES } from "@/lib/currencies";
import { useMe, isProjectsOnlyTenant } from "@/lib/session";
import { useSaveExtra } from "@/lib/prefs";
import { OPERATING_MODES, setOperatingMode, type OperatingMode } from "@/lib/operating-mode";

export const PERIOD_TYPES = [
  { value: "quarterly", label: "ربعي (4 فترات)" },
  { value: "semiannual", label: "نصف سنوي (فترتان)" },
  { value: "yearly", label: "سنوي (فترة واحدة)" },
];

const year = new Date().getFullYear();

export function OnboardingWizard({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const qc = useQueryClient();
  const seedFn = useServerFn(seedMyCompany);
  const applyFn = useServerFn(applyBusinessActivity);
  const settings = useQuery({
    queryKey: ["onboarding", tenantId],
    queryFn: async () =>
      (await db.from("tenant_settings").select("onboarding_done").eq("tenant_id", tenantId).maybeSingle()).data,
  });
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [f, setF] = useState({
    name: tenantName,
    phone: "",
    address: "",
    fiscal_start: `${year}-01-01`,
    fiscal_end: `${year}-12-31`,
    period_type: "yearly",
    seedCoa: false,
    inventory_method: "perpetual",
    sector: "commercial",
    activity: "general_trading",
    manual_datetime: true,
    standard_coding: true,
    has_branches: false,
    base_currency: "USD",
  });
  const curs = useCurrencies();
  const [tax, setTax] = useState<TaxSettings>(emptyTaxSettings());
  const { data: me } = useMe();
  const saveExtra = useSaveExtra(me);
  const [navMode, setNavModeChoice] = useState<"single" | "windows" | "hybrid">("single");
  const [opMode, setOpMode] = useState<OperatingMode>("multi_device");
  const projectsOnly = isProjectsOnlyTenant(me);
  const lastStep = projectsOnly ? 1 : 3;

  const open = !dismissed && settings.isSuccess && !settings.data?.onboarding_done;

  async function finishProjects() {
    setBusy(true);
    try {
      const { error: e1 } = await db.rpc("update_company_info", {
        _name: f.name, _code: "", _phone: f.phone, _address: f.address, _notes: "",
      });
      if (e1) throw e1;
      const { error } = await db.from("tenant_settings").upsert({ tenant_id: tenantId, onboarding_done: true }, { onConflict: "tenant_id" });
      if (error) throw error;
      await saveExtra.mutateAsync({ navMode }).catch(() => {});
      toast.success("تم تجهيز الشركة");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (projectsOnly) return finishProjects();
    setBusy(true);
    try {
      const { error: e1 } = await db.rpc("update_company_info", {
        _name: f.name, _code: "", _phone: f.phone, _address: f.address, _notes: "",
      });
      if (e1) throw e1;
      const { error: setupError } = await db.from("tenant_settings").upsert({ tenant_id: tenantId, base_currency: f.base_currency, inventory_method: f.inventory_method, tax_settings: validateTaxSettings(tax) }, { onConflict: "tenant_id" });
      if (setupError) throw setupError;
      if (f.seedCoa) {
        await seedFn();
        await applyFn({ data: { activity: f.activity } });
      }
      const { data: re } = await db.from("accounts").select("id").eq("tenant_id", tenantId).eq("code", "3103").eq("nature", "equity").eq("is_group", false).maybeSingle();
      const { error } = await db.from("tenant_settings").upsert(
        {
          tenant_id: tenantId,
          fiscal_start: f.fiscal_start,
          fiscal_end: f.fiscal_end,
          period_type: f.period_type,
          manual_datetime: f.manual_datetime,
          standard_coding: f.standard_coding,
          retained_earnings_account_id: re?.id ?? null,
          base_currency: f.base_currency,
          inventory_method: f.inventory_method,
          onboarding_done: true,
        },
        { onConflict: "tenant_id" },
      );
      if (error) throw error;
      // Seeded chart is created before the base currency is saved — align every account with it.
      const { error: ec } = await db.from("accounts").update({ currency: f.base_currency }).eq("tenant_id", tenantId).neq("currency", f.base_currency);
      if (ec) throw ec;
      if (f.has_branches) {
        const { error: eb } = await db.rpc("enable_branches", { _on: true });
        if (eb) throw eb;
      }
      await setOperatingMode(opMode);
      await saveExtra.mutateAsync({ navMode }).catch(() => {});
      toast.success("تم تجهيز الشركة بالإعدادات الافتراضية");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && setDismissed(true)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تجهيز الشركة لأول مرة — الخطوة {step} من {lastStep}</DialogTitle>
        </DialogHeader>
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">بيانات الشركة الأساسية</p>
            <div className="space-y-1"><Label>اسم الشركة</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>الهاتف</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="space-y-1"><Label>العنوان</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
            {!projectsOnly && <div className="space-y-1">
              <Label>العملة الأساسية للشركة (لا يمكن تغييرها لاحقاً)</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.base_currency} onChange={(e) => setF({ ...f, base_currency: e.target.value })}>
                {[...WORLD_CURRENCIES, ...(curs.data ?? []).filter((c) => !WORLD_CURRENCIES.some((w) => w.code === c.code))].map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
              </select>
            </div>}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">السنة المالية</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>بداية السنة المالية</Label><Input type="date" value={f.fiscal_start} onChange={(e) => setF({ ...f, fiscal_start: e.target.value })} /></div>
              <div className="space-y-1"><Label>نهاية السنة المالية</Label><Input type="date" value={f.fiscal_end} onChange={(e) => setF({ ...f, fiscal_end: e.target.value })} /></div>
            </div>
            <div className="space-y-1">
              <Label>نظام الفترات</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.period_type} onChange={(e) => setF({ ...f, period_type: e.target.value })}>
                {PERIOD_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>التاريخ والوقت عند إدخال الفواتير والقيود</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.manual_datetime ? "manual" : "auto"} onChange={(e) => setF({ ...f, manual_datetime: e.target.value === "manual" })}>
                <option value="manual">أُدخله بنفسي (يُقترح التاريخ والوقت الحاليان)</option>
                <option value="auto">يُؤخذ التاريخ والوقت الحاليان تلقائياً ولا يُعدّل</option>
              </select>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">الإعدادات الافتراضية</p>
            <div className="space-y-1"><Label>نظام الجرد (لا يتغير بعد تجهيز الشركة)</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.inventory_method} onChange={(e) => setF({ ...f, inventory_method: e.target.value })}><option value="perpetual">جرد مستمر</option><option value="periodic">جرد دوري</option></select></div>
            <ActivityPicker sector={f.sector} activity={f.activity} onChange={(sector, activity) => setF({ ...f, sector, activity })} />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.seedCoa} onCheckedChange={(v) => setF({ ...f, seedCoa: !!v })} />
              إنشاء شجرة الحسابات الموحدة وربط الحسابات تلقائياً (إن كانت الشجرة فارغة)
            </label>
            <div className="space-y-1">
              <Label>ترميز شجرة الحسابات والمواد</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.standard_coding ? "standard" : "free"} onChange={(e) => setF({ ...f, standard_coding: e.target.value === "standard" })}>
                <option value="standard">ترميز قياسي (أرقام متسلسلة تلقائية حسب موقع الحساب أو المادة في الشجرة)</option>
                <option value="free">ترميز حر (أُدخل الرمز الذي أريده لكل حساب أو مادة)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.has_branches} onCheckedChange={(v) => setF({ ...f, has_branches: !!v })} />
              الشركة لها فروع (يُنشأ الفرع الرئيسي وتضيف الباقي من الإعدادات)
            </label>
            <div className="space-y-2 rounded-md border p-2">
              <p className="text-sm font-medium">الضرائب (تستطيع ربط حساباتها لاحقاً من الإعدادات)</p>
              <TaxSettingsFields value={tax} onChange={setTax} />
            </div>
            <div className="space-y-1">
              <Label>طريقة فتح الشاشات على الكمبيوتر (تتغير لاحقاً من الإعدادات)</Label>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="طريقة فتح الشاشات">
                {([["single", "الصفحة الواحدة", "كل شاشة تفتح مكان الحالية"], ["windows", "نظام النوافذ", "كل شاشة بنافذة مستقلة"], ["hybrid", "النظام الهجين", "مكان الحالية مع زر لفتح نافذة"]] as const).map(([v, l, d]) => (
                  <button key={v} type="button" role="radio" aria-checked={navMode === v} onClick={() => setNavModeChoice(v)}
                    className={"rounded-lg border p-2 text-start text-sm transition " + (navMode === v ? "border-primary bg-primary/10" : "hover:bg-accent")}>
                    <span className="block font-semibold">{l}</span><span className="block text-xs text-muted-foreground">{d}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>نوع النسخة (نمط التشغيل) — يغيّره مدير النظام لاحقاً من الإعدادات</Label>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="نمط التشغيل">
                {OPERATING_MODES.map((m) => (
                  <button key={m.v} type="button" role="radio" aria-checked={opMode === m.v} onClick={() => setOpMode(m.v)}
                    className={"rounded-lg border p-2 text-start text-sm transition " + (opMode === m.v ? "border-primary bg-primary/10" : "hover:bg-accent")}>
                    <span className="block font-semibold">{m.l}</span><span className="block text-xs text-muted-foreground">{m.d}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setDismissed(true)} title="تُغلق الآن وتظهر مجدداً عند الدخول التالي">تخطي الآن</Button>
          <Button variant="ghost" className="text-destructive" disabled={busy} title="لن تظهر هذه النافذة مرة أخرى" onClick={async () => {
            if (!confirm("لن تظهر نافذة تجهيز الشركة مرة أخرى. متابعة؟")) return;
            const { error } = await db.from("tenant_settings").upsert({ tenant_id: tenantId, onboarding_done: true }, { onConflict: "tenant_id" });
            if (error) { toast.error(error.message); return; }
            setDismissed(true);
            qc.invalidateQueries({ queryKey: ["onboarding", tenantId] });
          }}>تخطي نهائياً</Button>
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>السابق</Button>}
          {step < lastStep ? (
            <Button onClick={() => setStep(step + 1)} disabled={!f.name.trim()}>التالي</Button>
          ) : (
            <Button onClick={finish} disabled={busy}>{busy ? "جارٍ التجهيز..." : "إنهاء وحفظ"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
