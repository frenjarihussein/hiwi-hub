import type { appDatabaseAdmin as supabaseAdmin } from '@/lib/app-database.server';
import { memberPreferences, memberProjectIds } from './telegram-preferences';
type Admin = typeof supabaseAdmin;
export type LinkedMember = { tenant_id: string; system_user_id: string | null; preferences: unknown; active: boolean; blocked: boolean };
export async function effectiveMemberAccess(admin: Admin, member: LinkedMember, teamIds: string[]) {
  const preferences = memberPreferences(member.preferences);
  if (!member.active || member.blocked) return { ids: [], finance: false, preferences };
  if (!member.system_user_id) return { ids: memberProjectIds(teamIds, preferences), finance: true, preferences };
  const profile = (await admin.from('profiles').select('tenant_id,is_active,is_tenant_admin,is_super_admin,branch_id,active_branch_id').eq('id',member.system_user_id).maybeSingle()).data;
  if (!profile?.is_active || profile.tenant_id !== member.tenant_id) return { ids: [], finance: false, preferences };
  const [perms, feature] = await Promise.all([
    admin.from('user_permissions').select('module,can_view').eq('user_id',member.system_user_id),
    admin.from('tenant_features').select('module,enabled').eq('tenant_id',member.tenant_id).in('module',['projects','project_finance']),
  ]);
  const privileged = profile.is_tenant_admin || profile.is_super_admin;
  const permitted = (module: string) => !feature.error && !perms.error && !feature.data?.some(f => f.module === module && !f.enabled) && (privileged || perms.data?.some(p => p.module === module && p.can_view));
  if (!permitted('projects')) return { ids: [], finance: false, preferences };
  let query = admin.from('projects').select('id').eq('tenant_id',member.tenant_id).eq('is_group',false);
  const branch = profile.branch_id || profile.active_branch_id;
  if (branch) query = query.eq('branch_id',branch);
  const projects = await query;
  return { ids: memberProjectIds(teamIds,preferences,projects.error ? [] : projects.data.map(p => p.id)), finance: Boolean(permitted('project_finance')), preferences };
}