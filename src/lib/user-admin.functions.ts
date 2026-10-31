import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Caller = { id: string; tenant_id: string | null; is_super_admin: boolean; is_tenant_admin: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function admin(): Promise<Any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Any;
}

/** Caller must be super admin, or tenant admin of the target user's company. */
async function guard(supabase: Any, callerId: string, targetId: string | null, tenantId?: string) {
  const { data: caller } = await supabase.from("profiles").select("id,tenant_id,is_super_admin,is_tenant_admin").eq("id", callerId).maybeSingle();
  const c = caller as Caller | null;
  if (!c) throw new Error("غير مسموح");
  const a = await admin();
  let target: Any = null;
  if (targetId) {
    target = (await a.from("profiles").select("id,tenant_id,email,full_name,is_super_admin,account_kind").eq("id", targetId).maybeSingle()).data;
    if (!target) throw new Error("المستخدم غير موجود");
  }
  const t = tenantId ?? target?.tenant_id;
  if (!c.is_super_admin) {
    if (target?.is_super_admin || !c.is_tenant_admin || c.tenant_id !== t) throw new Error("غير مسموح");
  }
  return { a, c, target };
}

export const getUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { a, target } = await guard(context.supabase, context.userId, data.userId);
    const [log, perms, prefs] = await Promise.all([
      a.from("audit_log").select("id,table_name,action,record_id,new_data,old_data,created_at").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(300),
      a.from("user_permissions").select("*").eq("user_id", data.userId).eq("tenant_id", target.tenant_id),
      a.from("user_prefs").select("extra").eq("user_id", data.userId).maybeSingle(),
    ]);
    return {
      log: (log.data ?? []) as Any[],
      perms: (perms.data ?? []) as Any[],
      navMode: ((prefs.data?.extra ?? {}) as Any).navMode ?? "single",
      accountKind: (target.account_kind ?? "standard") as string,
    };
  });

export const setUserPerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; module: string; field: "can_view" | "can_create" | "can_edit" | "can_delete"; value: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (!["can_view", "can_create", "can_edit", "can_delete"].includes(data.field)) throw new Error("حقل غير صالح");
    const { a, target } = await guard(context.supabase, context.userId, data.userId);
    const { data: ex } = await a.from("user_permissions").select("id").eq("user_id", data.userId).eq("tenant_id", target.tenant_id).eq("module", data.module).maybeSingle();
    const { error } = ex
      ? await a.from("user_permissions").update({ [data.field]: data.value }).eq("id", ex.id)
      : await a.from("user_permissions").insert({ tenant_id: target.tenant_id, user_id: data.userId, module: data.module, [data.field]: data.value });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setUserNavMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; mode: "windows" | "single" | "hybrid" }) => d)
  .handler(async ({ data, context }) => {
    if (!["windows", "single", "hybrid"].includes(data.mode)) throw new Error("نمط غير صالح");
    const { a } = await guard(context.supabase, context.userId, data.userId);
    const { data: row } = await a.from("user_prefs").select("extra").eq("user_id", data.userId).maybeSingle();
    const extra = { ...((row?.extra ?? {}) as object), navMode: data.mode };
    const { error } = row
      ? await a.from("user_prefs").update({ extra, updated_at: new Date().toISOString() }).eq("user_id", data.userId)
      : await a.from("user_prefs").insert({ user_id: data.userId, extra });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const ACCOUNT_KINDS = ["standard", "sales_cashier", "purchase_cashier", "warehouse_keeper", "projects_only"] as const;

/** Changes an existing user's account type (full menu, cashier, warehouse or projects-only). */
export const setUserAccountKind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; kind: (typeof ACCOUNT_KINDS)[number] }) => d)
  .handler(async ({ data, context }) => {
    if (!ACCOUNT_KINDS.includes(data.kind)) throw new Error("نوع غير صالح");
    if (data.userId === context.userId) throw new Error("لا يمكنك تغيير نوع حسابك بنفسك");
    const { a } = await guard(context.supabase, context.userId, data.userId);
    const { error } = await a.from("profiles").update({ account_kind: data.kind }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getCompanyModes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: c } = await (context.supabase as Any).from("profiles").select("tenant_id,is_super_admin,is_tenant_admin").eq("id", context.userId).maybeSingle() as { data: Caller | null };
    if (!c || (!c.is_super_admin && !c.is_tenant_admin)) return [];
    const a = await admin();
    let q = a.from("tenant_settings").select("tenant_id,operating_mode,bound_device_id");
    if (!c.is_super_admin) q = q.eq("tenant_id", c.tenant_id);
    return ((await q).data ?? []) as { tenant_id: string; operating_mode: string | null; bound_device_id: string | null }[];
  });

export const setCompanyOperatingMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; mode: "single_device" | "multi_device" }) => d)
  .handler(async ({ data, context }) => {
    if (!["single_device", "multi_device"].includes(data.mode)) throw new Error("نمط غير صالح");
    const { a } = await guard(context.supabase, context.userId, null, data.tenantId);
    // Releasing the bound device lets the next device that opens the company claim it.
    const { error } = await a.from("tenant_settings").update({ operating_mode: data.mode, bound_device_id: null }).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** System owner only: one-time sign-in link for a user; their password is never changed. */
export const impersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { a, c, target } = await guard(context.supabase, context.userId, data.userId);
    if (!c.is_super_admin) throw new Error("هذه العملية لمالك النظام فقط");
    if (!target.email) throw new Error("لا يوجد بريد لهذا المستخدم");
    const { data: link, error } = await a.auth.admin.generateLink({ type: "magiclink", email: target.email });
    if (error) throw new Error(error.message);
    await a.from("audit_log").insert({ tenant_id: target.tenant_id, user_id: context.userId, table_name: "impersonation", record_id: data.userId, action: "LOGIN_AS", new_data: { target: target.email } }).then(() => null, () => null);
    return { tokenHash: link.properties.hashed_token as string, email: target.email as string };
  });
