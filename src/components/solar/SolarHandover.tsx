/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileSignature, Plus, Printer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { useBranding } from "@/lib/branding";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MediaButton, useProjectMedia } from "./SolarMedia";
import { printDocument } from "@/lib/print";

const PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية" };
const SNAG_STATUS: Record<string, string> = { open: "مفتوحة", in_progress: "قيد المعالجة", closed: "مغلقة" };
const KINDS = {
  site: { title: "محضر استلام موقع", body: "تم استلام الموقع المذكور أعلاه من قبل الشركة المنفذة بحضور الطرفين، وهو جاهز للبدء بأعمال التركيب وفق الدراسة المعتمدة." },
  initial: { title: "محضر تسليم ابتدائي", body: "تم الكشف على المنظومة وتشغيلها تجريبياً بحضور الطرفين، وتبيّن مطابقتها للعرض الفني المعتمد، وتُسلَّم تسليماً ابتدائياً مع بدء فترة الضمان." },
  final: { title: "محضر تسليم نهائي", body: "بعد انتهاء فترة الضمان ومعالجة جميع الملاحظات، يقرّ الطرفان بالتسليم النهائي للمنظومة وبراءة ذمة الشركة المنفذة من الأعمال المذكورة." },
} as const;
type Kind = keyof typeof KINDS;

export function SnagList({ projectId, tenantId }: { projectId: string; tenantId: string }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const media = useProjectMedia(projectId);
  const canAdd = can(me, "projects", "create") || can(me, "projects", "edit");
  const canEdit = can(me, "projects", "edit");
  const canDel = can(me, "projects", "delete");
  const [title, setTitle] = useState("");
  const [loc, setLoc] = useState("");
  const [prio, setPrio] = useState("normal");
  const [filter, setFilter] = useState<"active" | "closed" | "all">("active");
  const list = useQuery({
    queryKey: ["snags", projectId],
    queryFn: async () => {
      const { data, error } = await db.from("project_snags").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["snags", projectId] });
  async function add() {
    if (!title.trim()) return;
    const { error } = await db.from("project_snags").insert({ tenant_id: tenantId, project_id: projectId, title: title.trim(), location: loc.trim() || null, priority: prio });
    if (error) { toast.error(error.message); return; }
    setTitle(""); setLoc("");
    refresh();
  }
  async function setStatus(id: string, status: string) {
    const { error } = await db.from("project_snags").update({ status, closed_at: status === "closed" ? new Date().toISOString() : null, closed_by: status === "closed" ? me?.userId : null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  async function remove(id: string) {
    if (!window.confirm("حذف الملاحظة؟")) return;
    const { error } = await db.from("project_snags").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  const rows = (list.data ?? []) as any[];
  const open = rows.filter((r) => r.status !== "closed").length;
  const shown = rows.filter((r) => filter === "all" || (filter === "closed" ? r.status === "closed" : r.status !== "closed"));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={open ? "font-semibold text-warning" : "font-semibold text-success"}>{open ? `${open} ملاحظة مفتوحة` : "لا توجد ملاحظات مفتوحة — جاهز للتسليم"}</span>
        <div className="ms-auto flex gap-1">
          {(["active", "closed", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "active" ? "المفتوحة" : f === "closed" ? "المغلقة" : "الكل"}</Button>
          ))}
        </div>
      </div>
      {canAdd && (
        <form className="grid gap-2 sm:grid-cols-[1fr_12rem_8rem_auto]" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input placeholder="الملاحظة (مثلاً: إعادة شد براغي القواعد)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="المكان (اختياري)" value={loc} onChange={(e) => setLoc(e.target.value)} />
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={prio} onChange={(e) => setPrio(e.target.value)}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Button type="submit"><Plus className="size-4" />إضافة</Button>
        </form>
      )}
      {!shown.length ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد ملاحظات</p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const photos = (media.data ?? []).filter((a) => a.attach_type === `snag:${r.id}`).length;
            return (
              <div key={r.id} className={`rounded-lg border p-3 ${r.status === "closed" ? "opacity-70" : ""}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${r.status === "closed" ? "line-through" : ""}`}>{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.location ? `${r.location} · ` : ""}{fmtDate(r.created_at)} · أولوية {PRIORITY[r.priority]}
                      {r.closed_at ? ` · أُغلقت ${fmtDate(r.closed_at)}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "closed" ? "bg-success/15 text-success" : r.priority === "high" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{SNAG_STATUS[r.status]}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <MediaButton projectId={projectId} tag={`snag:${r.id}`} canEdit={canAdd} label={`صور (${photos})`} />
                  {canEdit && r.status !== "closed" && (
                    <>
                      {r.status === "open" && <Button size="sm" variant="outline" onClick={() => void setStatus(r.id, "in_progress")}>قيد المعالجة</Button>}
                      <Button size="sm" onClick={() => void setStatus(r.id, "closed")}><CheckCircle2 className="size-4" />إغلاق</Button>
                    </>
                  )}
                  {canEdit && r.status === "closed" && <Button size="sm" variant="ghost" onClick={() => void setStatus(r.id, "open")}>إعادة فتح</Button>}
                  {canDel && <Button size="icon" variant="ghost" className="ms-auto" onClick={() => void remove(r.id)}><Trash2 className="size-4" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HandoverForms({ project, solar, completion }: { project: any; solar: any; completion: number }) {
  const { data: me } = useMe();
  const brand = useBranding();
  const [kind, setKind] = useState<Kind>("site");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [engineer, setEngineer] = useState("");
  const [client, setClient] = useState<string>(solar?.survey?.owner_name || project.partners?.name || "");
  const [notes, setNotes] = useState("");
  const snags = useQuery({
    queryKey: ["snags", project.id],
    queryFn: async () => (await db.from("project_snags").select("*").eq("project_id", project.id)).data ?? [],
  });
  const openSnags = ((snags.data ?? []) as any[]).filter((s) => s.status !== "closed");

  function print() {
    if (kind === "final" && openSnags.length && !window.confirm(`يوجد ${openSnags.length} ملاحظة غير مغلقة. متابعة إصدار محضر التسليم النهائي؟`)) return;
    const w = window.open("", "_blank", "width=960,height=1000");
    if (!w) { toast.error("اسمح بالنوافذ المنبثقة للطباعة"); return; }
    const k = KINDS[kind];
    const meta: [string, string][] = [
      ["المشروع", String(project.name ?? "")], ["رمز المشروع", String(project.code ?? "—")], ["العميل", client || "—"], ["الموقع", String(solar?.survey?.address ?? "—")],
      ["الاستطاعة", solar?.survey?.capacity_kwp ? `${solar.survey.capacity_kwp} kWp` : "—"], ["تاريخ المحضر", fmtDate(date)],
      ["نسبة الإنجاز", `${completion.toFixed(0)}%`], ["تاريخ البداية / النهاية", `${fmtDate(project.start_date) || "—"} / ${fmtDate(project.end_date) || "—"}`],
    ];
    void printDocument({
      title: k.title, company: me?.tenantName, logo: brand.data?.logo_url, meta, columns: [], rows: [],
      sections: [
        { title: "نص المحضر", text: k.body },
        ...(notes ? [{ title: "ملاحظات", text: notes }] : []),
        ...(kind !== "site" && openSnags.length ? [{ title: `ملاحظات قائمة (${openSnags.length})`, columns: ["#", "الملاحظة", "الموقع", "الأولوية"], rows: openSnags.map((s, i) => [i + 1, s.title ?? "", s.location ?? "", PRIORITY[s.priority] ?? s.priority ?? ""]) }] : []),
      ],
      signatures: [`المهندس المسؤول${engineer ? `: ${engineer}` : ""}`, `العميل / ممثله${client ? `: ${client}` : ""}`, "ختم الشركة"],
    }, w);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg border p-3 text-start text-sm ${kind === k ? "border-primary bg-primary/10" : ""}`}>
            <FileSignature className="mb-1 size-5 text-primary" />
            <b>{KINDS[k].title}</b>
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm">التاريخ<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">المهندس المسؤول<Input value={engineer} onChange={(e) => setEngineer(e.target.value)} /></label>
        <label className="text-sm">العميل<Input value={client} onChange={(e) => setClient(e.target.value)} /></label>
      </div>
      <Textarea placeholder="ملاحظات إضافية تظهر في المحضر (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {kind !== "site" && openSnags.length > 0 && <p className="text-sm text-warning">سيظهر في المحضر {openSnags.length} ملاحظة غير مغلقة.</p>}
      <Button onClick={print}><Printer className="size-4" />طباعة / حفظ PDF</Button>
    </div>
  );
}
