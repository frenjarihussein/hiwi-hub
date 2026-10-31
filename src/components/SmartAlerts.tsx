import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, PackageX } from "lucide-react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtDate, fmtNum } from "@/lib/format";

const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** Dashboard alerts: cheques due within 7 days and purchased batches expiring within 30 days. */
export function SmartAlerts() {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ["smart_alerts", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [ch, ex] = await Promise.all([
        scope(db.from("cheques").select("id,cheque_no,amount,currency,due_date,direction,status"), me?.tenantId)
          .lte("due_date", inDays(7)).not("status", "in", "(cleared,collected,paid,cancelled,bounced)").order("due_date").limit(20),
        scope(db.from("document_lines").select("id,expiry_date,qty,products(name)"), me?.tenantId)
          .not("expiry_date", "is", null).gte("expiry_date", today).lte("expiry_date", inDays(30)).order("expiry_date").limit(20),
      ]);
      return { cheques: ch.data ?? [], expiring: ex.data ?? [] };
    },
  });
  const c = q.data?.cheques ?? [];
  const e = q.data?.expiring ?? [];
  if (!c.length && !e.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {c.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-card p-5 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-destructive" />شيكات مستحقة خلال 7 أيام</h2>
          <ul className="space-y-1 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {c.map((x: any) => (
              <li key={x.id} className="flex justify-between gap-2 border-t pt-1">
                <span>{x.direction === "in" || x.direction === "incoming" ? "وارد" : "صادر"} رقم {x.cheque_no ?? "—"} {x.due_date < today && <span className="text-destructive">(متأخر)</span>}</span>
                <span className="num">{fmtNum(x.amount)} {x.currency} · {fmtDate(x.due_date)}</span>
              </li>
            ))}
          </ul>
          <Link to="/cheques" className="mt-2 inline-block text-xs text-primary underline">فتح الشيكات</Link>
        </div>
      )}
      {e.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-card p-5 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><PackageX className="size-4 text-destructive" />مواد تنتهي صلاحيتها خلال 30 يوماً</h2>
          <ul className="space-y-1 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {e.map((x: any) => (
              <li key={x.id} className="flex justify-between gap-2 border-t pt-1">
                <span className="flex items-center gap-1"><AlertTriangle className="size-3 text-destructive" />{x.products?.name ?? "—"}</span>
                <span className="num">{fmtNum(x.qty)} · {fmtDate(x.expiry_date)}</span>
              </li>
            ))}
          </ul>
          <Link to="/batches" className="mt-2 inline-block text-xs text-primary underline">فتح الدفعات</Link>
        </div>
      )}
    </div>
  );
}
