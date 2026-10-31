/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Plus, Save, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { fmtNum } from "@/lib/format";
import {
  AZIMUTHS,
  BOM_CATEGORIES,
  EARTHING,
  MOUNT_TYPES,
  PERMIT_DOCS,

  ROLE_LABEL,
  SHIFTS,
  SUPPLY_STATUS,
  SURVEY_RESULTS,
  milestoneDue,
  requiredPermits,
  PERMIT_STAGES,
  NO_OBJECTION_DOC,
  type Access,
  type SolarRole,
  type SectionPerms,
} from "@/lib/solar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaButton, useProjectMedia } from "./SolarMedia";

type F = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "yesno" | "textarea";
  options?: string[];
  media?: string;
  accept?: string;
  when?: (s: any) => boolean;
};
const GROUPS: { title: string; fields: F[] }[] = [
  {
    title: "بيانات الكشف",
    fields: [
      { key: "surveyor", label: "اسم القائم بالكشف" },
      { key: "survey_date", label: "تاريخ الكشف", type: "date" },
      { key: "result", label: "نتيجة الكشف", type: "select", options: SURVEY_RESULTS },
      { key: "result_notes", label: "ملاحظات وأسباب النتيجة", type: "textarea" },
    ],
  },
  {
    title: "بيانات المصنع والمالك",
    fields: [
      { key: "factory_name", label: "اسم المصنع" },
      { key: "owner_name", label: "اسم المالك" },
      { key: "owner_address", label: "عنوان سكن المالك" },
      { key: "phones", label: "أرقام الهاتف" },
      { key: "address", label: "عنوان الموقع" },
      { key: "lat", label: "خط العرض (Latitude)", type: "number" },
      { key: "lng", label: "خط الطول (Longitude)", type: "number" },
      { key: "maps_url", label: "رابط الموقع على خرائط غوغل" },
      { key: "agricultural", label: "الموقع خارج المدينة الصناعية؟", type: "yesno" },
    ],
  },
  {
    title: "طريقة التركيب وقياسات الموقع",
    fields: [
      { key: "mount_type", label: "طريقة التركيب", type: "select", options: MOUNT_TYPES },
      { key: "length_m", label: "الطول (م)", type: "number" },
      { key: "width_m", label: "العرض (م)", type: "number" },
      { key: "azimuth", label: "التوجيه (Azimuth)", type: "select", options: AZIMUTHS },
      { key: "grid_distance_m", label: "المسافة إلى لوحة الربط الرئيسية (م)", type: "number" },
    ],
  },
  {
    title: "الإشغالات والعوائق على السطح",
    fields: [
      {
        key: "obstructions",
        label: "وصف الإشغالات (خزانات، مداخن، تكييف، تهوية...) والظلال",
        type: "textarea",
        media: "survey:obstructions",
      },
    ],
  },
  {
    title: "غرفة / موقع الإنفرترات",
    fields: [
      { key: "inverter_room", label: "هل تم تحديد موقع غرفة الإنفرترات؟", type: "yesno" },
      {
        key: "inverter_area",
        label: "مساحتها (م²)",
        type: "number",
        when: (s) => s.inverter_room === "yes",
      },
      {
        key: "inverter_where",
        label: "أين تقع (وصف المكان)",
        when: (s) => s.inverter_room === "yes",
        media: "survey:inverter_room",
      },
      {
        key: "inverter_distance",
        label: "المسافة بين الألواح والغرفة (م)",
        type: "number",
        when: (s) => s.inverter_room === "yes",
      },
    ],
  },
  {
    title: "التأريض والصواعق القائم",
    fields: [
      {
        key: "earthing",
        label: "نظام التأريض والصواعق",
        type: "select",
        options: EARTHING,
        media: "survey:earthing",
      },
      {
        key: "earthing_ohms",
        label: "المقاومة الحالية (أوم)",
        type: "number",
        when: (s) => s.earthing && s.earthing !== "غير موجود",
      },
    ],
  },
  {
    title: "ساعات العمل والورديات",
    fields: [
      { key: "work_hours", label: "عدد ساعات العمل اليومية", type: "number" },
      { key: "shifts", label: "نظام الورديات", type: "select", options: SHIFTS },
      { key: "peak_hours", label: "ساعات ذروة الاستهلاك" },
    ],
  },
  {
    title: "الأحمال والشبكة",
    fields: [
      { key: "amp_l1", label: "أمبير الفاز 1 بالذروة", type: "number" },
      { key: "amp_l2", label: "أمبير الفاز 2 بالذروة", type: "number" },
      { key: "amp_l3", label: "أمبير الفاز 3 بالذروة", type: "number" },
      { key: "peak_kw", label: "حمل الذروة (kW)", type: "number" },
      { key: "transformer_kva", label: "سعة المحولة (kVA)", type: "number" },
      { key: "bill_value", label: "قيمة الفاتورة الشهرية", type: "number" },
      {
        key: "bill_currency",
        label: "العملة",
        type: "select",
        options: ["USD", "SYP", "TRY", "EUR", "SAR", "AED"],
      },
      { key: "export_to_grid", label: "تصدير الفائض إلى الشبكة؟", type: "yesno" },
    ],
  },
  {
    title: "المخططات والدراسات",
    fields: [
      {
        key: "technical_offer_note",
        label: "العرض الفني بعد الدراسة (PDF / PowerPoint)",
        media: "survey:technical_offer",
        accept: ".pdf,.ppt,.pptx",
      },
      {
        key: "drawings_note",
        label: "المخططات المعتمدة بعد الدراسة",
        media: "survey:drawings",
        accept: ".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp",
      },
      {
        key: "cad_note",
        label: "مخططات AutoCAD (.dwg / .dxf)",
        media: "survey:cad",
        accept: ".dwg,.dxf,.pdf,image/*",
      },
      {
        key: "pvsyst_note",
        label: "تقرير إنتاجية PVsyst (.pdf)",
        media: "survey:pvsyst",
        accept: ".pdf",
      },
    ],
  },
];

export function SurveyForm({
  projectId,
  solar,
  access,
  onExportChange,
  financeAccess,
  perms,
}: {
  projectId: string;
  solar: any;
  access: Access;
  onExportChange: (v: boolean) => void;
  financeAccess: Access;
  perms?: SectionPerms | null;
}) {
  const qc = useQueryClient();
  const [s, setS] = useState<any>(solar.survey ?? {});
  useEffect(() => setS(solar.survey ?? {}), [solar.survey]);
  const edit = access === "edit";
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));

  async function save(status?: string) {
    const { error } = await db
      .from("solar_projects")
      .update({
        survey: s,
        updated_at: new Date().toISOString(),
        ...(status ? { approval_status: status } : {}),
      })
      .eq("project_id", projectId);
    if (error) {
      toast.error(error.message);
      return;
    }
    if ((s.export_to_grid === "yes") !== (solar.survey?.export_to_grid === "yes"))
      onExportChange(s.export_to_grid === "yes");
    toast.success(status ? "تم تحديث حالة المشروع" : "تم حفظ الكشف");
    qc.invalidateQueries({ queryKey: ["solar", projectId] });
  }
  const mapUrl =
    s.maps_url || (s.lat && s.lng ? `https://www.google.com/maps?q=${s.lat},${s.lng}` : "");
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="rounded-lg border bg-card p-4">
          <legend className="px-2 font-semibold">{g.title}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.fields
              .filter((f) => !f.when || f.when(s))
              .map((f) => (
                <div
                  key={f.key}
                  className={`space-y-1 ${f.type === "textarea" ? "sm:col-span-2 lg:col-span-3" : ""}`}
                >
                  <Label>{f.label}</Label>
                  <div className="flex gap-2">
                    {!f.key.endsWith("_note") && (
                      <FieldInput
                        f={f}
                        value={s[f.key] ?? ""}
                        onChange={(v) => set(f.key, v)}
                        disabled={!edit}
                      />
                    )}
                    {f.media && (
                      <MediaButton
                        projectId={projectId}
                        tag={f.media}
                        canEdit={edit}
                        {...(f.media === "survey:technical_offer" || f.media === "survey:drawings" ? {
                          canUpload: perms?.create ?? edit,
                          canDelete: perms?.delete ?? edit,
                        } : {})}
                        label={f.key.endsWith("_note") ? "رفع / عرض الملفات" : "صور"}
                        {...(f.accept ? { accept: f.accept } : {})}
                      />
                    )}
                  </div>
                </div>
              ))}
          </div>
          {g.title === "بيانات المصنع والمالك" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {edit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigator.geolocation?.getCurrentPosition(
                      (p) => {
                        set("lat", p.coords.latitude.toFixed(6));
                        set("lng", p.coords.longitude.toFixed(6));
                      },
                      () => toast.error("تعذر تحديد الموقع"),
                    )
                  }
                >
                  <MapPin className="size-4" />
                  موقعي الحالي
                </Button>
              )}
              {mapUrl && (
                <Button asChild variant="secondary" size="sm">
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                    <MapPin className="size-4" />
                    فتح على خرائط غوغل
                  </a>
                </Button>
              )}
            </div>
          )}
        </fieldset>
      ))}
      {s.length_m && s.width_m && (
        <p className="text-sm">
          المساحة المتاحة: <b className="num">{fmtNum(Number(s.length_m) * Number(s.width_m))}</b>{" "}
          م²
        </p>
      )}
      {financeAccess !== "hidden" && (
        <div className="rounded-lg border bg-secondary p-4">
          <p className="text-sm text-muted-foreground">السعر النهائي المعتمد من المالية</p>
          <p className="num text-2xl font-bold">
            {solar.finance?.quote_price
              ? `${fmtNum(solar.finance.quote_price)} ${solar.finance.quote_currency ?? ""}`
              : "لم يُحدد بعد"}
          </p>
        </div>
      )}
      {edit && (
        <div className="sticky bottom-2 flex flex-wrap gap-2 rounded-lg border bg-card p-3 shadow">
          <Button className="h-11 flex-1" onClick={() => void save()}>
            <Save className="size-4" />
            حفظ الكشف
          </Button>
          <Button className="h-11" variant="outline" onClick={() => void save("approved")}>
            اعتماد المشروع
          </Button>
          <Button className="h-11" variant="destructive" onClick={() => void save("rejected")}>
            رفض المشروع
          </Button>
        </div>
      )}
    </div>
  );
}

function FieldInput({
  f,
  value,
  onChange,
  disabled,
}: {
  f: F;
  value: any;
  onChange: (v: any) => void;
  disabled: boolean;
}) {
  const cls = "h-11 w-full rounded-md border bg-background px-2 text-sm";
  if (f.type === "select")
    return (
      <select
        className={cls}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— اختر —</option>
        {f.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  if (f.type === "yesno")
    return (
      <select
        className={cls}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— اختر —</option>
        <option value="yes">نعم</option>
        <option value="no">لا</option>
      </select>
    );
  if (f.type === "textarea")
    return (
      <Textarea value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    );
  return (
    <Input
      className="h-11"
      type={f.type ?? "text"}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function BomTable({
  projectId,
  tenantId,
  access,
  showCosts,
  perms,
}: {
  projectId: string;
  tenantId: string;
  access: Access;
  showCosts: boolean;
  perms?: SectionPerms | null;
}) {
  const qc = useQueryClient();
  const bom = useQuery({
    queryKey: ["solar-bom", projectId],
    queryFn: async () =>
      (await db.from("project_bom").select("*").eq("project_id", projectId).order("created_at"))
        .data ?? [],
  });
  const edit = access === "edit";
  const canAdd = perms ? perms.create : edit;
  const canDel = perms ? perms.delete : edit;
  const refresh = () => qc.invalidateQueries({ queryKey: ["solar-bom", projectId] });
  async function patch(id: string, v: any) {
    const { error } = await db.from("project_bom").update(v).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }
  async function add() {
    const { error } = await db.from("project_bom").insert({
      tenant_id: tenantId,
      project_id: projectId,
      item: "مادة جديدة",
      category: "panels",
    });
    if (error) toast.error(error.message);
    refresh();
  }
  async function del(id: string) {
    if (!window.confirm("حذف المادة؟")) return;
    await db.from("project_bom").delete().eq("id", id);
    refresh();
  }
  const rows = (bom.data ?? []) as any[];
  const total = rows.reduce((a, r) => a + Number(r.qty) * Number(r.unit_cost), 0);
  const c = "h-9 rounded border bg-background px-1 text-sm";
  return (
    <div className="space-y-3 overflow-x-auto">
      <table className="w-full min-w-[720px] border text-sm">
        <thead className="bg-secondary">
          <tr>
            {[
              "الصنف",
              "المادة",
              "المواصفات",
              "الكمية",
              ...(showCosts ? ["الكلفة الإفرادية", "الإجمالي"] : []),
              "الفاقد",
              "حالة التوريد",
              "",
            ].map((h) => (
              <th key={h} className="border p-2 text-right">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="border p-1">
                <select
                  className={c}
                  disabled={!edit}
                  defaultValue={r.category}
                  onChange={(e) => void patch(r.id, { category: e.target.value })}
                >
                  {Object.entries(BOM_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border p-1">
                <input
                  className={c}
                  disabled={!edit}
                  defaultValue={r.item}
                  onBlur={(e) => void patch(r.id, { item: e.target.value })}
                />
              </td>
              <td className="border p-1">
                <input
                  className={c}
                  disabled={!edit}
                  defaultValue={r.spec ?? ""}
                  placeholder="القدرة، الموديل، الشركة"
                  onBlur={(e) => void patch(r.id, { spec: e.target.value })}
                />
              </td>
              <td className="border p-1">
                <input
                  className={`${c} w-20`}
                  type="number"
                  disabled={!edit}
                  defaultValue={r.qty}
                  onBlur={(e) => void patch(r.id, { qty: Number(e.target.value) })}
                />
              </td>
              {showCosts && (
                <td className="border p-1">
                  <input
                    className={`${c} w-24`}
                    type="number"
                    disabled={!edit}
                    defaultValue={r.unit_cost}
                    onBlur={(e) => void patch(r.id, { unit_cost: Number(e.target.value) })}
                  />
                </td>
              )}
              {showCosts && (
                <td className="num border p-2">{fmtNum(Number(r.qty) * Number(r.unit_cost))}</td>
              )}
              <td className="border p-1">
                <input
                  className={`${c} w-16`}
                  type="number"
                  disabled={!edit}
                  defaultValue={r.waste_qty}
                  onBlur={(e) => void patch(r.id, { waste_qty: Number(e.target.value) })}
                />
              </td>
              <td className="border p-1">
                <select
                  className={c}
                  disabled={!edit}
                  defaultValue={r.supply_status}
                  onChange={(e) => void patch(r.id, { supply_status: e.target.value })}
                >
                  {Object.entries(SUPPLY_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border p-1">
                {canDel && (
                  <Button size="icon" variant="ghost" onClick={() => void del(r.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between">
        {canAdd && (
          <Button variant="outline" onClick={() => void add()}>
            <Plus className="size-4" />
            إضافة مادة
          </Button>
        )}
        {showCosts && (
          <span className="text-sm">
            إجمالي كلفة المواد: <b className="num">{fmtNum(total)}</b>
          </span>
        )}
      </div>
    </div>
  );
}

export function FinancePanel({
  projectId,
  tenantId,
  solar,
  access,
  completion,
  actual,
  perms,
}: {
  projectId: string;
  tenantId: string;
  solar: any;
  access: Access;
  completion: number;
  actual: number;
  perms?: SectionPerms | null;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<any>(solar.finance ?? {});
  useEffect(() => setF(solar.finance ?? {}), [solar.finance]);
  const edit = access === "edit";
  const canAdd = perms ? perms.create : edit;
  const ms = useQuery({
    queryKey: ["milestones", projectId],
    queryFn: async () =>
      (
        await db
          .from("project_milestones")
          .select("*")
          .eq("project_id", projectId)
          .order("trigger_pct")
      ).data ?? [],
  });
  const [m, setM] = useState({ name: "", pct: "", amount: "" });
  const subs: any[] = f.subcontractors ?? [];
  async function save(next = f) {
    const { error } = await db
      .from("solar_projects")
      .update({ finance: next })
      .eq("project_id", projectId);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (next.quote_price)
      await db
        .from("projects")
        .update({ contract_value: Number(next.quote_price) })
        .eq("id", projectId);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["solar", projectId] });
  }
  async function addMs() {
    if (!m.name) return;
    const amount = m.amount
      ? Number(m.amount)
      : (Number(f.quote_price || 0) * Number(m.pct || 0)) / 100;
    const { error } = await db.from("project_milestones").insert({
      tenant_id: tenantId,
      project_id: projectId,
      name: m.name,
      trigger_pct: Number(m.pct) || 0,
      amount,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setM({ name: "", pct: "", amount: "" });
    qc.invalidateQueries({ queryKey: ["milestones", projectId] });
  }
  async function toggleMs(r: any, k: "is_done" | "invoiced") {
    await db
      .from("project_milestones")
      .update({ [k]: !r[k] })
      .eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["milestones", projectId] });
  }
  const budget = Number(f.budget || 0);
  const subTotal = subs.reduce((a, s) => a + Number(s.amount || 0), 0);
  const subPaid = subs.reduce((a, s) => a + Number(s.paid || 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>السعر النهائي للعميل</Label>
          <Input
            className="h-11"
            type="number"
            disabled={!edit}
            value={f.quote_price ?? ""}
            onChange={(e) => setF({ ...f, quote_price: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>عملة العرض</Label>
          <Input
            className="h-11"
            disabled={!edit}
            value={f.quote_currency ?? "USD"}
            onChange={(e) => setF({ ...f, quote_currency: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>الموازنة التقديرية</Label>
          <Input
            className="h-11"
            type="number"
            disabled={!edit}
            value={f.budget ?? ""}
            onChange={(e) => setF({ ...f, budget: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>سعة المحطة (kWp)</Label>
          <Input
            className="h-11"
            type="number"
            disabled={!edit}
            value={f.capacity_kwp ?? ""}
            onChange={(e) => setF({ ...f, capacity_kwp: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="الموازنة" v={budget} />
        <Stat label="المصروف الفعلي (من القيود)" v={actual} />
        <Stat label="الانحراف" v={budget - actual} />
      </div>
      {edit && (
        <Button onClick={() => void save()}>
          <Save className="size-4" />
          حفظ البيانات المالية
        </Button>
      )}

      <h3 className="font-semibold">
        دفعات العقد المرتبطة بالإنجاز (الإنجاز الحالي {completion.toFixed(1)}%)
      </h3>
      <table className="w-full border text-sm">
        <thead className="bg-secondary">
          <tr>
            {["الدفعة", "عند إنجاز", "القيمة", "الحالة", "منجزة", "مفوترة"].map((h) => (
              <th key={h} className="border p-2 text-right">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(ms.data ?? []).map((r: any) => {
            const due = milestoneDue(completion, r.trigger_pct);
            return (
              <tr key={r.id} className={due && !r.invoiced ? "bg-warning/10" : ""}>
                <td className="border p-2">{r.name}</td>
                <td className="num border p-2">{r.trigger_pct ?? "—"}%</td>
                <td className="num border p-2">{fmtNum(r.amount)}</td>
                <td className="border p-2">
                  {r.invoiced ? "مفوترة" : due ? "مستحقة الآن — أصدر الفاتورة" : "لم تستحق"}
                </td>
                <td className="border p-2">
                  <input
                    type="checkbox"
                    disabled={!edit}
                    checked={r.is_done}
                    onChange={() => void toggleMs(r, "is_done")}
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="checkbox"
                    disabled={!edit}
                    checked={r.invoiced}
                    onChange={() => void toggleMs(r, "invoiced")}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canAdd && (
        <div className="flex flex-wrap gap-2">
          <Input
            className="h-10 w-48"
            placeholder="اسم الدفعة"
            value={m.name}
            onChange={(e) => setM({ ...m, name: e.target.value })}
          />
          <Input
            className="h-10 w-28"
            type="number"
            placeholder="عند نسبة %"
            value={m.pct}
            onChange={(e) => setM({ ...m, pct: e.target.value })}
          />
          <Input
            className="h-10 w-32"
            type="number"
            placeholder="القيمة (اختياري)"
            value={m.amount}
            onChange={(e) => setM({ ...m, amount: e.target.value })}
          />
          <Button variant="outline" onClick={() => void addMs()}>
            <Plus className="size-4" />
            إضافة دفعة
          </Button>
        </div>
      )}

      <h3 className="font-semibold">مستخلصات مقاولي الباطن</h3>
      <table className="w-full border text-sm">
        <thead className="bg-secondary">
          <tr>
            {["المقاول", "نوع العمل", "قيمة العقد", "المدفوع", "المتبقي", ""].map((h) => (
              <th key={h} className="border p-2 text-right">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subs.map((s, i) => {
            const up = (k: string, v: string) =>
              setF({ ...f, subcontractors: subs.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
            return (
              <tr key={i}>
                {["name", "work", "amount", "paid"].map((k) => (
                  <td key={k} className="border p-1">
                    <input
                      className="h-9 w-full rounded border bg-background px-1"
                      disabled={!edit}
                      type={k === "amount" || k === "paid" ? "number" : "text"}
                      value={s[k] ?? ""}
                      onChange={(e) => up(k, e.target.value)}
                    />
                  </td>
                ))}
                <td className="num border p-2">
                  {fmtNum(Number(s.amount || 0) - Number(s.paid || 0))}
                </td>
                <td className="border p-1">
                  {edit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setF({ ...f, subcontractors: subs.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between">
        {edit && (
          <Button
            variant="outline"
            onClick={() =>
              setF({
                ...f,
                subcontractors: [...subs, { name: "", work: "مدني", amount: 0, paid: 0 }],
              })
            }
          >
            <Plus className="size-4" />
            إضافة مقاول
          </Button>
        )}
        <span className="text-sm">
          إجمالي العقود <b className="num">{fmtNum(subTotal)}</b> · المدفوع{" "}
          <b className="num">{fmtNum(subPaid)}</b> · المتبقي{" "}
          <b className="num">{fmtNum(subTotal - subPaid)}</b>
        </span>
      </div>
    </div>
  );
}
function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num text-lg font-bold">{fmtNum(v)}</p>
    </div>
  );
}

export function PermitsVault({
  projectId,
  solar,
  access,
  electricalDone,
}: {
  projectId: string;
  solar: any;
  access: Access;
  electricalDone: number;
}) {
  const qc = useQueryClient();
  const media = useProjectMedia(projectId);
  const [p, setP] = useState<any>(solar.permits ?? {});
  useEffect(() => setP(solar.permits ?? {}), [solar.permits]);
  const edit = access === "edit";
  const outside = solar.survey?.agricultural === "yes";
  const exporting = solar.survey?.export_to_grid === "yes";
  const req = requiredPermits(outside, exporting);
  const docs = exporting
    ? [...PERMIT_DOCS, ...req.map((d) => ({ ...d, optional: false }))]
    : [NO_OBJECTION_DOC];
  const has = (k: string) => (media.data ?? []).some((a) => a.attach_type === `permit:${k}`);
  const missing = req.filter((d) => !has(d.key));
  const stages: Record<string, boolean> = p.stages ?? {};
  const doneCount = PERMIT_STAGES.filter((st) => stages[st.key]).length;
  async function save() {
    const { error } = await db
      .from("solar_projects")
      .update({ permits: p })
      .eq("project_id", projectId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["solar", projectId] });
  }
  return (
    <div className="space-y-4">
      <p className="rounded-lg border bg-secondary p-3 text-sm">
        {!exporting
          ? "المنظومة لا تورّد للشبكة: يكفي «لا مانع من التركيب» وكل الأوراق اختيارية."
          : outside
            ? "الموقع خارج المدينة الصناعية: مطلوب موافقة البلدية وموافقة الزراعة (تأخذ ورقة من شركة الكهرباء ثم تراجع الزراعة)."
            : "الموقع داخل المدينة الصناعية: لا يحتاج موافقة الزراعة."}
      </p>
      {exporting && (
        <fieldset className="rounded-lg border p-4">
          <legend className="px-2 font-semibold">
            مراحل الترخيص <span className="num">({doneCount}/{PERMIT_STAGES.length})</span>
          </legend>
          <ol className="space-y-2">
            {PERMIT_STAGES.map((st, i) => (
              <li key={st.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={!edit}
                    checked={!!stages[st.key]}
                    onChange={(e) => setP({ ...p, stages: { ...stages, [st.key]: e.target.checked } })}
                  />
                  <span className="num">{i + 1}.</span> {st.label}
                  {st.key === "initial" && outside && (
                    <span className="text-xs text-muted-foreground">(خذ ورقة للزراعة)</span>
                  )}
                </label>
                {st.doc && (
                  <MediaButton
                    projectId={projectId}
                    tag={`permit:${st.doc}`}
                    canEdit={edit}
                    label={has(st.doc) ? "مرفوعة" : "رفع"}
                    accept=".pdf,image/*"
                  />
                )}
              </li>
            ))}
          </ol>
        </fieldset>
      )}
      {exporting && electricalDone < 100 && !stages["inspection"] && (
        <p className="rounded-lg border border-warning bg-warning/10 p-3 text-sm">
          مطابقة الدراسة مع الواقع وتركيب العدادات تتم بعد انتهاء التنفيذ (الأعمال الكهربائية حالياً{" "}
          {electricalDone.toFixed(0)}%).
        </p>
      )}
      {req.length > 0 && (
        <p className="text-sm">
          {missing.length
            ? `موافقات مطلوبة ناقصة: ${missing.map((d) => d.label).join("، ")}`
            : "اكتملت الموافقات المطلوبة ✓"}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {docs.map((d, i) => (
          <li
            key={d.key}
            className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${has(d.key) ? "border-success" : ""}`}
          >
            <span className="text-sm">
              <span className="num">{i + 1}.</span> {d.label}{" "}
              {d.optional && <span className="text-xs text-muted-foreground">(اختياري)</span>}
            </span>
            <MediaButton
              projectId={projectId}
              tag={`permit:${d.key}`}
              canEdit={edit}
              label={has(d.key) ? "مرفوعة" : "رفع"}
              accept=".pdf,image/*"
            />
          </li>
        ))}
      </ul>
      <fieldset className="rounded-lg border p-4">
        <legend className="px-2 font-semibold">مؤشرات السعات المصرّح بها</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["transformer_kva", "سعة المحولة (kVA)"],
            ["installed_kwp", "إجمالي سعة المحطة (kWp)"],
            ["export_kw", "سعة التصدير المطلوب ترخيصها (kW)"],
          ].map(([k, l]) => (
            <div key={k} className="space-y-1">
              <Label>{l}</Label>
              <Input
                className="h-11"
                type="number"
                disabled={!edit}
                value={p[k!] ?? ""}
                onChange={(e) => setP({ ...p, [k!]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </fieldset>
      {edit && (
        <Button onClick={() => void save()}>
          <Save className="size-4" />
          حفظ
        </Button>
      )}
    </div>
  );
}

export function SolarRolesCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["tenant-users", tenantId],
    queryFn: async () =>
      (await db.from("profiles").select("id, full_name, email").eq("tenant_id", tenantId)).data ??
      [],
  });
  const roles = useQuery({
    queryKey: ["solar-roles", tenantId],
    queryFn: async () =>
      (await db.from("solar_roles").select("*").eq("tenant_id", tenantId)).data ?? [],
  });
  async function setRole(userId: string, role: string) {
    const { error } = role
      ? await db
          .from("solar_roles")
          .upsert(
            { tenant_id: tenantId, user_id: userId, role },
            { onConflict: "tenant_id,user_id" },
          )
      : await db.from("solar_roles").delete().eq("tenant_id", tenantId).eq("user_id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم تحديد الدور");
    qc.invalidateQueries({ queryKey: ["solar-roles", tenantId] });
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        حدد دور كل مستخدم في مشاريع الطاقة الشمسية. مدراء الشركة يرون كل شيء دائماً، ومن دون دور يرى
        المستخدم الأقسام للاطلاع فقط دون المالية.
      </p>
      {(users.data ?? []).map((u: any) => (
        <div
          key={u.id}
          className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
        >
          <span>{u.full_name || u.email}</span>
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={(roles.data ?? []).find((r: any) => r.user_id === u.id)?.role ?? ""}
            onChange={(e) => void setRole(u.id, e.target.value)}
          >
            <option value="">بدون دور (اطلاع)</option>
            {(Object.keys(ROLE_LABEL) as SolarRole[])
              .filter((r) => r !== "viewer")
              .map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
          </select>
        </div>
      ))}
    </div>
  );
}
