import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { defaultUnits, useUnits, type UnitKind } from "@/lib/units";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

export function UnitsCard({ editable, kind = "stock" }: { editable: boolean; kind?: UnitKind }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const list = useUnits(kind);
  const base = defaultUnits(kind);
  const svc = kind === "service";
  const [f, setF] = useState({ name: "", factor: "1", base_unit: base[0] });

  async function add() {
    if (!f.name.trim()) { toast.error("أدخل اسم الوحدة"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("units" as any) as any).insert({
      tenant_id: me!.tenantId, name: f.name.trim(), base_unit: f.base_unit || null, factor: Number(f.factor) || 1, kind,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تمت إضافة الوحدة");
    setF({ name: "", factor: "1", base_unit: base[0] });
    qc.invalidateQueries({ queryKey: ["units"] });
  }
  async function remove(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("units" as any) as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["units"] });
  }

  return (
    <div className="mb-8">
      <PageHeader
        title={svc ? "وحدات الخدمات" : "وحدات المواد"}
        subtitle={svc ? "وحدات تستخدم في دليل الخدمات فقط، مثل: باقة = 10 زيارات" : "وحدات تستخدم في دليل المواد فقط، مثل: كرتونة = 12 قطعة"}
      />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap gap-1">
          {base.map((u) => <span key={u} className="rounded-full border px-2 py-0.5 text-xs">{u}</span>)}
        </div>
        {(list.data ?? []).length > 0 && (
          <ul className="divide-y rounded border text-sm">
            {list.data!.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-3 py-2">
                <span><b>{u.name}</b>{u.base_unit && <span className="text-muted-foreground"> = <span className="num">{u.factor}</span> {u.base_unit}</span>}</span>
                {editable && <Button size="icon" variant="ghost" aria-label={`حذف ${u.name}`} onClick={() => remove(u.id)}><Trash2 className="size-4 text-destructive" /></Button>}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
            <div><Label>اسم الوحدة</Label><Input value={f.name} placeholder={svc ? "باقة" : "كرتونة"} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><Label>تحتوي على</Label><Input type="number" value={f.factor} onChange={(e) => setF({ ...f, factor: e.target.value })} /></div>
            <div>
              <Label>من وحدة</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.base_unit} onChange={(e) => setF({ ...f, base_unit: e.target.value })}>
                <option value="">— بدون —</option>
                {[...base, ...(list.data ?? []).map((u) => u.name)].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <Button onClick={add}>إضافة</Button>
          </div>
        )}
      </div>
    </div>
  );
}
