import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), call: vi.fn(), verify: vi.fn() }));
vi.mock('./telegram.server', () => ({ sendTelegram: mocks.send, telegramCall: mocks.call }));
vi.mock('./telegram-security.server', () => ({ verifyTeamPassword: mocks.verify }));
import { interactiveJoin } from './telegram-onboarding.server';
type Row = Record<string, unknown>;
function database(blocked = false) {
  const rows: Record<string, Row[]> = {
    telegram_teams: [{ id: '5963cb46-5127-49fa-ba7f-6a35137983a5', enabled: true, tenant_id: 'tenant', password_salt: 'salt', password_hash: 'hash' }],
    tenants: [{ id: 'tenant', is_active: true, sub_end: '2099-01-01' }],
    telegram_team_members: blocked ? [{ team_id: '5963cb46-5127-49fa-ba7f-6a35137983a5', telegram_user_id: 123, blocked: true }] : [],
    telegram_join_sessions: [], telegram_member_events: [],
  };
  const from = (table: string) => {
    let selected = rows[table] || [];
    const result = () => ({ data: selected[0] || null, error: null });
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { selected = selected.filter(r => r[key] === value); return query; },
      maybeSingle: async () => result(), single: async () => result(),
      upsert: (row: Row) => { const saved = { id: 'member', ...row }; rows[table] = [saved]; selected = [saved]; return query; },
      insert: (row: Row) => { rows[table]?.push(row); return query; },
      update: (row: Row) => { selected.forEach(r => Object.assign(r,row)); return query; },
      delete: () => { rows[table] = []; return query; },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  };
  return { admin: { from } as unknown as Parameters<typeof interactiveJoin>[0], rows };
}
describe('Interactive Telegram onboarding', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.call.mockResolvedValue({ ok: true }); mocks.verify.mockReturnValue(true); });
  it('asks password then name and enables reports for the saved member', async () => {
    const { admin, rows } = database();
    await interactiveJoin(admin,123,123,'/start team_5963cb46-5127-49fa-ba7f-6a35137983a5');
    expect(rows['telegram_join_sessions']?.[0]?.['step']).toBe('password');
    await interactiveJoin(admin,123,123,'team password',10);
    expect(rows['telegram_join_sessions']?.[0]?.['step']).toBe('name');
    expect(mocks.call).toHaveBeenCalledWith('deleteMessage', { chat_id:123, message_id:10 });
    await interactiveJoin(admin,123,123,'اسم عضو الفريق',11);
    expect(rows['telegram_team_members']?.[0]).toMatchObject({ display_name: 'اسم عضو الفريق', active:true, reports_enabled:true });
    expect(rows['telegram_member_events']?.[0]?.['event']).toBe('join');
    expect(rows['telegram_join_sessions']).toEqual([]);
  });
  it('prevents blocked users from starting a new password session', async () => {
    const { admin, rows } = database(true);
    await interactiveJoin(admin,123,123,'/start team_5963cb46-5127-49fa-ba7f-6a35137983a5');
    expect(rows['telegram_join_sessions']).toEqual([]);
    expect(mocks.send).toHaveBeenCalledWith(123,'تم منع حسابك؛ راجع مسؤول الفريق.');
  });
  it('does not advance after an incorrect password', async () => {
    const { admin, rows } = database();
    await interactiveJoin(admin,123,123,'/start team_5963cb46-5127-49fa-ba7f-6a35137983a5');
    mocks.verify.mockReturnValue(false);
    await interactiveJoin(admin,123,123,'incorrect',10);
    expect(rows['telegram_join_sessions']?.[0]).toMatchObject({ step:'password', attempts:1 });
  });
});