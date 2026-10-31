import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Checkbox } from "@/components/ui/checkbox";
import type { PosStation } from "@/lib/pos-stations";

/** Per-user POS/POP station access from the users screen; writes the same pos_stations.allowed_user_ids the stations screen edits. */
export function UserStationAccess({ userId, tenantId, editable }: { userId: string; tenantId: string; editable: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["pos_stations_all", tenantId],
    queryFn: async () => ((await db.from("pos_stations" as never).select("*").eq("tenant_id", tenantId).order("name")).data ?? []) as unknown as PosStation[],
  });
  const toggle = useMutation({
    mutationFn: async ({ s, on }: { s: PosStation; on: boolean }) => {
      const cur = s.allowed_user_ids ?? [];
      const next = on ? [...new Set([...cur, userId])] : cur.filter((x) => x !== userId);
      const { error } = await db.from("pos_stations" as never).update({ allowed_user_ids: next } as never).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos_stations_all"] }); qc.invalidateQueries({ queryKey: ["pos_stations_admin"] }); qc.invalidateQueries({ queryKey: ["pos_stations"] }); qc.invalidateQueries({ queryKey: ["pos_stations_mine"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = list.data ?? [];
  if (!rows.length) return null;
  return (
    <div className="mt-3 rounded border p-3 text-sm">
      <div className="font-semibold">نقاط البيع والشراء المسموحة</div>
      <p className="mb-2 text-xs text-muted-foreground">النقطة غير المخصصة لأحد متاحة للجميع؛ عند تحديد مستخدمين تصبح محصورة بهم.</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {rows.map((s) => {
          const ids = s.allowed_user_ids ?? [];
          return (
            <label key={s.id} className="flex items-center gap-2">
              <Checkbox checked={ids.includes(userId)} disabled={!editable || toggle.isPending} onCheckedChange={(v) => toggle.mutate({ s, on: !!v })} />
              <span>{s.name} <span className="text-xs text-muted-foreground">({s.station_type === "sale" ? "بيع" : "شراء"}{ids.length === 0 ? " · متاحة للجميع" : ""})</span></span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
