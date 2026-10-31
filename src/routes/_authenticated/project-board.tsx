import { sortSolarRows } from "@/lib/solar-sort";
import { isStale, matchingReading, type SolarReading } from "@/lib/solar-monitor";
import { ArrowDownUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, HardHat, LayoutGrid, Palette, PauseCircle, Pencil, Plus, Search, Timer, Trash2, Users } from "lucide-react";
import { EditProjectDialog } from "@/components/solar/EditProjectDialog";
import { appDatabase as supabase } from "@/lib/app-database-client";
import { db } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtDate, fmtNum, MODULE_LABEL, PROJECT_STATUS_LABEL, today } from "@/lib/format";
import { pageHead } from "@/lib/page-head";
import { compressMedia } from "@/lib/media-compress";
import { listProjectTeam, setProjectTeamPerm, setProjectTeamActive, deleteProjectTeamUser } from "@/lib/project-team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewUserDialog } from "@/components/NewUserDialog";
import { ProjectLeads } from "@/components/solar/ProjectLeads";
import { NewProjectWizard } from "@/components/solar/NewProjectWizard";
import { CategorySelect, ProjectCategoriesDialog, categoryDescendants, useProjectCategories } from "@/components/solar/ProjectCategories";
import { FolderTree } from "lucide-react";
import { processLogo } from "@/lib/branding";
import { BrandThemeEditor } from "@/components/BrandThemeEditor";
import { startWork } from "@/lib/work-progress";

export const Route = createFileRoute("/_authenticated/project-board")({
  head: () => pageHead("لوحة متابعة المشاريع", "كل المشاريع مع نسب الإنجاز وحالتها وفريق العمل في يوسف سوفت."),
  component: ProjectBoard,
});

type Row = { id: string; name: string; code: string | null; parent_id: string | null; status: string; completion_pct: number | null; start_date: string | null; end_date: string | null; brand_color: string | null; brand_logo_path: string | null };
const STATUSES = ["active", "on_hold", "completed", "closed"] as const;
const TONE: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  on_hold: "bg-destructive/10 text-destructive",
  completed: "bg-accent text-accent-foreground",
  closed: "bg-muted text-muted-foreground",
};
const COLORS = ["#1f3a5f", "#2e7d32", "#0277bd", "#ef6c00", "#6a1b9a", "#c62828", "#00838f", "#5d4037"];

export type Health = 'running' | 'standby' | 'idle' | 'offline' | 'fault' | 'alarm' | 'none';
const HEALTHS = ['running', 'standby', 'idle', 'alarm', 'fault', 'offline', 'none'] as const;
const HEALTH_LABEL: Record<Health, string> = { running: '🟢 ينتج', standby: '🌙 استعداد', idle: '⚠️ لا ينتج', alarm: '🔔 إنذارات', fault: '🔴 عطل', offline: '📡 غير متصل', none: '— بلا مراقبة' };
const HEALTH_TONE: Record<Health, string> = { running: 'bg-primary/10 text-primary', standby: 'bg-muted text-muted-foreground', idle: 'bg-accent text-accent-foreground', alarm: 'bg-accent text-accent-foreground', fault: 'bg-destructive/10 text-destructive', offline: 'bg-destructive/10 text-destructive', none: 'bg-muted text-muted-foreground' };
/** Operating health for board filters: offline when sync is stale, then fault, alarms, standby, production. */
export function healthFor(r: SolarReading | null, lastSync: string | null, monitored: boolean, now = new Date()): Health {
  if (!monitored) return 'none';
  if (!r || isStale(lastSync, now, 60) || r.status === 'offline') return 'offline';
  if (r.status === 'fault') return 'fault';
  if (r.alarms?.length) return 'alarm';
  if (r.status === 'standby') return 'standby';
  if (!(r.power_kw > 0)) { const h = now.getHours(); return h >= 9 && h <= 16 ? 'idle' : 'standby'; }
  return 'running';
}

function Ring({ value, color }: { value: number; color: string }) {
  const r = 26, c = 2 * Math.PI * r, off = c - (value / 100) * c;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0">
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="7" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 34 34)" style={{ transition: "stroke-dashoffset .5s" }} />
      <text x="34" y="39" textAnchor="middle" className="fill-foreground text-[13px] font-bold">{fmtNum(value, 0)}%</text>
    </svg>
  );
}

function ProjectBoard() {
  const { data: me } = useMe();
  const isPM = !!me && (me.isTenantAdmin || me.isSuperAdmin || can(me, "project_users", "create"));
  const [appBrand, setAppBrand] = useState(false);
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-primary p-4 sm:p-6 text-primary-foreground shadow-lg">
        <div className="absolute -start-10 -top-10 size-40 rounded-full bg-primary-foreground/10" />
        <div className="absolute -bottom-16 end-10 size-52 rounded-full bg-primary-foreground/5" />
        <h1 className="relative flex items-center gap-2 text-xl font-bold sm:text-2xl"><HardHat className="size-6 shrink-0 sm:size-7" />لوحة المشاريع</h1>
        <p className="relative mt-1 text-sm opacity-80">كل مشاريعك ووين وصلت، اضغط على أي مشروع لتدخل وتتابعه.</p>
        {isPM && <Button size="sm" variant="secondary" className="relative mt-3" onClick={() => setAppBrand(true)}><Palette className="size-4" />شعار وألوان البرنامج</Button>}
      </div>
      {isPM ? (
        <Tabs defaultValue="projects">
          <TabsList className="w-full sm:w-auto"><TabsTrigger value="projects"><LayoutGrid className="size-4" />المشاريع</TabsTrigger><TabsTrigger value="team"><Users className="size-4" />فريق المشاريع</TabsTrigger></TabsList>
          <TabsContent value="projects"><Projects /></TabsContent>
          <TabsContent value="team"><Team /></TabsContent>
        </Tabs>
      ) : <Projects />}
      {appBrand && <AppBrandDialog onClose={() => setAppBrand(false)} />}
    </div>
  );
}

function Projects() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sort,setSort] = useState("name"), [descending,setDescending] = useState(false);
  const [brandOf, setBrandOf] = useState<Row | null>(null);
  const [editOf, setEditOf] = useState<Row | null>(null);
  const [wizard, setWizard] = useState(false);
  const [cat, setCat] = useState("");
  const [catsOpen, setCatsOpen] = useState(false);
  const canAdd = can(me, "projects", "create");
  const canEdit = can(me, "projects", "edit");
  const canDelete = can(me, "projects", "delete");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const list = useQuery({
    queryKey: ["projects", "board", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db.from("projects") as any).select("id,name,code,status,completion_pct,start_date,end_date,brand_color,brand_logo_path,parent_id").eq("tenant_id", me!.tenantId).eq("is_group", false).neq("status", "lead").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const logos = useQuery({
    queryKey: ["projects", "logos", (list.data ?? []).map((r) => r.brand_logo_path).join()],
    enabled: !!list.data?.some((r) => r.brand_logo_path),
    queryFn: async () => {
      const paths = list.data!.map((r) => r.brand_logo_path).filter(Boolean) as string[];
      const { data } = await supabase.storage.from("attachments").createSignedUrls(paths, 3600);
      return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["projects"] });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = { status };
      if (status === "completed") { patch.completion_pct = 100; patch.end_date = today(); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from("projects") as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تغيير حالة المشروع"); void refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const monitoring = useQuery({ queryKey:['projects','board-monitoring',me?.tenantId],enabled:!!me?.tenantId,queryFn:async () => {
    if (!me?.tenantId) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase.from('solar_monitoring') as any).select('project_id,capacity_kwp,last_data,last_sync,demo,provider,solar_fleet_stations(plant_kind)').eq('tenant_id',me.tenantId);
    if (result.error) throw result.error; return result.data as { project_id: string; capacity_kwp: number; last_data: unknown; last_sync: string | null; demo: boolean; provider: string; solar_fleet_stations: { plant_kind: string | null } | null }[];
  } });
  const wbs = useQuery({ queryKey:['projects','board-wbs',me?.tenantId],enabled:!!me?.tenantId,queryFn:async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (db.from('project_wbs') as any).select('project_id,name,progress,is_final,sort_order,end_date').eq('tenant_id',me!.tenantId).eq('is_final',true).order('sort_order').limit(10000);
    if (r.error) throw r.error; return (r.data ?? []) as { project_id: string; name: string; progress: number; end_date: string | null }[];
  } });
  const snags = useQuery({ queryKey:['projects','board-snags',me?.tenantId],enabled:!!me?.tenantId,queryFn:async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (db.from('project_snags') as any).select('project_id,status').eq('tenant_id',me!.tenantId).neq('status','closed');
    return (r.data ?? []) as { project_id: string }[];
  } });
  const [kind, setKind] = useState<'all' | 'ess' | 'ongrid'>('all');
  const [health, setHealth] = useState<'all' | Health>('all');
  const kindOf = (id: string) => { const m = monitoring.data?.find(x => x.project_id === id); if (!m) return null; return m.solar_fleet_stations?.plant_kind ?? (matchingReading(m.last_data,m.demo,m.provider)?.extra?.plant_kind ?? null); };
  const healthOf = (id: string): Health => { const m = monitoring.data?.find(x => x.project_id === id); return healthFor(m ? matchingReading(m.last_data,m.demo,m.provider) : null, m?.last_sync ?? null, !!m); };
  const rows = list.data ?? [];
  const cats = useProjectCategories(me?.tenantId).data ?? [];
  const inCat = useMemo(() => (cat ? categoryDescendants(cats, cat) : null), [cats, cat]);
  const shown = sortSolarRows(rows.filter((r) => (tab === "all" || r.status === tab) && (!gov || (gov === '__none' ? !govOf(r.id) : govOf(r.id) === gov)) && (kind === 'all' || kindOf(r.id) === kind) && (health === 'all' || healthOf(r.id) === health) && (!inCat || (!!r.parent_id && inCat.has(r.parent_id))) && (!q || `${r.name} ${r.code ?? ""}`.includes(q))),r => {
    const m = monitoring.data?.find(m => m.project_id === r.id);
    const reading = m ? matchingReading(m.last_data,m.demo,m.provider) : null;
    return sort === 'capacity' ? (m ? Number(m.capacity_kwp) : null) : sort === 'power' ? reading?.power_kw : sort === 'today' ? reading?.today_kwh : sort === 'month' ? reading?.month_kwh : sort === 'total' ? reading?.total_kwh : sort === 'updated' ? m?.last_sync : sort === 'status' ? r.status : sort === 'completion' ? Number(r.completion_pct) : r.name;
  },descending);
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = useMutation({
    mutationFn: async (action: string) => {
      let ok = 0; const fails: string[] = [];
      const ids = [...picked];
      const work = startWork(action === "delete" ? "حذف المشاريع" : "تحديث المشاريع", ids.length);
      try {
      for (const [index, id] of ids.entries()) {
        const label = `${action === "delete" ? "حذف" : "تحديث"} ${rows.find((r) => r.id === id)?.name ?? "المشروع"}`;
        work.update(label, index);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = db.from("projects") as any;
        const patch: Record<string, unknown> = { status: action };
        if (action === "completed") { patch["completion_pct"] = 100; patch["end_date"] = today(); }
        const { error } = action === "delete" ? await t.delete().eq("id", id) : await t.update(patch).eq("id", id);
        if (error) fails.push(`${rows.find((r) => r.id === id)?.name ?? id}: ${error.message}`); else ok++;
        work.update(label, index + 1);
      }
      return { ok, fails };
      } finally { work.finish(); }
    },
    onSuccess: ({ ok, fails }) => {
      if (ok) toast.success(`تم تنفيذ العملية على ${ok} مشروع`);
      if (fails.length) toast.error(`تعذر ${fails.length}: ${fails.slice(0, 3).join(" | ")}`);
      setPicked(new Set()); void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const active = rows.filter((r) => r.status === "active");
  const avg = active.length ? active.reduce((a, r) => a + Number(r.completion_pct || 0), 0) / active.length : 0;
  const stats = [
    { l: "قيد التنفيذ", v: count("active"), icon: Timer, s: "active" },
    { l: "متوقف", v: count("on_hold"), icon: PauseCircle, s: "on_hold" },
    { l: "تم الإنجاز", v: count("completed"), icon: CheckCircle2, s: "completed" },
    { l: "متوسط إنجاز الجارية", v: `${fmtNum(avg, 0)}%`, icon: LayoutGrid, s: "all" },
  ];

  return (
    <div className="space-y-5 pt-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((x) => (
          <button key={x.l} onClick={() => setTab(x.s)} className={`flex min-w-0 items-center gap-2 rounded-xl border bg-card p-3 text-start sm:gap-3 sm:p-4 transition hover:shadow-md ${tab === x.s ? "ring-2 ring-primary" : ""}`}>
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><x.icon className="size-5" /></div>
            <div className="min-w-0"><div className="truncate text-xs text-muted-foreground">{x.l}</div><div className="text-xl font-bold sm:text-2xl">{x.v}</div></div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Button size="sm" className="shrink-0" variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>الكل ({rows.length})</Button>
        {STATUSES.map((s) => <Button key={s} size="sm" className="shrink-0" variant={tab === s ? "default" : "outline"} onClick={() => setTab(s)}>{PROJECT_STATUS_LABEL[s]}</Button>)}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {([['all','كل الأنواع'],['ess','🔋 بطاريات'],['ongrid','⚡ أون جريد']] as const).map(([k,l]) => <Button key={k} size="sm" className="shrink-0" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{l} ({k === 'all' ? rows.length : rows.filter(r => kindOf(r.id) === k).length})</Button>)}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(['all', ...HEALTHS] as const).map((k) => <Button key={k} size="sm" className="shrink-0" variant={health === k ? "default" : "outline"} onClick={() => setHealth(k)}>{k === 'all' ? 'كل حالات التشغيل' : HEALTH_LABEL[k]} ({k === 'all' ? rows.length : rows.filter(r => healthOf(r.id) === k).length})</Button>)}
        </div>
        <select aria-label="المحافظة" className="h-9 rounded-md border bg-background px-2 text-sm" value={gov} onChange={(e) => setGov(e.target.value)}>
          <option value="">كل المحافظات ({rows.length})</option>
          {SYRIA_GOVERNORATES.map((g) => <option key={g} value={g}>{g} ({rows.filter(r => govOf(r.id) === g).length})</option>)}
          <option value="__none">بلا محافظة ({rows.filter(r => !govOf(r.id)).length})</option>
        </select>
        <div className="flex w-full gap-2 lg:ms-auto lg:w-72">
          <CategorySelect cats={cats} value={cat} onChange={setCat} placeholder="كل التصنيفات" />
          {canAdd && <Button size="icon" variant="outline" className="shrink-0" aria-label="إدارة التصنيفات" title="إدارة التصنيفات" onClick={() => setCatsOpen(true)}><FolderTree className="size-4" /></Button>}
        </div>
        {catsOpen && me?.tenantId && <ProjectCategoriesDialog open onClose={() => setCatsOpen(false)} tenantId={me.tenantId} />}
        <div className="relative w-full lg:w-52">
          <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="بحث عن مشروع" value={q} onChange={(e) => setQ(e.target.value)} className="w-full ps-8" />
        </div>
        <div className="flex items-center gap-2"><Select value={sort} onValueChange={setSort}><SelectTrigger className="w-48" aria-label="ترتيب المشاريع"><SelectValue /></SelectTrigger><SelectContent>{[['name','اسم المشروع'],['capacity','الاستطاعة'],['power','القدرة اللحظية'],['today','إنتاج اليوم'],['month','إنتاج الشهر'],['total','الإنتاج التراكمي'],['status','الحالة'],['completion','نسبة الإنجاز'],['updated','آخر تحديث']].map(([k,v]) => <SelectItem key={k} value={k || 'name'}>{v}</SelectItem>)}</SelectContent></Select><Button size="icon" variant="outline" title={descending ? 'ترتيب تنازلي' : 'ترتيب تصاعدي'} aria-label={descending ? 'ترتيب تنازلي' : 'ترتيب تصاعدي'} onClick={() => setDescending(v => !v)}><ArrowDownUp className="size-4" /></Button></div>
        {canAdd && (
          <Button className="w-full shrink-0 lg:w-auto" onClick={() => setWizard(true)}><Plus className="size-4" />مشروع جديد</Button>
        )}
      </div>

      {(canEdit || canDelete) && shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 px-1"><input type="checkbox" className="size-4 accent-primary" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r) => r.id)))} />تحديد الكل</label>
          {picked.size > 0 && <>
            <span className="text-muted-foreground">محدد: {picked.size}</span>
            {canEdit && <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate("completed")}><CheckCircle2 className="size-4" />تحويل إلى منجز</Button>}
            {canEdit && <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate("active")}><Timer className="size-4" />قيد التنفيذ</Button>}
            {canEdit && <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate("on_hold")}><PauseCircle className="size-4" />إيقاف</Button>}
            {canDelete && <Button size="sm" variant="destructive" disabled={bulk.isPending} onClick={() => { if (confirm(`حذف ${picked.size} مشروع نهائياً؟`)) bulk.mutate("delete"); }}><Trash2 className="size-4" />حذف المحددة</Button>}
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>إلغاء التحديد</Button>
          </>}
        </div>
      )}
      {list.isLoading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : !shown.length ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">لا توجد مشاريع هنا بعد</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            const pct = Math.min(100, Math.max(0, Number(r.completion_pct || 0)));
            const color = r.brand_color || "var(--color-primary)";
            const logo = r.brand_logo_path ? logos.data?.[r.brand_logo_path] : null;
            return (
              <div key={r.id} className={`group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${picked.has(r.id) ? "ring-2 ring-primary" : ""}`}>
                {(canEdit || canDelete) && <input type="checkbox" aria-label={`تحديد ${r.name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="absolute end-3 top-4 z-10 size-4 cursor-pointer accent-primary" />}
                <div className="h-1.5" style={{ background: color }} />
                <Link to="/projects/$projectId" params={{ projectId: r.id }} className="flex items-center gap-3 p-4">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-bold" style={{ background: logo ? "transparent" : color, color: "var(--color-primary-foreground)" }}>
                    {logo ? <img src={logo} alt="" className="size-full object-contain" /> : r.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold group-hover:underline">{r.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{r.start_date ? fmtDate(r.start_date) : "—"}{r.end_date ? ` ← ${fmtDate(r.end_date)}` : ""}</div>
                  </div>
                  <Ring value={pct} color={color} />
                </Link>
                {(() => {
                  const m = monitoring.data?.find(x => x.project_id === r.id);
                  const rd = m ? matchingReading(m.last_data, m.demo, m.provider) : null;
                  const h = healthOf(r.id);
                  const monitoringMode = r.status === 'completed' || r.status === 'closed';
                  if (monitoringMode) return (
                    <div className="space-y-2 px-4 pb-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 font-medium ${HEALTH_TONE[h]}`}>{HEALTH_LABEL[h]}</span>{m?.last_sync && <span className="text-muted-foreground">آخر قراءة {new Date(m.last_sync).toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })}</span>}</div>
                      {m ? <div className="grid grid-cols-4 gap-1 text-center">
                        {[['الآن', rd ? `${fmtNum(rd.power_kw, 1)} kW` : '—'], ['اليوم', rd ? `${fmtNum(rd.today_kwh, 0)} kWh` : '—'], ['الشهر', rd ? `${fmtNum(rd.month_kwh, 0)} kWh` : '—'], ['الاستطاعة', `${fmtNum(Number(m.capacity_kwp), 1)} kWp`]].map(([l, v]) => <div key={l} className="rounded-lg bg-muted/50 p-1.5"><div className="text-muted-foreground">{l}</div><div className="font-semibold">{v}</div></div>)}
                      </div> : <p className="text-muted-foreground">لم تُربط المحطة بالمراقبة بعد</p>}
                      {!!rd?.alarms?.length && <div className="rounded-lg bg-destructive/10 p-1.5 text-destructive">🔔 {rd.alarms.length} إنذار: {rd.alarms.slice(0, 2).map(a => a.text || a.code).join(' · ')}</div>}
                    </div>
                  );
                  const items = (wbs.data ?? []).filter(w => w.project_id === r.id);
                  const done = items.filter(w => Number(w.progress) >= 100).length;
                  const next = items.find(w => Number(w.progress) < 100);
                  const late = items.filter(w => Number(w.progress) < 100 && w.end_date && w.end_date < today()).length;
                  const open = (snags.data ?? []).filter(s => s.project_id === r.id).length;
                  return (
                    <div className="space-y-2 px-4 pb-3 text-xs">
                      <div className="grid grid-cols-3 gap-1 text-center">
                        {[['البنود المنجزة', items.length ? `${done}/${items.length}` : '—'], ['بنود متأخرة', String(late)], ['ملاحظات مفتوحة', String(open)]].map(([l, v]) => <div key={l} className="rounded-lg bg-muted/50 p-1.5"><div className="text-muted-foreground">{l}</div><div className="font-semibold">{v}</div></div>)}
                      </div>
                      {next && <div className="truncate text-muted-foreground">المرحلة الحالية: <span className="font-medium text-foreground">{next.name}</span> ({fmtNum(Number(next.progress), 0)}%)</div>}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-2">
                  {canEdit ? (
                    <select value={r.status} onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value })} className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${TONE[r.status] ?? ""}`} aria-label="حالة المشروع">
                      {STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
                    </select>
                  ) : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[r.status] ?? ""}`}>{PROJECT_STATUS_LABEL[r.status] ?? r.status}</span>}
                  {canEdit && <Button size="icon" variant="ghost" className="ms-auto size-7" title="تعديل بيانات المشروع" aria-label="تعديل بيانات المشروع" onClick={() => setEditOf(r)}><Pencil className="size-4" /></Button>}
                  {canEdit && <Button size="icon" variant="ghost" className="size-7" title="هوية المشروع" onClick={() => setBrandOf(r)}><Palette className="size-4" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {brandOf && <BrandDialog row={brandOf} onClose={() => { setBrandOf(null); void refresh(); }} />}
      {editOf && <EditProjectDialog row={editOf} onClose={() => { setEditOf(null); void refresh(); }} />}
      <NewProjectWizard open={wizard} onClose={() => setWizard(false)} />
      <ProjectLeads />
    </div>
  );
}

/** Project visual identity: a color and an optional logo kept in the company's private files. */
function BrandDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const { data: me } = useMe();
  const [color, setColor] = useState(row.brand_color ?? COLORS[0]!);
  const [busy, setBusy] = useState(false);
  async function save(file?: File) {
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = { brand_color: color };
      if (file) {
        const f = await compressMedia(file);
        const path = `${me!.tenantId}/project-brand/${row.id}-${Date.now()}.${f.name.split(".").pop() || "jpg"}`;
        const { error } = await supabase.storage.from("attachments").upload(path, f, { contentType: f.type });
        if (error) throw error;
        patch.brand_logo_path = path;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from("projects") as any).update(patch).eq("id", row.id);
      if (error) throw error;
      toast.success("تم حفظ هوية المشروع");
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>هوية المشروع: {row.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-sm">لون المشروع</div>
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`size-8 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} aria-label={c} />)}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-8 cursor-pointer rounded" aria-label="لون مخصص" />
            </div>
          </div>
          <label className="block text-sm">شعار المشروع (اختياري)
            <Input type="file" accept="image/*" disabled={busy} className="mt-1" onChange={(e) => { const f = e.target.files?.[0]; if (f) void save(f); }} />
          </label>
          <Button className="w-full" disabled={busy} onClick={() => save()}>حفظ اللون</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FIELDS = [["can_view", "عرض"], ["can_create", "إضافة"], ["can_edit", "تعديل"], ["can_delete", "حذف"]] as const;
const TEAM_MODULES = Object.keys(MODULE_LABEL).filter((m) => m === "projects" || (m.startsWith("project_") && m !== "project_users"));

/** Project manager panel: add project-only users, adjust their project permissions, and see sign-ins. */
function Team() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectTeam);
  const permFn = useServerFn(setProjectTeamPerm);
  const q = useQuery({ queryKey: ["project-team"], queryFn: () => listFn() });
  const [sel, setSel] = useState<string | null>(null);
  const canAddUser = !!me && (me.isTenantAdmin || can(me, "project_users", "create"));
  const canEditPerm = !!me && (me.isTenantAdmin || can(me, "project_users", "edit"));
  const canDeleteUser = !!me && (me.isTenantAdmin || can(me, "project_users", "delete"));
  const activeFn = useServerFn(setProjectTeamActive);
  const deleteFn = useServerFn(deleteProjectTeamUser);
  const refresh = () => qc.invalidateQueries({ queryKey: ["project-team"] });
  const users = q.data?.users ?? [];
  const user = users.find((u) => u.id === sel) ?? users[0];
  const val = (m: string, f: string) => !!(q.data?.perms.find((p) => p.user_id === user?.id && p.module === m) as Record<string, unknown> | undefined)?.[f];
  const logins = (q.data?.logins ?? []).filter((l) => l.user_id === user?.id);

  return (
    <div className="space-y-4 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">مستخدمو المشاريع فقط: صلاحياتهم على كل قسم، وسجل دخولهم وخروجهم.</p>
        {canAddUser && me?.tenantId && <NewUserDialog tenantId={me.tenantId} allowAdmin={false} projectsOnly onCreated={() => qc.invalidateQueries({ queryKey: ["project-team"] })} />}
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : !users.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">لا يوجد مستخدمو مشاريع بعد</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-1">
            {users.map((u) => (
              <button key={u.id} onClick={() => setSel(u.id)} className={`flex w-full items-center gap-2 rounded-lg border p-2 text-start text-sm ${user?.id === u.id ? "border-primary bg-primary/10" : "bg-card"}`}>
                <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">{(u.full_name || u.email || "?").slice(0, 1)}</div>
                <div className="min-w-0"><div className="truncate font-medium">{u.full_name || u.email}</div><div className="truncate text-xs text-muted-foreground" dir="ltr">{u.email}</div></div>
              </button>
            ))}
          </div>
          {user && (
            <div className="space-y-4 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">صلاحيات {user.full_name || user.email}{user.is_active === false && <span className="ms-2 text-xs text-destructive">(موقوف)</span>}</h3>
                {user.id !== me?.userId && (
                  <div className="flex gap-2">
                    {canEditPerm && <Button size="sm" variant="outline" onClick={() => activeFn({ data: { userId: user.id, active: user.is_active === false } }).then(() => { toast.success(user.is_active === false ? "تمت إعادة التفعيل" : "تم الإيقاف المؤقت"); refresh(); }, (e: Error) => toast.error(e.message))}>{user.is_active === false ? "إعادة التفعيل" : "إيقاف مؤقت"}</Button>}
                    {canDeleteUser && <Button size="sm" variant="destructive" onClick={() => { if (confirm(`حذف ${user.full_name || user.email} نهائياً؟`)) deleteFn({ data: { userId: user.id } }).then(() => { toast.success("تم الحذف"); setSel(null); refresh(); }, (e: Error) => toast.error(e.message)); }}>حذف</Button>}
                  </div>
                )}
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-right">القسم</th>{FIELDS.map(([, l]) => <th key={l} className="p-2">{l}</th>)}</tr></thead>
                <tbody>{TEAM_MODULES.map((m) => <tr key={m} className="border-t"><td className="p-2">{MODULE_LABEL[m]?.replace("↳ مشروع: ", "")}</td>{FIELDS.map(([f]) => <td key={f} className="p-2 text-center">
                  <Switch checked={val(m, f)} disabled={!canEditPerm} onCheckedChange={(v) => permFn({ data: { userId: user.id, module: m, field: f, value: v } }).then(() => qc.invalidateQueries({ queryKey: ["project-team"] }), (e: Error) => toast.error(e.message))} />
                </td>)}</tr>)}</tbody></table></div>
              <h3 className="font-semibold">سجل الدخول والخروج</h3>
              {!logins.length ? <p className="text-sm text-muted-foreground">لا يوجد سجل بعد</p> : (
                <ul className="max-h-72 divide-y overflow-y-auto text-sm">{logins.map((l) => (
                  <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className={l.event === "sign_out" ? "text-muted-foreground" : "font-medium text-primary"}>{l.event === "sign_out" ? "خروج" : "دخول"}</span>
                    <span dir="ltr" className="text-xs text-muted-foreground">{l.ip ?? ""}</span>
                    <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("ar-SY-u-nu-latn")}</span>
                  </li>
                ))}</ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Company logo and colours for the whole app and printouts — same editor as settings. */
function AppBrandDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>شعار وألوان البرنامج</DialogTitle></DialogHeader>
        <BrandThemeEditor onSaved={onClose} />
      </DialogContent>
    </Dialog>
  );
}
