import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, Check, Clock, Plus, Trash2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { db, scope } from "@/lib/db";
import { fmtDate, fmtNum } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useExtra, useSaveExtra, type Extra } from "@/lib/prefs";
import { SOURCE_LABEL } from "@/components/SourceDoc";

export type HomeTask = { id: string; date: string; time?: string | undefined; title: string; done?: boolean };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <Clock className="size-10 text-primary" />
        <div>
          <div className="text-4xl font-bold tabular-nums" dir="ltr">{now ? now.toLocaleTimeString("ar-SY-u-nu-latn", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}</div>
          <div className="text-muted-foreground">{now ? now.toLocaleDateString("ar-SY-u-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : ""}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TodayPulse({ tenantId }: { tenantId: string | null }) {
  const today = ymd(new Date());
  const q = useQuery({
    queryKey: ["home_pulse", tenantId, today],
    queryFn: async () => {
      const { data } = await scope(db.from("documents").select("doc_type,amount,exchange_rate,status").eq("doc_date", today), tenantId);
      const rows = ((data ?? []) as { doc_type: string; amount: number; exchange_rate: number; status: string }[]).filter((r) => r.status !== "cancelled");
      const sum = (types: string[]) => rows.filter((r) => types.includes(r.doc_type)).reduce((s, r) => s + Number(r.amount || 0) / (Number(r.exchange_rate) || 1), 0);
      return { sales: sum(["sale", "pos_sale"]), receipts: sum(["receipt"]), payments: sum(["payment"]), count: rows.length };
    },
  });
  const items = [
    { label: "مبيعات اليوم", v: q.data?.sales },
    { label: "المقبوضات", v: q.data?.receipts },
    { label: "المدفوعات", v: q.data?.payments },
    { label: "عدد الحركات", v: q.data?.count, int: true },
  ];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">نبض اليوم</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-4 gap-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-md border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{i.label}</div>
            <div className="text-xl font-bold tabular-nums">{i.v == null ? "…" : i.int ? i.v : fmtNum(i.v)}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentActivity({ tenantId }: { tenantId: string | null }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["home_recent", tenantId],
    queryFn: async () => {
      const { data } = await scope(db.from("documents").select("id,doc_type,doc_no,doc_date,amount,status").order("created_at", { ascending: false }).limit(8), tenantId);
      return (data ?? []) as { id: string; doc_type: string; doc_no: number | null; doc_date: string; amount: number; status: string }[];
    },
  });
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">آخر العمليات المضافة</CardTitle></CardHeader>
      <CardContent>
        {!q.data?.length ? <p className="text-sm text-muted-foreground">{q.isLoading ? "…" : "لا توجد عمليات بعد"}</p> : (
          <table className="w-full text-sm">
            <tbody>
              {q.data.map((d) => (
                <tr key={d.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => void navigate({ to: "/documents", search: { open: d.id } as never })}>
                  <td className="py-2">{SOURCE_LABEL[d.doc_type] ?? d.doc_type}</td>
                  <td className="py-2 tabular-nums">#{d.doc_no ?? "—"}</td>
                  <td className="py-2">{fmtDate(d.doc_date)}</td>
                  <td className="py-2 tabular-nums">{fmtNum(d.amount)}</td>
                  <td className="py-2 text-xs text-muted-foreground">{d.status === "posted" ? "مرحّل" : d.status === "draft" ? "مسودة" : d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TaskPlanner() {
  const me = useMe().data;
  const extra = useExtra(me);
  const save = useSaveExtra(me);
  const [day, setDay] = useState<Date>(() => new Date());
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const tasks = ((extra.data as Extra & { tasks?: HomeTask[] })?.tasks ?? []) as HomeTask[];
  const key = ymd(day);
  const dayTasks = useMemo(() => tasks.filter((t) => t.date === key).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")), [tasks, key]);
  const marked = useMemo(() => [...new Set(tasks.filter((t) => !t.done).map((t) => t.date))].map((s) => new Date(s + "T00:00:00")), [tasks]);
  const write = (next: HomeTask[]) => save.mutate({ tasks: next } as Partial<Extra>);
  const add = () => {
    if (!title.trim()) return;
    const task: HomeTask = { id: crypto.randomUUID(), date: key, title: title.trim() };
    if (time) task.time = time;
    write([...tasks, task]);
    setTitle(""); setTime("");
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="size-4" />التقويم ومدير المهام</CardTitle></CardHeader>
      <CardContent className="flex gap-4">
        <Calendar mode="single" selected={day} onSelect={(d) => d && setDay(d)} modifiers={{ hasTask: marked }} modifiersClassNames={{ hasTask: "font-bold underline decoration-primary decoration-2" }} className="rounded-md border" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="text-sm font-medium">مهام {fmtDate(key)}</div>
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="مهمة جديدة…" />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
            <Button size="icon" onClick={add} title="إضافة"><Plus className="size-4" /></Button>
          </div>
          <ul className="space-y-1 overflow-auto">
            {!dayTasks.length && <li className="text-sm text-muted-foreground">لا مهام لهذا اليوم</li>}
            {dayTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                <Button size="icon" variant={t.done ? "default" : "outline"} className="size-6" onClick={() => write(tasks.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))}><Check className="size-3" /></Button>
                {t.time && <span className="tabular-nums text-muted-foreground">{t.time}</span>}
                <span className={t.done ? "flex-1 line-through text-muted-foreground" : "flex-1"}>{t.title}</span>
                <Button size="icon" variant="ghost" className="size-6" onClick={() => write(tasks.filter((x) => x.id !== t.id))}><Trash2 className="size-3" /></Button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

/** Accountant start screen on desktop: clock, calendar tasks, today's pulse and recent documents. */
export function DesktopHome() {
  const me = useMe().data;
  return (
    <div className="grid gap-4 p-2 lg:grid-cols-2" aria-label="مساحة العمل">
      <div className="space-y-4"><LiveClock /><TodayPulse tenantId={me?.tenantId ?? null} /><RecentActivity tenantId={me?.tenantId ?? null} /></div>
      <TaskPlanner />
    </div>
  );
}
