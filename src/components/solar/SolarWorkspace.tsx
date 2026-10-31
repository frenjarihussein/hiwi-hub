/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Eye, Printer, Sun } from "lucide-react";
import { db } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import {
  ROLE_LABEL,
  SECTION_LABEL,
  SECTIONS,
  canSeeCosts,
  rollup,
  sectionAccess,
  type Access,
  sectionPermsFor,
  accessFromPerms,
  templateRows,
  TEMPLATE,
  type SolarRole,
  type SolarSection,
} from "@/lib/solar";
import { exportProjectBundle } from "@/lib/solar-bundle";
import { printFullProjectReport } from "@/lib/project-report";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { WbsTree } from "./SolarWbs";
import { BomTable, FinancePanel, PermitsVault, SolarRolesCard, SurveyForm } from "./SolarForms";
import { useProjectMedia } from "./SolarMedia";
import { SolarQuotation } from "./SolarQuotation";
import { DeliveryCountdown, SolarGantt } from "./SolarSchedule";
import { HandoverForms, SnagList } from "./SolarHandover";
import { SolarMonitor } from "./SolarMonitor";

const STATUS: Record<string, string> = {
  pending: "بانتظار الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
};

export function SolarWorkspace({ project, actual }: { project: any; actual: number }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const projectId: string = project.id;
  const tenantId: string = project.tenant_id;
  const solar = useQuery({
    queryKey: ["solar", projectId],
    queryFn: async () =>
      (await db.from("solar_projects").select("*").eq("project_id", projectId).maybeSingle())
        .data ?? null,
  });
  const wbs = useQuery({
    queryKey: ["solar-wbs", projectId],
    enabled: !!solar.data,
    queryFn: async () =>
      (await db.from("project_wbs").select("*").eq("project_id", projectId).order("sort_order"))
        .data ?? [],
  });
  const myRole = useQuery({
    queryKey: ["solar-my-role", tenantId, me?.userId],
    enabled: !!me,
    queryFn: async () =>
      (
        await db
          .from("solar_roles")
          .select("role")
          .eq("tenant_id", tenantId)
          .eq("user_id", me!.userId)
          .maybeSingle()
      ).data?.role ?? null,
  });
  const media = useProjectMedia(projectId);
  const isAdmin = !!(me?.isTenantAdmin || me?.isSuperAdmin);
  const [preview, setPreview] = useState<SolarRole | null>(null);
  const realRole: SolarRole = isAdmin ? "admin" : ((myRole.data as SolarRole | null) ?? "viewer");
  const role: SolarRole = isAdmin && preview ? preview : realRole;
  const [tab, setTab] = useState<SolarSection | "roles" | "schedule" | "handover" | "monitor">("survey");
  const [busy, setBusy] = useState<string | null>(null);

  const nodes = (wbs.data ?? []) as any[];
  const { byId, total } = useMemo(() => rollup(nodes), [nodes]);
  const exportToGrid = solar.data?.survey?.export_to_grid === "yes";
  const roots = nodes.filter((n) => !n.parent_id);
  // Explicit per-section user permissions win over the solar role matrix (admins previewing a role use the matrix).
  const permsOf = (s: SolarSection) =>
    preview ? null : sectionPermsFor(me?.perms ?? [], s, isAdmin);
  const accessOf = (s: SolarSection): Access => {
    const p = permsOf(s);
    return p ? accessFromPerms(p) : sectionAccess(role, s, exportToGrid);
  };
  const visible = SECTIONS.filter((s) => accessOf(s) !== "hidden");
  const current = tab === "roles" || tab === "schedule" || tab === "handover" || tab === "monitor" ? tab : visible.includes(tab) ? tab : visible[0];

  async function enable() {
    if (!can(me, "projects", "create") && !can(me, "projects", "edit")) {
      toast.error("لا تملك صلاحية تعديل المشاريع");
      return;
    }
    const existing = await db
      .from("project_wbs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (!existing.count) {
      const { error: e2 } = await db
        .from("project_wbs")
        .insert(templateRows(projectId, tenantId, false));
      if (e2) {
        toast.error(e2.message);
        return;
      }
    }
    const { error } = await db
      .from("solar_projects")
      .upsert({ project_id: projectId, tenant_id: tenantId }, { onConflict: "project_id" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم تفعيل قالب مشروع الطاقة الشمسية");
    qc.invalidateQueries({ queryKey: ["solar", projectId] });
  }
  async function onExportChange(v: boolean) {
    const root = roots.find((r) => r.section === "permits");
    const w = TEMPLATE.find((t) => t.section === "permits")?.weight ?? 10;
    if (root)
      await db
        .from("project_wbs")
        .update({ weight: v ? w : 0 })
        .eq("id", root.id);
    qc.invalidateQueries({ queryKey: ["solar-wbs", projectId] });
  }
  async function bundle(print = false) {
    if (print) { await printFullProjectReport(projectId, { company: me?.tenantName, includeFinance: canSeeCosts(role) }).catch((e: Error) => toast.error(e.message)); return; }
    const win = null;
    setBusy("0");
    try {
      const [bom, ms] = await Promise.all([
        db.from("project_bom").select("*").eq("project_id", projectId),
        db.from("project_milestones").select("*").eq("project_id", projectId),
      ]);
      const allowed = (media.data ?? []).filter(
        (a) =>
          !a.attach_type.startsWith("permit:") ||
          accessOf("permits") !== "hidden",
      );
      const args = {
        project: { ...project, partners: undefined },
        solar: solar.data,
        nodes,
        bom: bom.data ?? [],
        milestones: ms.data ?? [],
        media: allowed,
        includeFinance: canSeeCosts(role),
        onProgress: (d: number, t: number) => setBusy(`${d}/${t}`),
      };
      void win; await exportProjectBundle(args);
      if (!print) toast.success("تم تنزيل حزمة المشروع");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (solar.isLoading) return null;
  if (!solar.data || (wbs.isSuccess && nodes.length === 0)) {
    return (
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-card p-4">
        <div className="flex items-center gap-2">
          <Sun className="size-5 text-warning" />
          <span>هل هذا مشروع طاقة شمسية صناعية متصلة بالشبكة؟</span>
        </div>
        <Button onClick={() => void enable()}>
          <Sun className="size-4" />
          تحويله إلى مشروع طاقة شمسية
        </Button>
      </div>
    );
  }

  const access = accessOf;
  const rootOf = (s: SolarSection) => roots.find((r) => r.section === s);
  const canFinish = isAdmin || can(me, "projects", "edit");
  async function setDone(done: boolean) {
    if (done && !confirm("تحويل المشروع إلى منجز بالكامل؟ ستختفي أقسام التركيب ويبقى قسم المراقبة فقط.")) return;
    const { error } = await db.from("projects").update({ status: done ? "completed" : "active", ...(done ? { completion_pct: 100 } : {}) }).eq("id", projectId);
    if (error) { toast.error(error.message); return; }
    toast.success(done ? "تم تحويل المشروع إلى منجز — وضع المراقبة" : "تمت إعادة فتح أقسام التركيب");
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  }
  if (project.status === "completed") {
    return (
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 sm:p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sun className="size-5 text-warning" />
            مشروع منجز — وضع المراقبة
          </h2>
          {canFinish && <Button variant="outline" size="sm" onClick={() => void setDone(false)}>إعادة فتح أقسام التركيب</Button>}
        </div>
        <Panel title="المراقبة الحية للمنظومة">
          <SolarMonitor projectId={projectId} tenantId={tenantId} canEdit={canFinish} />
        </Panel>
      </div>
    );
  }
  return (
    <div className="mb-6 space-y-4">
      <div className="rounded-lg border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Sun className="size-5 text-warning" />
              مشروع طاقة شمسية On-Grid
            </h2>
            <p className="text-sm text-muted-foreground">
              الحالة: {STATUS[solar.data.approval_status] ?? solar.data.approval_status} · دورك:{" "}
              {ROLE_LABEL[role]}
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            {isAdmin && (
              <label className="flex items-center gap-1 text-sm">
                <Eye className="size-4" />
                معاينة كـ
                <select
                  className="h-9 rounded-md border bg-background px-2"
                  value={preview ?? ""}
                  onChange={(e) => setPreview((e.target.value || null) as SolarRole | null)}
                >
                  <option value="">الإدارة (أنا)</option>
                  {(Object.keys(ROLE_LABEL) as SolarRole[])
                    .filter((r) => r !== "admin")
                    .map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {canFinish && <Button onClick={() => void setDone(true)}>تحويل إلى مشروع منجز</Button>}
            <Button variant="outline" disabled={!!busy} onClick={() => void bundle()}>
              <Archive className="size-4" />
              {busy ? `جارٍ التجميع ${busy}` : "تصدير حزمة المشروع ZIP"}
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => void bundle(true)}>
              <Printer className="size-4" />
              طباعة تقرير المشروع
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm">
            <span>الإنجاز الكلي للمشروع</span>
            <b className="num">{total.toFixed(1)}%</b>
          </div>
          <Progress value={total} className="h-3" />
        </div>
        <div className="mt-3"><DeliveryCountdown end={project.end_date} completion={total} /></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {SECTIONS.map((s) => {
            const r = rootOf(s);
            const hidden = access(s) === "hidden";
            return (
              <button
                key={s}
                type="button"
                disabled={hidden}
                onClick={() => setTab(s)}
                className={`rounded-lg border p-2 text-right text-xs transition ${current === s ? "border-primary bg-primary/10" : ""} ${hidden ? "opacity-40" : ""}`}
              >
                <p className="font-semibold">{SECTION_LABEL[s]}</p>
                <p className="num mt-1 text-base font-bold">
                  {hidden ? "—" : `${(r ? (byId.get(r.id) ?? 0) : 0).toFixed(0)}%`}
                </p>
                <p className="text-muted-foreground">
                  وزن {r?.weight ?? 0}%{r?.is_continuous ? " · مستمر" : ""}
                </p>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant={current === "schedule" ? "default" : "outline"} onClick={() => setTab("schedule")}>المخطط الزمني</Button>
          <Button size="sm" variant={current === "handover" ? "default" : "outline"} onClick={() => setTab("handover")}>الملاحظات ومحاضر التسليم</Button>
          <Button size="sm" variant={current === "monitor" ? "default" : "outline"} onClick={() => setTab("monitor")}>مراقبة الإنفرتر (سن غرو)</Button>
          {isAdmin && !preview && (
            <Button variant="link" size="sm" className="px-0" onClick={() => setTab("roles")}>
              أدوار المستخدمين في مشاريع الطاقة الشمسية
            </Button>
          )}
        </div>
      </div>

      {current === "roles" ? (
        <Panel title="أدوار المستخدمين">
          <SolarRolesCard tenantId={tenantId} />
        </Panel>
      ) : current === "schedule" ? (
        <Panel title="المخطط الزمني للمراحل">
          <SolarGantt nodes={nodes} byId={byId} />
        </Panel>
      ) : current === "monitor" ? (
        <Panel title="المراقبة الحية للمنظومة">
          <SolarMonitor projectId={projectId} tenantId={tenantId} canEdit={isAdmin || can(me, "projects", "edit")} />
        </Panel>
      ) : current === "handover" ? (
        <>
          <Panel title="قائمة الملاحظات الميدانية">
            <SnagList projectId={projectId} tenantId={tenantId} />
          </Panel>
          <Panel title="محاضر الاستلام والتسليم">
            <HandoverForms project={project} solar={solar.data} completion={total} />
          </Panel>
        </>
      ) : current ? (
        <Panel title={SECTION_LABEL[current]}>
          {current === "survey" && (
            <SurveyForm
              projectId={projectId}
              solar={solar.data}
              access={access("survey")}
              financeAccess={access("finance")}
              perms={permsOf("survey")}
              onExportChange={(v) => void onExportChange(v)}
            />
          )}
          {current === "procurement" && (
            <BomTable
              projectId={projectId}
              tenantId={tenantId}
              access={access("procurement")}
              perms={permsOf("procurement")}
              showCosts={canSeeCosts(role)}
            />
          )}
          {current === "finance" && (
            <>
            <SolarQuotation
              projectId={projectId}
              tenantId={tenantId}
              projectName={project.name}
              client={solar.data.survey?.owner_name || project.partners?.name}
              location={solar.data.survey?.address}
              access={access("finance")}
              perms={permsOf("finance")}
            />
            <FinancePanel
              projectId={projectId}
              tenantId={tenantId}
              solar={solar.data}
              access={access("finance")}
              perms={permsOf("finance")}
              completion={total}
              actual={actual}
            />
            </>
          )}
          {current === "permits" && (
            <PermitsVault
              projectId={projectId}
              solar={solar.data}
              access={access("permits")}
              electricalDone={rootOf("electrical") ? (byId.get(rootOf("electrical")!.id) ?? 0) : 0}
            />
          )}
          {rootOf(current) && (
            <div className="mt-6">
              <h3 className="mb-2 font-semibold">مراحل وفروع القسم</h3>
              <WbsTree
                projectId={projectId}
                tenantId={tenantId}
                nodes={nodes}
                rootId={rootOf(current)!.id}
                access={access(current)}
                structure={(() => {
                  const p = permsOf(current);
                  const adm = role === "admin";
                  return p
                    ? { add: p.create, del: p.delete, weight: p.edit }
                    : { add: adm, del: adm, weight: adm };
                })()}
              />
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3 sm:p-4">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}
