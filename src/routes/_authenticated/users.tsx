import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe, isProjectsOnlyTenant } from "@/lib/session";
import { PROJECT_PRESETS, isProjectModule } from "@/lib/project-presets";
import { MODULE_LABEL } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { NewUserDialog } from "@/components/NewUserDialog";
import { UserPatternAccess } from "@/components/UserPatternAccess";
import { UserStationAccess } from "@/components/UserStationAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { processLogo } from "@/lib/branding";
import { useBranches } from "@/components/BranchSwitcher";
import { LoginLog } from "@/components/LoginLog";
import { useServerFn } from "@tanstack/react-start";
import { deleteUserAccount, setUserActive } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/users")({ head: () => pageHead("المستخدمون وسجل الدخول", "إدارة المستخدمين وعرض جلسات الدخول والخروج. في يوسف سوفت."), component: UsersPage });

const MODULES = Object.keys(MODULE_LABEL);
const ACTIONS = [
  { key: "can_view", label: "استعراض" },
  { key: "can_create", label: "إضافة" },
  { key: "can_edit", label: "تعديل" },
  { key: "can_delete", label: "حذف" },
] as const;

const FULL = { can_view: true, can_create: true, can_edit: true, can_delete: false };
const VIEW = { can_view: true, can_create: false, can_edit: false, can_delete: false };
type RolePreset = { key: string; label: string; perms: Record<string, typeof FULL> };
const PROJECT_ROLE_PRESETS: RolePreset[] = PROJECT_PRESETS.map((p) => ({ key: p.id, label: p.label, perms: p.perms }));
const ROLE_PRESETS: RolePreset[] = [
  { key: "sales", label: "مستخدم مبيعات", perms: { sales: FULL, partners: FULL, products: VIEW, reports: VIEW } },
  { key: "purchases", label: "مستخدم مشتريات", perms: { purchases: FULL, partners: FULL, products: VIEW, reports: VIEW } },
  { key: "inventory", label: "أمين مستودع", perms: { inventory: FULL, products: FULL, warehouses: FULL, stock: FULL, reports: VIEW } },
];

export function UsersPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const editable = can(me, "users", "edit");
  // A company subscribed to project management only sees project permissions only.
  const projectsTenant = isProjectsOnlyTenant(me);
  // Accounting-only companies (projects feature off) never see project permissions.
  const noProjects = !projectsTenant && me?.features?.["projects"] === false;
  const modules = projectsTenant ? MODULES.filter(isProjectModule) : noProjects ? MODULES.filter((m) => !isProjectModule(m)) : MODULES;
  const presets = projectsTenant ? PROJECT_ROLE_PRESETS : ROLE_PRESETS;
  const [shown, setShown] = useState<Record<string, boolean>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);

  const users = useQuery({
    queryKey: ["profiles", me?.tenantId],
    enabled: !!me,
    queryFn: async () => (await scope(db.from("profiles").select("*"), me?.tenantId).order("full_name")).data ?? [],
  });

  const perms = useQuery({
    queryKey: ["all_perms", me?.tenantId],
    enabled: !!me,
    queryFn: async () => (await scope(db.from("user_permissions").select("*"), me?.tenantId)).data ?? [],
  });

  const setPerm = useMutation({
    mutationFn: async (args: { userId: string; module: string; field: string; value: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = (perms.data ?? []).find((p: any) => p.user_id === args.userId && p.module === args.module);
      if (existing) {
        const { error } = await db
          .from("user_permissions")
          .update({ [args.field]: args.value })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("user_permissions").insert({
          tenant_id: me?.tenantId,
          user_id: args.userId,
          module: args.module,
          [args.field]: args.value,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all_perms"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const applyPreset = useMutation({
    mutationFn: async (args: { userId: string; preset: RolePreset }) => {
      for (const [module, p] of Object.entries(args.preset.perms)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = (perms.data ?? []).find((x: any) => x.user_id === args.userId && x.module === module);
        const { error } = existing
          ? await db.from("user_permissions").update(p).eq("id", existing.id)
          : await db.from("user_permissions").insert({ tenant_id: me?.tenantId, user_id: args.userId, module, ...p });
        if (error) throw error;
      }
    },
    onSuccess: (_d, a) => { toast.success(`تم منح صلاحيات ${a.preset.label}`); qc.invalidateQueries({ queryKey: ["all_perms"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeFn = useServerFn(setUserActive);
  const deleteFn = useServerFn(deleteUserAccount);
  const canDelete = can(me, "users", "delete");
  const toggleActive = useMutation({
    mutationFn: (a: { userId: string; active: boolean }) => activeFn({ data: a }),
    onSuccess: (_d, a) => { toast.success(a.active ? "تم تفعيل الحساب" : "تم إيقاف الحساب مؤقتاً"); qc.invalidateQueries({ queryKey: ["profiles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeUser = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => { toast.success("تم حذف المستخدم"); qc.invalidateQueries({ queryKey: ["profiles"] }); qc.invalidateQueries({ queryKey: ["all_perms"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function value(userId: string, module: string, field: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (perms.data ?? []).find((x: any) => x.user_id === userId && x.module === module);
    return p ? !!p[field] : false;
  }

  return (
    <div>
      <PageHeader
        title="المستخدمون والصلاحيات"
        subtitle={projectsTenant ? "تحديد صلاحيات كل مستخدم على أقسام المشاريع" : "تحديد صلاحيات الإضافة والتعديل والحذف والاستعراض لكل مستخدم على كل بطاقة ودفتر"}
      />
      {me?.tenantId && can(me, "users", "create") && (
        <div className="mb-4 flex justify-end">
          <NewUserDialog
            tenantId={me.tenantId}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            allowAdmin={me.isSuperAdmin || !!(me as any).isTenantAdmin}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ["profiles"] });
              qc.invalidateQueries({ queryKey: ["all_perms"] });
            }}
          />
        </div>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <LoginLog names={Object.fromEntries((users.data ?? []).map((u: any) => [u.id, u.full_name || u.email || u.id]))} />
      <div className="space-y-6">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(users.data ?? []).map((u: any) => (
          <div key={u.id} className="rounded-lg border bg-card p-5">
            <button type="button" className="flex w-full items-center justify-between text-start" onClick={() => setShown((s) => ({ ...s, [u.id]: !s[u.id] }))}>
              <h2 className="font-bold">
                {u.full_name}{" "}
                {u.is_active === false && <span className="ms-1 rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">موقوف مؤقتاً</span>}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {u.email} {u.is_super_admin ? "· مالك النظام" : ""}
                  {me?.hasBranches ? ` · ${u.branch_id ? "فرع محدد" : "كل الفروع"}` : ""}
                </span>
              </h2>
              <span className="flex items-center gap-3">
                {editable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(u);
                    }}
                  >
                    تعديل البيانات
                  </Button>
                )}
                {editable && u.id !== me?.userId && !u.is_super_admin && (
                  <Button type="button" variant="outline" size="sm" disabled={toggleActive.isPending}
                    onClick={(e) => { e.stopPropagation(); if (u.is_active === false || confirm(`إيقاف حساب ${u.full_name || u.email} مؤقتاً؟ لن يتمكن من الدخول حتى تعيد تفعيله.`)) toggleActive.mutate({ userId: u.id, active: u.is_active === false }); }}>
                    {u.is_active === false ? "إعادة التفعيل" : "إيقاف مؤقت"}
                  </Button>
                )}
                {canDelete && u.id !== me?.userId && !u.is_super_admin && (
                  <Button type="button" variant="destructive" size="sm" disabled={removeUser.isPending}
                    onClick={(e) => { e.stopPropagation(); if (confirm(`حذف المستخدم ${u.full_name || u.email} نهائياً مع صلاحياته؟ لا يمكن التراجع.`)) removeUser.mutate(u.id); }}>
                    حذف
                  </Button>
                )}
                <span className="text-sm text-primary">{shown[u.id] ? "إخفاء الصلاحيات ▲" : "عرض الصلاحيات ▼"}</span>
              </span>
            </button>
            {shown[u.id] && editable && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">صلاحيات جاهزة:</span>
                {presets.map((r) => (
                  <Button key={r.key} type="button" size="sm" variant="secondary" disabled={applyPreset.isPending} onClick={() => applyPreset.mutate({ userId: u.id, preset: r })}>{r.label}</Button>
                ))}
              </div>
            )}
            {shown[u.id] && <div className="mt-3 overflow-x-auto">
              <table className="w-full border text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="border px-2 py-2 text-right">الواجهة</th>
                    {ACTIONS.map((a) => (
                      <th key={a.key} className="border px-2 py-2 text-center">
                        {a.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m}>
                      <td className="border px-2 py-2">{MODULE_LABEL[m]}</td>
                      {ACTIONS.map((a) => (
                        <td key={a.key} className="border px-2 py-2 text-center">
                          <Checkbox
                            checked={value(u.id, m, a.key)}
                            disabled={!editable}
                            onCheckedChange={(v) =>
                              setPerm.mutate({ userId: u.id, module: m, field: a.key, value: !!v })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {me?.tenantId && <UserPatternAccess userId={u.id} tenantId={me.tenantId} editable={editable} />}
              {me?.tenantId && <UserStationAccess userId={u.id} tenantId={me.tenantId} editable={editable} />}
            </div>}
          </div>
        ))}
      </div>
      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["profiles"] });
        }}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditUserDialog({ user, onClose, onSaved }: { user: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [branch, setBranch] = useState("");
  const { data: me } = useMe();
  const branches = useBranches(me?.hasBranches ? me.tenantId : null);

  useEffect(() => {
    if (user) {
      setName(user.full_name ?? "");
      setPhone(user.phone ?? "");
      setAvatar(user.avatar_url ?? null);
      setBranch(user.branch_id ?? "");
    }
  }, [user]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("profiles")
        .update({ full_name: name.trim(), phone: phone.trim() || null, avatar_url: avatar, ...(me?.hasBranches ? { branch_id: branch || null } : {}) })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات المستخدم");
      onSaved();
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
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل بيانات المستخدم</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border bg-background">
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
          <div className="space-y-1">
            <Label>الاسم الكامل</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>رقم الهاتف (اختياري)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="text-right" />
          </div>
          {me?.hasBranches && (
            <div className="space-y-1">
              <Label>الفرع</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">كل الفروع (محاسب عام / مدير)</option>
                {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">مستخدم الفرع يرى ويُدخل بيانات فرعه فقط.</p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">البريد الإلكتروني: {user?.email}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
            {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
