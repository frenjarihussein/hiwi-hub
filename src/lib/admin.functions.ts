import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { keepProjectPerms, projectsOnlyFeatures } from "@/lib/project-presets";

const MODULES = [
  "accounts",
  "journal",
  "documents",
  "partners",
  "cheques",
  "assets",
  "products",
  "warehouses",
  "stock",
  "projects",
  "payroll",
  "reports",
  "users",
  "audit",
];

type Caller = {
  id: string;
  tenant_id: string | null;
  is_super_admin: boolean;
  is_tenant_admin: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadCaller(supabase: any, userId: string): Promise<Caller> {
  const { data } = await supabase
    .from("profiles")
    .select("id,tenant_id,is_super_admin,is_tenant_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!data) throw new Error("لا يوجد ملف مستخدم لهذا الحساب");
  return data as Caller;
}

/** Company admins, and managers granted the users permission (e.g. project managers), manage users of their own company only. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCanManageUser(supabase: any, caller: Caller, target: { tenant_id: string | null; is_super_admin: boolean }, action: "edit" | "delete") {
  if (caller.is_super_admin) return;
  if (target.is_super_admin || caller.tenant_id !== target.tenant_id) throw new Error("غير مسموح");
  if (caller.is_tenant_admin) return;
  const { data } = await supabase.rpc("has_perm", { _module: "users", _action: action });
  if (data !== true) throw new Error("ليست لديك صلاحية إدارة المستخدمين");
}

function assertPassword(password: string) {
  if (!password || password.length < 6) throw new Error("كلمة المرور يجب ألا تقل عن 6 محارف");
}

/** Creates the very first system owner. Refuses once an owner exists. */
export const bootstrapOwner = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; fullName: string }) => d)
  .handler(async ({ data }) => {
    assertPassword(data.password);
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_super_admin", true);
    if ((count ?? 0) > 0) throw new Error("تم إنشاء حساب مالك النظام مسبقاً");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);

    const { error: pErr } = await supabaseAdmin.from("profiles").upsert({
      id: created.user!.id,
      email: data.email,
      full_name: data.fullName,
      tenant_id: null,
      is_super_admin: true,
      is_active: true,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user!.id);
      throw new Error(pErr.message);
    }
    return { ok: true as const };
  });

/** True when no system owner exists yet (drives the bootstrap form). */
export const ownerExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_super_admin", true);
  return { exists: (count ?? 0) > 0 };
});


/** Seeds the chosen accounting framework into a brand-new tenant. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedFramework(supabaseAdmin: any, tenantId: string, framework: string) {
  if (framework === "blank") return;
  const { chartFor, settingsMapFor, DEMO_WAREHOUSES, DEMO_PRODUCTS, DEMO_PARTNERS, DEMO_PROJECTS, DEMO_OPENING, DEMO_COST_CENTERS } =
    await import("@/lib/coa-seed");

  const { data: config } = await supabaseAdmin.from("tenant_settings").select("inventory_method,base_currency").eq("tenant_id", tenantId).maybeSingle();
  const periodic = config?.inventory_method === "periodic";
  const chart = chartFor(config?.inventory_method);
  const idByCode: Record<string, string> = {};
  // Insert level by level so parent ids exist first.
  const levels: (typeof chart)[] = [];
  const remaining = [...chart];
  let guard = 0;
  while (remaining.length && guard++ < 10) {
    const ready = remaining.filter((a) => !a.parent || levels.flat().some((x) => x.code === a.parent));
    if (!ready.length) break;
    levels.push(ready);
    ready.forEach((r) => remaining.splice(remaining.indexOf(r), 1));
  }
  for (const level of levels) {
    const { data, error } = await supabaseAdmin
      .from("accounts")
      .insert(
        level.map((a) => ({
          tenant_id: tenantId,
          code: a.code,
          name: a.name,
          notes: a.nameEn,
          nature: a.nature,
          currency: config?.base_currency ?? "USD",
          is_group: !!a.isGroup,
          parent_id: a.parent ? idByCode[a.parent] : null,
        })),
      )
      .select("id,code");
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).forEach((r: any) => (idByCode[r.code] = r.id));
  }

  const settings: Record<string, string | null> = { tenant_id: tenantId };
  Object.entries(settingsMapFor(config?.inventory_method)).forEach(([k, code]) => (settings[k] = idByCode[code] ?? null));
  settings[periodic ? "cogs_account_id" : "purchases_account_id"] = null;
  const { error: settingsError } = await supabaseAdmin.from("tenant_settings").upsert({ ...settings, entity_account_roots: { customer: idByCode["1102"], supplier: idByCode["21"], warehouses: idByCode["1103"], projects: idByCode["5"], cost_centers: idByCode["5"] } }, { onConflict: "tenant_id" });
  if (settingsError) throw new Error(settingsError.message);

  if (framework !== "demo") return;

  const { data: whs } = await supabaseAdmin
    .from("warehouses")
    .insert(DEMO_WAREHOUSES.map((w) => ({ ...w, tenant_id: tenantId })))
    .select("id,code");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mainWh = (whs ?? []).find((w: any) => w.code === "WH1")?.id ?? null;

  const { data: grp } = await supabaseAdmin
    .from("products")
    .insert({ tenant_id: tenantId, sku: "G-001", name: "مواد بناء", unit: "قطعة", is_group: true })
    .select("id")
    .single();
  await supabaseAdmin
    .from("products")
    .insert(DEMO_PRODUCTS.map((p) => ({ ...p, tenant_id: tenantId, parent_id: grp?.id ?? null, default_warehouse_id: mainWh })));

  await supabaseAdmin
    .from("cost_centers")
    .insert(DEMO_COST_CENTERS.map((c) => ({ ...c, tenant_id: tenantId, is_active: true })));

  const { data: partners } = await supabaseAdmin
    .from("partners")
    .insert(
      DEMO_PARTNERS.map((p) => ({
        tenant_id: tenantId,
        code: p.code,
        name: p.name,
        name_en: p.name_en,
        partner_type: p.partner_type,
        phone: p.phone,
        credit_limit: p.credit_limit,
        auto_parent_account_id: idByCode[p.partner_type === "supplier" ? "21" : "1102"] ?? null,
        currency: config?.base_currency ?? "USD",
      })),
    )
    .select("id,code");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (partners ?? []).find((p: any) => p.code === "C-001")?.id ?? null;

  await supabaseAdmin
    .from("projects")
    .insert(DEMO_PROJECTS.map((p) => ({ ...p, tenant_id: tenantId, client_id: client })));

  const { data: entry, error: eErr } = await supabaseAdmin
    .from("journal_entries")
    .insert({
      tenant_id: tenantId,
      entry_no: 1,
      entry_date: new Date().toISOString().slice(0, 10),
      description: "قيد الأرصدة الافتتاحية",
      doc_type: "opening",
    })
    .select("id")
    .single();
  if (eErr) throw new Error(eErr.message);
  await supabaseAdmin.from("journal_lines").insert(
    DEMO_OPENING.map((l) => ({
      tenant_id: tenantId,
      entry_id: entry.id,
      account_id: idByCode[({ "1101": "110101", "1102": "110102", "1301": "110301", "1201": "110201" } as Record<string, string>)[l.account] ?? l.account],
      debit: l.debit,
      credit: l.credit,
      description: l.description,
    })),
  );
}

const PROJECT_SUBMODULES = ["project_survey", "project_procurement", "project_civil", "project_mechanical", "project_electrical", "project_finance", "project_permits", "project_users"];
/** Company scope → enabled modules. "projects" keeps only project management (single bundle). */
function companyFeatureRows(tenantId: string, scope: "accounting" | "both" | "projects") {
  const all = Array.from(new Set([...MODULES, "projects", ...PROJECT_SUBMODULES]));
  return all.map((m) => {
    const isProject = m === "projects" || PROJECT_SUBMODULES.includes(m);
    // Projects-only companies carry no financial data: the project finance section stays off too.
    const enabled = scope === "both" ? true : scope === "projects" ? (isProject && m !== "project_finance") || m === "users" : !isProject;
    return { tenant_id: tenantId, module: m, enabled };
  });
}

/** Owner-only: creates a company plus its admin account in one step. */
export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      name: string;
      nameEn: string;
      code: string;
      plan: string;
      subEnd: string;
      maxUsers: number;
      notes?: string;
      framework: "blank" | "unified" | "demo";
      scope?: "accounting" | "both" | "projects";
      adminName: string;
      adminEmail: string;
      adminPassword: string;
      mustChangePassword?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    if (!caller.is_super_admin) throw new Error("هذه العملية لمالك النظام فقط");
    assertPassword(data.adminPassword);

    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: data.name,
        name_en: data.nameEn || null,
        code: data.code || null,
        plan: data.plan,
        sub_end: data.subEnd,
        max_users: data.maxUsers,
        notes: data.notes || null,
        is_active: true,
      })
      .select()
      .single();
    if (tErr) throw new Error(tErr.message);

    await supabaseAdmin
      .from("tenant_features")
      .upsert(
        companyFeatureRows(tenant.id, data.scope ?? "both"),
        { onConflict: "tenant_id,module" },
      );
    if ((data.scope ?? "both") === "projects") data.framework = "blank";

    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.adminEmail,
      password: data.adminPassword,
      email_confirm: true,
      user_metadata: { full_name: data.adminName },
    });
    if (uErr) {
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      throw new Error(uErr.message);
    }

    const { error: pErr } = await supabaseAdmin.from("profiles").upsert({
      id: created.user!.id,
      email: data.adminEmail,
      full_name: data.adminName,
      tenant_id: tenant.id,
      is_tenant_admin: true,
      is_active: true,
      must_change_password: !!data.mustChangePassword,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user!.id);
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      throw new Error(pErr.message);
    }

    try {
      await seedFramework(supabaseAdmin, tenant.id, data.framework ?? "blank");
    } catch (e) {
      throw new Error(`تم إنشاء الشركة لكن فشل تهيئة الدليل المحاسبي: ${(e as Error).message}`);
    }

    await supabaseAdmin.from("subscription_history").insert({
      tenant_id: tenant.id,
      plan: data.plan,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: data.subEnd,
      amount: 0,
      notes: "إنشاء الاشتراك",
    });

    return { tenantId: tenant.id as string };
  });

/** Creates a user account directly (no email confirmation, no signup flow). */
export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      tenantId: string;
      fullName: string;
      email: string;
      password: string;
      isTenantAdmin: boolean;
      isAuditor?: boolean;
      mustChangePassword?: boolean;
      accountKind?: "standard" | "sales_cashier" | "purchase_cashier" | "warehouse_keeper" | "projects_only";
      permissions?: {
        module: string;
        can_view: boolean;
        can_create: boolean;
        can_edit: boolean;
        can_delete: boolean;
      }[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    let allowed = caller.is_super_admin || (caller.is_tenant_admin && caller.tenant_id === data.tenantId);
    const isAdminCaller = allowed;
    if (!allowed && caller.tenant_id === data.tenantId && data.accountKind === "projects_only" && !data.isTenantAdmin && !data.isAuditor) {
      // Project managers (project_users permission) may add project-only users.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pm } = await (context.supabase as any).from("user_permissions").select("can_create").eq("user_id", context.userId).eq("module", "project_users").maybeSingle();
      allowed = !!pm?.can_create;
    }
    if (!allowed && caller.tenant_id === data.tenantId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = context.supabase as any;
      const { data: p } = await db
        .from("user_permissions")
        .select("can_create")
        .eq("user_id", context.userId)
        .eq("module", "users")
        .maybeSingle();
      allowed = !!p?.can_create;
    }
    if (!allowed) throw new Error("لا تملك صلاحية إنشاء المستخدمين");
    if (data.isTenantAdmin && !caller.is_super_admin && !caller.is_tenant_admin) {
      throw new Error("فقط مدير الشركة يمكنه إنشاء مدير آخر");
    }
    assertPassword(data.password);

    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("max_users")
      .eq("id", data.tenantId)
      .maybeSingle();
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", data.tenantId);
    if (tenant && (count ?? 0) >= tenant.max_users) {
      throw new Error("تم بلوغ الحد الأقصى لعدد المستخدمين في هذه الشركة");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);

    const { error: pErr } = await supabaseAdmin.from("profiles").upsert({
      id: created.user!.id,
      email: data.email,
      full_name: data.fullName,
      tenant_id: data.tenantId,
      is_tenant_admin: data.isTenantAdmin,
      is_auditor: !!data.isAuditor && !data.isTenantAdmin,
      account_kind: data.isTenantAdmin ? "standard" : (data.accountKind ?? "standard"),
      is_active: true,
      must_change_password: !!data.mustChangePassword,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user!.id);
      throw new Error(pErr.message);
    }
    // A company subscribed to project management only never gets accounting users or permissions.
    const { data: feats } = await supabaseAdmin.from("tenant_features").select("module,enabled").eq("tenant_id", data.tenantId);
    const projectsTenant = projectsOnlyFeatures(Object.fromEntries(((feats ?? []) as { module: string; enabled: boolean }[]).map((f) => [f.module, f.enabled])));
    const kind = projectsTenant && !data.isTenantAdmin ? "projects_only" : (data.accountKind ?? "standard");
    if (kind !== (data.accountKind ?? "standard")) {
      await supabaseAdmin.from("profiles").update({ account_kind: kind, is_auditor: false }).eq("id", created.user!.id);
    }
    const cashierMods: Record<string, string[]> = {
      sales_cashier: ["documents"],
      purchase_cashier: ["documents"],
      warehouse_keeper: ["documents", "stock"],
    };
    const perms = data.isAuditor && kind !== "projects_only"
      ? MODULES.map((m) => ({ module: m, can_view: true, can_create: false, can_edit: false, can_delete: false }))
      : kind === "projects_only"
        ? [
            ...keepProjectPerms(data.permissions ?? [], isAdminCaller),
            ...(projectsTenant ? [] : [{ module: "partners", can_view: true, can_create: true, can_edit: false, can_delete: false }]),
          ]
      : kind !== "standard"
        ? MODULES.filter((m) => ["documents", "stock", "products", "warehouses", "partners"].includes(m)).map((m) => ({
            module: m,
            can_view: true,
            can_create: (cashierMods[kind] ?? []).includes(m),
            can_edit: false,
            can_delete: false,
          }))
        : (data.permissions ?? []);
    const rows = perms
      .filter((p) => MODULES.includes(p.module) || (kind === "projects_only" && p.module.startsWith("project_")))
      .map((p) => ({
        tenant_id: data.tenantId,
        user_id: created.user!.id,
        module: p.module,
        can_view: !!p.can_view,
        can_create: !!p.can_create,
        can_edit: !!p.can_edit,
        can_delete: !!p.can_delete,
      }));
    if (rows.length && !data.isTenantAdmin) {
      const { error: permErr } = await supabaseAdmin
        .from("user_permissions")
        .upsert(rows, { onConflict: "user_id,module" });
      if (permErr) throw new Error(permErr.message);
    }
    return { userId: created.user!.id };
  });

/** Sets a new password for a managed user. */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string; mustChange?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    assertPassword(data.password);
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const target = await loadManagedTarget(supabaseAdmin, caller, data.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("restored_user_passwords").delete().eq("user_id", target.id);
    if (data.mustChange !== undefined) {
      await supabaseAdmin.from("profiles").update({ must_change_password: !!data.mustChange }).eq("id", target.id);
    }
    return { ok: true as const };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadManagedTarget(supabaseAdmin: any, caller: { is_super_admin: boolean; is_tenant_admin: boolean; tenant_id: string | null }, userId: string) {
  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id,tenant_id,is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!target) throw new Error("المستخدم غير موجود");
  if (!caller.is_super_admin) {
    if (target.is_super_admin) throw new Error("غير مسموح");
    if (!caller.is_tenant_admin || caller.tenant_id !== target.tenant_id) throw new Error("غير مسموح");
  }
  return target as { id: string };
}

/** Turns the "must change password at next sign-in" flag on/off for a managed user. */
export const setMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; on: boolean }) => d)
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const target = await loadManagedTarget(supabaseAdmin, caller, data.userId);
    const { error } = await supabaseAdmin.from("profiles").update({ must_change_password: !!data.on }).eq("id", target.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Deletes a user account and its profile. */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    if (data.userId === caller.id) throw new Error("لا يمكنك حذف حسابك");
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id,tenant_id,is_super_admin")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("المستخدم غير موجود");
    await assertCanManageUser(context.supabase, caller, target, "delete");
    await supabaseAdmin.from("user_permissions").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Temporarily suspends or re-activates a user; suspended users cannot sign in. */
export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; active: boolean }) => d)
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    if (data.userId === caller.id) throw new Error("لا يمكنك إيقاف حسابك");
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const { data: target } = await supabaseAdmin.from("profiles").select("id,tenant_id,is_super_admin").eq("id", data.userId).maybeSingle();
    if (!target) throw new Error("المستخدم غير موجود");
    await assertCanManageUser(context.supabase, caller, target, "edit");
    const { error } = await supabaseAdmin.from("profiles").update({ is_active: data.active }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    const ban = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.active ? "none" : "876000h" });
    if (ban.error) throw new Error(ban.error.message);
    return { ok: true as const };
  });

const BACKUP_TABLES = [
  "tenants", "tenant_settings", "tenant_features", "profiles", "user_permissions", "accounts",
  "warehouses", "products", "partners", "projects", "boq_items", "project_milestones",
  "project_expenses", "banks", "cheques", "fixed_assets", "exchange_rates", "documents",
  "document_lines", "journal_entries", "journal_lines", "stock_moves", "subscription_history",
  "tenant_payments", "units", "recurring_entries", "employees", "employee_advances",
  "employee_leaves", "employee_adjustments", "payroll_runs", "attachments", "notifications",
  "currencies", "branches", "cost_centers", "hotel_rooms", "hotel_reservations",
  "manufacturing_orders", "manufacturing_materials", "product_recipes", "product_batches",
  "batch_consumptions", "pos_shifts", "user_cash_drawers", "record_comments",
  "approval_requests", "partner_inquiries", "tenant_members", "personal_notes", "chat_messages", "ai_drafts",
  "doc_patterns", "bank_recon_marks", "fx_log", "assembly_vouchers", "manufacturing_byproducts", "service_contracts", "service_orders",
  "project_templates", "project_wbs", "project_bom", "project_quotes", "project_snags", "solar_projects", "solar_roles",
];

async function requireOwner(supabase: unknown, userId: string) {
  const caller = await loadCaller(supabase, userId);
  if (!caller.is_super_admin) throw new Error("هذه العملية لمالك النظام فقط");
}

/** Owner or the company's own admin: full backup of one company's data. */
export const backupCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    if (!caller.is_super_admin && !(caller.is_tenant_admin && caller.tenant_id === data.tenantId))
      throw new Error("لا تملك صلاحية النسخ الاحتياطي");
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const out: Record<string, unknown[]> = {};
    // Every company table (from the database itself) so new tables are never missed.
    const { data: plan } = await supabaseAdmin.rpc("company_backup_plan");
    const planned = Array.isArray(plan) ? plan.map((p: { table: string }) => p.table) : [];
    const tables = Array.from(new Set(["tenants", "tenant_settings", "profiles", ...planned, ...BACKUP_TABLES]))
      .filter((t) => t !== "notifications");
    const PAGE = 1000;
    for (const t of tables) {
      const rows: unknown[] = [];
      for (let from = 0; ; from += PAGE) {
        const q = supabaseAdmin.from(t).select("*");
        const { data: page, error } = await (t === "tenants" ? q.eq("id", data.tenantId) : q.eq("tenant_id", data.tenantId))
          .range(from, from + PAGE - 1);
        if (error) {
          if (from === 0 && /does not exist|schema cache/i.test(error.message)) break;
          throw new Error(`${t}: ${error.message}`);
        }
        rows.push(...(page ?? []));
        if (!page || page.length < PAGE) break;
      }
      out[t] = rows;
    }
    return JSON.stringify({ app: "yousef-soft", version: 3, created_at: new Date().toISOString(), data: out });
  });

/**
 * Owner-only: recreates the user accounts found in a company backup (same ids, random temporary
 * passwords, confirmed emails) and upserts their profile rows, so a later restore_tenant_full can
 * reattach user_permissions and tenant_members without foreign-key failures.
 */
export const restoreCompanyUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .inputValidator((d: { tenantId: string; profiles: any[] }) => d)
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    let created = 0, existed = 0, failed = 0;
    for (const p of data.profiles ?? []) {
      if (!p?.id || !p?.email) { failed++; continue; }
      let isNew = false;
      const { data: existing } = await supabaseAdmin.auth.admin.getUserById(p.id);
      if (!existing?.user) {
        const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        const bytes = crypto.getRandomValues(new Uint8Array(10));
        const tempPassword = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
        const { error } = await supabaseAdmin.auth.admin.createUser({
          id: p.id,
          email: p.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: p.full_name ?? "" },
        });
        if (error) { failed++; continue; }
        await supabaseAdmin
          .from("restored_user_passwords")
          .upsert({ user_id: p.id, tenant_id: data.tenantId, temp_password: tempPassword }, { onConflict: "user_id" });
        created++;
        isNew = true;
      } else {
        existed++;
      }
      const row = { ...p, tenant_id: data.tenantId };
      if (isNew) row.must_change_password = true;
      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert(row, { onConflict: "id" });
      if (error) failed++;
    }
    return { ok: true as const, created, existed, failed };
  });

/** Company admin: seeds the default chart of accounts for their own company if it is empty. */
export const seedMyCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    if (!caller.is_tenant_admin || !caller.tenant_id) throw new Error("فقط مدير الشركة");
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const { count } = await supabaseAdmin
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenant_id);
    if ((count ?? 0) === 0) await seedFramework(supabaseAdmin, caller.tenant_id, "unified");
    return { ok: true as const };
  });

/** Owner-only: permanently deletes a company, all its data and its user accounts. */
export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => d)
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const { data: users } = await supabaseAdmin.from("profiles").select("id").eq("tenant_id", data.tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).rpc("purge_tenant", { _id: data.tenantId });
    if (error) throw new Error(error.message);
    for (const u of users ?? []) await supabaseAdmin.auth.admin.deleteUser(u.id);
    return { ok: true as const };
  });

/** Company admin: saves the business activity, adds its sub-accounts (if missing) and maps posting defaults. */
export const applyBusinessActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { activity: string }) => d)
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.supabase, context.userId);
    if (!caller.is_tenant_admin || !caller.tenant_id) throw new Error("فقط مدير الشركة");
    const { findActivity } = await import("@/lib/business-activities");
    const act = findActivity(data.activity);
    if (!act) throw new Error("نشاط غير معروف");
    const tenantId = caller.tenant_id;
    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const { data: existing } = await supabaseAdmin.from("accounts").select("id,code").eq("tenant_id", tenantId);
    const idByCode: Record<string, string> = {};
    ((existing ?? []) as { id: string; code: string }[]).forEach((r) => { idByCode[r.code] = r.id; });
    for (const a of act.accounts) {
      if (idByCode[a.code]) continue;
      const parentId = (a.parent && (idByCode[a.parent] ?? idByCode[a.parent.charAt(0)])) || null;
      const { data: row, error } = await supabaseAdmin
        .from("accounts")
        .insert({ tenant_id: tenantId, code: a.code, name: a.name, notes: a.nameEn, nature: a.nature ?? "profit_loss", is_group: false, parent_id: parentId })
        .select("id,code")
        .single();
      if (error) throw new Error(error.message);
      idByCode[row.code] = row.id;
    }
    const settings: Record<string, string | null> = { tenant_id: tenantId, business_sector: act.sector, business_activity: act.value };
    Object.entries(act.settings).forEach(([k, code]) => { if (idByCode[code]) settings[k] = idByCode[code]; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).from("tenant_settings").upsert(settings, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Public: makes sure the shared demo company + full-admin demo user exist (idempotent). */
export const ensureDemoAccount = createServerFn({ method: "POST" }).handler(async () => {
  const DEMO_EMAIL = "demo@yousef-soft.com";
  const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAdmin = typedAdmin as any;
  const { data: existing } = await supabaseAdmin.from("profiles").select("id,tenant_id").eq("email", DEMO_EMAIL).maybeSingle();
  if (existing) {
    // Keep the advertised password in sync so the demo login always works.
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: "Demo2027", email_confirm: true });
    if (pwErr) throw new Error(pwErr.message);
    const { count } = await supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }).eq("tenant_id", existing.tenant_id);
    if (!count) await seedFramework(supabaseAdmin, existing.tenant_id, "demo");
    await supabaseAdmin.from("tenant_settings").upsert({ tenant_id: existing.tenant_id, onboarding_done: true }, { onConflict: "tenant_id" });
    return { ok: true };
  }

  const { data: tenant, error: tErr } = await supabaseAdmin
    .from("tenants")
    .insert({ name: "حساب ديمو", name_en: "Demo Account", code: "DEMO", plan: "custom", sub_end: "2099-12-31", max_users: 10, is_active: true, notes: "حساب تجريبي عام" })
    .select()
    .single();
  if (tErr) throw new Error(tErr.message);
  await supabaseAdmin.from("tenant_features").upsert(
    MODULES.map((m) => ({ tenant_id: tenant.id, module: m, enabled: true })),
    { onConflict: "tenant_id,module" },
  );
  const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: "Demo2027",
    email_confirm: true,
    user_metadata: { full_name: "حساب ديمو" },
  });
  if (uErr) throw new Error(uErr.message);
  const { error: pErr } = await supabaseAdmin.from("profiles").upsert({
    id: created.user!.id, email: DEMO_EMAIL, full_name: "حساب ديمو", tenant_id: tenant.id, is_tenant_admin: true, is_active: true,
  });
  if (pErr) throw new Error(pErr.message);
  await seedFramework(supabaseAdmin, tenant.id, "demo");
  // The demo company is pre-configured, so skip the first-run setup wizard.
  await supabaseAdmin.from("tenant_settings").upsert({ tenant_id: tenant.id, onboarding_done: true }, { onConflict: "tenant_id" });
  return { ok: true };
});
