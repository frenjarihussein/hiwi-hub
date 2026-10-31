import { createServerFn } from "@tanstack/react-start";
import { requireAppDatabaseAuth } from "@/lib/app-database-auth";
import { acquireSolarReading, combineReadings, dailyProduction, isStale, matchingReading, type SolarReading, type SolarUnit } from "./solar-monitor";

/** Reads live inverter data from Sungrow iSolarCloud (or a simulated feed in demo mode) and caches it on the project. */
export const syncSolarMonitor = createServerFn({ method: "POST" })
  .middleware([requireAppDatabaseAuth])
  .inputValidator((d: { projectId: string }) => {
    if (!d?.projectId || typeof d.projectId !== "string") throw new Error("projectId required");
    return d;
  })
  .handler(async ({ data, context }): Promise<{ reading: SolarReading | null; error: string | null; stale: boolean; historyError: boolean }> => {
    const { data: row, error } = await context.supabase
      .from("solar_monitoring")
      .select("*")
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (error || !row) throw new Error("لم يتم ربط هذا المشروع بإنفرتر بعد");
    const cap = Number(row.capacity_kwp) || 10;
    const { sungrowEnvFor, smaEnvFor } = await import("./integrations.server");
    const env: { appkey?: string; secret?: string; user?: string; pass?: string; base: string } = await sungrowEnvFor(row.tenant_id as string).catch(() => ({ base: "https://gateway.isolarcloud.com.hk" }));
    const provider = (row.provider as string) || "sungrow";
    const sma: { id?: string; secret?: string; base: string; auth: string } = await smaEnvFor(row.tenant_id as string).catch(() => ({
      base: "https://monitoring.smaapis.de",
      auth: "https://auth.smaapis.de/oauth2/token",
    }));
    const extras = (Array.isArray(row.extra_units) ? row.extra_units : []) as unknown as SolarUnit[];
    const units = [{ provider, plant_id: row.plant_id as string | null, capacity_kwp: cap }, ...extras.map((u) => ({ provider: u.provider, plant_id: u.plant_id, capacity_kwp: Number(u.capacity_kwp) || 0 }))];
    const ok = (p: string) => (p === "sma" ? Boolean(sma.id && sma.secret) : p === "sungrow" && Boolean(env.appkey && env.secret && env.user && env.pass));
    const result = await acquireSolarReading({
      demo: row.demo === true, provider, capacity: units.reduce((s, u) => s + u.capacity_kwp, 0) || cap, previous: row.last_data, now: new Date(),
      configured: units.every((u) => u.plant_id && ok(u.provider)),
      fetchLive: async () => {
        const { fetchSma, fetchSungrow } = await import("./solar-providers.server");
        const one = (u: (typeof units)[number]) => {
          if (!u.plant_id) throw new Error("Missing plant");
          if (u.provider === "sma" && sma.id && sma.secret) return fetchSma({ ...sma, id: sma.id, secret: sma.secret }, u.plant_id, u.capacity_kwp);
          if (u.provider === "sungrow" && env.appkey && env.secret && env.user && env.pass) return fetchSungrow({ ...env, appkey: env.appkey, secret: env.secret, user: env.user, pass: env.pass }, u.plant_id, u.capacity_kwp, true);
          throw new Error("Missing provider configuration");
        };
        // Every inverter must answer; a partial total would look like a production drop.
        const readings: SolarReading[] = [];
        for (let i = 0; i < units.length; i += 6) readings.push(...await Promise.all(units.slice(i, i + 6).map(one)));
        const combined = combineReadings(readings);
        if (!combined) throw new Error('No inverter readings');
        return combined;
      },
    });
    let historyError = false;
    if (result.cache && result.reading) {
      const { error: saveError } = await context.supabase.from("solar_monitoring")
        .update({ last_data: result.reading as never, last_sync: result.reading.at })
        .eq("project_id", data.projectId);
      if (saveError) throw new Error("Unable to save inverter readings.");
      // History snapshots are immutable and written only by the server after the caller passed RLS checks above.
      const { appDatabaseAdmin: supabaseAdmin } = await import("@/lib/app-database.server");
      const { error: snapshotError } = await supabaseAdmin.from("solar_readings").upsert(
        { project_id: data.projectId, tenant_id: row.tenant_id, read_at: result.reading.at, data: result.reading },
        { onConflict: "project_id,read_at", ignoreDuplicates: true },
      );
      historyError = Boolean(snapshotError);
      if (snapshotError) console.error("Solar history save failed", snapshotError.code);
    }
    return { reading: result.reading, error: result.error, historyError, stale: row.demo !== true && isStale(result.reading?.at ?? null, new Date()) };
  });

/** Staff sets or clears the client's portal password; the hash is computed server-side only. */
export const setSolarPortalPassword = createServerFn({ method: "POST" })
  .middleware([requireAppDatabaseAuth])
  .inputValidator((d: { token: string; password: string }) => {
    if (typeof d?.token !== "string" || d.token.length < 16 || d.token.length > 128) throw new Error("bad token");
    if (typeof d.password !== "string" || d.password.length > 64 || (d.password && d.password.length < 4)) throw new Error("كلمة السر بين 4 و64 حرفاً");
    return d;
  })
  .handler(async ({ data, context }) => {
    // RLS on share_links decides whether this user may manage the link.
    const { hashTeamPassword } = await import("./telegram-security.server");
    const h = data.password ? hashTeamPassword(data.password) : null;
    const { data: rows, error } = await context.supabase.from("share_links")
      .update({ password_hash: h?.hash ?? null, password_salt: h?.salt ?? null })
      .eq("token", data.token).eq("entity_type", "solar").select("id");
    if (error || !rows?.length) throw new Error("تعذر حفظ كلمة السر");
    return { ok: true };
  });

/** Public client view: verified by the unguessable share token (+ optional password), returns only display-safe readings. */
export const getSolarPortal = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; password?: string }) => {
    if (typeof d?.token !== "string" || d.token.length < 16 || d.token.length > 128) throw new Error("bad token");
    if (d.password !== undefined && (typeof d.password !== "string" || d.password.length > 64)) throw new Error("bad password");
    return d;
  })
  .handler(async ({ data }) => {
    const { appDatabaseAdmin: supabaseAdmin } = await import("@/lib/app-database.server");
    const admin = supabaseAdmin as any;
    const { data: link } = await admin.from("share_links").select("*").eq("token", data.token).eq("entity_type", "solar").maybeSingle();
    if (!link || link.revoked || new Date(link.expires_at) < new Date()) return { ok: false as const, needsPassword: false };
    if (link.password_hash) {
      const { verifyTeamPassword } = await import("./telegram-security.server");
      if (!data.password) return { ok: false as const, needsPassword: true, wrong: false };
      if (!verifyTeamPassword(data.password, link.password_salt, link.password_hash)) return { ok: false as const, needsPassword: true, wrong: true };
    }
    const m = (await admin.from("solar_monitoring").select("capacity_kwp,tariff,last_data,last_sync,provider,demo").eq("project_id", link.entity_id).eq("tenant_id", link.tenant_id).maybeSingle()).data;
    const p = (await admin.from("projects").select("name").eq("id", link.entity_id).maybeSingle()).data;
    const t = (await admin.from("tenants").select("name").eq("id", link.tenant_id).maybeSingle()).data;
    const reading = matchingReading(m?.last_data, m?.demo === true, m?.provider || "sungrow");
    const now = new Date();
    const { data: hist } = await admin.from("solar_readings").select("read_at,data")
      .eq("project_id", link.entity_id).eq("tenant_id", link.tenant_id)
      .gte("read_at", new Date(now.getTime() - 30 * 86_400_000).toISOString()).limit(3000);
    const valid = ((hist ?? []) as { read_at: string; data: unknown }[]).flatMap((row) => {
      const r = matchingReading(row.data, m?.demo === true, m?.provider || "sungrow");
      return r ? [{ read_at: row.read_at, data: r }] : [];
    });
    const daily = dailyProduction(valid, now, 30);
    return { ok: true as const, project: p?.name ?? "", company: t?.name ?? "", tariff: Number(m?.tariff ?? 0), capacity: Number(m?.capacity_kwp ?? 0), reading, daily, lastSync: reading?.at ?? null, stale: isStale(m?.last_sync ?? null, now) };
  });

/** Tenant-scoped reading history of the last 30 days, newest first (for daily-production comparison). */
export const getSolarHistory = createServerFn({ method: "POST" })
  .middleware([requireAppDatabaseAuth])
  .inputValidator((d: { projectId: string }) => {
    if (!d?.projectId || typeof d.projectId !== "string") throw new Error("projectId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: monitor, error: monitorError } = await context.supabase.from("solar_monitoring")
      .select("provider,demo").eq("project_id", data.projectId).maybeSingle();
    if (monitorError) throw new Error("Unable to load reading history.");
    if (!monitor) return [];
    const { data: rows, error } = await context.supabase
      .from("solar_readings")
      .select("read_at, data")
      .eq("project_id", data.projectId)
      .gte("read_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order("read_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error("Unable to load reading history.");
    return (rows ?? []).flatMap((row) => {
      const reading = matchingReading(row.data, monitor.demo === true, monitor.provider);
      return reading ? [{ read_at: row.read_at, data: reading }] : [];
    });
  });
