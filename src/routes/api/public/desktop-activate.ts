import { createFileRoute } from "@tanstack/react-router";
import { ACTIVATION_CODE, DEVICE_ID, cleanSpecs, normalizeCode } from "@/lib/desktop-activation";
import { planExpiry } from "@/lib/desktop-license";

const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "cache-control": "no-store" } });

/** Desktop installs redeem a pre-generated code online once; the code locks to the first device. */
export const Route = createFileRoute("/api/public/desktop-activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try { const input = await request.json(); if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "bad" }, 400); body = input; } catch { return json({ error: "bad" }, 400); }
        const code = normalizeCode(body["code"]);
        const device = String(body["device"] ?? "").trim().toUpperCase();
        if (!ACTIVATION_CODE.test(code) || !DEVICE_ID.test(device)) return json({ error: "invalid" }, 400);
        const specs = cleanSpecs(body["specs"]);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const { data: row, error } = await db.from("desktop_activation_codes").select("*").eq("code", code).maybeSingle();
        if (error) return json({ error: "unavailable" }, 503);
        if (!row) return json({ error: "not_found" }, 404);
        if (row.revoked) return json({ error: "revoked" }, 403);
        if (row.used_device && row.used_device !== device) return json({ error: "used" }, 409);

        // The row lock, license insert and code binding commit together; retries return the same key.
        let candidate = "";
        const id = crypto.randomUUID(); const now = Date.now();
        const e = planExpiry(row.plan, now, row.days);
        if (!row.license_id) {
          try {
            const { signLicense } = await import("@/lib/desktop-signing.server");
            candidate = await signLicense({ v: 1, id, d: device, c: row.customer, p: row.plan, e, i: now });
          } catch { return json({ error: "unavailable" }, 503); }
        }
        const { data: redeemed, error: redeemError } = await db.rpc("redeem_desktop_activation", {
          _code: code, _device: device, _id: id, _key: candidate, _expires: e ? new Date(e).toISOString() : null,
        });
        if (redeemError || !redeemed) return json({ error: "unavailable" }, 503);
        if (redeemed.error) return json({ error: redeemed.error }, redeemed.error === "used" ? 409 : redeemed.error === "revoked" ? 403 : 503);
        const ip = ((request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "").split(",")[0] ?? "").slice(0, 60);
        const { error: deviceError } = await db.from("desktop_devices").upsert({
          license_id: redeemed.license_id,
          device_id: device, customer: row.customer, platform: "windows", last_seen: new Date().toISOString(), last_ip: ip,
          hostname: specs.hostname, os_name: specs.os, cpu: specs.cpu, ram_gb: specs.ram_gb, specs,
          activated_at: row.used_at || new Date().toISOString(), activation_code: code, app_version: String(body["version"] ?? "").slice(0, 30),
        }, { onConflict: "device_id" });
        if (deviceError) return json({ error: "unavailable" }, 503);
        return json({ license_key: redeemed.license_key });
      },
    },
  },
});
