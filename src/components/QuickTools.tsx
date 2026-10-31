import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Calculator, Copy, NotebookPen, Trash2, X, Check, Pin, Search, Send, UserRound, CalendarClock } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { evalExpr, installCalcInputs } from "@/lib/calc-expr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Note = {
  id: string; user_id: string; title: string; body: string; remind_at: string | null; repeat: string; done: boolean; created_at: string;
  assigned_to: string | null; kind: string; priority: string; color: string; pinned: boolean; due_at: string | null; status: string; reply: string;
};
const REPEAT: Record<string, string> = { none: "مرة واحدة", daily: "يومياً", weekly: "أسبوعياً", monthly: "شهرياً" };
const KINDS: Record<string, string> = { note: "ملاحظة", task: "مهمة", request: "طلب" };
const PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة" };
const STATUS: Record<string, string> = { open: "جديدة", in_progress: "قيد التنفيذ", done: "منجزة" };
const COLORS: Record<string, string> = { default: "bg-card", yellow: "bg-warning/15", green: "bg-success/15", blue: "bg-primary/10", red: "bg-destructive/10" };
const PRI_CLS: Record<string, string> = { low: "text-muted-foreground", normal: "text-foreground", high: "text-warning-foreground", urgent: "text-destructive font-semibold" };

function nextTime(iso: string, rep: string) {
  const d = new Date(iso);
  const now = Date.now();
  while (d.getTime() <= now) {
    if (rep === "daily") d.setDate(d.getDate() + 1);
    else if (rep === "weekly") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}

/** Lets the floating panels be used while a modal (e.g. an open invoice) holds focus. */
function useEscapeModalTraps() {
  useEffect(() => {
    const inside = (n: EventTarget | null) => n instanceof Node && !!(n instanceof Element ? n : n.parentElement)?.closest("[data-quicktools]");
    const stop = (e: Event) => {
      const fe = e as FocusEvent;
      if (inside(e.target) || (e.type === "focusout" && inside(fe.relatedTarget))) e.stopImmediatePropagation();
    };
    const evs = ["focusin", "focusout", "pointerdown", "mousedown", "touchstart"];
    evs.forEach((t) => window.addEventListener(t, stop, true));
    return () => evs.forEach((t) => window.removeEventListener(t, stop, true));
  }, []);
}

export function QuickTools() {
  const [panel, setPanel] = useState<null | "calc" | "notes">(null);
  const [mounted, setMounted] = useState(false);
  const { data: me } = useMe();
  const qc = useQueryClient();
  useEscapeModalTraps();

  useEffect(() => setMounted(true), []);
  useEffect(() => installCalcInputs(), []);
  useEffect(() => {
    const o = () => setPanel("notes");
    const c = () => setPanel("calc");
    window.addEventListener("open-notes", o);
    window.addEventListener("open-calc", c);
    return () => { window.removeEventListener("open-notes", o); window.removeEventListener("open-calc", c); };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F9" || (e.ctrlKey && e.altKey && e.code === "KeyX")) { e.preventDefault(); e.stopPropagation(); setPanel((p) => (p === "calc" ? null : "calc")); }
      if (e.key === "F8" || (e.ctrlKey && e.altKey && e.code === "KeyN")) { e.preventDefault(); e.stopPropagation(); setPanel((p) => (p === "notes" ? null : "notes")); }
      if (e.key === "Escape" && e.target instanceof Element && e.target.closest("[data-quicktools]")) { e.stopPropagation(); setPanel(null); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  const notes = useQuery({
    queryKey: ["personal_notes", me?.userId],
    enabled: !!me,
    refetchInterval: 60000,
    queryFn: async () => ((await db.from("personal_notes").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false })).data ?? []) as Note[],
  });

  // Reminder checker: toast + entry in this user's notifications
  useEffect(() => {
    if (!me) return;
    const tick = async () => {
      const due = (notes.data ?? []).filter((n) => !n.done && n.remind_at && new Date(n.remind_at).getTime() <= Date.now() && (n.assigned_to ? n.assigned_to === me.userId : n.user_id === me.userId));
      for (const n of due) {
        toast(`⏰ تذكير: ${n.title || "ملاحظة"}`, { description: n.body, duration: 30000 });
        try { if ("Notification" in window && Notification.permission === "granted") new Notification(n.title || "تذكير", { body: n.body }); } catch { /* ignore */ }
        await db.from("personal_notes").update({ remind_at: n.repeat === "none" ? null : nextTime(n.remind_at!, n.repeat) }).eq("id", n.id);
        await db.rpc("notify_note_reminder", { _id: n.id });
      }
      if (due.length) { qc.invalidateQueries({ queryKey: ["personal_notes"] }); qc.invalidateQueries({ queryKey: ["notifications"] }); }
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [me, notes.data, qc]);

  if (!me || !mounted) return null;
  const pending = (notes.data ?? []).filter((n) => n.assigned_to === me.userId && n.user_id !== me.userId && n.status !== "done").length;
  return createPortal(
    <div data-quicktools className="no-print pointer-events-auto fixed bottom-4 start-4 z-[200] flex flex-col items-start gap-2 md:bottom-5 md:start-5">
      {panel === "calc" && <CalcPanel onClose={() => setPanel(null)} />}
      {panel === "notes" && <NotesPanel notes={notes.data ?? []} onClose={() => setPanel(null)} />}
      {panel && <div className="flex gap-2">
        <button onClick={() => setPanel((p) => (p === "calc" ? null : "calc"))} title="الآلة الحاسبة (F9)" aria-label="الآلة الحاسبة"
          className={cn("grid size-11 place-items-center rounded-full border bg-card shadow-lg transition hover:bg-accent", panel === "calc" && "bg-primary text-primary-foreground")}>
          <Calculator className="size-5" />
        </button>
        <button onClick={() => setPanel((p) => (p === "notes" ? null : "notes"))} title="الملاحظات والمهام (F8)" aria-label="الملاحظات والمهام"
          className={cn("relative grid size-11 place-items-center rounded-full border bg-card shadow-lg transition hover:bg-accent", panel === "notes" && "bg-primary text-primary-foreground")}>
          <NotebookPen className="size-5" />
          {pending > 0 && <span className="absolute -top-1 -end-1 grid size-5 place-items-center rounded-full bg-destructive text-[10px] text-destructive-foreground">{pending}</span>}
        </button>
      </div>}
    </div>,
    document.body,
  );
}

function Shell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3 shadow-2xl", wide ? "w-[min(94vw,26rem)]" : "w-[min(92vw,22rem)]")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        <button onClick={onClose} aria-label="إغلاق" className="rounded p-1 hover:bg-accent"><X className="size-4" /></button>
      </div>
      {children}
    </div>
  );
}

function CalcPanel({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const preview = evalExpr(expr);
  const equals = () => {
    if (preview === null) return;
    setHist((h) => [`${expr} = ${preview}`, ...h].slice(0, 6));
    setExpr(String(preview));
  };
  const keys = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "%", "="];
  const press = (k: string) => {
    if (k === "C") setExpr("");
    else if (k === "=") equals();
    else setExpr((e) => e + k);
  };
  return (
    <Shell title="الآلة الحاسبة (F9)" onClose={onClose}>
      <div dir="ltr" className="mb-2 rounded-md bg-muted p-2 text-end">
        <input autoFocus value={expr} onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "=") { e.preventDefault(); equals(); } }}
          className="num w-full bg-transparent text-end text-xl outline-none" placeholder="0" />
        <div className="num text-sm text-muted-foreground">{preview !== null && expr ? `= ${preview.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : "\u00a0"}</div>
      </div>
      <div dir="ltr" className="grid grid-cols-4 gap-1.5">
        {keys.map((k) => (
          <button key={k} onClick={() => press(k)}
            className={cn("h-11 rounded-md border text-lg font-medium hover:bg-accent", k === "=" && "bg-primary text-primary-foreground hover:bg-primary/90", k === "C" && "text-destructive")}>
            {k}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-2">
        <button className="text-xs text-muted-foreground hover:underline" onClick={() => setExpr((e) => e.slice(0, -1))}>⌫ حذف رقم</button>
        <button className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => { if (preview !== null) { navigator.clipboard?.writeText(String(preview)); toast.success("تم نسخ الناتج"); } }}>
          <Copy className="size-3" /> نسخ الناتج
        </button>
      </div>
      {!!hist.length && (
        <div dir="ltr" className="num mt-2 max-h-24 space-y-0.5 overflow-auto border-t pt-2 text-end text-xs text-muted-foreground">
          {hist.map((h, i) => <div key={i} className="cursor-pointer hover:text-foreground" onClick={() => setExpr(h.split(" = ")[1] ?? "")}>{h}</div>)}
        </div>
      )}
    </Shell>
  );
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fmtShort = (iso: string) => new Date(iso).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });

function NotesPanel({ notes, onClose }: { notes: Note[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const people = useQuery({
    queryKey: ["tenant_colleagues"],
    queryFn: async () => ((await db.rpc("tenant_colleagues")).data ?? []) as { id: string; full_name: string; email: string | null }[],
  });
  const nameOf = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name || people.data?.find((p) => p.id === id)?.email || "زميل";
  const [tab, setTab] = useState<"mine" | "inbox" | "sent">("mine");
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", at: "", rep: "none", kind: "note", priority: "normal", color: "default", assigned_to: "", due: "" });
  const [more, setMore] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["personal_notes"] });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.title.trim() && !form.body.trim()) throw new Error("اكتب الملاحظة أولاً");
      if (form.kind !== "note" && form.assigned_to === "" && form.kind === "request") throw new Error("اختر الزميل المطلوب منه");
      const { error } = await db.from("personal_notes").insert({
        title: form.title.trim(), body: form.body.trim(),
        remind_at: form.at ? new Date(form.at).toISOString() : null, repeat: form.at ? form.rep : "none",
        kind: form.kind, priority: form.priority, color: form.color,
        assigned_to: form.assigned_to || null, due_at: form.due ? new Date(form.due).toISOString() : null,
      });
      if (error) throw error;
      if (form.at && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
    },
    onSuccess: () => {
      toast.success(form.assigned_to ? `أُرسلت إلى ${nameOf(form.assigned_to)}` : "حُفظت");
      setForm({ title: "", body: "", at: "", rep: "none", kind: "note", priority: "normal", color: "default", assigned_to: "", due: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd = async (id: string, patch: Partial<Note>) => { const { error } = await db.from("personal_notes").update(patch).eq("id", id); if (error) toast.error(error.message); refresh(); };
  const del = async (id: string) => { await db.from("personal_notes").delete().eq("id", id); refresh(); };

  const uid = me?.userId;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return notes.filter((n) => {
      const inTab = tab === "inbox" ? n.assigned_to === uid && n.user_id !== uid : tab === "sent" ? n.user_id === uid && !!n.assigned_to && n.assigned_to !== uid : n.user_id === uid && (!n.assigned_to || n.assigned_to === uid);
      const isDone = n.done || n.status === "done";
      return inTab && (showDone || !isDone) && (!s || `${n.title} ${n.body}`.toLowerCase().includes(s));
    });
  }, [notes, tab, q, showDone, uid]);
  const count = (t: typeof tab) => notes.filter((n) => (t === "inbox" ? n.assigned_to === uid && n.user_id !== uid : t === "sent" ? n.user_id === uid && !!n.assigned_to && n.assigned_to !== uid : n.user_id === uid && (!n.assigned_to || n.assigned_to === uid)) && n.status !== "done" && !n.done).length;

  const field = "w-full rounded-md border bg-background px-2 py-1.5 text-sm";
  const sel = "rounded-md border bg-background px-1 py-1 text-xs";
  return (
    <Shell title="الملاحظات والمهام (F8)" onClose={onClose} wide>
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
        {([["mine", "ملاحظاتي"], ["inbox", "مطلوب مني"], ["sent", "أرسلتها"]] as const).map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-md py-1.5", tab === k && "bg-card font-semibold shadow")}>
            {v}{count(k) > 0 && <span className="ms-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{count(k)}</span>}
          </button>
        ))}
      </div>

      {tab !== "inbox" && (
        <div className="space-y-1.5 rounded-lg border p-2">
          <div className="flex gap-1">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} onClick={() => setForm({ ...form, kind: k })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", form.kind === k && "border-primary bg-primary text-primary-foreground")}>{v}</button>
            ))}
            <button className="ms-auto text-xs text-primary hover:underline" onClick={() => setMore((v) => !v)}>{more ? "خيارات أقل" : "خيارات أكثر"}</button>
          </div>
          <input className={field} placeholder="العنوان" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
          <textarea className={cn(field, "min-h-14")} placeholder={form.kind === "request" ? "ماذا تطلب من زميلك؟" : "النص..."} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          {(form.kind !== "note" || more) && (
            <div className="flex items-center gap-1.5">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <select className={cn(field, "py-1")} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                <option value="">{form.kind === "request" ? "اختر الزميل..." : "لي أنا"}</option>
                {(people.data ?? []).filter((p) => p.id !== uid).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </div>
          )}
          {more && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">الأولوية</span>
                <select className={sel} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <span className="ms-2 text-muted-foreground">اللون</span>
                {Object.entries(COLORS).map(([k, c]) => (
                  <button key={k} onClick={() => setForm({ ...form, color: k })} className={cn("size-5 rounded-full border", c, form.color === k && "ring-2 ring-primary")} aria-label={k} />
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs"><CalendarClock className="size-4 text-muted-foreground" /> الموعد النهائي
                <input type="datetime-local" className={cn(sel, "flex-1")} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
              </label>
            </>
          )}
          <div className="flex gap-1.5">
            <input type="datetime-local" className={field} value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} title="وقت التذكير (اختياري)" />
            <select className="rounded-md border bg-background px-1 text-sm" value={form.rep} onChange={(e) => setForm({ ...form, rep: e.target.value })} disabled={!form.at}>
              {Object.entries(REPEAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <Button size="sm" className="w-full" onClick={() => add.mutate()} disabled={add.isPending}>
            {form.assigned_to ? <><Send className="size-4" /> إرسال إلى {nameOf(form.assigned_to)}</> : "إضافة"}
          </Button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(field, "ps-7 py-1")} placeholder="بحث..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> المنجزة</label>
      </div>

      <div className="mt-2 max-h-80 space-y-1.5 overflow-auto">
        {!filtered.length && <p className="py-4 text-center text-xs text-muted-foreground">{tab === "inbox" ? "لا توجد طلبات أو مهام موجهة لك" : "لا يوجد شيء بعد"}</p>}
        {filtered.map((n) => {
          const isDone = n.done || n.status === "done";
          const overdue = n.due_at && !isDone && new Date(n.due_at).getTime() < Date.now();
          const mineToManage = n.user_id === uid;
          return (
            <div key={n.id} className={cn("rounded-md border p-2 text-sm", COLORS[n.color] ?? "bg-card", isDone && "opacity-60")}>
              <div className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    {n.kind !== "note" && <span className="rounded bg-muted px-1">{KINDS[n.kind]}</span>}
                    {n.priority !== "normal" && <span className={PRI_CLS[n.priority]}>● {PRIORITY[n.priority]}</span>}
                    {n.assigned_to && n.assigned_to !== n.user_id && (
                      <span className="text-muted-foreground">{tab === "inbox" ? `من ${nameOf(n.user_id)}` : `إلى ${nameOf(n.assigned_to)}`} · {STATUS[n.status]}</span>
                    )}
                  </div>
                  {n.title && <div className={cn("font-medium", isDone && "line-through")}>{n.title}</div>}
                  {n.body && <div className="whitespace-pre-wrap text-xs text-muted-foreground">{n.body}</div>}
                  {n.due_at && <div className={cn("text-[10px]", overdue ? "text-destructive" : "text-muted-foreground")}>الموعد: {fmtShort(n.due_at)}{overdue && " (متأخرة)"}</div>}
                  {n.reply && <div className="mt-1 rounded bg-muted px-1.5 py-0.5 text-xs">↩ {n.reply}</div>}
                </div>
                {mineToManage && (
                  <button title={n.pinned ? "إلغاء التثبيت" : "تثبيت"} onClick={() => upd(n.id, { pinned: !n.pinned })} className={cn("rounded p-1 hover:bg-accent", n.pinned && "text-primary")}><Pin className="size-3.5" /></button>
                )}
                <button title="تم" onClick={() => upd(n.id, { done: !isDone, status: isDone ? "open" : "done" })} className="rounded p-1 hover:bg-accent"><Check className="size-3.5" /></button>
                {mineToManage && <button title="حذف" onClick={() => del(n.id)} className="rounded p-1 text-destructive hover:bg-accent"><Trash2 className="size-3.5" /></button>}
              </div>
              {tab === "inbox" && !isDone && (
                <div className="mt-1.5 flex gap-1">
                  {n.status === "open" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => upd(n.id, { status: "in_progress" })}>بدء التنفيذ</Button>}
                  <ReplyBox onSend={(r) => upd(n.id, { reply: r })} />
                </div>
              )}
              <div className="mt-1 flex items-center gap-1 text-xs">
                <Bell className="size-3 text-muted-foreground" />
                <input type="datetime-local" className="rounded border bg-background px-1 text-xs" value={toLocalInput(n.remind_at)}
                  onChange={(e) => upd(n.id, { remind_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                <select className="rounded border bg-background text-xs" value={n.repeat} onChange={(e) => upd(n.id, { repeat: e.target.value })}>
                  {Object.entries(REPEAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function ReplyBox({ onSend }: { onSend: (r: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-1 gap-1">
      <input className="h-7 flex-1 rounded-md border bg-background px-1.5 text-xs" placeholder="رد..." value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { onSend(v.trim()); setV(""); } }} />
      <Button size="sm" variant="outline" className="h-7 px-2" disabled={!v.trim()} onClick={() => { onSend(v.trim()); setV(""); }}><Send className="size-3" /></Button>
    </div>
  );
}
