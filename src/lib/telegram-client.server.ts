import type { appDatabaseAdmin as Admin } from '@/lib/app-database.server';
import { sendTelegram, telegramCall, formatReport } from './telegram.server';
import { teamReportRows } from './telegram-team';

type Db = typeof Admin;
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] || c);
const menu = (id: string) => [
  [{ text: '⚡ حالة منظومتي', callback_data: `c:${id}:status` }, { text: '☀️ إنتاج اليوم', callback_data: `c:${id}:today` }],
  [{ text: '🔔 الإنذارات', callback_data: `c:${id}:alarms` }, { text: '💰 العوائد وCO₂', callback_data: `c:${id}:finance` }],
];

export const CLIENT_MAX_ATTEMPTS = 5;

/** Step 1: a valid single-use token marks the chat as pending and asks for the client password. */
export async function bindClient(admin: Db, token: string, chatId: number, _userId: number, _name: string) {
  if (!/^[0-9a-f]{24}$/.test(token)) { await sendTelegram(chatId, 'رابط الزبون غير صالح.'); return; }
  const link = (await admin.from('telegram_client_links').select('id,chat_id,active').eq('token', token).maybeSingle()).data;
  if (!link || !link.active || (link.chat_id && Number(link.chat_id) !== chatId)) { await sendTelegram(chatId, 'رابط الزبون غير صالح أو مستخدم مسبقاً. اطلب رابطاً جديداً من الشركة.'); return; }
  if (link.chat_id) { await sendTelegram(chatId, '✅ منظومتك مرتبطة مسبقاً.', menu(link.id)); return; }
  const saved = await admin.from('telegram_client_links').update({ pending_chat_id: chatId }).eq('id', link.id);
  if (saved.error) throw new Error('Unable to start client binding');
  await sendTelegram(chatId, '🔒 أهلاً بك! أرسل كلمة السر التي أعطتك إياها الشركة.');
}

/** Step 2: verifies the password for a pending chat; locks the link after repeated failures. Returns true when handled. */
export async function verifyClientPassword(admin: Db, chatId: number, userId: number, name: string, text: string | undefined) {
  const link = (await admin.from('telegram_client_links').select('id,active,chat_id,password_hash,password_salt,failed_attempts').eq('pending_chat_id', chatId).is('chat_id', null).eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
  if (!link) return false;
  const pw = (text || '').trim();
  if (!pw || pw.startsWith('/')) { await sendTelegram(chatId, '🔒 أرسل كلمة السر لإكمال الربط.'); return true; }
  const { verifyTeamPassword } = await import('./telegram-security.server');
  const ok = !!link.password_hash && !!link.password_salt && pw.length <= 128 && verifyTeamPassword(pw, link.password_salt, link.password_hash);
  if (!ok) {
    const attempts = (link.failed_attempts || 0) + 1;
    const locked = attempts >= CLIENT_MAX_ATTEMPTS;
    await admin.from('telegram_client_links').update({ failed_attempts: attempts, ...(locked ? { active: false, pending_chat_id: null } : {}) }).eq('id', link.id);
    await sendTelegram(chatId, locked ? '⛔ تم إيقاف الرابط بعد محاولات خاطئة كثيرة. اطلب رابطاً جديداً من الشركة.' : `❌ كلمة السر غير صحيحة. المحاولات المتبقية: ${CLIENT_MAX_ATTEMPTS - attempts}`);
    return true;
  }
  const saved = await admin.from('telegram_client_links').update({ chat_id: chatId, telegram_user_id: userId, display_name: name, linked_at: new Date().toISOString(), pending_chat_id: null, failed_attempts: 0 }).eq('id', link.id).is('chat_id', null);
  if (saved.error) throw new Error('Unable to bind client');
  await sendTelegram(chatId, '✅ تم ربط منظومتك الشمسية.\nيمكنك أيضاً كتابة سؤالك مباشرة أو إرسال رسالة صوتية.', menu(link.id));
  return true;
}

async function clientRows(admin: Db, link: { tenant_id: string; project_id: string }) {
  const monitors = (await admin.from('solar_monitoring').select('project_id,tenant_id,provider,demo,last_data,last_sync,projects!inner(name)').eq('tenant_id', link.tenant_id).eq('project_id', link.project_id)).data || [];
  return teamReportRows(monitors, [link.project_id]);
}

/** Handles any message from a bound client chat; clients only ever see their own project. */
export async function handleClient(admin: Db, chatId: number, opts: { voice?: { file_id: string; duration?: number | undefined } | undefined; cbData?: string | undefined; text?: string | undefined; signal: AbortSignal }) {
  const links = (await admin.from('telegram_client_links').select('id,tenant_id,project_id,active').eq('chat_id', chatId).eq('active', true)).data || [];
  if (!links.length) return false;
  let link = links[0];
  if (!link) return false;
  let action = 'status';
  if (opts.cbData?.startsWith('c:')) {
    const [, id, a] = opts.cbData.split(':');
    const found = links.find(l => l.id === id);
    if (!found) return true;
    link = found; action = a || 'status';
  } else if (links.length > 1 && !opts.text && !opts.voice) {
    const names = (await admin.from('projects').select('id,name').in('id', links.map(l => l.project_id))).data || [];
    await sendTelegram(chatId, 'اختر منظومتك:', links.map(l => [{ text: (names.find(n => n.id === l.project_id)?.name || 'منظومة').slice(0, 60), callback_data: `c:${l.id}:status` }]));
    return true;
  } else {
    const t = (opts.text || '').trim();
    action = ({ '/today': 'today', '/alarms': 'alarms', '/status': 'status', '/start': 'status', '/finance': 'finance' } as Record<string, string>)[t.split(/\s+/)[0]?.toLowerCase() || ''] ?? (opts.voice || (t.length >= 3 && !t.startsWith('/')) ? 'ask' : 'status');
  }
  const tenant = (await admin.from('tenants').select('is_active,sub_end').eq('id', link.tenant_id).single()).data;
  if (!tenant?.is_active || String(tenant.sub_end) < new Date().toISOString().slice(0, 10)) { await sendTelegram(chatId, 'الخدمة غير متاحة حالياً.'); return true; }
  const rows = await clientRows(admin, link);
  if (action === 'ask') {
    await telegramCall('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined);
    try {
      let q = (opts.text || '').trim();
      if (opts.voice) {
        if ((opts.voice.duration ?? 0) > 120) throw new Error('الرسالة الصوتية أطول من دقيقتين.');
        const { telegramFile } = await import('./telegram.server');
        const { transcribeVoice } = await import('./solar-voice.server');
        q = await transcribeVoice(await telegramFile(opts.voice.file_id, 5_000_000), opts.signal);
        await sendTelegram(chatId, `🎙️ ${esc(q.slice(0, 500))}`);
      }
      const { answerSolarQuestion } = await import('./solar-chat.server');
      const answer = await answerSolarQuestion(admin, link.tenant_id, q.slice(0, 1000), rows, opts.signal);
      await sendTelegram(chatId, `🤖 ${esc(answer)}`, menu(link.id));
    } catch (e) { await sendTelegram(chatId, esc(e instanceof Error ? e.message : 'تعذر الرد.')); }
    return true;
  }
  const kind = (['status', 'today', 'alarms', 'finance'].includes(action) ? action : 'status') as 'status' | 'today' | 'alarms' | 'finance';
  await sendTelegram(chatId, rows.length ? formatReport(kind, rows) : 'لم تُربط منظومتك بالمراقبة بعد.', menu(link.id));
  return true;
}

/** Sends an alarm report to each bound client whose own station has a new alarm set. */
export async function sendClientAlertsJob(admin: Db) {
  const links = (await admin.from('telegram_client_links').select('id,tenant_id,project_id,chat_id,last_alert_key').eq('active', true).eq('alerts_enabled', true).not('chat_id', 'is', null)).data || [];
  let sent = 0;
  for (const link of links) {
    const rows = (await clientRows(admin, link)).filter(r => Array.isArray(r.data?.['alarms']) && (r.data?.['alarms'] as unknown[]).length > 0);
    const key = rows.length ? JSON.stringify((rows[0]?.data?.['alarms'] as { code?: string }[]).map(a => a.code)) : '';
    if (key === (link.last_alert_key || '')) continue;
    const claim = await admin.from('telegram_client_links').update({ last_alert_key: key }).eq('id', link.id).eq('last_alert_key', link.last_alert_key ?? '').select('id');
    const claimNull = !claim.data?.length && link.last_alert_key == null ? await admin.from('telegram_client_links').update({ last_alert_key: key }).eq('id', link.id).is('last_alert_key', null).select('id') : null;
    if (!claim.data?.length && !claimNull?.data?.length) continue;
    if (!key) continue;
    try { await sendTelegram(Number(link.chat_id), `🚨 تنبيه لمنظومتك\n${formatReport('alarms', rows)}`, menu(link.id)); sent++; } catch { /* next run retries only on new alarms */ }
  }
  return sent;
}
