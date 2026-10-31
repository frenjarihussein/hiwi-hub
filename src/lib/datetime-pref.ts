import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";

/** True when the company lets users type the date/time of documents; false = always "now". */
export function useManualDatetime() {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ["manual_datetime", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () =>
      (await db.from("tenant_settings").select("manual_datetime").eq("tenant_id", me!.tenantId).maybeSingle()).data?.manual_datetime ?? true,
  });
  return q.data ?? true;
}

/** Local date (YYYY-MM-DD) and time (HH:MM) right now. */
export function nowParts() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

/** Value for <input type="datetime-local"> for now. */
export function nowLocalInput() {
  const n = nowParts();
  return `${n.date}T${n.time}`;
}
