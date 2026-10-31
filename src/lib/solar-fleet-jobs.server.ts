import { discoverStations, fetchSma, fetchSungrow } from './solar-providers.server';
import { combineReadings, matchingReading, newAlertText, type SolarUnit } from './solar-monitor';
import { alarmKey, reportClock, teamReportRows } from './telegram-team';
import { formatReport, REPORT_KINDS, sendTelegram, type ReportKind } from './telegram.server';
import { effectiveMemberAccess } from './telegram-access.server';
import { memberTemplates, alertRows,redactReportFinance } from './telegram-preferences';
import { createHash } from 'node:crypto';
export async function syncFleetJob() {
  const { appDatabaseAdmin: admin } = await import('@/lib/app-database.server');
  const accounts = (await admin.from('solar_provider_accounts').select('id,tenant_id,provider').eq('enabled',true)).data || [];
  let updated = 0, failed = 0;
  for (const account of accounts) {
    let sgCache: Promise<import('./integrations.server').SungrowEnv> | null = null;
    const sgEnv = () => (sgCache ??= import('./integrations.server').then(m => m.sungrowEnvFor(account.tenant_id)));
    try {
      const tenant = (await admin.from('tenants').select('is_active,sub_end').eq('id',account.tenant_id).single()).data;
      if (!tenant?.is_active || String(tenant.sub_end) < new Date().toISOString().slice(0,10)) continue;
      const monitors = (await admin.from('solar_monitoring').select('*').eq('tenant_id',account.tenant_id).eq('provider',account.provider).eq('demo',false).not('fleet_station_id','is',null)).data || [];
      for (const monitor of monitors) {
        try {
          if (!monitor.plant_id) continue;
          const smaEnv = () => { const id = process.env['SMA_CLIENT_ID'], secret = process.env['SMA_CLIENT_SECRET']; if (!id || !secret) throw new Error('SMA unavailable'); return { id,secret,base:process.env['SMA_BASE_URL'] || 'https://monitoring.smaapis.de',auth:process.env['SMA_AUTH_URL'] || 'https://auth.smaapis.de/oauth2/token' }; };
          const units = [{ provider: account.provider as string, plant_id: monitor.plant_id as string, capacity_kwp: Number(monitor.capacity_kwp) }, ...((Array.isArray(monitor.extra_units) ? monitor.extra_units : []) as unknown as SolarUnit[]).map((u) => ({ provider: u.provider as string, plant_id: u.plant_id, capacity_kwp: Number(u.capacity_kwp) || 0 }))];
          // All inverters of the project must answer; partial totals would look like a production drop.
          const readings = [];
          for (let i = 0; i < units.length; i += 6) readings.push(...await Promise.all(units.slice(i,i+6).map(async (u) => u.provider === 'sungrow' ? fetchSungrow(await sgEnv(), u.plant_id, u.capacity_kwp) : fetchSma(smaEnv(), u.plant_id, u.capacity_kwp))));
          const reading = combineReadings(readings);
          if (!reading) throw new Error('No readings');
          if (!matchingReading(reading,false,account.provider)) throw new Error('Invalid reading');
          const saved = await admin.from('solar_monitoring').update({ last_data:reading,last_sync:reading.at }).eq('project_id',monitor.project_id).eq('tenant_id',account.tenant_id).eq('plant_id',monitor.plant_id).eq('demo',false);
          if (saved.error) throw new Error('Unable to save reading');
          const history = await admin.from('solar_readings').upsert({ project_id:monitor.project_id,tenant_id:account.tenant_id,read_at:reading.at,data:reading },{ onConflict:'project_id,read_at',ignoreDuplicates:true });
          if (history.error) throw new Error('Unable to save history');
          const alert = newAlertText(matchingReading(monitor.last_data,false,account.provider), reading);
          if (alert) {
            const name = (await admin.from('projects').select('name').eq('id',monitor.project_id).maybeSingle()).data?.name || 'محطة';
            // Company-wide notification: every account in the company sees station alarms instantly.
            await admin.rpc('emit_notification',{ _tenant:account.tenant_id,_kind:'solar_alarm',_title:`⚠️ ${name}`,_body:alert,_link:`/projects/${monitor.project_id}` });
          }
          updated++;
        } catch { failed++; }
      }
    } catch { failed++; }
    try { await performanceCheck(admin, account.tenant_id, account.provider); } catch (e) { console.error('Performance check failed', e); }
  }
  const alerts = await sendTeamReportsJob(true);
  return { updated,failed,alerts:alerts.sent };
}

/** Daily fleet comparison; solar_performance_flags (unique project/day) makes the alert fire once per day. */
async function performanceCheck(admin: Awaited<typeof import('@/lib/app-database.server')>['appDatabaseAdmin'], tenantId: string, provider: string) {
  const { completeDays, lowPerformanceStations, performanceAlertText } = await import('./solar-performance');
  const now = new Date();
  const days = completeDays(now);
  const today = now.toISOString().slice(0, 10);
  const monitors = (await admin.from('solar_monitoring').select('project_id,capacity_kwp,last_data,provider,demo,projects!inner(name,status)').eq('tenant_id', tenantId).eq('provider', provider).eq('demo', false)).data || [];
  if (monitors.length < 3) return;
  const ids = monitors.map((m) => m.project_id);
  const done = (await admin.from('solar_performance_flags').select('project_id').eq('tenant_id', tenantId).eq('day', today)).data || [];
  const hist = (await admin.from('solar_readings').select('project_id,read_at,data').eq('tenant_id', tenantId).in('project_id', ids).gte('read_at', `${days[0]}T00:00:00Z`).lt('read_at', `${today}T00:00:00Z`).limit(20000)).data || [];
  const stations = monitors.map((m) => {
    const daily: Record<string, number> = {};
    for (const h of hist) {
      if (h.project_id !== m.project_id) continue;
      const kwh = (h.data as { today_kwh?: unknown } | null)?.today_kwh;
      if (typeof kwh !== 'number' || !Number.isFinite(kwh)) continue;
      const day = h.read_at.slice(0, 10);
      daily[day] = Math.max(daily[day] ?? 0, kwh);
    }
    const r = matchingReading(m.last_data, false, provider);
    return { id: m.project_id, capacity_kwp: Number(r?.capacity_kwp) || Number(m.capacity_kwp) || 0, faulty: !r || r.status === 'fault' || r.alarms.length > 0, daily };
  });
  for (const flag of lowPerformanceStations(stations, days)) {
    if (done.some((d) => d.project_id === flag.id)) continue;
    const claim = await admin.from('solar_performance_flags').insert({ tenant_id: tenantId, project_id: flag.id, day: today, ratio: flag.ratio }).select('id').maybeSingle();
    if (claim.error || !claim.data) continue;
    const m = monitors.find((x) => x.project_id === flag.id) as { projects?: { name?: string } } | undefined;
    const text = performanceAlertText(m?.projects?.name || 'محطة', flag.ratio);
    await admin.rpc('emit_notification', { _tenant: tenantId, _kind: 'solar_alarm', _title: '🧽 انخفاض كفاءة', _body: text, _link: `/projects/${flag.id}` });
    // Telegram: only members whose effective access includes this station.
    const teams = (await admin.from('telegram_teams').select('id,tenant_id,alerts_enabled').eq('tenant_id', tenantId).eq('enabled', true).eq('alerts_enabled', true)).data || [];
    for (const team of teams) {
      const allowed = (await admin.from('telegram_team_projects').select('project_id').eq('team_id', team.id).eq('tenant_id', tenantId)).data?.map((p) => p.project_id) || [];
      if (!allowed.includes(flag.id)) continue;
      const members = (await admin.from('telegram_team_members').select('*').eq('team_id', team.id).eq('tenant_id', tenantId).eq('active', true).eq('blocked', false).eq('reports_enabled', true)).data || [];
      for (const member of members) {
        const access = await effectiveMemberAccess(admin, member, allowed);
        if (!access.ids.includes(flag.id)) continue;
        const deliv = await admin.from('telegram_deliveries').insert({ member_id: member.id, delivery_key: `perf:${today}:${flag.id}` }).select('id').single();
        if (deliv.error || !deliv.data) continue;
        try { await sendTelegram(Number(member.chat_id), `🧽 ${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] || c)}`); await admin.from('telegram_deliveries').update({ state: 'sent' }).eq('id', deliv.data.id); }
        catch { await admin.from('telegram_deliveries').update({ state: 'failed' }).eq('id', deliv.data.id); }
      }
    }
  }
}
export async function sendTeamReportsJob(alertsOnly = false) {
  const { appDatabaseAdmin: admin } = await import('@/lib/app-database.server');
  const teams = (await admin.from('telegram_teams').select('*').eq('enabled',true)).data || [];
  const now = new Date(), clock = reportClock(now);
  let sent = 0;
  for (const team of teams) {
    const tenant = (await admin.from('tenants').select('is_active,sub_end').eq('id',team.tenant_id).single()).data;
    if (!tenant?.is_active || String(tenant.sub_end) < clock.day) continue;
    const allowed = (await admin.from('telegram_team_projects').select('project_id').eq('team_id',team.id).eq('tenant_id',team.tenant_id)).data?.map(p=>p.project_id) || [];
    if (!allowed.length) continue;
    const monitors = (await admin.from('solar_monitoring').select('project_id,tenant_id,provider,demo,last_data,last_sync,projects!inner(name)').eq('tenant_id',team.tenant_id).in('project_id',allowed)).data || [];
    const rows = teamReportRows(monitors,allowed);
    const members = (await admin.from('telegram_team_members').select('*').eq('team_id',team.id).eq('tenant_id',team.tenant_id).eq('active',true).eq('blocked',false).eq('reports_enabled',true)).data || [];
    for (const member of members) {
      const active = (await admin.from('telegram_team_members').select('*').eq('id',member.id).eq('tenant_id',team.tenant_id).single()).data;
      if (!active?.active || active.blocked || !active.reports_enabled) continue;
      const access = await effectiveMemberAccess(admin,active,allowed);
      const memberRows = redactReportFinance(rows.filter(r => access.ids.includes(r.id)),access.finance);
      if (!memberRows.length) continue;
      const deliveries: { key:string; text:string }[] = [];
      if (!alertsOnly && team.daily_enabled && clock.hour === (access.preferences.hour ?? team.report_hour)) {
        for (const kind of memberTemplates(Array.isArray(team.report_templates) ? team.report_templates as string[] : ['status'],access.preferences,access.finance)) {
          deliveries.push({ key:kind === 'status' ? `daily:${clock.day}` : `daily:${clock.day}:${kind}`, text:formatReport(kind,memberRows) });
        }
      }
      const alerts = alertRows(memberRows,access.preferences.alerts);
      const alarm = alarmKey(alerts,now);
      if (team.alerts_enabled && alarm) deliveries.push({ key:`alarm:${clock.day}:${createHash('sha256').update(alarm).digest('hex')}`,text:formatReport('alarms',alerts) });
      for (const delivery of deliveries) {
        const claim = await admin.from('telegram_deliveries').insert({ member_id:member.id,delivery_key:delivery.key }).select('id').single();
        if (claim.error || !claim.data) continue;
        const latest = (await admin.from('telegram_team_members').select('*').eq('id',member.id).single()).data;
        if (!latest?.active || latest.blocked || !latest.reports_enabled || latest.system_user_id !== active.system_user_id || JSON.stringify(latest.preferences) !== JSON.stringify(active.preferences)) continue;
        const latestAccess = await effectiveMemberAccess(admin,latest,allowed);
        if (JSON.stringify(latestAccess.ids) !== JSON.stringify(access.ids) || latestAccess.finance !== access.finance) continue;
        try {
          await sendTelegram(Number(member.chat_id),delivery.text,[[{ text:'المشاريع والاستعلام عن الأعطال',callback_data:`t:${team.id}:list` }]]);
          await admin.from('telegram_deliveries').update({ state:'sent' }).eq('id',claim.data.id);
          sent++;
        } catch { await admin.from('telegram_deliveries').update({ state:'failed' }).eq('id',claim.data.id); }
      }
    }
  }
  try { const { sendClientAlertsJob } = await import('./telegram-client.server'); sent += await sendClientAlertsJob(admin); } catch { /* client alerts never block team delivery */ }
  return { sent };
}
