import { describe, expect, it } from 'vitest';
import { effectiveMemberAccess, type LinkedMember } from './telegram-access.server';
function admin(profile: Record<string, unknown> | null, ids = ['p1'], permitted = true) {
  return { from(table:string) {
    const data = table === 'profiles' ? profile : table === 'projects' ? ids.map(id => ({ id })) : table === 'user_permissions' ? [{ module:'projects',can_view:permitted }] : [];
    const q = { select:() => q,eq:() => q,in:() => q,maybeSingle:async () => ({ data,error:null }),then:(resolve:(result:unknown) => unknown) => Promise.resolve({ data,error:null }).then(resolve) };
    return q;
  } } as unknown as Parameters<typeof effectiveMemberAccess>[0];
}
const member:LinkedMember = { tenant_id:'tenant',system_user_id:'user',preferences:{},active:true,blocked:false };
describe('Linked Telegram access',() => {
  it('rejects suspended and cross-company users',async () => {
    expect((await effectiveMemberAccess(admin({tenant_id:'other',is_active:true}),member,['p1'])).ids).toEqual([]);
    expect((await effectiveMemberAccess(admin({tenant_id:'tenant',is_active:false}),member,['p1'])).ids).toEqual([]);
  });
  it('rejects blocked members and users without project permission',async () => {
    expect((await effectiveMemberAccess(admin(null),{...member,blocked:true,system_user_id:null},['p1'])).ids).toEqual([]);
    expect((await effectiveMemberAccess(admin({tenant_id:'tenant',is_active:true},['p1'],false),member,['p1'])).ids).toEqual([]);
  });
  it('intersects linked user projects and excludes unauthorized finance',async () => {
    const access = await effectiveMemberAccess(admin({tenant_id:'tenant',is_active:true},['p1']),member,['p1','p2']);
    expect(access.ids).toEqual(['p1']); expect(access.finance).toBe(false);
  });
});