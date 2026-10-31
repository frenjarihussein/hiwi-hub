import { z } from 'zod';
import { effectiveMemberAccess } from './telegram-access.server';
import { redactReportFinance } from './telegram-preferences';
import { timingSafeEqual } from 'node:crypto';
import { webhookSecret, sendTelegram, telegramCall, formatReport, REPORT_KINDS, type ReportKind } from './telegram.server';
import { verifyTeamPassword } from './telegram-security.server';
import { teamReportRows } from './telegram-team';
import { interactiveJoin, recordTelegramEvent } from './telegram-onboarding.server';
const Update = z.object({
  update_id: z.number().int(),
  message: z.object({ message_id: z.number().int(), chat: z.object({ id: z.number().int(), type: z.string() }), from: z.object({ id: z.number().int(), first_name: z.string().max(256).optional() }).optional(), text: z.string().max(4096).optional(), voice: z.object({ file_id: z.string().max(256), duration: z.number().optional(), file_size: z.number().optional() }).optional() }).optional(),
  callback_query: z.object({ id: z.string().max(256), from: z.object({ id: z.number().int() }), data: z.string().max(64).optional(), message: z.object({ chat: z.object({ id: z.number().int(), type: z.string() }) }).optional() }).optional(),
});
export async function handleTelegram(request: Request) {
  const expected = Buffer.from(await webhookSecret());
  const got = Buffer.from(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return new Response('Unauthorized', { status: 401 });
  const parsed = Update.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: true });
  const { message: msg, callback_query: cb } = parsed.data;
  const chat = msg?.chat || cb?.message?.chat;
  const user = msg?.from?.id || cb?.from.id;
  if (!chat || chat.type !== 'private' || !user) return Response.json({ ok: true });
  const chatId = chat.id;
  const { appDatabaseAdmin: admin } = await import('@/lib/app-database.server');
  if (cb) await telegramCall('answerCallbackQuery', { callback_query_id: cb.id });
  const [raw, arg, ...rest] = (msg?.text || '').trim().split(/\s+/);
  const command = (raw || '').split('@')[0]?.toLowerCase();
  if (msg && !(command === '/start' && arg && !arg.startsWith('team_')) && await interactiveJoin(admin, user, chatId, (msg.text || '').trim(), msg.message_id)) return Response.json({ ok: true });
  if (command === '/start' && arg?.startsWith('team_')) {
    const id = arg.slice(5);
    if (!z.string().uuid().safeParse(id).success) return Response.json({ ok: true });
    await sendTelegram(chatId, `للانضمام إلى فريق العمل أرسل:\n/join ${id} كلمة_سر_الفريق\n\nتُحذف رسالة كلمة السر بعد التحقق. الأعضاء الموقوفون يحتاجون موافقة المسؤول.`);
    return Response.json({ ok: true });
  }
  if (command === '/join') {
    if (msg) await telegramCall('deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => undefined);
    if (!arg || !z.string().uuid().safeParse(arg).success || rest.join(' ').length > 128) { await sendTelegram(chatId,'بيانات الانضمام غير صحيحة.'); return Response.json({ ok: true }); }
    const team = (await admin.from('telegram_teams').select('*').eq('id', arg).eq('enabled',true).maybeSingle()).data;
    const existing = team ? (await admin.from('telegram_team_members').select('id,active,blocked').eq('team_id',team.id).eq('telegram_user_id',user).maybeSingle()).data : null;
    if (!team || !verifyTeamPassword(rest.join(' '), team.password_salt, team.password_hash) || existing?.blocked || existing?.active === false) {
      await sendTelegram(chatId,'تعذر الانضمام: تحقق من كلمة السر أو راجع مسؤول الفريق.');
      return Response.json({ ok: true });
    }
    const saved = await admin.from('telegram_team_members').upsert({ team_id: team.id, tenant_id: team.tenant_id, telegram_user_id: user, chat_id: chatId, display_name: msg?.from?.first_name || '', active: true }, { onConflict: 'team_id,telegram_user_id' });
    if (saved.error) throw new Error('Unable to join team');
    await sendTelegram(chatId,'✅ تم الانضمام إلى الفريق.', [[{ text: 'المشاريع', callback_data: `t:${team.id}:list` }]]);
    return Response.json({ ok: true });
  }
  if (command === '/start' && arg?.startsWith('c_')) {
    const { bindClient } = await import('./telegram-client.server');
    await bindClient(admin, arg.slice(2), chatId, user, msg?.from?.first_name || '');
    return Response.json({ ok: true });
  }
  if (cb?.data?.startsWith('c:') || !(await admin.from('telegram_team_members').select('id').eq('telegram_user_id',user).eq('chat_id',chatId).limit(1)).data?.length) {
    const { handleClient, verifyClientPassword } = await import('./telegram-client.server');
    if (!cb && !(command === '/start' && arg) && await verifyClientPassword(admin, chatId, user, msg?.from?.first_name || '', msg?.text)) return Response.json({ ok: true });
    if (!(command === '/start' && arg) && await handleClient(admin, chatId, { cbData: cb?.data, text: msg?.text, voice: msg?.voice, signal: request.signal })) return Response.json({ ok: true });
  }
  if (command === '/start' && arg) {
    const link = (await admin.from('telegram_links').select('user_id,code_expires').eq('link_code',arg).maybeSingle()).data;
    if (!link?.code_expires || new Date(link.code_expires) < new Date()) { await sendTelegram(chatId,'رمز الربط غير صالح أو منتهي.'); return Response.json({ ok:true }); }
    const cleared = await admin.from('telegram_links').update({ chat_id:null }).eq('chat_id',chatId);
    if (cleared.error) throw new Error('Unable to clear old link');
    const saved = await admin.from('telegram_links').update({ chat_id:chatId,link_code:null,code_expires:null,linked_at:new Date().toISOString() }).eq('user_id',link.user_id).eq('link_code',arg).select('tenant_id').maybeSingle();
    if (saved.error || !saved.data) throw new Error('Unable to link account');
    const bound = await admin.from('telegram_team_members').update({ system_user_id:link.user_id }).eq('tenant_id',saved.data.tenant_id).eq('telegram_user_id',user).eq('chat_id',chatId).eq('blocked',false);
    if (bound.error) throw new Error('Unable to link team identity');
    await sendTelegram(chatId,'✅ تم ربط حسابك.\n/status — حالة المحطات\n/today — إنتاج اليوم\n/alarms — الإنذارات');
    return Response.json({ ok:true });
  }
  const memberships = (await admin.from('telegram_team_members').select('id,team_id,tenant_id,active,blocked,system_user_id,preferences').eq('telegram_user_id',user).eq('chat_id',chatId)).data || [];
  if (command === '/logout') {
    for (const member of memberships.filter(m => m.active)) {
      await admin.from('telegram_team_members').update({ active: false, logged_out_at: new Date().toISOString() }).eq('id', member.id);
      await recordTelegramEvent(admin, member, 'logout');
    }
    await sendTelegram(chatId, 'تم تسجيل خروجك وإيقاف التقارير. للعودة افتح رابط فريقك.'); return Response.json({ ok: true });
  }
  let teamId: string | undefined;
  let action = 'list';
  if (cb?.data?.startsWith('t:')) {
    const pieces = cb.data.split(':'); teamId = pieces[1]; action = pieces[2] || 'list';
  } else if (memberships.length === 1) { teamId = memberships[0]?.team_id; action = ({ '/today':'today','/alarms':'alarms','/status':'status','/top':'top','/attention':'attention','/finance':'finance' } as Record<string,string>)[command ?? ''] ?? (msg?.voice ? 'voice' : msg?.text && !msg.text.trim().startsWith('/') && msg.text.trim().length >= 3 ? 'ask' : 'list'); }
  const membership = memberships.find(m => m.team_id === teamId && m.active && !m.blocked);
  if (teamId && membership) {
    const team = (await admin.from('telegram_teams').select('id,tenant_id,enabled').eq('id',teamId).eq('tenant_id',membership.tenant_id).eq('enabled',true).maybeSingle()).data;
    const tenant = (await admin.from('tenants').select('is_active,sub_end').eq('id',membership.tenant_id).single()).data;
    if (!team || !tenant?.is_active || String(tenant.sub_end) < new Date().toISOString().slice(0,10)) { await sendTelegram(chatId,'وصول الفريق غير متاح حالياً.'); return Response.json({ ok:true }); }
    await admin.from('telegram_team_members').update({ last_seen_at: new Date().toISOString() }).eq('id', membership.id);
    await recordTelegramEvent(admin, membership, cb ? 'query' : command === '/start' ? 'login' : 'report');
    const teamAllowed = (await admin.from('telegram_team_projects').select('project_id').eq('team_id',team.id).eq('tenant_id',team.tenant_id)).data?.map(p => p.project_id) || [];
    const access = await effectiveMemberAccess(admin,membership,teamAllowed);
    const allowed = access.ids;
    if (action === 'finance' && !access.finance) { await sendTelegram(chatId,'ليس لديك صلاحية التقرير المالي.'); return Response.json({ ok:true }); }
    const monitors = allowed.length ? (await admin.from('solar_monitoring').select('project_id,tenant_id,provider,demo,last_data,last_sync,projects!inner(name)').eq('tenant_id',team.tenant_id).in('project_id',allowed)).data || [] : [];
    const rows = redactReportFinance(teamReportRows(monitors,allowed),access.finance).sort((a,b)=>a.id.localeCompare(b.id));
    const esc = (s: string) => s.replace(/[&<>]/g,c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[c] || c);
    if ((action === 'ask' && msg?.text) || (action === 'voice' && msg?.voice)) {
      await telegramCall('sendChatAction',{ chat_id:chatId, action:'typing' }).catch(() => undefined);
      try {
        let question = msg.text?.trim() || '';
        if (action === 'voice' && msg.voice) {
          if ((msg.voice.duration ?? 0) > 120) throw new Error('الرسالة الصوتية أطول من دقيقتين.');
          const { telegramFile } = await import('./telegram.server');
          const { transcribeVoice } = await import('./solar-voice.server');
          question = await transcribeVoice(await telegramFile(msg.voice.file_id, 5_000_000), request.signal);
          if (question.length < 2) throw new Error('لم أفهم الرسالة الصوتية، حاول مجدداً.');
          await sendTelegram(chatId,`🎙️ ${esc(question.slice(0,500))}`);
        }
        const { answerSolarQuestion } = await import('./solar-chat.server');
        const answer = await answerSolarQuestion(admin,team.tenant_id,question.slice(0,1000),rows,request.signal);
        await sendTelegram(chatId,`🤖 ${esc(answer)}`,[[{ text:'المشاريع',callback_data:`t:${team.id}:list` }]]);
      } catch(error) { await sendTelegram(chatId,esc(error instanceof Error ? error.message : 'تعذر الرد.')); }
      return Response.json({ ok:true });
    }
    const faultAction = /^a(\d+)_(\d+)$/.exec(action);
    if (faultAction) {
      const row = rows[Number(faultAction[1])];
      const monitor = monitors.find(m => m.project_id === row?.id);
      if (!monitor || monitor.demo) { await sendTelegram(chatId,'لا يوجد عطل متاح للتحليل.'); return Response.json({ ok:true }); }
      await sendTelegram(chatId,'جارٍ تحليل العطل…');
      try {
        const { faultAnalysis } = await import('./solar-fault.server');
        let text = '';
        for await (const part of faultAnalysis(admin,team.tenant_id,monitor,Number(faultAction[2]),request.signal)) text += part;
        await sendTelegram(chatId,text.replace(/[&<>]/g,c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[c] || c));
      } catch(error) { await sendTelegram(chatId,(error instanceof Error ? error.message : 'تعذر التحليل.').replace(/[&<>]/g,c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[c] || c)); }
      return Response.json({ ok:true });
    }
    const kindOf = (r: typeof rows[number]) => ((r.data?.['extra'] ?? {}) as Record<string, unknown>)['plant_kind'];
    const { SYRIA_GOVERNORATES } = await import('./syria-governorates');
    const govRows = allowed.length ? (await admin.from('solar_projects').select('project_id,survey').eq('tenant_id',team.tenant_id).in('project_id',allowed)).data || [] : [];
    const govById = new Map(govRows.map((g: any) => [g.project_id, String(g.survey?.governorate || '')]));
    const govList = SYRIA_GOVERNORATES.map((name, gi) => ({ name, gi, count: rows.filter(r => govById.get(r.id) === name).length })).filter(g => g.count);
    if (action === 'gov') {
      const kb = govList.map(g => [{ text:`📍 ${g.name} (${g.count})`, callback_data:`t:${team.id}:g${g.gi}_0` }]);
      kb.push([{ text:'المشاريع',callback_data:`t:${team.id}:list` }]);
      await sendTelegram(chatId, govList.length ? '📍 اختر المحافظة:' : 'لم تُحدد محافظات للمشاريع بعد.', kb);
      return Response.json({ ok:true });
    }
    const govMatch = /^g(\d+)_(\d+)$/.exec(action);
    const listGov = govMatch ? SYRIA_GOVERNORATES[Number(govMatch[1])] : undefined;
    const kindMatch = /^k(ess|ongrid)(\d*)$/.exec(action);
    const listKind = kindMatch?.[1];
    const isList = action.startsWith('list') || !!kindMatch || !!listGov;
    const page = Math.max(0, Number(govMatch ? govMatch[2] : kindMatch ? kindMatch[2] : action.startsWith('list') ? action.slice(4) : 0) || 0);
    const pool = rows.map((r,i) => ({ r, i })).filter(x => (!listKind || kindOf(x.r) === listKind) && (!listGov || govById.get(x.r.id) === listGov));
    const prefix = listGov ? `g${govMatch![1]}_` : listKind ? `k${listKind}` : 'list';
    const keyboard = pool.slice(page*12,page*12+12).map(({ r, i }) => [{ text:`${kindOf(r) === 'ess' ? '🔋 ' : kindOf(r) === 'ongrid' ? '⚡ ' : ''}${r.name}`.slice(0,60),callback_data:`t:${team.id}:p${i}` }]);
    if (page > 0) keyboard.push([{ text:'السابق',callback_data:`t:${team.id}:${prefix}${page-1}` }]);
    if ((page+1)*12 < pool.length) keyboard.push([{ text:'التالي',callback_data:`t:${team.id}:${prefix}${page+1}` }]);
    keyboard.push([{ text:`🔋 بطاريات (${rows.filter(r => kindOf(r) === 'ess').length})`,callback_data:`t:${team.id}:kess` },{ text:`⚡ أون جريد (${rows.filter(r => kindOf(r) === 'ongrid').length})`,callback_data:`t:${team.id}:kongrid` },{ text:'الكل',callback_data:`t:${team.id}:list` }]);
    keyboard.push([{ text:'📍 حسب المحافظة',callback_data:`t:${team.id}:gov` }]);
    keyboard.push([{ text:'إنتاج اليوم',callback_data:`t:${team.id}:today` },{ text:'الإنذارات',callback_data:`t:${team.id}:alarms` }]);
    keyboard.push([{ text:'الأفضل أداءً',callback_data:`t:${team.id}:top` },{ text:'تحتاج انتباهاً',callback_data:`t:${team.id}:attention` },{ text:'العوائد وCO₂',callback_data:`t:${team.id}:finance` }]);
    if (isList) await sendTelegram(chatId,pool.length ? (listGov ? `📍 مشاريع ${listGov}` : listKind === 'ess' ? '🔋 مشاريع البطاريات' : listKind === 'ongrid' ? '⚡ مشاريع الأون جريد' : '☀️ مشاريع الفريق') : 'لا توجد مشاريع من هذا النوع.',keyboard);
    else {
      const isReport = (REPORT_KINDS as readonly string[]).includes(action);
      const selected = isReport ? rows : /^p\d+$/.test(action) ? rows.slice(Number(action.slice(1)),Number(action.slice(1))+1) : [];
      const analysisButtons = selected.flatMap(row => {
        const alarms = row.data?.['alarms'];
        return row.demo || !Array.isArray(alarms) ? [] : alarms.slice(0,3).map((a,i) => [{ text:`تحليل ${row.name.slice(0,30)} · ${i+1}`,callback_data:`t:${team.id}:a${rows.findIndex(r => r.id === row.id)}_${i}` }]);
      }).slice(0,30);
      await sendTelegram(chatId,formatReport(isReport ? action as ReportKind : 'status',selected),[...analysisButtons,[{ text:'المشاريع',callback_data:`t:${team.id}:list` },{ text:'تحديث',callback_data:`t:${team.id}:${action}` }]]);
    }
    return Response.json({ ok:true });
  }
  if (cb || memberships.length) {
    const active = memberships.filter(m => m.active && !m.blocked);
    await sendTelegram(chatId,active.length ? 'اختر الفريق:' : 'تم إيقاف وصولك؛ راجع مسؤول الفريق.',active.map(m => [{ text:'فريق العمل',callback_data:`t:${m.team_id}:list` }]));
    return Response.json({ ok:true });
  }
  // Legacy personal access follows current user permissions and branch scope, not just tenant membership.
  const link = (await admin.from('telegram_links').select('tenant_id,user_id').eq('chat_id',chatId).maybeSingle()).data;
  if (link) {
    const profile = (await admin.from('profiles').select('tenant_id,is_active,is_tenant_admin,is_super_admin,branch_id,active_branch_id').eq('id',link.user_id).single()).data;
    const permission = (await admin.from('user_permissions').select('can_view').eq('user_id',link.user_id).eq('module','projects').maybeSingle()).data;
    const tenant = (await admin.from('tenants').select('is_active,sub_end').eq('id',link.tenant_id).single()).data;
    const feature = (await admin.from('tenant_features').select('enabled').eq('tenant_id',link.tenant_id).eq('module','projects').maybeSingle()).data;
    if (!profile?.is_active || profile.tenant_id !== link.tenant_id || !tenant?.is_active || String(tenant.sub_end) < new Date().toISOString().slice(0,10) || feature?.enabled === false || !(profile.is_tenant_admin || profile.is_super_admin || permission?.can_view)) {
      await sendTelegram(chatId,'حسابك لا يملك صلاحية عرض المشاريع حالياً.'); return Response.json({ ok:true });
    }
    let projectsQuery = admin.from('projects').select('id').eq('tenant_id',link.tenant_id);
    const branch = profile.branch_id || profile.active_branch_id;
    if (branch) projectsQuery = projectsQuery.eq('branch_id',branch);
    const ids = (await projectsQuery).data?.map(p=>p.id) || [];
    const monitors = ids.length ? (await admin.from('solar_monitoring').select('project_id,tenant_id,provider,demo,last_data,last_sync,projects!inner(name)').eq('tenant_id',link.tenant_id).in('project_id',ids)).data || [] : [];
    await sendTelegram(chatId,formatReport(command === '/today' ? 'today' : command === '/alarms' ? 'alarms' : 'status',teamReportRows(monitors,ids)));
  }
  else await sendTelegram(chatId,'مرحباً، اطلب رابط الفريق وكلمة السر من مسؤولك.');
  return Response.json({ ok:true });
}
