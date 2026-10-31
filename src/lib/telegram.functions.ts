import { createServerFn } from "@tanstack/react-start";
import { requireAppDatabaseAuth } from "@/lib/app-database-auth";

/** Creates a one-time (15 min) deep link that binds the caller's Telegram chat to their account. */
export const createTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireAppDatabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase.from("profiles").select("tenant_id").eq("id", context.userId).maybeSingle();
    if (!me?.tenant_id) throw new Error("No company selected");
    const code = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    const { appDatabaseAdmin: supabaseAdmin } = await import("@/lib/app-database.server");
    const { error } = await supabaseAdmin.from("telegram_links").upsert({
      user_id: context.userId, tenant_id: me.tenant_id, link_code: code,
      code_expires: new Date(Date.now() + 15 * 60_000).toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error("Unable to create link");
    const { botUsernameFor } = await import("./integrations.server");
    return { url: `https://t.me/${await botUsernameFor(me.tenant_id)}?start=${code}` };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireAppDatabaseAuth])
  .handler(async ({ context }) => {
    const { appDatabaseAdmin: supabaseAdmin } = await import("@/lib/app-database.server");
    await supabaseAdmin.from("telegram_links").delete().eq("user_id", context.userId);
    return { ok: true };
  });

async function requireProjectEditor(supabase: any, projectId: string) {
  const { data: tenantId } = await supabase.rpc("current_tenant_id");
  const { data: admin } = await supabase.rpc("is_tenant_admin");
  const { data: edit } = await supabase.rpc("has_perm", { _module: "projects", _action: "edit" });
  if (!tenantId || !(admin || edit)) throw new Error("لا تملك صلاحية");
  const { data: project } = await supabase.from("projects").select("id,tenant_id").eq("id", projectId).eq("tenant_id", tenantId).maybeSingle();
  if (!project) throw new Error("المشروع غير متاح");
  return tenantId as string;
}

/** Creates a client deep link that binds one Telegram chat to exactly one project (read-only). */
export const createClientTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireAppDatabaseAuth])
  .inputValidator((d: { projectId: string; password: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d?.projectId ?? "")) throw new Error("Invalid project");
    const p = String(d?.password ?? "").trim();
    if (p.length < 4 || p.length > 64) throw new Error("كلمة السر بين 4 و64 حرفاً");
    return { projectId: d.projectId, password: p };
  })
  .handler(async ({ data, context }) => {
    const tenantId = await requireProjectEditor(context.supabase, data.projectId);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
    const { hashTeamPassword } = await import("./telegram-security.server");
    const h = hashTeamPassword(data.password);
    const { appDatabaseAdmin: supabaseAdmin } = await import("@/lib/app-database.server");
    const { error } = await supabaseAdmin.from("telegram_client_links").insert({ tenant_id: tenantId, project_id: data.projectId, token, password_hash: h.hash, password_salt: h.salt });
    if (error) throw new Error("تعذر إنشاء الرابط");
    const { botUsernameFor } = await import("./integrations.server");
    const bot = await botUsernameFor(tenantId);
    return { url: `https://t.me/${bot}?start=c_${token}` };
  });
