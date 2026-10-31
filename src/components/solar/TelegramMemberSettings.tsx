import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { getSolarFleet, setTelegramMember } from '@/lib/solar-fleet.functions';
import { memberPreferences, reportKinds, type MemberPreferences } from '@/lib/telegram-preferences';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
type FleetData = Awaited<ReturnType<typeof getSolarFleet>>;
const labels = { status:'حالة المحطات',today:'إنتاج اليوم',alarms:'الإنذارات',top:'أفضل الأداء',attention:'تحتاج انتباهاً',finance:'العوائد وCO₂' };
export function TelegramMemberSettings({ data, member, onSaved }: { data:FleetData; member:FleetData['members'][number]; onSaved:() => Promise<unknown> }) {
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false);
  const [prefs,setPrefs] = useState(memberPreferences(member.preferences));
  const [user,setUser] = useState(member.system_user_id || 'none');
  const save = useServerFn(setTelegramMember);
  const projects = data.projects.filter(p => data.selected.includes(p.id));
  function change<K extends keyof MemberPreferences>(key:K,value:MemberPreferences[K]) { setPrefs(p => ({...p,[key]:value})); }
  return <><Button size="sm" variant="outline" onClick={() => { setPrefs(memberPreferences(member.preferences)); setUser(member.system_user_id || 'none'); setOpen(true); }}>تخصيص وربط الحساب</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl"><DialogHeader><DialogTitle>إعدادات {member.display_name || 'العضو'}</DialogTitle></DialogHeader>
    <label className="space-y-2 text-sm"><span>مستخدم النظام</span><Select value={user} onValueChange={setUser}><SelectTrigger aria-label="مستخدم النظام"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">عضو بوت فقط — بدون ربط</SelectItem>{data.users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || u.id}{!u.is_active ? ' (موقوف)' : ''}</SelectItem>)}</SelectContent></Select></label>
    <section className="space-y-3 border-t pt-3"><h3 className="font-semibold">المشاريع</h3><label className="flex items-center gap-2 text-sm"><Switch checked={prefs.projects === null} onCheckedChange={on => change('projects',on ? null : [])} />كل مشاريع الفريق</label>{prefs.projects !== null && <><label className="flex items-center gap-2 text-sm"><Checkbox checked={projects.length > 0 && projects.every(p => prefs.projects?.includes(p.id))} onCheckedChange={c => change('projects',c === true ? projects.map(p => p.id) : [])} />تحديد الكل</label><div className="grid gap-2 sm:grid-cols-2">{projects.map(p => <label key={p.id} className="flex min-w-0 items-center gap-2 text-sm"><Checkbox checked={Boolean(prefs.projects?.includes(p.id))} onCheckedChange={c => change('projects',c === true ? [...(prefs.projects || []),p.id] : (prefs.projects || []).filter(id => id !== p.id))} /><span className="break-words">{p.name}</span></label>)}</div></>}</section>
    <section className="space-y-3 border-t pt-3"><h3 className="font-semibold">التقارير الدورية</h3><label className="flex items-center gap-2 text-sm"><Switch checked={prefs.templates === null} onCheckedChange={on => change('templates',on ? null : [])} />استخدام نماذج الفريق</label>{prefs.templates !== null && <div className="grid gap-2 sm:grid-cols-2">{reportKinds.map(k => <label key={k} className="flex items-center justify-between gap-2 text-sm"><span>{labels[k]}</span><Switch checked={Boolean(prefs.templates?.includes(k))} onCheckedChange={on => change('templates',on ? [...(prefs.templates || []),k] : (prefs.templates || []).filter(v => v !== k))} /></label>)}</div>}<label className="flex items-center gap-2 text-sm"><Switch checked={prefs.hour === null} onCheckedChange={on => change('hour',on ? null : data.team?.report_hour ?? 18)} />استخدام توقيت الفريق</label>{prefs.hour !== null && <label className="block space-y-2 text-sm">ساعة الإرسال — توقيت دمشق<Input aria-label="ساعة إرسال العضو" type="number" min={0} max={23} value={prefs.hour} onChange={e => change('hour',Number(e.target.value))} /></label>}</section>
    <label className="space-y-2 border-t pt-3 text-sm"><span>التنبيهات</span><Select value={prefs.alerts} onValueChange={v => change('alerts',v as MemberPreferences['alerts'])}><SelectTrigger aria-label="تنبيهات العضو"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الأعطال والانقطاع والإنذارات</SelectItem><SelectItem value="critical">الأعطال فقط</SelectItem><SelectItem value="none">إيقاف التنبيهات</SelectItem></SelectContent></Select></label>
    <Button disabled={busy} onClick={async () => { setBusy(true); try { await save({ data:{ id:member.id,system_user_id:user === 'none' ? null : user,preferences:prefs } }); await onSaved(); setOpen(false); toast.success('تم حفظ تخصيص العضو'); } catch(e) { toast.error(e instanceof Error ? e.message : 'تعذر الحفظ'); } finally { setBusy(false); } }}>حفظ إعدادات العضو</Button>
  </DialogContent></Dialog></>;
}