/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, Plus, Save, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { rollup, type Access } from "@/lib/solar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { MediaButton, useProjectMedia } from "./SolarMedia";
import { taskSchedule } from "@/lib/project-schedule";
import { fmtDate } from "@/lib/format";

export function WbsTree({
  projectId,
  tenantId,
  nodes,
  rootId,
  access,
  structure,
}: {
  projectId: string;
  tenantId: string;
  nodes: any[];
  rootId: string;
  access: Access;
  structure: WbsStructure;
}) {
  const { byId } = useMemo(() => rollup(nodes), [nodes]);
  const kids = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const n of nodes) if (n.parent_id) m.set(n.parent_id, [...(m.get(n.parent_id) ?? []), n]);
    for (const l of m.values()) l.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [nodes]);
  return (
    <div className="space-y-2">
      {(kids.get(rootId) ?? []).map((n) => (
        <WbsRow
          key={n.id}
          n={n}
          kids={kids}
          byId={byId}
          depth={0}
          projectId={projectId}
          tenantId={tenantId}
          access={access}
          structure={structure}
        />
      ))}
      {structure.add && (
        <AddChild
          parent={rootId}
          projectId={projectId}
          tenantId={tenantId}
          section={nodes.find((x) => x.id === rootId)?.section}
        />
      )}
    </div>
  );
}

export type WbsStructure = { add: boolean; del: boolean; weight: boolean };

function WbsRow({
  n,
  kids,
  byId,
  depth,
  projectId,
  tenantId,
  access,
  structure,
}: {
  n: any;
  kids: Map<string, any[]>;
  byId: Map<string, number>;
  depth: number;
  projectId: string;
  tenantId: string;
  access: Access;
  structure: WbsStructure;
}) {
  const qc = useQueryClient();
  const media = useProjectMedia(projectId);
  const children = kids.get(n.id) ?? [];
  const leaf = children.length === 0;
  const pct = byId.get(n.id) ?? 0;
  const [open, setOpen] = useState(depth < 1);
  const [val, setVal] = useState(Number(n.progress));
  const [ohms, setOhms] = useState<string>(n.data?.ohms_value ?? "");
  const [weight, setWeight] = useState(String(n.weight));
  const edit = access === "edit";
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["solar-wbs", projectId] });
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  };

  async function save() {
    const hasMedia = (media.data ?? []).some((a) => a.attach_type === `wbs:${n.id}`);
    if (n.data?.media && val > 0 && !hasMedia) {
      toast.error("يجب إرفاق صورة أو فيديو توثيقي من الموقع قبل تسجيل الإنجاز");
      return;
    }
    if (n.data?.ohms && val >= 100 && !(Number(ohms) > 0)) {
      toast.error("أدخل قيمة مقاومة الأرضي بالأوم قبل إكمال المهمة");
      return;
    }
    const { error } = await db
      .from("project_wbs")
      .update({
        progress: val,
        data: { ...(n.data ?? {}), ...(n.data?.ohms ? { ohms_value: ohms } : {}) },
      })
      .eq("id", n.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم حفظ الإنجاز");
    refresh();
  }
  async function saveWeight() {
    const { error } = await db
      .from("project_wbs")
      .update({ weight: Number(weight) || 0 })
      .eq("id", n.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }
  async function saveDate(field: "start_date" | "end_date", v: string) {
    const { error } = await db.from("project_wbs").update({ [field]: v || null }).eq("id", n.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }
  const sch = taskSchedule(n.start_date, n.end_date, pct);
  async function remove() {
    if (!window.confirm(`حذف "${n.name}" وكل فروعه؟`)) return;
    const { error } = await db.from("project_wbs").delete().eq("id", n.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  const tone = pct >= 100 ? "text-success" : pct > 0 ? "text-warning" : "text-muted-foreground";
  return (
    <div className="rounded-lg border bg-card" style={{ marginInlineStart: depth * 12 }}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        {!leaf ? (
          <button
            type="button"
            className="flex flex-1 items-center gap-1 text-right font-semibold"
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
            {n.name}
          </button>
        ) : (
          <span className="min-w-0 flex-1 font-medium">{n.name}</span>
        )}
        {sch.late && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
            {sch.overdue ? `متأخرة ${-(sch.daysLeft ?? 0)} يوم` : "متأخرة عن الخطة"}
          </span>
        )}
        <span className={`num text-sm font-bold ${tone}`}>{pct.toFixed(1)}%</span>
        {structure.weight ? (
          <span className="flex items-center gap-1 text-xs">
            وزن
            <Input
              className="h-8 w-16"
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => void saveWeight()}
            />
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">وزن {n.weight}</span>
        )}
        <MediaButton projectId={projectId} tag={`wbs:${n.id}`} canEdit={edit} label="توثيق" />
        {structure.del && (
          <Button size="icon" variant="ghost" onClick={() => void remove()}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      <Progress value={pct} className="mx-3 mb-2 h-2" />
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3 text-xs text-muted-foreground">
        {edit ? (
          <>
            <label className="flex items-center gap-1">
              من
              <Input type="date" className="h-8 w-36" defaultValue={n.start_date ?? ""} onBlur={(e) => e.target.value !== (n.start_date ?? "") && void saveDate("start_date", e.target.value)} />
            </label>
            <label className="flex items-center gap-1">
              إلى
              <Input type="date" className="h-8 w-36" defaultValue={n.end_date ?? ""} onBlur={(e) => e.target.value !== (n.end_date ?? "") && void saveDate("end_date", e.target.value)} />
            </label>
          </>
        ) : (
          <span>{n.start_date ? fmtDate(n.start_date) : "—"} ← {n.end_date ? fmtDate(n.end_date) : "—"}</span>
        )}
        {sch.daysLeft != null && pct < 100 && sch.daysLeft >= 0 && <span>متبقٍ {sch.daysLeft} يوم</span>}
      </div>
      {leaf && edit && (
        <div className="flex flex-wrap items-center gap-3 border-t p-3">
          <Slider
            className="min-w-40 flex-1 py-3"
            value={[val]}
            min={0}
            max={100}
            step={5}
            onValueChange={(v) => setVal(v[0] ?? 0)}
          />
          <span className="num w-12 text-center font-bold">{val}%</span>
          {n.data?.ohms && (
            <Input
              className="h-10 w-32"
              type="number"
              placeholder="المقاومة (أوم)"
              value={ohms}
              onChange={(e) => setOhms(e.target.value)}
            />
          )}
          <Button className="h-10" onClick={() => void save()}>
            <Save className="size-4" />
            حفظ
          </Button>
        </div>
      )}
      {leaf && !edit && n.data?.ohms_value && (
        <p className="px-3 pb-3 text-sm">
          مقاومة الأرضي: <b className="num">{n.data.ohms_value}</b> أوم
        </p>
      )}
      {!leaf && open && (
        <div className="space-y-2 p-2">
          {children.map((c) => (
            <WbsRow
              key={c.id}
              n={c}
              kids={kids}
              byId={byId}
              depth={depth + 1}
              projectId={projectId}
              tenantId={tenantId}
              access={access}
              structure={structure}
            />
          ))}
          {structure.add && (
            <AddChild parent={n.id} projectId={projectId} tenantId={tenantId} section={n.section} />
          )}
        </div>
      )}
    </div>
  );
}

function AddChild({
  parent,
  projectId,
  tenantId,
  section,
  label = "إضافة فرع",
}: {
  parent: string;
  projectId: string;
  tenantId: string;
  section: string;
  label?: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  async function add() {
    if (!name.trim()) return;
    const { error } = await db.from("project_wbs").insert({
      tenant_id: tenantId,
      project_id: projectId,
      parent_id: parent,
      section,
      name: name.trim(),
      weight: 1,
      is_final: true,
      sort_order: 999,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await db.from("project_wbs").update({ is_final: false }).eq("id", parent);
    setName("");
    qc.invalidateQueries({ queryKey: ["solar-wbs", projectId] });
  }
  return (
    <div className="flex gap-2">
      <Input
        className="h-9"
        placeholder={label}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void add()}
      />
      <Button size="sm" variant="outline" className="h-9" onClick={() => void add()}>
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
