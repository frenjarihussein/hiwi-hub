import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { SECTORS, activitiesOf, findActivity } from "@/lib/business-activities";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ActivityPicker({ sector, activity, onChange, hideAccountsNote }: {
  sector: string; activity: string; onChange: (sector: string, activity: string) => void; hideAccountsNote?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>نوع النشاط</Label>
        <div className="flex gap-2">
          {SECTORS.map((s) => (
            <Button key={s.value} type="button" size="sm" variant={sector === s.value ? "default" : "outline"}
              onClick={() => onChange(s.value, activitiesOf(s.value)[0]?.value ?? "")}>{s.label}</Button>
          ))}
        </div>
      </div>
      {sector && (
        <div className="space-y-1">
          <Label>النشاط التفصيلي</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={activity}
            onChange={(e) => onChange(sector, e.target.value)}>
            {activitiesOf(sector).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {!hideAccountsNote && <p className="text-xs text-muted-foreground">
            سيُضاف {findActivity(activity)?.accounts.length ?? 0} حساب فرعي مناسب للنشاط وتُربط القيود التلقائية بها، مع بقاء الحسابات العامة.
          </p>}
        </div>
      )}
    </div>
  );
}

export function BusinessActivityCard({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["business_activity", tenantId],
    queryFn: async () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await (db.from("tenant_settings") as any).select("business_sector,business_activity").eq("tenant_id", tenantId).maybeSingle()).data,
  });
  const [v, setV] = useState({ sector: "", activity: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setV({ sector: q.data.business_sector ?? "", activity: q.data.business_activity ?? "" });
  }, [q.data]);

  async function apply() {
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from("tenant_settings") as any).update({ business_sector: v.sector || null, business_activity: v.activity || null }).eq("tenant_id", tenantId);
      if (error) throw error;
      toast.success("تم حفظ نشاط الشركة");
      qc.invalidateQueries({ queryKey: ["business_activity", tenantId] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mb-8 max-w-3xl">
      <PageHeader title="نشاط الشركة" subtitle="تعديل النشاط هنا لا يضيف حسابات؛ حسابات النشاط تُضاف فقط عند تجهيز الشركة." />
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <ActivityPicker hideAccountsNote sector={v.sector} activity={v.activity} onChange={(sector, activity) => setV({ sector, activity })} />
        {isAdmin && <Button onClick={apply} disabled={busy || !v.activity}>{busy ? "جارٍ الحفظ..." : "حفظ النشاط"}</Button>}
      </div>
    </div>
  );
}
