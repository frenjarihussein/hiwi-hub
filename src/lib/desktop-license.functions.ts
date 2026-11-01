import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { b64u, encodePayload, formatKey, planExpiry, type LicensePayload } from "@/lib/desktop-license";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuper(supabase: any) {
  const { data } = await supabase.rpc("is_super_admin");
  if (!data) throw new Error("هذه العملية لمدير النظام فقط");
}

export async function signLicense(p: LicensePayload) {
  const pk = process.env["DESKTOP_LICENSE_PRIVATE_KEY"];
  if (!pk) throw new Error("مفتاح التوقيع غير مضبوط على الخادم");
  const key = await crypto.subtle.importKey("pkcs8", b64u.dec(pk.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")), { name: "Ed25519" }, false, ["sign"]);
  const body = encodePayload(p);
  const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(body)));
  return formatKey(`${body}.${b64u.enc(sig)}`);
}

const DEVICE = /^YS-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export const issueDesktopLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { device: string; customer: string; plan: string; days?: number; notes?: string }) => {
    const device = String(d.device ?? "").trim().toUpperCase();
    if (!DEVICE.test(device)) throw new Error("رمز الجهاز غير صحيح (مثال: YS-XXXX-XXXX-XXXX-XXXX)");
    const customer = String(d.customer ?? "").trim().slice(0, 120);
    if (!customer) throw new Error("اكتب اسم الزبون");
    const plan = ["trial", "month", "year", "lifetime"].includes(d.plan) ? d.plan : "year";
    const days = Math.max(0, Math.min(3650, Number(d.days) || 0));
    return { device, customer, plan, days, notes: String(d.notes ?? "").slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase);
    const id = crypto.randomUUID();
    const now = Date.now();
    const e = planExpiry(data.plan, now, data.days);
    const license_key = await signLicense({ v: 1, id, d: data.device, c: data.customer, p: data.plan, e, i: now });
    const { error } = await supabase.from("desktop_licenses").insert({
      id, device_id: data.device, customer: data.customer, plan: data.plan,
      expires_at: e ? new Date(e).toISOString() : null, license_key, notes: data.notes || null, created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { license_key };
  });
