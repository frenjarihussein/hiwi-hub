import { createFileRoute } from "@tanstack/react-router";
import { verifyLicense } from "@/lib/desktop-license";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };

/** Desktop copies report in when online. Caller is trusted only if it holds a validly signed license for its device. */
export const Route = createFileRoute("/api/public/desktop-heartbeat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        let body: { device?: string; license?: string; version?: string; company?: string; platform?: string };
        try { body = await request.json(); } catch { return Response.json({ error: "bad" }, { status: 400, headers: cors }); }
        const device = String(body.device ?? "").slice(0, 40);
        const check = await verifyLicense(String(body.license ?? ""), device, Date.now());
        if (!check.ok && check.reason !== "expired") return Response.json({ error: "invalid" }, { status: 403, headers: cors });
        const p = check.ok ? check.payload : check.payload!;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const { data: lic } = await db.from("desktop_licenses").select("id,revoked").eq("id", p.id).maybeSingle();
        await db.from("desktop_devices").upsert({
          device_id: device, license_id: lic ? p.id : null, customer: p.c,
          app_version: String(body.version ?? "").slice(0, 30), company_name: String(body.company ?? "").slice(0, 120),
          platform: String(body.platform ?? "windows").slice(0, 20), last_seen: new Date().toISOString(),
          last_ip: ((request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "").split(",")[0] ?? "").slice(0, 60),
        }, { onConflict: "device_id" });
        return Response.json({ revoked: !lic || !!lic.revoked }, { headers: cors });
      },
    },
  },
});
