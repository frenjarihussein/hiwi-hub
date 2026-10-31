import { useState } from "react";
import { formatDeviceInfo } from "@/lib/device";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useOperatingMode } from "@/lib/operating-mode";
import { Button } from "@/components/ui/button";
import { buildSessions, fmtDuration, type LoginEv } from "@/lib/audit-describe";

const fmt = (d: string) => (d ? new Date(d).toLocaleString("ar-SY-u-nu-latn") : "—");

/** Sign-in / sign-out history as sessions; admins see every user of the company, others only themselves. */
export function LoginLog({ names }: { names: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState("");
  const [view, setView] = useState<"sessions" | "events" | "devices">("sessions");
  const q = useQuery({
    queryKey: ["login_events", user],
    enabled: open,
    queryFn: async () => {
      let r = db.from("login_events").select("*").order("created_at", { ascending: false }).limit(600);
      if (user) r = r.eq("user_id", user);
      const { data, error } = await r;
      if (error) throw error;
      return (data ?? []) as LoginEv[];
    },
  });
  const { data: me } = useMe();
  const mode = useOperatingMode(me?.tenantId);
  const bound = { data: mode.data?.mode === "single_device" ? mode.data.boundDevice : null };
  const boundInfo = mode.data?.mode === "single_device" ? mode.data.boundInfo : null;
  const sessions = buildSessions(q.data ?? []);
  return (
    <div className="mb-6 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">سجل الدخول والخروج</h3>
        <Button size="sm" variant="outline" className="ms-auto" onClick={() => setOpen((v) => !v)}>{open ? "إخفاء" : "عرض السجل"}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">كل المستخدمين</option>
              {Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <Button size="sm" variant={view === "sessions" ? "default" : "outline"} onClick={() => setView("sessions")}>الجلسات</Button>
            <Button size="sm" variant={view === "events" ? "default" : "outline"} onClick={() => setView("events")}>كل العمليات</Button>
            <Button size="sm" variant={view === "devices" ? "default" : "outline"} onClick={() => setView("devices")}>الأجهزة</Button>
          </div>
          <div className="max-h-96 overflow-auto rounded border">
            {view === "devices" ? <>{boundInfo && <p className="mb-2 rounded bg-primary/10 p-2 text-sm">الجهاز المعتمد: {formatDeviceInfo(boundInfo)}</p>}<DevicesTable events={q.data ?? []} names={names} bound={bound.data ?? null} /></> : view === "sessions" ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted"><tr>
                  <th className="p-2 text-start">المستخدم</th><th className="p-2 text-start">وقت الدخول</th><th className="p-2 text-start">وقت الخروج</th><th className="p-2 text-start">مدة الجلسة</th><th className="p-2 text-start">الجهاز</th><th className="p-2 text-start">عنوان IP</th>
                </tr></thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{names[s.user_id] ?? "—"}</td>
                      <td className="p-2" dir="ltr">{s.start ? fmt(s.start) : "غير مسجّل"}</td>
                      <td className="p-2">{s.end ? <span dir="ltr">{fmt(s.end)}</span> : <span className="text-primary">جلسة نشطة أو خروج بدون تسجيل</span>}</td>
                      <td className="p-2">{s.start && s.end ? fmtDuration(Date.parse(s.end) - Date.parse(s.start)) : s.start ? `منذ ${fmtDuration(Date.now() - Date.parse(s.start))}` : "—"}</td>
                      <td className="p-2" title={s.user_agent ?? ""}>{s.device ?? "—"}<DevTag id={s.device_id} /></td>
                      <td className="p-2" dir="ltr">{s.ip ?? "—"}</td>
                    </tr>
                  ))}
                  {q.isSuccess && !sessions.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">لا توجد جلسات مسجلة بعد</td></tr>}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted"><tr>
                  <th className="p-2 text-start">المستخدم</th><th className="p-2 text-start">العملية</th><th className="p-2 text-start">الوقت</th><th className="p-2 text-start">الجهاز</th><th className="p-2 text-start">عنوان IP</th>
                </tr></thead>
                <tbody>
                  {(q.data ?? []).map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2">{names[e.user_id] ?? "—"}</td>
                      <td className="p-2">{e.event === "sign_in" ? "تسجيل دخول" : "تسجيل خروج"}</td>
                      <td className="p-2" dir="ltr">{fmt(e.created_at)}</td>
                      <td className="p-2" title={e.user_agent ?? ""}>{e.device ?? "—"}<DevTag id={e.device_id} /></td>
                      <td className="p-2" dir="ltr">{e.ip ?? "—"}</td>
                    </tr>
                  ))}
                  {q.isSuccess && !q.data.length && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">لا توجد عمليات مسجلة بعد</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DevTag({ id }: { id?: string | null | undefined }) {
  if (!id) return null;
  return <span className="ms-1 rounded bg-muted px-1 text-xs text-muted-foreground" dir="ltr">#{id.slice(0, 8)}</span>;
}

/** One row per stable browser device id (survives IP changes); events before tracking are grouped as unknown. */
function DevicesTable({ events, names, bound }: { events: LoginEv[]; names: Record<string, string>; bound: string | null }) {
  const map = new Map<string, { id: string; device: string | null; info: string | null; users: Set<string>; ips: Set<string>; first: string; last: string; count: number }>();
  for (const e of events) {
    const k = e.device_id ?? "";
    const r = map.get(k) ?? { id: k, device: e.device, info: null as string | null, users: new Set(), ips: new Set(), first: e.created_at, last: e.created_at, count: 0 };
    r.users.add(e.user_id); if (e.ip) r.ips.add(e.ip); r.count++;
    if (e.created_at < r.first) r.first = e.created_at;
    if (e.created_at > r.last) { r.last = e.created_at; r.device = e.device ?? r.device; }
    if (e.device_info && (!r.info || e.created_at >= r.last)) r.info = formatDeviceInfo(e.device_info);
    map.set(k, r);
  }
  const rows = [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted"><tr>
        <th className="p-2 text-start">رمز الجهاز</th><th className="p-2 text-start">بيانات الجهاز</th><th className="p-2 text-start">المستخدمون</th><th className="p-2 text-start">أول ظهور</th><th className="p-2 text-start">آخر ظهور</th><th className="p-2 text-start">عناوين IP</th><th className="p-2 text-start">العمليات</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id || "none"} className="border-t">
            <td className="p-2" dir="ltr">{r.id ? r.id.slice(0, 8) : "غير معروف (قبل التتبع)"}{r.id && r.id === bound && <span className="ms-1 rounded bg-primary/15 px-1 text-xs text-primary">المعتمد</span>}</td>
            <td className="p-2">{r.info ?? r.device ?? "—"}</td>
            <td className="p-2">{[...r.users].map((u) => names[u] ?? "—").join("، ")}</td>
            <td className="p-2" dir="ltr">{fmt(r.first)}</td>
            <td className="p-2" dir="ltr">{fmt(r.last)}</td>
            <td className="p-2" dir="ltr">{[...r.ips].join(", ") || "—"}</td>
            <td className="p-2">{r.count}</td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">لا توجد أجهزة مسجلة بعد</td></tr>}
      </tbody>
    </table>
  );
}
