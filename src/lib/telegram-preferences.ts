import { z } from 'zod';
export const reportKinds = ['status','today','alarms','top','attention','finance'] as const;
export const memberPreferencesSchema = z.object({
  projects: z.array(z.string().uuid()).max(500).nullable().default(null),
  templates: z.array(z.enum(reportKinds)).max(6).nullable().default(null),
  hour: z.number().int().min(0).max(23).nullable().default(null),
  alerts: z.enum(['all','critical','none']).default('all'),
});
export type MemberPreferences = z.infer<typeof memberPreferencesSchema>;
export function memberPreferences(value: unknown): MemberPreferences {
  const parsed = memberPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : { projects: [], templates: [], hour: null, alerts: 'none' };
}
export function memberProjectIds(team: string[], preferences: MemberPreferences, userAllowed?: string[]) {
  return team.filter(id => (preferences.projects === null || preferences.projects.includes(id)) && (!userAllowed || userAllowed.includes(id)));
}
export function memberTemplates(team: string[], preferences: MemberPreferences, financeAllowed = true) {
  return (preferences.templates ?? team).filter((kind): kind is typeof reportKinds[number] => reportKinds.includes(kind as typeof reportKinds[number]) && (kind !== 'finance' || financeAllowed));
}
export function alertRows<T extends { demo: boolean; data: Record<string, unknown> | null }>(rows: T[], mode: MemberPreferences['alerts']) {
  return rows.filter(r => !r.demo && mode !== 'none' && (mode === 'all' || r.data?.['status'] === 'fault' || Number((r.data?.['extra'] as { fault_count?: number } | undefined)?.fault_count) > 0));
}
export function redactReportFinance<T extends { data: Record<string,unknown> | null }>(rows:T[],allowed:boolean):T[] {
  if (allowed) return rows;
  return rows.map(row => {
    if (!row.data) return row;
    const extra = { ...(row.data['extra'] as Record<string,unknown> | undefined) };
    delete extra['today_income']; delete extra['total_income']; delete extra['currency'];
    return { ...row,data:{ ...row.data,extra } };
  });
}