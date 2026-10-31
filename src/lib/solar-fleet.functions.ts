import { createServerFn } from '@tanstack/react-start';
import { requireAppDatabaseAuth } from '@/lib/app-database-auth';
import { z } from 'zod';
import { memberPreferencesSchema } from './telegram-preferences';

export const getSolarFleet = createServerFn({ method: 'GET' }).middleware([requireAppDatabaseAuth]).handler(async ({ context }) => {
  const [stations, projects, monitors, members] = await Promise.all([
    context.supabase.from('solar_fleet_stations').select('*').order('name'),
    context.supabase.from('projects').select('id,name').eq('is_group', false).order('name'),
    context.supabase.from('solar_monitoring').select('project_id,fleet_station_id,provider,plant_id,last_sync,demo,last_data'),
    context.supabase.from('telegram_team_members').select('id,display_name,active,blocked,reports_enabled,joined_at,last_seen_at,logged_out_at,system_user_id,preferences'),
  ]);
  if (stations.error || projects.error || monitors.error) throw new Error('Unable to load solar fleet.');
  const { data: admin } = await context.supabase.rpc('is_tenant_admin');
  const { data: owner } = await context.supabase.rpc('is_super_admin');
  let team: { id: string; enabled: boolean; daily_enabled: boolean; report_hour: number; alerts_enabled: boolean; report_templates: string[] } | null = null;
  let selected: string[] = [];
  if (admin || owner) {
    const { data: tenantId } = await context.supabase.rpc('current_tenant_id');
    const { appDatabaseAdmin: supabaseAdmin } = await import('@/lib/app-database.server');
    const result = await supabaseAdmin.from('telegram_teams').select('id,enabled,daily_enabled,report_hour,alerts_enabled,report_templates').eq('tenant_id', tenantId || '').maybeSingle();
    team = result.data ? { ...result.data, report_templates: Array.isArray(result.data.report_templates) ? (result.data.report_templates as string[]) : ['status'] } : null;
    if (team) selected = (await supabaseAdmin.from('telegram_team_projects').select('project_id').eq('team_id', team.id)).data?.map(p => p.project_id) || [];
  }
  const users = (admin || owner) ? (await context.supabase.from('profiles').select('id,full_name,email,is_active').eq('tenant_id',(await context.supabase.rpc('current_tenant_id')).data || '')).data || [] : [];
  return { users, stations: stations.data || [], projects: projects.data || [], monitors: monitors.data || [], members: members.data || [], team, selected, isAdmin: Boolean(admin || owner) };
});

export const importSolarStations = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: z.enum(['sungrow','sma']) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc('is_tenant_admin');
    const { data: owner } = await context.supabase.rpc('is_super_admin');
    const { data: permitted } = await context.supabase.rpc('has_perm', { _module: 'projects', _action: 'edit' });
    const { data: tenantId } = await context.supabase.rpc('current_tenant_id');
    if (!(admin || owner) || !permitted || !tenantId) throw new Error('Forbidden');
    const { appDatabaseAdmin: supabaseAdmin } = await import('@/lib/app-database.server');
    // Shared server credentials are claimed once for one tenant, never exposed to other companies.
    const { sungrowEnvFor } = await import('./integrations.server');
    const sg = data.provider === 'sungrow' ? await sungrowEnvFor(tenantId) : null;
    const { data: account, error: existingError } = await supabaseAdmin.from('solar_provider_accounts').select('id,tenant_id').eq('provider', data.provider).eq('tenant_id', tenantId).maybeSingle();
    if (existingError) throw new Error('Unable to verify provider ownership');
    // Platform (shared) credentials may still be claimed by only one company; own credentials are private to the company.
    if (!account && !sg?.own) {
      const { data: others } = await supabaseAdmin.from('solar_provider_accounts').select('tenant_id').eq('provider', data.provider).neq('tenant_id', tenantId);
      for (const o of others || []) {
        const own = await sungrowEnvFor(o.tenant_id).then(e => e.own).catch(() => false);
        if (!own) throw new Error('This provider account is already assigned to another company. أدخل مفاتيح سن غرو الخاصة بشركتك من إعدادات الربط.');
      }
    }
    const { discoverStations } = await import('./solar-providers.server');
    const stations = await discoverStations(data.provider, sg ?? undefined);
    let accountId = account?.id;
    if (!accountId) {
      const inserted = await supabaseAdmin.from('solar_provider_accounts').insert({ tenant_id: tenantId, provider: data.provider }).select('id').single();
      if (inserted.error || !inserted.data) throw new Error('Unable to assign provider account');
      accountId = inserted.data.id;
    }
    if (stations.length) {
      const result = await supabaseAdmin.from('solar_fleet_stations').upsert(stations.map(s => ({ ...s, account_id: accountId, tenant_id: tenantId, provider: data.provider, imported_at: new Date().toISOString() })), { onConflict: 'account_id,plant_id' });
      if (result.error) throw new Error('Unable to save station list');
    }
    return { count: stations.length };
  });

type Ctx = { supabase: import('@supabase/supabase-js').SupabaseClient<import('@/lib/app-database.types').Database> };
async function linkStation(context: Ctx, stationId: string, projectId: string | null) {
  const station = (await context.supabase.from('solar_fleet_stations').select('*').eq('id', stationId).single()).data;
  if (!station) throw new Error('Station unavailable');
  const { data: current } = await context.supabase.from('solar_monitoring').select('project_id').eq('fleet_station_id', station.id).maybeSingle();
  if (current && projectId === current.project_id) return station;
  if (current) {
    const result = await context.supabase.from('solar_monitoring').update({ fleet_station_id: null, plant_id: null, last_data: null, last_sync: null }).eq('fleet_station_id', station.id);
    if (result.error) throw new Error('Unable to unlink station');
  }
  if (!projectId) return station;
  const project = (await context.supabase.from('projects').select('id,tenant_id').eq('id', projectId).eq('tenant_id', station.tenant_id).eq('is_group', false).single()).data;
  if (!project) throw new Error('Project unavailable');
  const result = await context.supabase.from('solar_monitoring').upsert({ project_id: project.id, tenant_id: project.tenant_id, fleet_station_id: station.id, provider: station.provider, plant_id: station.plant_id, capacity_kwp: station.capacity_kwp, demo: false, last_data: null, last_sync: null }, { onConflict: 'project_id' });
  if (result.error) throw new Error('هذا المشروع مرتبط بمحطة أخرى');
  return station;
}
async function requireEdit(context: Ctx) {
  const { data: permitted } = await context.supabase.rpc('has_perm', { _module: 'projects', _action: 'edit' });
  if (!permitted) throw new Error('Forbidden');
}
export const bindSolarStation = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ stationId: z.string().uuid(), projectId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEdit(context);
    await linkStation(context, data.stationId, data.projectId);
    return { ok: true };
  });

export const createProjectsForStations = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ stationIds: z.array(z.string().uuid()).min(1).max(200), name: z.string().trim().min(1).max(200).optional(), ready: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEdit(context);
    const { data: canAdd } = await context.supabase.rpc('has_perm', { _module: 'projects', _action: 'create' });
    if (!canAdd) throw new Error('Forbidden');
    let count = 0; const ids: string[] = [];
    for (const id of data.stationIds) {
      const station = (await context.supabase.from('solar_fleet_stations').select('id,name,tenant_id').eq('id', id).single()).data;
      if (!station) continue;
      const created = await context.supabase.from('projects').insert({ tenant_id: station.tenant_id, name: (data.stationIds.length === 1 && data.name) || station.name, is_group: false, is_active: true, status: data.ready ? 'completed' : 'active', ...(data.ready ? { completion_pct: 100 } : {}), contract_value: 0, currency: 'USD' }).select('id').single();
      if (created.error || !created.data) throw new Error('تعذر إنشاء المشروع: ' + (created.error?.message || ''));
      await linkStation(context, station.id, created.data.id);
      if (data.ready) {
        // Ready monitoring station: solar template + completed status so the project opens straight on live monitoring.
        const { templateRows } = await import('./solar');
        const wbs = await context.supabase.from('project_wbs').insert(templateRows(created.data.id, station.tenant_id, false) as never);
        if (wbs.error) throw new Error('تعذر تجهيز قالب المحطة: ' + wbs.error.message);
        const sp = await context.supabase.from('solar_projects').upsert({ project_id: created.data.id, tenant_id: station.tenant_id } as never, { onConflict: 'project_id' });
        if (sp.error) throw new Error('تعذر تجهيز المحطة: ' + sp.error.message);
      }
      ids.push(created.data.id);
      count++;
    }
    return { count, ids };
  });

export const bulkStationsAction = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ stationIds: z.array(z.string().uuid()).min(1).max(500), action: z.enum(['unlink', 'delete']) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEdit(context);
    if (data.action === 'delete') {
      const { data: admin } = await context.supabase.rpc('is_tenant_admin');
      const { data: owner } = await context.supabase.rpc('is_super_admin');
      if (!(admin || owner)) throw new Error('Forbidden');
    }
    const rows = (await context.supabase.from('solar_fleet_stations').select('id,tenant_id').in('id', data.stationIds)).data || [];
    for (const r of rows) await linkStation(context, r.id, null);
    if (data.action === 'delete' && rows.length) {
      const { appDatabaseAdmin: supabaseAdmin } = await import('@/lib/app-database.server');
      for (const r of rows) {
        const res = await supabaseAdmin.from('solar_fleet_stations').delete().eq('id', r.id).eq('tenant_id', r.tenant_id);
        if (res.error) throw new Error('تعذر حذف المحطة');
      }
    }
    return { count: rows.length };
  });

export const saveTelegramTeam = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(12).max(128).optional(), enabled: z.boolean(), daily: z.boolean(), hour: z.number().int().min(0).max(23), alerts: z.boolean(), templates: z.array(z.enum(['status','today','alarms','top','attention','finance'])).max(6).default(['status']), projects: z.array(z.string().uuid()).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc('is_tenant_admin');
    const { data: owner } = await context.supabase.rpc('is_super_admin');
    const { data: tenantId } = await context.supabase.rpc('current_tenant_id');
    const { data: permitted } = await context.supabase.rpc('has_perm', { _module: 'projects', _action: 'view' });
    if (!(admin || owner) || !tenantId || !permitted) throw new Error('Forbidden');
    const allowed = (await context.supabase.from('projects').select('id').eq('tenant_id', tenantId).eq('is_group', false)).data || [];
    if (data.projects.some(id => !allowed.some(p => p.id === id))) throw new Error('Project unavailable');
    const { appDatabaseAdmin: supabaseAdmin } = await import('@/lib/app-database.server');
    const existing = (await supabaseAdmin.from('telegram_teams').select('id').eq('tenant_id', tenantId).maybeSingle()).data;
    const settings = { enabled: data.enabled, daily_enabled: data.daily, report_hour: data.hour, alerts_enabled: data.alerts, report_templates: data.templates };
    let id = existing?.id;
    if (!id) {
      if (!data.password) throw new Error('A team password is required.');
      const { hashTeamPassword } = await import('./telegram-security.server');
      const hashed = hashTeamPassword(data.password);
      const result = await supabaseAdmin.from('telegram_teams').insert({ ...settings, tenant_id: tenantId, password_hash: hashed.hash, password_salt: hashed.salt }).select('id').single();
      if (result.error || !result.data) throw new Error('Unable to create team');
      id = result.data.id;
    } else {
      const { hashTeamPassword } = await import('./telegram-security.server');
      const hashed = data.password ? hashTeamPassword(data.password) : null;
      const result = await supabaseAdmin.from('telegram_teams').update({ ...settings, ...(hashed ? { password_hash: hashed.hash, password_salt: hashed.salt } : {}) }).eq('id', id);
      if (result.error) throw new Error('Unable to save team');
    }
    // Remove access before adding replacements: failures fail closed.
    const deleted = await supabaseAdmin.from('telegram_team_projects').delete().eq('team_id', id);
    if (deleted.error) throw new Error('Unable to update team projects');
    if (data.projects.length) {
      const inserted = await supabaseAdmin.from('telegram_team_projects').insert([...new Set(data.projects)].map(project_id => ({ team_id: id, tenant_id: tenantId, project_id })));
      if (inserted.error) throw new Error('Unable to save team projects');
    }
    return { id, url: `https://t.me/KFP_solar_bot?start=team_${id}` };
  });

export const setTelegramMember = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean().optional(), blocked: z.boolean().optional(), reports_enabled: z.boolean().optional(), remove: z.boolean().optional(), system_user_id: z.string().uuid().nullable().optional(), preferences: memberPreferencesSchema.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc('has_perm', { _module: 'projects', _action: 'view' });
    const { data: admin } = await context.supabase.rpc('is_tenant_admin');
    const { data: owner } = await context.supabase.rpc('is_super_admin');
    if (!allowed || !(admin || owner)) throw new Error('Forbidden');
    const member = (await context.supabase.from('telegram_team_members').select('id,tenant_id,team_id').eq('id', data.id).single()).data;
    if (!member) throw new Error('Forbidden');
    const { appDatabaseAdmin: supabaseAdmin } = await import('@/lib/app-database.server');
    if (data.system_user_id) {
      const profile = (await context.supabase.from('profiles').select('id').eq('id',data.system_user_id).eq('tenant_id',member.tenant_id).maybeSingle()).data;
      if (!profile) throw new Error('مستخدم النظام غير متاح في هذه الشركة');
    }
    if (data.preferences?.projects) {
      const allowedIds = (await supabaseAdmin.from('telegram_team_projects').select('project_id').eq('team_id',member.team_id).eq('tenant_id',member.tenant_id)).data?.map(p => p.project_id) || [];
      if (data.preferences.projects.some(id => !allowedIds.includes(id))) throw new Error('اختر مشاريع مسموحة للفريق فقط');
    }
    const { recordTelegramEvent } = await import('./telegram-onboarding.server');
    if (!data.remove) await recordTelegramEvent(supabaseAdmin, member, data.blocked === true ? 'blocked' : data.blocked === false ? 'unblocked' : data.reports_enabled !== undefined ? 'reports_changed' : 'access_changed');
    const result = data.remove ? await supabaseAdmin.from('telegram_team_members').delete().eq('id', member.id).eq('tenant_id', member.tenant_id) : await supabaseAdmin.from('telegram_team_members').update({ ...(data.system_user_id !== undefined ? { system_user_id: data.system_user_id } : {}), ...(data.preferences ? { preferences: data.preferences } : {}), ...(data.active !== undefined ? { active: data.active } : {}), ...(data.blocked !== undefined ? { blocked: data.blocked, ...(data.blocked ? { active: false } : {}) } : {}), ...(data.reports_enabled !== undefined ? { reports_enabled: data.reports_enabled } : {}) }).eq('id', member.id).eq('tenant_id', member.tenant_id);
    if (result.error) throw new Error('Unable to update member');
    return { ok: true };
  });

export const getTelegramMemberEvents = createServerFn({ method: 'GET' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from('telegram_member_events').select('id,event,created_at').eq('member_id', data.id).order('created_at', { ascending: false }).limit(100);
    if (result.error) throw new Error('Unable to load activity'); return result.data;
  });

async function botOwner(context: { supabase: import('@supabase/supabase-js').SupabaseClient<import('@/lib/app-database.types').Database> }) {
  const admin = (await context.supabase.rpc('is_tenant_admin')).data;
  const owner = (await context.supabase.rpc('is_super_admin')).data;
  const allowed = (await context.supabase.rpc('has_perm', { _module: 'projects', _action: 'view' })).data;
  const tenant = (await context.supabase.rpc('current_tenant_id')).data;
  const account = (await context.supabase.from('solar_provider_accounts').select('id').eq('tenant_id', tenant || '').eq('provider', 'sungrow').maybeSingle()).data;
  if (!(admin || owner) || !allowed || !account) throw new Error('Forbidden');
}
export const saveTelegramIdentity = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(64), description: z.string().max(512), shortDescription: z.string().max(120), photo: z.string().max(4_000_000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await botOwner(context);
    const { telegramCall, telegramPhoto } = await import('./telegram.server');
    await telegramCall('setMyName', { name: data.name });
    await telegramCall('setMyDescription', { description: data.description });
    await telegramCall('setMyShortDescription', { short_description: data.shortDescription });
    if (data.photo) await telegramPhoto(data.photo);
    return { ok: true };
  });
export const getTelegramIdentity = createServerFn({ method: 'GET' }).middleware([requireAppDatabaseAuth]).handler(async ({ context }) => {
  await botOwner(context);
  const { telegramCall } = await import('./telegram.server');
  const [name, description, short] = await Promise.all([telegramCall('getMyName', {}), telegramCall('getMyDescription', {}), telegramCall('getMyShortDescription', {})]);
  return { name: name.result?.name || '', description: description.result?.description || '', shortDescription: short.result?.short_description || '' };
});
const sgFields = ['appkey', 'secret', 'user', 'pass', 'base'] as const;
async function integrationGuard(context: Ctx) {
  const { data: admin } = await context.supabase.rpc('is_tenant_admin');
  const { data: owner } = await context.supabase.rpc('is_super_admin');
  const { data: tenantId } = await context.supabase.rpc('current_tenant_id');
  if (!(admin || owner) || !tenantId) throw new Error('Forbidden');
  return { tenantId: tenantId as string, owner: Boolean(owner) };
}
/** Returns which settings are stored, never the secret values. */
export const getIntegrationSettings = createServerFn({ method: 'GET' }).middleware([requireAppDatabaseAuth]).handler(async ({ context }) => {
  const { tenantId, owner } = await integrationGuard(context);
  const { readIntegration } = await import('./integrations.server');
  const sg = await readIntegration(tenantId, 'sungrow');
  const tg = owner ? await readIntegration(null, 'telegram') : {};
  return {
    sungrow: { appkey: sg.appkey || '', user: sg.user || '', base: sg.base || '', hasSecret: Boolean(sg.secret), hasPass: Boolean(sg.pass) },
    telegram: { canEdit: owner, hasToken: Boolean((tg as import('./integrations.server').IntegrationConfig).bot_token), username: (tg as import('./integrations.server').IntegrationConfig).username || '' },
  };
});
export const saveSungrowSettings = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ appkey: z.string().trim().max(200), secret: z.string().max(500).optional(), user: z.string().trim().max(200), pass: z.string().max(500).optional(), base: z.string().trim().url().max(200).or(z.literal('')), clear: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { tenantId } = await integrationGuard(context);
    const { readIntegration, writeIntegration } = await import('./integrations.server');
    if (data.clear) { await writeIntegration(tenantId, 'sungrow', {}); return { ok: true }; }
    const old = await readIntegration(tenantId, 'sungrow');
    const next: Record<string, string | undefined> = { appkey: data.appkey, user: data.user, base: data.base, secret: data.secret || old.secret || '', pass: data.pass || old.pass || '' };
    for (const k of sgFields) if (!next[k]) delete next[k];
    await writeIntegration(tenantId, 'sungrow', next as import('./integrations.server').IntegrationConfig);
    return { ok: true };
  });
export const testSungrowSettings = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth]).handler(async ({ context }) => {
  const { tenantId } = await integrationGuard(context);
  const { sungrowEnvFor } = await import('./integrations.server');
  const { discoverStations } = await import('./solar-providers.server');
  try {
    const env = await sungrowEnvFor(tenantId);
    const stations = await discoverStations('sungrow', env);
    return { ok: true, own: env.own, stations: stations.length, message: '' };
  } catch (e) { return { ok: false, own: false, stations: 0, message: e instanceof Error ? e.message : 'فشل الاتصال' }; }
});
/** Platform bot token (one shared bot): only the platform owner can change it; webhook is re-registered on save. */
export const saveTelegramToken = createServerFn({ method: 'POST' }).middleware([requireAppDatabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().regex(/^\d+:[\w-]{20,}$/, 'رمز البوت غير صحيح'), origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { owner } = await integrationGuard(context);
    if (!owner) throw new Error('Forbidden');
    const me = await fetch(`https://api.telegram.org/bot${data.token}/getMe`).then(r => r.json()) as { ok?: boolean; result?: { username?: string } };
    if (!me.ok) throw new Error('رمز البوت مرفوض من تلغرام');
    const { writeIntegration } = await import('./integrations.server');
    await writeIntegration(null, 'telegram', { bot_token: data.token, username: me.result?.username || '' });
    const { webhookSecret, telegramCall } = await import('./telegram.server');
    const origin = new URL(data.origin).origin;
    await telegramCall('setWebhook', { url: `${origin}/api/public/telegram/webhook`, secret_token: await webhookSecret() });
    return { username: me.result?.username || '' };
  });
