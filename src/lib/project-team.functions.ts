import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isProjectModule } from "@/lib/project-presets";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Field = "can_view" | "can_create" | "can_edit" | "can_delete";

/** Caller must be a tenant admin or hold the project_users permission for the requested action. */
async function teamGuard(supabase: Any, userId: string, field: Field) {
  const { data: me } = await supabase.from("profiles").select("id,tenant_id,is_super_admin,is_tenant_admin").eq("id", userId).maybeSingle();
  if (!me?.tenant_id) throw new Error("غير مسموح");
  if (!me.is_tenant_admin && !me.is_super_admin) {
    const { data: p } = await supabase.from("user_permissions").select(field).eq("user_id", userId).eq("module", "project_users").maybeSingle();
    if (!p?.[field]) throw new Error("لا تملك صلاحية إدارة مستخدمي المشاريع");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { a: supabaseAdmin as Any, tenantId: me.tenant_id as string, isAdmin: !!(me.is_tenant_admin || me.is_super_admin) };
}

/** Project-only users of the caller's company with their permissions and recent sign-ins. */
export const listProjectTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { a, tenantId } = await teamGuard(context.supabase, context.userId, "can_view");
    const { data: users } = await a.from("profiles").select("id,full_name,email,is_active").eq("tenant_id", tenantId).eq("account_kind", "projects_only").order("full_name");
    const ids = (users ?? []).map((u: Any) => u.id);
    const [perms, logins] = ids.length ? await Promise.all([
      a.from("user_permissions").select("user_id,module,can_view,can_create,can_edit,can_delete").eq("tenant_id", tenantId).in("user_id", ids),
      a.from("login_events").select("id,user_id,event,created_at,ip,user_agent").in("user_id", ids).order("created_at", { ascending: false }).limit(300),
    ]) : [{ data: [] }, { data: [] }];
    return {
      users: (users ?? []) as { id: string; full_name: string | null; email: string | null; is_active: boolean | null }[],
      perms: ((perms.data ?? []) as Any[]).filter((p) => isProjectModule(p.module)) as { user_id: string; module: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }[],
      logins: (logins.data ?? []) as { id: string; user_id: string; event: string; created_at: string; ip: string | null; user_agent: string | null }[],
    };
  });

/** Changes one project permission of a project-only user; only admins may grant team management itself. */
export const setProjectTeamPerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; module: string; field: Field; value: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (!["can_view", "can_create", "can_edit", "can_delete"].includes(data.field)) throw new Error("حقل غير صالح");
    if (!isProjectModule(data.module)) throw new Error("يمكن تعديل صلاحيات المشاريع فقط");
    if (data.userId === context.userId) throw new Error("لا يمكنك تعديل صلاحياتك بنفسك");
    const { a, tenantId, isAdmin } = await teamGuard(context.supabase, context.userId, "can_edit");
    if (data.module === "project_users" && !isAdmin) throw new Error("فقط مدير الشركة يمنح صلاحية إدارة الفريق");
    const { data: t } = await a.from("profiles").select("tenant_id,account_kind").eq("id", data.userId).maybeSingle();
    if (!t || t.tenant_id !== tenantId || t.account_kind !== "projects_only") throw new Error("المستخدم ليس من فريق المشاريع");
    const { data: ex } = await a.from("user_permissions").select("id").eq("user_id", data.userId).eq("tenant_id", tenantId).eq("module", data.module).maybeSingle();
    const { error } = ex
      ? await a.from("user_permissions").update({ [data.field]: data.value }).eq("id", ex.id)
      : await a.from("user_permissions").insert({ tenant_id: tenantId, user_id: data.userId, module: data.module, [data.field]: data.value });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Loads a target that must be a project-only member of the caller's company — never accounting/admin accounts. */
async function projectTarget(a: Any, tenantId: string, userId: string) {
  const { data: t } = await a.from("profiles").select("id,tenant_id,account_kind,is_tenant_admin,is_super_admin").eq("id", userId).maybeSingle();
  if (!t || t.tenant_id !== tenantId || t.account_kind !== "projects_only" || t.is_tenant_admin || t.is_super_admin) {
    throw new Error("يمكنك إدارة مستخدمي المشاريع فقط");
  }
  return t;
}

/** Suspends or re-activates a project-only user. */
export const setProjectTeamActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; active: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) throw new Error("لا يمكنك إيقاف حسابك");
    const { a, tenantId } = await teamGuard(context.supabase, context.userId, "can_edit");
    await projectTarget(a, tenantId, data.userId);
    const { error } = await a.from("profiles").update({ is_active: !!data.active }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    const ban = await a.auth.admin.updateUserById(data.userId, { ban_duration: data.active ? "none" : "876000h" });
    if (ban.error) throw new Error(ban.error.message);
    return { ok: true as const };
  });

/** Deletes a project-only user account. */
export const deleteProjectTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) throw new Error("لا يمكنك حذف حسابك");
    const { a, tenantId } = await teamGuard(context.supabase, context.userId, "can_delete");
    await projectTarget(a, tenantId, data.userId);
    await a.from("user_permissions").delete().eq("user_id", data.userId);
    await a.from("profiles").delete().eq("id", data.userId);
    const { error } = await a.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
