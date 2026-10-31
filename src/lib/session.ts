import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { offlineStore, setOfflineScope } from "@/lib/offline-store";
import { connectivityFailure, usableSnapshot } from "@/lib/offline-session";
import { projectsOnlyFeatures } from "@/lib/project-presets";

export type PermRow = {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type AccountKind = "standard" | "sales_cashier" | "purchase_cashier" | "warehouse_keeper" | "projects_only";

export type Me = {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantNameEn: string | null;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  isAuditor: boolean;
  accountKind: AccountKind;
  notifSeenAt: string | null;
  perms: PermRow[];
  features: Record<string, boolean>;
  businessActivity: string | null;
  tenantLocked: boolean;
  hasBranches: boolean;
  branchId: string | null;
  activeBranchId: string | null;
};

async function cachedMe(): Promise<Me | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return null;
    const cached = await offlineStore().values.get(`me:${userId}`);
    const snapshot = cached?.value as { me: Me; savedAt: number } | undefined;
    const me = usableSnapshot(userId, snapshot);
    if (!me) return null;
    setOfflineScope({ userId, tenantId: me.tenantId, branchId: me.branchId || me.activeBranchId });
    return me;
  } catch { return null; }
}

async function loadMe(): Promise<Me | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return cachedMe();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (connectivityFailure(authError)) return cachedMe();
  if (authError) throw authError;
  if (!user) return null;
  // A signed-in user without a profile gets one created (the very first becomes system owner).
  let { data: profile, error: profileError } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profileError) { if (connectivityFailure(profileError)) return cachedMe(); throw profileError; }
  if (!profile) {
    await db.rpc("bootstrap_my_profile");
    profile = (await db.from("profiles").select("*").eq("id", user.id).maybeSingle()).data;
  }
  if (!profile) return null;
  if (profile.is_active === false) return null;
  if (typeof window !== "undefined") setOfflineScope({ userId: user.id, tenantId: profile.tenant_id ?? null, branchId: profile.branch_id || profile.active_branch_id || null });

  const [permsRes, tenantRes, featRes, activeRes, tsRes] = await Promise.all([
    db.from("user_permissions").select("module,can_view,can_create,can_edit,can_delete").eq("user_id", user.id),
    profile?.tenant_id
      ? db.from("tenants").select("id,name,name_en").eq("id", profile.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    profile?.tenant_id
      ? db.from("tenant_features").select("module,enabled").eq("tenant_id", profile.tenant_id)
      : Promise.resolve({ data: [] }),
    db.rpc("tenant_active"),
    profile?.tenant_id
      ? db.from("tenant_settings").select("business_activity,has_branches").eq("tenant_id", profile.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const features: Record<string, boolean> = {};
  const readError = [permsRes, tenantRes, featRes, activeRes, tsRes].find((r) => "error" in r && r.error)?.error;
  if (readError) {
    const cached = connectivityFailure(readError) ? await cachedMe() : null;
    if (cached && cached.tenantId === profile.tenant_id) return cached;
    throw readError;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (featRes.data ?? []).forEach((f: any) => {
    features[f.module] = f.enabled;
  });

  const me: Me = {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? "",
    avatarUrl: profile?.avatar_url ?? null,
    tenantId: profile?.tenant_id ?? null,
    tenantName: tenantRes.data?.name ?? null,
    tenantNameEn: tenantRes.data?.name_en ?? null,
    isSuperAdmin: !!profile?.is_super_admin,
    isTenantAdmin: !!profile?.is_tenant_admin,
    isAuditor: !!profile?.is_auditor,
    accountKind: ((profile as { account_kind?: string })?.account_kind ?? "standard") as AccountKind,
    notifSeenAt: profile?.notif_seen_at ?? null,
    perms: permsRes.data ?? [],
    features,
    businessActivity: ((tsRes.data as { business_activity?: string } | null)?.business_activity) ?? null,
    tenantLocked: !profile.is_super_admin && activeRes.data !== true,
    hasBranches: !!(tsRes.data as { has_branches?: boolean } | null)?.has_branches,
    branchId: profile.branch_id ?? null,
    activeBranchId: profile.active_branch_id ?? null,
  };
  if (typeof window !== "undefined") await offlineStore().values.put({ key: `me:${user.id}`, value: { me, savedAt: Date.now() } }).catch(() => {});
  return me;
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: loadMe, staleTime: 60_000 });
}

export const CYCLE_MODULES = ["sales", "purchases", "inventory"] as const;
/** Which work cycle (permission module) each document type belongs to. */
export const DOC_CYCLE: Record<string, (typeof CYCLE_MODULES)[number]> = {
  quote: "sales", sale: "sales", sale_return: "sales", receipt: "sales",
  purchase_request: "purchases", purchase_order: "purchases", purchase: "purchases",
  purchase_return: "purchases", payment: "purchases", payment_order: "purchases",
  stock_in: "inventory", stock_out: "inventory", transfer: "inventory", opening_inventory: "inventory", closing_inventory: "inventory",
};

type Act = "view" | "create" | "edit" | "delete";
function rowAllows(p: Me["perms"][number] | undefined, action: Act) {
  if (!p) return false;
  return action === "view" ? p.can_view : action === "create" ? p.can_create : action === "edit" ? p.can_edit : p.can_delete;
}

export function can(me: Me | null | undefined, module: string, action: Act) {
  if (!me) return false;
  if (me.isSuperAdmin) return true;
  if (me.features[module] === false) return false;
  // Match has_perm: tenant admins do not depend on explicit permission rows.
  if (me.isTenantAdmin) return true;
  if (me.isAuditor && action === "view") return true;
  if (rowAllows(me.perms.find((x) => x.module === module), action)) return true;
  // Mirrors has_perm: any work-cycle permission opens the documents screen.
  if (module === "documents") return me.perms.some((x) => (CYCLE_MODULES as readonly string[]).includes(x.module) && rowAllows(x, action));
  return false;
}

/** Document-type access: full "documents" permission sees all; otherwise only the user's cycles. */
export function canDocType(me: Me | null | undefined, docType: string, action: Act = "view") {
  if (!me) return false;
  if (me.isSuperAdmin || me.isTenantAdmin || (me.isAuditor && action === "view")) return true;
  if (rowAllows(me.perms.find((x) => x.module === "documents"), action)) return true;
  const cyc = DOC_CYCLE[docType];
  return !!cyc && rowAllows(me.perms.find((x) => x.module === cyc), action);
}

/** Company opened as "project management only": projects on, accounting modules off. */
export function isProjectsOnlyTenant(me: Me | null | undefined) {
  if (!me || me.isSuperAdmin) return false;
  return projectsOnlyFeatures(me.features);
}

export function moduleEnabled(me: Me | null | undefined, module: string) {
  if (!me) return false;
  if (me.isSuperAdmin) return true;
  return me.features[module] !== false && can(me, module, "view");
}
