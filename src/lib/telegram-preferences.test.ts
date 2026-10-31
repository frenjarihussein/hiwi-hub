import { describe, expect, it } from 'vitest';
import { alertRows, memberPreferences, memberProjectIds, memberTemplates,redactReportFinance } from './telegram-preferences';
describe('Member report preferences', () => {
  it('removes income from all report shapes without finance permission',() => {
    const rows = [{data:{extra:{today_income:20,total_income:100,currency:'USD',co2_kg:8}}}];
    expect(redactReportFinance(rows,false)[0]?.data?.['extra']).toEqual({co2_kg:8});
    expect(rows[0]?.data.extra.today_income).toBe(20);
  });
  const a = '5963cb46-5127-49fa-ba7f-6a35137983a5', b = '5963cb46-5127-49fa-ba7f-6a35137983a6';
  it('narrows team projects by member and linked user access', () => {
    expect(memberProjectIds([a,b],memberPreferences({ projects:[a,b] }),[b])).toEqual([b]);
    expect(memberProjectIds([a,b],memberPreferences({ projects:[] }))).toEqual([]);
  });
  it('inherits team templates unless overridden and blocks finance without permission', () => {
    expect(memberTemplates(['status','today'],memberPreferences({}))).toEqual(['status','today']);
    expect(memberTemplates(['status'],memberPreferences({ templates:['today','finance'] }),false)).toEqual(['today']);
    expect(memberTemplates(['status'],memberPreferences({ templates:[] }))).toEqual([]);
  });
  it('honors critical-only and disabled alerts', () => {
    const rows = [{ demo:false,data:{ status:'fault' } },{ demo:false,data:{ status:'offline' } }];
    expect(alertRows(rows,'critical')).toEqual([rows[0]]);
    expect(alertRows(rows,'none')).toEqual([]);
  });
});