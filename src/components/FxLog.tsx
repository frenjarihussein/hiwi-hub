import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum } from "@/lib/format";

type Log = { id: string; kind: string; rate_date: string; currency: string | null; old_rate: number | null; new_rate: number | null; source: string | null; details: { code: string; name: string; diff: number }[]; entry_id: string | null; created_at: string };

/** Audit log of exchange-rate changes and revaluation entries. */
export function FxLog() {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ["fx_log", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async (): Promise<Log[]> => (await db.from("fx_log").select("*").eq("tenant_id", me!.tenantId).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <section className="mt-4 max-w-5xl rounded-lg border bg-card p-4">
      <h3 className="font-semibold">سجل تغيّر أسعار الصرف</h3>
      {!q.data?.length ? <p className="mt-2 text-sm text-muted-foreground">لا توجد عمليات بعد.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border text-sm">
            <thead className="bg-secondary"><tr>
              <th className="border px-2 py-1 text-right">وقت العملية</th><th className="border px-2 py-1">النوع</th><th className="border px-2 py-1">تاريخ السعر</th>
              <th className="border px-2 py-1">التفاصيل</th><th className="border px-2 py-1">الحسابات المتأثرة</th><th className="border px-2 py-1">القيد</th>
            </tr></thead>
            <tbody>{q.data.map((l) => (
              <tr key={l.id}>
                <td className="num border px-2 py-1">{new Date(l.created_at).toLocaleString("ar-SY")}</td>
                <td className="border px-2 py-1">{l.kind === "revaluation" ? "إعادة تقييم" : l.source === "document" ? "سعر من مستند" : "تعديل النشرة"}</td>
                <td className="num border px-2 py-1">{l.rate_date}</td>
                <td className="border px-2 py-1">{l.kind === "rate_change" ? `${l.currency}: ${l.old_rate ?? "—"} ← ${l.new_rate}` : ""}</td>
                <td className="border px-2 py-1 text-xs">{(l.details ?? []).map((d) => `${d.code} ${d.name} (${fmtNum(d.diff)})`).join("، ") || "—"}</td>
                <td className="border px-2 py-1">{l.entry_id ? <Link to="/journal/$entryId" params={{ entryId: l.entry_id }} className="text-primary underline">عرض</Link> : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
