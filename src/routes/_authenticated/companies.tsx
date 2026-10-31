import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState } from "react";
import { db } from "@/lib/db";
import { startWork } from "@/lib/work-progress";
import { useMe } from "@/lib/session";
import { MODULE_LABEL, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, UserPlus, KeyRound, Trash2 } from "lucide-react";
import {
  createCompany,
  createUserAccount,
  setUserPassword,
  deleteUserAccount,
  deleteCompany,
} from "@/lib/admin.functions";
import { BackupButtons, ExportAllButton } from "@/components/BackupButtons";
import { UserAdminDialog } from "@/components/UserAdminDialog";
import { getCompanyModes, setCompanyOperatingMode } from "@/lib/user-admin.functions";

export const Route = createFileRoute("/_authenticated/companies")({
  head: () => ({ meta: [
    { title: "إدارة الشركات | يوسف سوفت" },
    { name: "description", content: "إنشاء الشركات وإدارة اشتراكاتها وحساباتها." },
    { property: "og:title", content: "إدارة الشركات | يوسف سوفت" },
    { property: "og:description", content: "إنشاء الشركات وإدارة اشتراكاتها وحساباتها." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CompaniesPage,
});

const MODULES = Object.keys(MODULE_LABEL).filter((m) => !m.startsWith("project_"));
const PROJECT_SUBMODULES = Object.keys(MODULE_LABEL).filter((m) => m.startsWith("project_"));
const SCOPES = [
  { value: "accounting", label: "محاسبة فقط" },
  { value: "both", label: "محاسبة وإدارة مشاريع" },
  { value: "projects", label: "إدارة مشاريع فقط" },
] as const;
const PLANS = [
  { value: "trial", label: "تجريبي مجاني (30 يوماً)" },
  { value: "yearly", label: "مدفوع سنوي (يجدد سنوياً)" },
];
const planEnd = (plan: string) => inDays(plan === "trial" ? 30 : 365);

function inDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const emptyCompany = {
  name: "",
  nameEn: "",
  code: "",
  plan: "trial",
  subEnd: inDays(30),
  maxUsers: 5,
  notes: "",
  framework: "unified" as "blank" | "unified" | "demo",
  scope: "both" as "accounting" | "both" | "projects",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  mustChangePassword: true,
};

function CompaniesPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [form, setForm] = useState(emptyCompany);
  const [userDialog, setUserDialog] = useState<{ tenantId: string; name: string } | null>(null);
  const [userForm, setUserForm] = useState({
    fullName: "",
    email: "",
    password: "",
    isTenantAdmin: false,
    isAuditor: false,
    mustChangePassword: true,
  });

  const deleteCompanyFn = useServerFn(deleteCompany);
  const createCompanyFn = useServerFn(createCompany);
  const createUserFn = useServerFn(createUserAccount);
  const setPasswordFn = useServerFn(setUserPassword);
  const deleteUserFn = useServerFn(deleteUserAccount);

  const tenants = useQuery({
    queryKey: ["tenants"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await db.from("tenants").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const features = useQuery({
    queryKey: ["tenant_features_all"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await db.from("tenant_features").select("*")).data ?? [],
  });

  const modesFn = useServerFn(getCompanyModes);
  const setModeFn = useServerFn(setCompanyOperatingMode);
  const modes = useQuery({ queryKey: ["company-modes"], queryFn: () => modesFn() });
  const modeOf = (t: string) => modes.data?.find((m) => m.tenant_id === t);
  const profiles = useQuery({
    queryKey: ["all_profiles"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await db.from("profiles").select("*").order("full_name")).data ?? [],
  });
  const tempPwds = useQuery({
    queryKey: ["all_profiles", "temp_passwords"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db as any).from("restored_user_passwords").select("user_id,temp_password");
      const m = new Map<string, string>();
      for (const r of data ?? []) m.set(r.user_id, r.temp_password);
      return m;
    },
  });
  const dismissTempPwd = async (userId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from("restored_user_passwords").delete().eq("user_id", userId);
    qc.invalidateQueries({ queryKey: ["all_profiles"] });
  };

  const addCompany = useMutation({
    mutationFn: async () => createCompanyFn({ data: form }),
    onSuccess: () => {
      toast.success("تم إنشاء الشركة وحساب مديرها");
      setOpen(false);
      setForm(emptyCompany);
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant_features_all"] });
      qc.invalidateQueries({ queryKey: ["all_profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addUser = useMutation({
    mutationFn: async () =>
      createUserFn({ data: { tenantId: userDialog!.tenantId, ...userForm } }),
    onSuccess: () => {
      toast.success("تم إنشاء حساب المستخدم");
      setUserDialog(null);
      setUserForm({ fullName: "", email: "", password: "", isTenantAdmin: false, isAuditor: false, mustChangePassword: true });
      qc.invalidateQueries({ queryKey: ["all_profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async (args: { userId: string; password: string }) => setPasswordFn({ data: args }),
    onSuccess: () => toast.success("تم تغيير كلمة المرور"),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeUser = useMutation({
    mutationFn: async (userId: string) => deleteUserFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("تم حذف الحساب");
      qc.invalidateQueries({ queryKey: ["all_profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleModule = useMutation({
    mutationFn: async (args: { tenantId: string; module: string; enabled: boolean }) => {
      // The projects module is one bundle: toggling it switches every project section too.
      const mods = args.module === "projects" ? ["projects", ...PROJECT_SUBMODULES] : [args.module];
      const { error } = await db
        .from("tenant_features")
        .upsert(
          mods.map((module) => ({ tenant_id: args.tenantId, module, enabled: args.enabled })),
          { onConflict: "tenant_id,module" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant_features_all"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTenant = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (args: { id: string; patch: any }) => {
      const { error } = await db.from("tenants").update(args.patch).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extend = useMutation({
    mutationFn: async (args: { t: { id: string; sub_end: string }; years: number }) => {
      const base = new Date(Math.max(new Date(args.t.sub_end).getTime(), Date.now()));
      const start = base.toISOString().slice(0, 10);
      base.setFullYear(base.getFullYear() + args.years);
      const end = base.toISOString().slice(0, 10);
      const { error } = await db.from("tenants").update({ plan: "yearly", sub_end: end, is_active: true }).eq("id", args.t.id);
      if (error) throw error;
      await db.from("subscription_history").insert({
        tenant_id: args.t.id, plan: "yearly", start_date: start, end_date: end, amount: 0,
        notes: `تمديد الاشتراك ${args.years} سنة`,
      });
    },
    onSuccess: () => {
      toast.success("تم تمديد الاشتراك");
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCompany = useMutation({
    mutationFn: async (tenantId: string) => deleteCompanyFn({ data: { tenantId } }),
    onSuccess: () => {
      toast.success("تم حذف الشركة وكل بياناتها");
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["all_profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  async function deleteSelected() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (tenants.data ?? []).filter((t: any) => selected.includes(t.id));
    const typed = window.prompt(
      `سيتم حذف ${list.length} شركة نهائياً مع كل بياناتها وحسابات مستخدميها:\n${list.map((t: any) => `• ${t.name}`).join("\n")}\n\nيُنصح بتصديرها أولاً. اكتب كلمة "حذف" للتأكيد:`,
    );
    if (typed === null) return;
    if (typed.trim() !== "حذف") { toast.error("لم يتم الحذف"); return; }
    setBulkDeleting(true);
    const failed: string[] = [];
    const work = startWork("حذف الشركات", list.length);
    try {
    for (const [index, t] of list.entries()) {
      work.update(`حذف ${t.name}`, index);
      try { await deleteCompanyFn({ data: { tenantId: t.id } }); } catch (e) { failed.push(`${t.name}: ${(e as Error).message}`); }
      work.update(`حذف ${t.name}`, index + 1);
    }
    } finally { work.finish(); setBulkDeleting(false); }
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["tenants"] });
    qc.invalidateQueries({ queryKey: ["all_profiles"] });
    if (failed.length) toast.error(`تعذر حذف ${failed.length} شركة`, { description: failed.join("\n") });
    else toast.success(`تم حذف ${list.length} شركة`);
  }

  if (me && !me.isSuperAdmin) {
    return <p className="text-muted-foreground">هذه الصفحة مخصصة لمالك النظام فقط.</p>;
  }

  function isOn(tenantId: string, module: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (features.data ?? []).find((f: any) => f.tenant_id === tenantId && f.module === module);
    return row ? !!row.enabled : true;
  }

  function usersOf(tenantId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (profiles.data ?? []).filter((p: any) => p.tenant_id === tenantId);
  }

  return (
    <div>
      <PageHeader
        title="لوحة مدير النظام"
        subtitle="إنشاء حسابات الشركات ومستخدميها مباشرة، وضبط الاشتراك والواجهات المتاحة لكل شركة"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            حساب شركة جديد
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
        <Input placeholder="بحث باسم الشركة أو رمزها أو الهاتف..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">كل الشركات</option>
          <option value="active">المفعّلة</option>
          <option value="inactive">الموقوفة</option>
          <option value="expired">اشتراك منتهٍ</option>
        </select>
        <ExportAllButton tenants={(tenants.data ?? []).map((t: any) => ({ id: t.id, name: t.name }))} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!tenants.data?.length && selected.length === tenants.data.length}
            onChange={(e) => setSelected(e.target.checked ? (tenants.data ?? []).map((t: any) => t.id) : [])}
          />
          تحديد الكل
        </label>
        <span className="text-sm text-muted-foreground">المحدد: {selected.length}</span>
        {selected.length > 0 && (
          <>
            <ExportAllButton
              label="تصدير المحدد"
              tenants={(tenants.data ?? []).filter((t: any) => selected.includes(t.id)).map((t: any) => ({ id: t.id, name: t.name }))}
            />
            <Button variant="destructive" size="sm" disabled={bulkDeleting} onClick={deleteSelected}>
              <Trash2 className="size-4" />
              {bulkDeleting ? "جارٍ الحذف..." : `حذف المحدد (${selected.length})`}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>إلغاء التحديد</Button>
          </>
        )}
      </div>
      <div className="space-y-5">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(tenants.data ?? []).filter((t: any) => {
          const term = q.trim().toLowerCase();
          if (term && ![t.name, t.name_en, t.code, t.phone].some((v) => String(v ?? "").toLowerCase().includes(term))) return false;
          const exp = t.sub_end && new Date(t.sub_end) < new Date();
          if (statusF === "active") return !!t.is_active;
          if (statusF === "inactive") return !t.is_active;
          if (statusF === "expired") return !!exp;
          return true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }).map((t: any) => {
          const expired = t.sub_end && new Date(t.sub_end) < new Date();
          return (
            <div key={t.id} className={`rounded-lg border bg-card p-5 ${selected.includes(t.id) ? "ring-2 ring-primary" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5 size-4"
                    aria-label={`تحديد ${t.name}`}
                    checked={selected.includes(t.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id)))}
                  />
                <div>
                  <h2 className="font-bold">
                    {t.name}{" "}
                    <span className="text-sm font-normal text-muted-foreground">({t.code ?? "—"})</span>
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    الاشتراك: {PLANS.find((p) => p.value === t.plan)?.label ?? t.plan} · ينتهي{" "}
                    {fmtDate(t.sub_end)} {expired ? "· منتهي" : ""} · المستخدمون {usersOf(t.id).length}/
                    {t.max_users}
                  </p>
                </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    مفعّلة
                    <Switch
                      checked={!!t.is_active}
                      onCheckedChange={(v) => updateTenant.mutate({ id: t.id, patch: { is_active: v } })}
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUserDialog({ tenantId: t.id, name: t.name })}
                  >
                    <UserPlus className="size-4" />
                    مستخدم جديد
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={extend.isPending}
                    onClick={() => {
                      const y = window.prompt("تمديد الاشتراك المدفوع لعدد سنوات:", "1");
                      if (y && Number(y) > 0) extend.mutate({ t, years: Number(y) });
                    }}
                  >
                    تمديد الاشتراك
                  </Button>
                  <BackupButtons tenantId={t.id} name={t.name} />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={removeCompany.isPending}
                    onClick={() => {
                      const typed = window.prompt(
                        `سيتم حذف شركة "${t.name}" وكل بياناتها وحسابات مستخدميها نهائياً.\nيُنصح بأخذ نسخة احتياطية أولاً.\nاكتب اسم الشركة للتأكيد:`,
                      );
                      if (typed === t.name) removeCompany.mutate(t.id);
                      else if (typed !== null) toast.error("الاسم غير مطابق، لم يتم الحذف");
                    }}
                  >
                    <Trash2 className="size-4" />
                    حذف الشركة
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-xs">الخطة</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={t.plan}
                    onChange={(e) => updateTenant.mutate({ id: t.id, patch: { plan: e.target.value } })}
                  >
                    {!PLANS.some((p) => p.value === t.plan) && <option value={t.plan}>{t.plan}</option>}
                    {PLANS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">نهاية الاشتراك</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    defaultValue={t.sub_end}
                    onBlur={(e) =>
                      e.target.value !== t.sub_end &&
                      updateTenant.mutate({ id: t.id, patch: { sub_end: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">حد المستخدمين</Label>
                  <Input
                    type="number"
                    min={1}
                    className="mt-1"
                    defaultValue={t.max_users}
                    onBlur={(e) =>
                      Number(e.target.value) !== t.max_users &&
                      updateTenant.mutate({ id: t.id, patch: { max_users: Number(e.target.value) } })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">ملاحظات</Label>
                  <Input
                    className="mt-1"
                    defaultValue={t.notes ?? ""}
                    onBlur={(e) =>
                      (e.target.value || null) !== t.notes &&
                      updateTenant.mutate({ id: t.id, patch: { notes: e.target.value || null } })
                    }
                  />
                </div>
              </div>

              <h3 className="mt-5 text-sm font-semibold">حسابات المستخدمين</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="border px-2 py-2 text-right">الاسم</th>
                      <th className="border px-2 py-2 text-right">البريد</th>
                      <th className="border px-2 py-2 text-center">مدير الشركة</th>
                      <th className="border px-2 py-2 text-center">نشط</th>
                      <th className="border px-2 py-2 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersOf(t.id).length === 0 && (
                      <tr>
                        <td colSpan={5} className="border px-2 py-3 text-center text-muted-foreground">
                          لا يوجد مستخدمون
                        </td>
                      </tr>
                    )}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {usersOf(t.id).map((u: any) => (
                      <tr key={u.id}>
                        <td className="border px-2 py-2">{u.full_name}</td>
                        <td className="border px-2 py-2" dir="ltr">
                          {u.email}
                          {tempPwds.data?.get(u.id) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" dir="rtl">
                              <span className="text-muted-foreground">كلمة مرور مؤقتة:</span>
                              <code className="rounded bg-muted px-1.5 py-0.5 font-mono" dir="ltr">
                                {tempPwds.data.get(u.id)}
                              </code>
                              <button
                                type="button"
                                className="text-primary underline"
                                onClick={() => {
                                  navigator.clipboard.writeText(`${u.email}\n${tempPwds.data?.get(u.id)}`);
                                  toast.success("تم نسخ البريد وكلمة المرور");
                                }}
                              >
                                نسخ
                              </button>
                              <button
                                type="button"
                                className="text-muted-foreground underline"
                                onClick={() => dismissTempPwd(u.id)}
                              >
                                إخفاء
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="border px-2 py-2 text-center">{u.is_tenant_admin ? "نعم" : u.is_auditor ? "مدقق" : "—"}</td>
                        <td className="border px-2 py-2 text-center">
                          <Switch
                            checked={!!u.is_active}
                            onCheckedChange={async (v) => {
                              const { error } = await db
                                .from("profiles")
                                .update({ is_active: v })
                                .eq("id", u.id);
                              if (error) toast.error(error.message);
                              else qc.invalidateQueries({ queryKey: ["all_profiles"] });
                            }}
                          />
                        </td>
                        <td className="border px-2 py-2">
                          <div className="flex justify-center gap-2">
                            <UserAdminDialog user={u} canImpersonate={!!me?.isSuperAdmin && u.id !== me?.userId} />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const pwd = window.prompt(`كلمة مرور جديدة لـ ${u.full_name}`);
                                if (pwd) resetPassword.mutate({ userId: u.id, password: pwd });
                              }}
                            >
                              <KeyRound className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`حذف حساب ${u.full_name} نهائياً؟`))
                                  removeUser.mutate(u.id);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="mt-5 text-sm font-semibold">نمط التشغيل</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {([["single_device", "جهاز واحد (يعمل دون إنترنت)"], ["multi_device", "أجهزة متعددة (يحتاج إنترنت)"]] as const).map(([v, l]) => (
                  <Button key={v} size="sm" variant={(modeOf(t.id)?.operating_mode ?? "multi_device") === v ? "default" : "outline"}
                    onClick={() => { if (!confirm(`تحويل ${t.name} إلى نمط ${l}؟ سيُلغى ربط الجهاز المعتمد الحالي وأول جهاز يفتح الشركة يصبح المعتمد.`)) return;
                      setModeFn({ data: { tenantId: t.id, mode: v } }).then(() => { toast.success("تم تغيير النمط"); void modes.refetch(); }, (e: Error) => toast.error(e.message)); }}>{l}</Button>
                ))}
                {modeOf(t.id)?.bound_device_id && <span className="text-xs text-muted-foreground" dir="ltr">الجهاز المعتمد: {modeOf(t.id)!.bound_device_id!.slice(0, 8)}</span>}
              </div>

              <h3 className="mt-5 text-sm font-semibold">الواجهات المتاحة</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {MODULES.map((m) => (
                  <div key={m} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm">{MODULE_LABEL[m]}</span>
                    <Switch
                      checked={isOn(t.id, m)}
                      onCheckedChange={(v) => toggleModule.mutate({ tenantId: t.id, module: m, enabled: v })}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>حساب شركة جديد</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>اسم الشركة</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>اسم الشركة بالإنكليزية <span className="text-xs text-muted-foreground">(اختياري)</span></Label>
              <Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="Company name" />
            </div>
            <div className="space-y-1">
              <Label>الرمز <span className="text-xs text-muted-foreground">(اختياري)</span></Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>الخطة</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value, subEnd: planEnd(e.target.value) })}
              >
                {PLANS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>نهاية الاشتراك</Label>
              <Input
                type="date"
                value={form.subEnd}
                onChange={(e) => setForm({ ...form, subEnd: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>حد المستخدمين</Label>
              <Input
                type="number"
                min={1}
                value={form.maxUsers}
                onChange={(e) => setForm({ ...form, maxUsers: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>نطاق عمل الشركة *</Label>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="نطاق عمل الشركة">
                {SCOPES.map((sc) => (
                  <button key={sc.value} type="button" role="radio" aria-checked={form.scope === sc.value}
                    onClick={() => setForm({ ...form, scope: sc.value })}
                    className={"rounded-lg border p-2 text-sm font-semibold transition " + (form.scope === sc.value ? "border-primary bg-primary/10" : "hover:bg-accent")}>
                    {sc.label}
                  </button>
                ))}
              </div>
            </div>
            {form.scope !== "projects" && <div className="space-y-1 sm:col-span-2">
              <Label>تهيئة النظام المحاسبي *</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.framework}
                onChange={(e) =>
                  setForm({ ...form, framework: e.target.value as "blank" | "unified" | "demo" })
                }
              >
                <option value="blank">نظام فارغ — بدون أي حسابات</option>
                <option value="unified">نظام محاسبي موحد — دليل حسابات قياسي عربي/إنكليزي</option>
                <option value="demo">نظام مع بيانات تجريبية — دليل + مواد ومشاريع وموردين وأرصدة افتتاحية</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {form.framework === "blank"
                  ? "تبدأ الشركة فارغة تماماً وتُدخل حساباتها بنفسها."
                  : form.framework === "unified"
                    ? "يتم إنشاء دليل حسابات هرمي كامل وربط حسابات الترحيل التلقائي."
                    : "دليل حسابات كامل مع مستودعات ومواد وزبائن وموردين ومشاريع وقيد أرصدة افتتاحية."}
              </p>
            </div>}
            <div className="space-y-1">
              <Label>ملاحظات <span className="text-xs text-muted-foreground">(اختياري)</span></Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="sm:col-span-2 mt-2 border-t pt-3 text-sm font-semibold">حساب مدير الشركة</div>
            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>البريد الإلكتروني (اسم الدخول)</Label>
              <Input
                dir="ltr"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>كلمة المرور</Label>
              <PasswordInput
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Switch
                checked={form.mustChangePassword}
                onCheckedChange={(v) => setForm({ ...form, mustChangePassword: v })}
              />
              إلزام المستخدم بتغيير كلمة المرور عند أول دخول
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={() => addCompany.mutate()}
              disabled={
                addCompany.isPending ||
                !form.name ||
                !form.adminName ||
                !form.adminEmail ||
                form.adminPassword.length < 6
              }
            >
              {addCompany.isPending ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!userDialog} onOpenChange={(v) => !v && setUserDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>مستخدم جديد في {userDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input
                value={userForm.fullName}
                onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>البريد الإلكتروني (اسم الدخول)</Label>
              <Input
                dir="ltr"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور</Label>
              <PasswordInput
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={userForm.mustChangePassword}
                onCheckedChange={(v) => setUserForm({ ...userForm, mustChangePassword: v })}
              />
              إلزام المستخدم بتغيير كلمة المرور عند أول دخول
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={userForm.isTenantAdmin}
                onCheckedChange={(v) => setUserForm({ ...userForm, isTenantAdmin: v })}
              />
              مدير الشركة (صلاحيات كاملة)
            </label>
            {!userForm.isTenantAdmin && (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={userForm.isAuditor}
                  onCheckedChange={(v) => setUserForm({ ...userForm, isAuditor: v })}
                />
                حساب مدقق
              </label>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => addUser.mutate()}
              disabled={
                addUser.isPending ||
                !userForm.fullName ||
                !userForm.email ||
                userForm.password.length < 6
              }
            >
              {addUser.isPending ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
