import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { describeDevice } from "./device";

/** Records a sign-in / sign-out with the caller's IP and device. */
export const logLoginEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { event: "sign_in" | "sign_out"; deviceId?: string; deviceInfo?: Record<string, unknown> }) => {
    if (d?.event !== "sign_in" && d?.event !== "sign_out") throw new Error("invalid event");
    const deviceId = typeof d.deviceId === "string" && /^[0-9a-f-]{36}$/i.test(d.deviceId) ? d.deviceId : undefined;
    const info = d.deviceInfo && typeof d.deviceInfo === "object" && JSON.stringify(d.deviceInfo).length < 2000 ? d.deviceInfo : null;
    return { event: d.event, deviceId: deviceId ?? null, deviceInfo: info };
  })
  .handler(async ({ data, context }) => {
    const req = getRequest();
    const h = req.headers;
    const ip = (h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim() || null;
    const ua = h.get("user-agent")?.slice(0, 400) ?? null;
    // Table types are generated from the live schema; while it is being restored, use
    // the same loosely typed access the data grids use (see src/lib/db.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: prof } = await sb.from("profiles").select("tenant_id").eq("id", context.userId).maybeSingle();
    const { error } = await sb.from("login_events").insert({
      user_id: context.userId,
      tenant_id: (prof as { tenant_id?: string } | null)?.tenant_id ?? null,
      event: data.event,
      ip,
      user_agent: ua,
      device: describeDevice(ua),
      device_id: data.deviceId,
      device_info: data.deviceInfo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
