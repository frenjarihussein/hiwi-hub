import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ stream:vi.fn(), provider:vi.fn() }));
vi.mock('ai',() => ({ streamText:mocks.stream }));
vi.mock('@ai-sdk/openai',() => ({ createOpenAI:() => ({ responses:mocks.provider }) }));
import { faultAnalysis } from './solar-fault.server';
const monitor = { demo:false,provider:'sungrow',last_data:{ source:'sungrow',at:'2026-10-25T10:00:00Z',power_kw:0,capacity_kwp:10,today_kwh:1,month_kwh:1,total_kwh:1,status:'fault',curve:[],alarms:[{code:'fault',text:'عطل المحطة',at:'2026-10-25T10:00:00Z'}] } };
function admin(cached:string | null = null,blocked = false) {
  return { from(table:string) { const q = { select:() => q,eq:() => q,maybeSingle:async () => ({ data:table === 'solar_fault_analyses' ? cached ? { analysis:cached } : null : { blocked,reason:'access denied' },error:null }),upsert:async () => ({error:null}) };return q; } } as unknown as Parameters<typeof faultAnalysis>[0];
}
beforeEach(() => vi.clearAllMocks());
it('reuses a saved explanation without another AI call',async () => {
  const parts = []; for await (const p of faultAnalysis(admin('شرح محفوظ'),'tenant',monitor,0)) parts.push(p);
  expect(parts.join('')).toBe('شرح محفوظ'); expect(mocks.stream).not.toHaveBeenCalled();
});
it('blocks AI access and never substitutes another model',async () => {
  await expect(faultAnalysis(admin(null,true),'tenant',monitor,0).next()).rejects.toThrow('access denied');
  expect(mocks.stream).not.toHaveBeenCalled();
});
it('does not diagnose demonstration data or a missing fault',async () => {
  await expect(faultAnalysis(admin(),'tenant',{...monitor,demo:true},0).next()).rejects.toThrow('لا يوجد عطل');
  await expect(faultAnalysis(admin(),'tenant',monitor,1).next()).rejects.toThrow('لا يوجد عطل');
});