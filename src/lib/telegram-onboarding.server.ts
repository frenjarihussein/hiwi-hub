import type { appDatabaseAdmin as supabaseAdmin } from '@/lib/app-database.server';
import { verifyTeamPassword } from './telegram-security.server';
import { sendTelegram, telegramCall } from './telegram.server';
import { z } from 'zod';

type Admin = typeof supabaseAdmin;
export async function recordTelegramEvent(admin: Admin, member: { id: string; tenant_id: string }, event: string) {
  const result = await admin.from('telegram_member_events').insert({ member_id: member.id, tenant_id: member.tenant_id, event });
  if (result.error) throw new Error('Unable to record member activity');
}
export async function interactiveJoin(admin: Admin, user: number, chatId: number, text: string, messageId?: number) {
  const start = /^\/start(?:@\w+)?\s+team_([^\s]+)$/.exec(text);
  if (text === '/cancel') {
    await admin.from('telegram_join_sessions').delete().eq('telegram_user_id', user);
    await sendTelegram(chatId, 'تم إلغاء الانضمام.'); return true;
  }
  if (start) {
    const id = start[1];
    if (!z.string().uuid().safeParse(id).success) return true;
    const team = (await admin.from('telegram_teams').select('id,enabled,tenant_id').eq('id', id || '').maybeSingle()).data;
    if (!team?.enabled) { await sendTelegram(chatId, 'الفريق غير متاح.'); return true; }
    const member = (await admin.from('telegram_team_members').select('blocked').eq('team_id', team.id).eq('telegram_user_id', user).maybeSingle()).data;
    if (member?.blocked) { await sendTelegram(chatId, 'تم منع حسابك؛ راجع مسؤول الفريق.'); return true; }
    const saved = await admin.from('telegram_join_sessions').upsert({ telegram_user_id: user, chat_id: chatId, team_id: team.id, step: 'password', attempts: 0, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
    if (saved.error) throw new Error('Unable to start joining');
    await sendTelegram(chatId, 'أهلاً بك! ما هي كلمة سر الفريق؟'); return true;
  }
  const session = (await admin.from('telegram_join_sessions').select('*').eq('telegram_user_id', user).eq('chat_id', chatId).maybeSingle()).data;
  if (!session) return false;
  if (session.step === 'password' && messageId) await telegramCall('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => undefined);
  const team = (await admin.from('telegram_teams').select('*').eq('id', session.team_id).maybeSingle()).data;
  const tenant = team ? (await admin.from('tenants').select('is_active,sub_end').eq('id', team.tenant_id).single()).data : null;
  const previous = (await admin.from('telegram_team_members').select('*').eq('team_id', session.team_id).eq('telegram_user_id', user).maybeSingle()).data;
  if (!team?.enabled || !tenant?.is_active || String(tenant.sub_end) < new Date().toISOString().slice(0,10) || previous?.blocked || Date.parse(session.expires_at) < Date.now() || session.attempts >= 5) {
    await admin.from('telegram_join_sessions').delete().eq('telegram_user_id', user);
    await sendTelegram(chatId, 'انتهت محاولة الانضمام أو الوصول موقوف. افتح رابط الفريق مجدداً أو راجع المسؤول.'); return true;
  }
  if (session.step === 'password') {
    if (text.length > 128 || !verifyTeamPassword(text, team.password_salt, team.password_hash)) {
      await admin.from('telegram_join_sessions').update({ attempts: session.attempts + 1 }).eq('telegram_user_id', user);
      await sendTelegram(chatId, 'كلمة السر غير صحيحة، حاول مجدداً.'); return true;
    }
    const changed = await admin.from('telegram_join_sessions').update({ step: 'name' }).eq('telegram_user_id', user);
    if (changed.error) throw new Error('Unable to advance joining');
    await sendTelegram(chatId, 'ما هو اسمك الكامل؟'); return true;
  }
  const name = text.trim();
  if (name.length < 2 || name.length > 100 || name.startsWith('/')) { await sendTelegram(chatId, 'أرسل اسمك من حرفين إلى 100 حرف.'); return true; }
  const linked = previous?.system_user_id ? null : (await admin.from('telegram_links').select('user_id').eq('chat_id',chatId).eq('tenant_id',team.tenant_id).maybeSingle()).data;
  const saved = await admin.from('telegram_team_members').upsert({ team_id: team.id, tenant_id: team.tenant_id, telegram_user_id: user, chat_id: chatId, display_name: name, active: true, reports_enabled: previous?.reports_enabled ?? true, system_user_id: previous?.system_user_id ?? linked?.user_id ?? null, preferences: previous?.preferences ?? {}, logged_out_at: null, last_seen_at: new Date().toISOString() }, { onConflict: 'team_id,telegram_user_id' }).select('id,tenant_id').single();
  if (saved.error || !saved.data) throw new Error('Unable to join team');
  await recordTelegramEvent(admin, saved.data, previous ? 'login' : 'join');
  await admin.from('telegram_join_sessions').delete().eq('telegram_user_id', user);
  await sendTelegram(chatId, '✅ تم تسجيل اسمك والانضمام. ستصلك التقارير المفعّلة للفريق.', [[{ text: 'المشاريع', callback_data: `t:${team.id}:list` }]]);
  return true;
}