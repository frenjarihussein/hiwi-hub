import { createFileRoute } from "@tanstack/react-router";
import { ACTIVATION_CODE, DEVICE_ID, cleanSpecs, normalizeCode } from "@/lib/desktop-activation";
import { planExpiry } from "@/lib/desktop-license";

const json = (b: unknown, status = 200) => Response.json(b, { status });

/** Desktop installs redeem a pre-generated code online once; the code locks to the first device. */
export const Route = createFileRoute("/api/public/desktop-activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try { body = await request.json(); } catch { return json({ error: "bad" }, 400); }
        const code = normalizeCode(body["code"]);
        const device = String(body["device"] ?? "").trim().toUpperCase();
        if (!ACTIVATION_CODE.test(code) || !DEVICE_ID.test(device)) return json({ error: "invalid" }, 400);
        const specs = cleanSpecs(body["specs"]);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { signLicense } = await import("@/lib/desktop-license.functions");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const { data: row, error } = await db.from("desktop_activation_codes").select("*").eq("code", code).maybeSingle();
        if (error) return json({ error: "unavailable" }, 503);
        if (!row) return json({ error: "not_found" }, 404);
        if (row.revoked) return json({ error: "revoked" }, 403);
        if (row.used_device && row.used_device !== device) return json({ error: "used" }, 409);

        let licenseKey = "";
        if (row.license_id) {
          const { data: lic } = await db.from("desktop_licenses").select("license_key,revoked").eq("id", row.license_id).maybeSingle();
          if (lic?.revoked) return json({ error: "revoked" }, 403);
          licenseKey = lic?.license_key ?? "";
        }
        if (!licenseKey) {
          // Claim atomically: only an unused code (or this same device) may be bound.
          const { data: claimed } = await db.from("desktop_activation_codes")
            .update({ used_device: device, used_at: new Date().toISOString() })
            .eq("id", row.id).eq("revoked", false).or(`used_device.is.null,used_device.eq.${device}`).select("id");
          if (!claimed?.length) return json({ error: "used" }, 409);
          const id = crypto.randomUUID(); const now = Date.now();
          const e = planExpiry(row.plan, now, row.days);
          licenseKey = await signLicense({ v: 1, id, d: device, c: row.customer, p: row.plan, e, i: now });
          const ins = await db.from("desktop_licenses").insert({ id, device_id: device, customer: row.customer, plan: row.plan, expires_at: e ? new Date(e).toISOString() : null, license_key: licenseKey, notes: `كود ${code}`, created_by: row.created_by });
          if (ins.error) return json({ error: "unavailable" }, 503);
          await db.from("desktop_activation_codes").update({ license_id: id }).eq("id", row.id);
        }
        const ip = ((request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "").split(",")[0] ?? "").slice(0, 60);
        await db.from("desktop_devices").upsert({
          device_id: device, customer: row.customer, platform: "windows", last_seen: new Date().toISOString(), last_ip: ip,
          hostname: specs.hostname, os_name: specs.os, cpu: specs.cpu, ram_gb: specs.ram_gb, specs,
          activated_at: new Date().toISOString(), activation_code: code, app_version: String(body["version"] ?? "").slice(0, 30),
        }, { onConflict: "device_id" });
        return json({ license_key: licenseKey });
      },
    },
  },
});
