import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { processLogo, useBranding } from "@/lib/branding";
import { BrandThemeEditor } from "@/components/BrandThemeEditor";
import { BusinessActivityCard } from "@/components/BusinessActivityCard";
import { FiscalYearCard } from "@/components/FiscalYearCard";
import { BackupButtons, CloudBackupCard } from "@/components/BackupButtons";
import { CurrenciesCard } from "@/components/CurrenciesCard";
import { RepricingCard } from "@/components/RepricingCard";
import { ExchangeRatesCard } from "@/components/ExchangeRatesCard";
import { FxRevaluationCard } from "@/components/FxRevaluationCard";
import { UnitsCard } from "@/components/UnitsCard";
import { TaxSettingsCard } from "@/components/TaxSettingsCard";
import { NotificationPrefs } from "@/components/NotificationPrefs";
import { OfflineSyncSettings } from "@/components/OfflineSyncSettings";
import { EntrySettingsCard } from "@/components/EntrySettingsCard";
import { setupClosingAccounts } from "@/lib/closing-setup";
import { CLOSING_STAGES, type ClosingLinks } from "@/lib/closing-rules";
import { BranchesCard } from "@/components/BranchesCard";
import { DataFilesCard } from "@/components/DataFilesCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useNavigate } from "@tanstack/react-router";
import { UsersPage } from "./users";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { costRules } from "@/lib/purchase-cost-policy";
import { ReceiptTemplateCard } from "@/components/ReceiptTemplateCard";

type Search = { tab?: string | undefined; sec?: string | undefined };
export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: typeof s["tab"] === "string" ? (s["tab"] as string) : undefined,
    sec: typeof s["sec"] === "string" ? (s["sec"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "الإعدادات | يوسف سوفت" },
      { name: "description", content: "إعدادات الحساب والشركة والمستخدمين والصلاحيات والعملات والمواد والبيانات." },
      { property: "og:title", content: "الإعدادات" },
      { property: "og:description", content: "إعدادات الحساب والشركة والمستخدمين والصلاحيات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const FIELDS = [
  { key: "cash_account_id", label: "حساب الصندوق / المصرف" },
  { key: "customers_account_id", label: "حساب الزبائن (الذمم المدينة)" },
  { key: "suppliers_account_id", label: "حساب الموردين (الذمم الدائنة)" },
  { key: "capital_account_id", label: "حساب رأس المال (قيد بضاعة أول المدة)" },
  { key: "inventory_account_id", label: "حساب المخزون الاحتياطي (للمستودعات غير المربوطة)" },
  { key: "purchases_account_id", label: "حساب المشتريات (الجرد الدوري)" },
  { key: "sales_account_id", label: "حساب المبيعات" },
  { key: "cogs_account_id", label: "حساب تكلفة المبيعات" },
  { key: "project_cost_account_id", label: "حساب تكاليف المشاريع" },
  { key: "fx_account_id", label: "حساب فروق أسعار الصرف (عام)" },
  { key: "fx_gain_account_id", label: "حساب أرباح فروق الصرف" },
  { key: "fx_loss_account_id", label: "حساب خسائر فروق الصرف" },
  { key: "sales_discount_account_id", label: "حساب الحسم الممنوح (فواتير البيع)" },
  { key: "purchase_discount_account_id", label: "حساب الحسم المكتسب (فواتير الشراء)" },
  { key: "sales_freight_account_id", label: "حساب مصاريف النقل (فواتير البيع)" },
  { key: "purchase_freight_account_id", label: "حساب مصاريف النقل (فواتير الشراء)" },
  { key: "stock_shortage_account_id", label: "حساب عجز المخزون (الجرد)" },
  { key: "stock_surplus_account_id", label: "حساب أرباح فروقات الجرد" },
  { key: "notes_receivable_account_id", label: "حساب أوراق القبض (شيكات واردة)" },
  { key: "notes_payable_account_id", label: "حساب أوراق الدفع (شيكات صادرة)" },
  { key: "dep_expense_account_id", label: "حساب مصروف الاهتلاك (افتراضي)" },
  { key: "accum_dep_account_id", label: "حساب مجمع الاهتلاك (افتراضي)" },
] as const;


const GENERAL_KEYS = new Set<string>(["stock_shortage_account_id", "stock_surplus_account_id", "dep_expense_account_id", "accum_dep_account_id"]);

function SettingsPage() {
  const { t: tr, dir } = useI18n();
  const { data: me } = useMe();
  const brandLogo = useBranding().data?.logo_url ?? null;
  const qc = useQueryClient();
  const editable = can(me, "accounts", "edit");
  const [choiceFor, setChoiceFor] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, string>>({});

  const accounts = useQuery({
    queryKey: ["accounts_flat", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () =>
      (await scope(db.from("accounts").select("id,code,name,is_group"), me?.tenantId).order("code")).data ?? [],
  });

  const settings = useQuery({
    queryKey: ["tenant_settings", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () =>
      (await db.from("tenant_settings").select("*").eq("tenant_id", me!.tenantId).maybeSingle()).data,
  });

  useEffect(() => {
    if (settings.data) {
      const next: Record<string, string> = {};
      FIELDS.forEach((f) => {
        next[f.key] = settings.data[f.key] ?? "";
      });
      const roots = (settings.data.entity_account_roots ?? {}) as Record<string, string>;
      for (const key of ["customer", "supplier", "warehouses", "cost_centers", "projects"]) next[`root.${key}`] = roots[key] ?? "";
      next["cost_method"] = settings.data.cost_method ?? "avg";
      next["purchase_cost_policy"] = settings.data.purchase_cost_policy ?? "net";
      next["standard_coding"] = settings.data.standard_coding ? "true" : "false";
      next["account_code_len"] = String(settings.data.account_code_len ?? 12);
      next["product_code_len"] = String(settings.data.product_code_len ?? 12);
      next["warehouse_code_len"] = String(settings.data.warehouse_code_len ?? 12);
      next["price_names"] = (Array.isArray(settings.data.price_names) ? settings.data.price_names : []).join("، ");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spn = (settings.data as any).service_price_names;
      next["service_price_names"] = (Array.isArray(spn) ? spn : []).join("، ");
      setForm(next);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | boolean | null> = { tenant_id: me!.tenantId! };
      FIELDS.forEach((f) => {
        payload[f.key] = form[f.key] || null;
      });
      payload["cost_method"] = form["cost_method"] || "avg";
      payload["purchase_cost_policy"] = form["purchase_cost_policy"] || "net";
      payload["standard_coding"] = form["standard_coding"] === "true";
      const lens = payload as unknown as Record<string, unknown>;
      for (const k of ["account_code_len", "product_code_len", "warehouse_code_len"]) {
        const n = Math.round(Number(form[k]) || 12);
        if (n < 2 || n > 30) throw new Error("عدد خانات الترميز يجب أن يكون بين 2 و30");
        lens[k] = n;
      }
      lens["entity_account_roots"] = Object.fromEntries(["customer", "supplier", "warehouses", "cost_centers", "projects"].filter((key) => form[`root.${key}`]).map((key) => [key, form[`root.${key}`]]));
      lens["price_names"] = String(form["price_names"] ?? "").split(/[,،]/).map((x) => x.trim()).filter(Boolean);
      lens["service_price_names"] = String(form["service_price_names"] ?? "").split(/[,،]/).map((x) => x.trim()).filter(Boolean);
      const { error } = await db.from("tenant_settings").upsert(payload, { onConflict: "tenant_id" });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["standard_coding"] });
    },
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات");
      qc.invalidateQueries({ queryKey: ["tenant_settings"] });
      qc.invalidateQueries({ queryKey: ["price_names"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = !!me?.tenantId;
  const admin = !!me?.isTenantAdmin;
  const search = Route.useSearch();
  const navigate = useNavigate();
  type Sec = { v: string; l: string; node: ReactNode };
  type Main = { v: string; l: string; secs: Sec[] };
  const mains: Main[] = [
    { v: "me", l: "الحساب الشخصي", secs: [
      { v: "profile", l: "ملفي الشخصي", node: <ProfileCard /> },
      { v: "sync", l: "التنقل والمزامنة", node: <OfflineSyncSettings /> },
      { v: "notif", l: "إشعاراتي", node: (
        <div className="mb-8 max-w-3xl">
          <PageHeader title={tr("إشعاراتي")}  subtitle={tr("اختر أنواع الإشعارات التي تريد أن تصلك على هذا الحساب")}  />
          <div className="rounded-lg border bg-card p-5"><NotificationPrefs /></div>
        </div>) },
    ] },
    { v: "company", l: t ? "الشركة" : "الهوية", secs: [
      { v: "brand", l: "الشعار والطباعة", node: <BrandingCard tenantId={me?.tenantId ?? null} editable={editable} /> },
      ...(me?.tenantId ? [{ v: "receipt", l: "الإيصال الحراري", node: <ReceiptTemplateCard tenantId={me.tenantId} editable={editable} company={me.tenantName ?? ""} logoUrl={brandLogo} /> }] : []),
      ...(t ? [{ v: "activity", l: "نشاط الشركة", node: <BusinessActivityCard tenantId={me!.tenantId!} isAdmin={admin} /> }] : []),
    ] },
  ];
  if (t && can(me, "users", "view")) mains.push({ v: "users", l: "المستخدمون والصلاحيات", secs: [{ v: "list", l: "المستخدمون وصلاحياتهم", node: <UsersPage /> }] });
  if (t) {
    mains.push(
      { v: "accounting", l: "المحاسبة", secs: [
        { v: "entries", l: "إعدادات القيود", node: <EntrySettingsCard editable={editable} /> },
        { v: "taxes", l: "الضرائب", node: <TaxSettingsCard editable={editable} /> },
        { v: "links", l: "حسابات الجرد والاهتلاك", node: (<div>
            <PageHeader title={tr("حسابات الجرد والاهتلاك")}  subtitle={tr("باقي الحسابات تُضبط من إدارة الأنماط")}  />
            <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
              <Link to="/doc-patterns" className="block rounded-md border border-primary/40 bg-primary/5 p-3 text-sm text-primary">{tr("حسابات المبيعات والمشتريات والصناديق ورأس المال تُضبط من إدارة الأنماط ←")}</Link>
              {FIELDS.filter((f) => GENERAL_KEYS.has(f.key)).map((f) => (
                <div key={f.key} className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center">
                  <Label>{tr(f.label)}</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    disabled={!editable}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  >
                    <option value="">{tr("— غير محدد —")}</option>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(accounts.data ?? [])
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .filter((a: any) => !a.is_group)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => save.mutate()} disabled={!editable || save.isPending}>
                  {tr(save.isPending ? "جارٍ الحفظ..." : "حفظ")}
                </Button>
              </div>
            </div>
          </div>) },
        { v: "coding", l: "الترميز وفروع الأدلة", node: (<div>
            <PageHeader title={tr("الترميز وفروع الأدلة")}  subtitle={tr("نظام ترميز الحسابات والمواد، والحساب الأب لكل دليل")}  />
            <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center">
                <Label>{tr("نظام ترميز الحسابات والمواد")}</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!editable} value={form["standard_coding"] === "true" ? "true" : "false"} onChange={(e) => setForm({ ...form, standard_coding: e.target.value })}>
                  <option value="false">{tr("ترميز حر (بدون قيود)")}</option>
                  <option value="true">{tr("ترميز قياسي: خانتان لكل مستوى، وعدد خانات محدد للبطاقة التي يُكتب عليها")}</option>
                </select>
              </div>
              {form["standard_coding"] === "true" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {([["account_code_len", "خانات رمز الحساب"], ["product_code_len", "خانات رمز المادة"], ["warehouse_code_len", "خانات رمز المستودع"]] as const).map(([k, l]) => (
                    <div key={k} className="space-y-1">
                      <Label>{tr(l)}</Label>
                      <Input type="number" min={2} max={30} disabled={!editable} value={form[k] ?? "12"} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-3"><h3 className="font-semibold">{tr("فروع الحسابات للأدلة")}</h3>{([["customer", "الزبائن"], ["supplier", "الموردون"], ["warehouses", "المستودعات"], ["cost_centers", "مراكز الكلفة"], ["projects", "المشاريع"]] as const).map(([key, label]) => <div key={key} className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center"><Label>{tr(label)}</Label><select aria-label={`فرع حسابات ${label}`} className="h-9 rounded-md border bg-background px-2" disabled={!editable} value={form[`root.${key}`] ?? ""} onChange={(e) => setForm({ ...form, [`root.${key}`]: e.target.value })}><option value="">{tr("— غير محدد —")}</option>{(accounts.data ?? []).filter((a: any) => a.is_group).map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>)}</div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => save.mutate()} disabled={!editable || save.isPending}>
                  {tr(save.isPending ? "جارٍ الحفظ..." : "حفظ")}
                </Button>
              </div>
            </div>
          </div>) },
      ] },
      { v: "currency", l: "العملات", secs: [
        { v: "list", l: "العملات", node: <CurrenciesCard editable={editable} /> },
        { v: "rates", l: "أسعار الصرف", node: <ExchangeRatesCard editable={editable} /> },
        { v: "reval", l: "إعادة تقييم العملات", node: <FxRevaluationCard editable={editable} /> },
      ] },
      { v: "items", l: "المواد", secs: [
        { v: "pricing", l: "التسعير والمخزون", node: (<div>
            <PageHeader title={tr("التسعير والمخزون")}  subtitle={tr("طريقة تكلفة المخزون وتسميات مستويات الأسعار")}  />
            <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]"><Label>{tr("نظام الجرد")}</Label><span>{tr(settings.data?.inventory_method === "periodic" ? "جرد دوري" : "جرد مستمر")}</span></div>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center">
                <Label>{tr("طريقة تسعير المخزون (تكلفة البضاعة المباعة)")}</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!editable} value={form["cost_method"] ?? "avg"} onChange={(e) => setForm({ ...form, cost_method: e.target.value })}>
                  <option value="avg">{tr("المتوسط المرجّح")}</option>
                  <option value="last">{tr("آخر سعر شراء")}</option>
                </select>
              </div>
              {settings.data?.inventory_method !== "periodic" && (
                <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center">
                  <Label>{tr("سعر الكلفة في فواتير الشراء")}</Label>
                  <select aria-label="سعر الكلفة في فواتير الشراء" className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!editable} value={form["purchase_cost_policy"] ?? "net"} onChange={(e) => setForm({ ...form, purchase_cost_policy: e.target.value })}>
                    <option value="price">{tr("سعر الشراء فقط")}</option>
                    <option value="less_disc">{tr("سعر الشراء مطروحاً منه الحسميات")}</option>
                    <option value="plus_add">{tr("سعر الشراء مضافاً إليه الإضافات")}</option>
                    <option value="net">{tr("سعر الشراء مع الحسميات والإضافات")}</option>
                  </select>
                </div>
                {([ ["purchase_discount_account_id", "حساب الحسم المستبعد من الكلفة", costRules(form["purchase_cost_policy"]).discountInCost], ["purchase_freight_account_id", "حساب مصروف الإضافات المستبعدة من الكلفة", costRules(form["purchase_cost_policy"]).additionInCost] ] as const).filter(([, , included]) => !included).map(([key, label]) => <div key={key} className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center"><Label>{tr(label)}</Label><select aria-label={label} className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!editable} value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })}><option value="">— غير محدد —</option>{(accounts.data ?? []).filter((a: any) => !a.is_group).map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>)}
                </div>
              )}
              {([["price_names", "تسميات أسعار بيع المواد", ["جملة", "مفرق", "بيع نقدي", "موزع", "خاص"]], ["service_price_names", "تسميات أسعار الخدمات", ["عادي", "مستعجل", "عقد سنوي", "شركات", "خاص"]]] as const).map(([fk, title, choices]) => {
                const names = String(form[fk] ?? "").split(/[,،]/).map((x) => x.trim()).filter(Boolean);
                return (
                  <div key={fk} className="space-y-2">
                    <Label>{tr(title)}</Label>
                    <div className="flex flex-wrap gap-2"><div className="flex items-center gap-1 border bg-muted px-3 py-1 text-sm" title={tr("سعر أساسي لا يمكن حذفه")}>{tr(fk === "price_names" ? "سعر الشراء" : "سعر الكلفة")} 🔒</div>{names.map((n, i) => <div key={i} className="flex items-center gap-1 border px-2 py-1"><Input aria-label={`${title} ${i + 1}`} className="h-8 w-32" disabled={!editable} value={n} onChange={(e) => setForm({ ...form, [fk]: names.map((name, j) => j === i ? e.target.value : name).join("، ") })} /><Button size="sm" variant="ghost" aria-label="حذف" disabled={!editable} onClick={() => setForm({ ...form, [fk]: names.filter((_, j) => j !== i).join("، ") })}>×</Button></div>)}</div>
                    <div className="flex gap-2"><select aria-label={`إضافة خيار — ${title}`} className="h-9 rounded border bg-background px-2" value={choiceFor[fk] ?? choices[0]} onChange={(e) => setChoiceFor({ ...choiceFor, [fk]: e.target.value })}>{choices.map((n) => <option key={n} value={n}>{tr(n)}</option>)}</select><Button variant="outline" disabled={!editable} onClick={() => { const c = choiceFor[fk] ?? choices[0]; if (!names.includes(c)) setForm({ ...form, [fk]: [...names, c].join("، ") }); }}>{tr("إضافة خيار")}</Button></div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => save.mutate()} disabled={!editable || save.isPending}>
                  {tr(save.isPending ? "جارٍ الحفظ..." : "حفظ")}
                </Button>
              </div>
            </div>
          </div>) },
        { v: "repricing", l: "تسعير جديد", node: <RepricingCard editable={can(me, "products", "edit")} /> },
        { v: "units", l: "وحدات المواد", node: <UnitsCard kind="stock" editable={can(me, "products", "edit")} /> },
        { v: "service-units", l: "وحدات الخدمات", node: <UnitsCard kind="service" editable={can(me, "products", "edit")} /> },
      ] },
      { v: "org", l: "التنظيم", secs: [
        { v: "fiscal", l: "السنوات المالية", node: <FiscalYearCard tenantId={me!.tenantId!} isAdmin={admin} /> },
        { v: "branches", l: "الفروع", node: <BranchesCard tenantId={me!.tenantId!} isAdmin={admin} /> },
      ] },
    );
  }
  if (t && admin) mains.push({ v: "data", l: "البيانات", secs: [
    { v: "files", l: "ملفات البيانات", node: <DataFilesCard tenantName={me!.tenantName ?? ""} /> },
    { v: "backup", l: "النسخ الاحتياطي", node: (
      <div className="mb-8">
        <PageHeader title={tr("النسخ الاحتياطي والاسترجاع")}  subtitle={tr("تنزيل كل بيانات الشركة في ملف Excel (ورقة لكل جدول)، أو استرجاعها من ملف سابق")}  />
        <div className="flex max-w-3xl flex-wrap gap-2 rounded-lg border bg-card p-5">
          <BackupButtons tenantId={me!.tenantId!} name={me!.tenantName ?? "الشركة"} />
        </div>
        <div className="mt-4 max-w-3xl"><CloudBackupCard tenantId={me!.tenantId!} /></div>
      </div>) },
  ] });

  const main = (mains.find((m) => m.v === search.tab) ?? mains[0])!;
  const sec = (main.secs.find((x) => x.v === search.sec) ?? main.secs[0])!;
  const go = (tab: string, s?: string) => void navigate({ to: "/settings", search: { tab, sec: s }, replace: true });
  return (
    <div dir={dir}>
      <PageHeader title={tr("الإعدادات")}  subtitle={tr("اختر العنوان الرئيسي ثم القسم الفرعي")}  />
      <Tabs value={main.v} onValueChange={(v) => go(v)}>
        <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1">
          {mains.map((x) => <TabsTrigger key={x.v} value={x.v}>{tr(x.l)}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {main.secs.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-1 border-b pb-2">
          {main.secs.map((x) => (
            <Button key={x.v} size="sm" variant={x.v === sec.v ? "default" : "ghost"} onClick={() => go(main.v, x.v)}>{tr(x.l)}</Button>
          ))}
        </div>
      )}
      <div key={main.v + sec.v}>{sec.node}</div>
    </div>
  );
}

function ProfileCard() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["my_profile", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () =>
      (await db.from("profiles").select("full_name,phone,avatar_url").eq("id", me!.userId!).maybeSingle()).data,
  });

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.full_name ?? "");
      setPhone(profile.data.phone ?? "");
      setAvatar(profile.data.avatar_url ?? null);
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("profiles")
        .update({ full_name: name.trim(), phone: phone.trim() || null, avatar_url: avatar })
        .eq("id", me!.userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ بياناتك الشخصية");
      qc.invalidateQueries({ queryKey: ["my_profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const r = await processLogo(f);
      setAvatar(r.dataUrl);
    } catch {
      toast.error("تعذّر قراءة الصورة");
    }
  }

  return (
    <div className="mb-8">
      <PageHeader title="ملفي الشخصي" subtitle="اسمك ورقم هاتفك وصورتك — كلها اختيارية ويمكنك تعديلها في أي وقت" />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border bg-background">
            {avatar ? (
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">بدون صورة</span>
            )}
          </div>
          <div className="space-y-1">
            <Label>الصورة الشخصية (اختياري)</Label>
            <Input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center">
          <Label>الاسم الكامل</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك الكامل" />
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center">
          <Label>رقم الهاتف (اختياري)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" dir="ltr" className="text-right" />
        </div>
        <Button onClick={() => save.mutate()} disabled={!me?.userId || save.isPending || !name.trim()}>
          {save.isPending ? "جارٍ الحفظ..." : "حفظ بياناتي"}
        </Button>
      </div>
    </div>
  );
}

function BrandingCard({ tenantId, editable }: { tenantId: string | null; editable: boolean }) {
  const qc = useQueryClient();
  const brand = useBranding();
  const [logo, setLogo] = useState<string | null>(null);
  const [color, setColor] = useState<string>("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [taxNo, setTaxNo] = useState("");
  const [tpl, setTpl] = useState("modern");
  const [footer, setFooter] = useState("");
  const [lh, setLh] = useState<Record<string, string>>({});

  useEffect(() => {
    if (brand.data) {
      setLogo(brand.data.logo_url);
      setColor(brand.data.primary_color ?? "");
      setTaxNo(brand.data.tax_number ?? "");
      setTpl(brand.data.print_template ?? "modern");
      setFooter(brand.data.print_footer ?? "");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLh(((brand.data as any).letterhead ?? {}) as Record<string, string>);
    }
  }, [brand.data]);

  const save = useMutation({
    mutationFn: async (reset?: boolean) => {
      const { error } = await db.from("tenant_settings").upsert(
        { tenant_id: tenantId!, tax_number: taxNo.trim() || null, print_template: tpl, print_footer: footer.trim() || null, letterhead: lh },
        { onConflict: "tenant_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الطباعة");
      qc.invalidateQueries({ queryKey: ["branding"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const r = await processLogo(f);
      setLogo(r.dataUrl);
      setSuggested(r.colors);
      if (r.colors[0]) setColor(r.colors[0]);
    } catch {
      toast.error("تعذّر قراءة الصورة");
    }
  }

  return (
    <div className="mb-8">
      <PageHeader title="الشعار والألوان والطباعة" />
      <div className="mb-4 max-w-3xl rounded-lg border bg-card p-5"><BrandThemeEditor editable={editable} /></div>
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>الرقم الضريبي (يظهر في رمز QR للفاتورة)</Label>
            <Input value={taxNo} disabled={!editable} onChange={(e) => setTaxNo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>قالب طباعة الفواتير الافتراضي</Label>
            <select aria-label="قالب الطباعة" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={tpl} disabled={!editable} onChange={(e) => setTpl(e.target.value)}>
              <option value="modern">حديث ملوّن (A4)</option>
              <option value="classic">رسمي كلاسيكي (A4)</option>
              <option value="thermal">إيصال حراري 80mm</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>تذييل الفاتورة (شروط، عنوان، شكر...)</Label>
            <Input value={footer} disabled={!editable} onChange={(e) => setFooter(e.target.value)} />
          </div>
          <div className="sm:col-span-2 pt-2 text-sm font-semibold">ترويسة ورق الطباعة الرسمي</div>
          {([
            ["legal_name", "الاسم الرسمي للشركة"],
            ["cr_number", "رقم السجل التجاري"],
            ["phones", "أرقام الهواتف"],
            ["email", "البريد / الموقع"],
            ["address", "العنوان"],
            ["header_note", "عبارة تحت الاسم (النشاط أو الشعار النصي)"],
          ] as const).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label>{label}</Label>
              <Input value={lh[k] ?? ""} disabled={!editable} onChange={(e) => setLh({ ...lh, [k]: e.target.value })} />
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <Label>تذييل رسمي أسفل كل صفحة مطبوعة</Label>
            <Input value={lh["footer_note"] ?? ""} disabled={!editable} onChange={(e) => setLh({ ...lh, footer_note: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => save.mutate(false)} disabled={!editable || !tenantId || save.isPending}>حفظ إعدادات الطباعة</Button>
        </div>
      </div>
    </div>
  );
}

function ClosingSetupCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [links, setLinks] = useState<ClosingLinks>({});
  const closing = useQuery({ queryKey: ["closing_choices", tenantId], queryFn: async () => {
    const { data, error } = await db.from("accounts").select("id,code,name").eq("tenant_id", tenantId).eq("nature", "closing").eq("is_group", false).order("code");
    if (error) throw error;
    return (data ?? []) as { id: string; code: string; name: string }[];
  } });
  const saved = useQuery({ queryKey: ["closing_links", tenantId], queryFn: async () => {
    const { data, error } = await db.from("tenant_settings").select("closing_account_links").eq("tenant_id", tenantId).maybeSingle();
    if (error) throw error;
    return (data?.closing_account_links ?? {}) as ClosingLinks;
  } });
  useEffect(() => { if (saved.data) setLinks(saved.data); }, [saved.data]);
  const names = { balance_sheet: "الميزانية — الأصول والخصوم والزبائن والموردون", profit_loss: "الأرباح والخسائر", trading: "المتاجرة", operating: "التشغيل" };
  const run = useMutation({
    mutationFn: async () => {
      const result = await setupClosingAccounts(tenantId, links);
      const { error } = await db.from("tenant_settings").update({ closing_account_links: links }).eq("tenant_id", tenantId);
      if (error) throw error;
      return result;
    },
    onSuccess: (r) => {
      toast.success(`تم ربط ${r.linked} حساباً بالحسابات الختامية المختارة`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mb-8">
      <PageHeader title="ربط الحسابات الختامية" />
      <div className="max-w-3xl space-y-3 rounded-lg border bg-card p-5 text-sm">
        {CLOSING_STAGES.map((stage) => <div key={stage} className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center"><Label htmlFor={`closing-${stage}`}>{names[stage]}</Label><select id={`closing-${stage}`} className="h-9 rounded-md border bg-background px-2" value={links[stage] ?? ""} onChange={(e) => setLinks({ ...links, [stage]: e.target.value })}><option value="">— غير محدد —</option>{(closing.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div>)}
        <Button onClick={() => run.mutate()} disabled={run.isPending || !links.balance_sheet || !links.profit_loss}>{run.isPending ? "جارٍ الربط..." : "حفظ وربط الحسابات المختارة"}</Button>
      </div>
    </div>
  );
}
