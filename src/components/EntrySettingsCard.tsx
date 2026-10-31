import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Date/time entry mode and per-warehouse negative-stock permission. */
export function EntrySettingsCard({ editable }: { editable: boolean }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const s = useQuery({
    queryKey: ["manual_datetime", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () =>
      (await db.from("tenant_settings").select("manual_datetime").eq("tenant_id", me!.tenantId).maybeSingle()).data?.manual_datetime ?? true,
  });
  const wh = useQuery({
    queryKey: ["wh_negative", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => (await scope(db.from("warehouses").select("id,name,allow_negative").eq("is_group", false), me?.tenantId).order("name")).data ?? [],
  });
  const saveMode = useMutation({
    mutationFn: async (manual: boolean) => {
      const { error } = await db.from("tenant_settings").upsert({ tenant_id: me!.tenantId, manual_datetime: manual }, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["manual_datetime"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveWh = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: boolean }) => {
      const { error } = await db.from("warehouses").update({ allow_negative: v }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["wh_negative"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mb-8">
      <PageHeader title="إعدادات الإدخال والمخزون" subtitle="طريقة إدخال التاريخ والوقت، والسماح بإخراج المواد بالسالب لكل مستودع" />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center">
          <Label>التاريخ والوقت عند الإدخال</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!editable || saveMode.isPending} value={s.data === false ? "auto" : "manual"} onChange={(e) => saveMode.mutate(e.target.value === "manual")}>
            <option value="manual">يسمح لي بإدخالهما (يُقترح الحالي)</option>
            <option value="auto">يؤخذ التاريخ والوقت الحاليان تلقائياً</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>السماح بالإخراج بالسالب</Label>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(wh.data ?? []).map((w: any) => (
            <div key={w.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{w.name}</span>
              <Switch checked={!!w.allow_negative} disabled={!editable} onCheckedChange={(v) => saveWh.mutate({ id: w.id, v })} />
            </div>
          ))}
          {wh.data?.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مستودعات بعد</p>}
        </div>
      </div>
    </div>
  );
}
