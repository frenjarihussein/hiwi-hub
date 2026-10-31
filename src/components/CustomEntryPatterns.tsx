import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { postEntry } from "@/lib/post-entry";
import { baseCurrencyOf } from "@/lib/currencies";
import { today, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { buildCustomEntry, CUSTOM_ENTRY_TYPE, type CustomLine } from "@/lib/custom-entry";

const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
type Row = { id?: string; name: string; explanation: string; entry_lines: CustomLine[]; allowed_user_ids: string[]; defaults: Record<string, string>; is_active: boolean };
const blank = (): Row => ({ name: "", explanation: "", entry_lines: [{ account_id: "", side: "debit", pct: 100, note: "" }, { account_id: "", side: "credit", pct: 100, note: "" }], allowed_user_ids: [], defaults: { description: "" }, is_active: true });

/** User-defined free entry templates for rare operations (depreciation, provisions, expenses...). */
export function CustomEntryPatterns({ editable, accounts, users }: { editable: boolean; accounts: [string, string][]; users: { id: string; full_name: string | null; email: string | null }[] }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Row | null>(null);
  const [run, setRun] = useState<Row | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState("");
  const [cur, setCur] = useState("");
  const [rate, setRate] = useState("1");
  const [cc, setCc] = useState("");
  const refs = useQuery({
    queryKey: ["custom_entry_refs", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [c, k, base] = await Promise.all([
        db.from("currencies").select("code,name,is_active").order("code"),
        db.from("cost_centers").select("id,name,is_group").eq("is_active", true).order("name"),
        baseCurrencyOf(me!.tenantId!),
      ]);
      return { currencies: ((c.data ?? []) as any[]).filter((x) => x.is_active !== false), centers: ((k.data ?? []) as any[]).filter((x) => !x.is_group), base };
    },
  });
  const baseCur = refs.data?.base ?? "";
  const curCode = cur || baseCur;
  const fx = curCode === baseCur ? 1 : Number(rate) || 0;

  const list = useQuery({
    queryKey: ["doc_patterns", "custom", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => ((await db.from("doc_patterns").select("*").eq("doc_type", CUSTOM_ENTRY_TYPE).order("name")).data ?? []) as unknown as Row[],
  });
  const visible = (list.data ?? []).filter((p) => me?.isTenantAdmin || editable || !p.allowed_user_ids?.length || p.allowed_user_ids.includes(me?.userId ?? ""));
  const accName = (id: string) => accounts.find(([v]) => v === id)?.[1] ?? "—";

  const save = useMutation({
    mutationFn: async (d: Row) => {
      if (!d.name.trim()) throw new Error("أدخل اسم النمط");
      buildCustomEntry(d.entry_lines, 100);
      const row = { name: d.name.trim(), doc_type: CUSTOM_ENTRY_TYPE, explanation: d.explanation.trim() || null, entry_lines: d.entry_lines, allowed_user_ids: d.allowed_user_ids, defaults: d.defaults, is_active: d.is_active, locked: [], hidden: [], partner_ids: [] };
      const { error } = d.id ? await db.from("doc_patterns").update(row).eq("id", d.id) : await db.from("doc_patterns").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حفظ النمط المخصص"); setDraft(null); qc.invalidateQueries({ queryKey: ["doc_patterns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("doc_patterns").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("تم حذف النمط"); qc.invalidateQueries({ queryKey: ["doc_patterns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const post = useMutation({
    mutationFn: async () => {
      if (!run || !me?.tenantId) return;
      if (!(fx > 0)) throw new Error("أدخل سعر صرف صحيحاً");
      const fc = buildCustomEntry(run.entry_lines, Number(amount));
      const lines = buildCustomEntry(run.entry_lines, Math.round(Number(amount) * fx * 100) / 100).map((l, i) => ({
        ...l, cost_center_id: cc || null,
        ...(fx !== 1 ? { line_currency: curCode, line_rate: fx, fc_amount: fc[i]!.debit || fc[i]!.credit } : {}),
      }));
      await postEntry(me.tenantId, me.userId, { entry_date: date, description: desc || run.name, currency: curCode, exchange_rate: fx }, lines as any);
    },
    onSuccess: () => { toast.success("تم ترحيل القيد"); setRun(null); qc.invalidateQueries({ queryKey: ["journal_entries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLine = (i: number, patch: Partial<CustomLine>) => draft && setDraft({ ...draft, entry_lines: draft.entry_lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">الأنماط المخصصة (قيود حرة)</h2>
          <p className="text-xs text-muted-foreground">للعمليات النادرة كالإهلاك والمخصصات ودفع المصاريف: تعرّف قيدها وتأثيراتها بنفسك دون الاعتماد على نمط أساسي.</p>
        </div>
        {editable && <Button variant="outline" onClick={() => setDraft(blank())}><Plus className="size-4" />نمط مخصص جديد</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <div key={p.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{p.name}</div>
              <div className="flex gap-1">
                <Button size="sm" onClick={() => { setRun(p); setAmount(""); setDesc(p.defaults?.["description"] || p.name); setDate(today()); }}><Play className="size-3.5" />تنفيذ</Button>
                {editable && <Button size="icon" variant="ghost" onClick={() => setDraft({ ...blank(), ...p, explanation: p.explanation ?? "" })}><Pencil className="size-4" /></Button>}
                {editable && <Button size="icon" variant="ghost" onClick={() => confirm("حذف هذا النمط؟") && remove.mutate(p.id!)}><Trash2 className="size-4 text-destructive" /></Button>}
              </div>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs">
              {p.entry_lines.map((l, i) => <li key={i}>{l.side === "debit" ? "من حـ/" : "إلى حـ/"} {accName(l.account_id)} ({l.pct}%)</li>)}
            </ul>
            {p.explanation && <p className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">{p.explanation}</p>}
          </div>
        ))}
        {visible.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أنماط مخصصة بعد.</p>}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? "تعديل نمط مخصص" : "نمط مخصص جديد"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div><Label>اسم النمط</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="مثال: إهلاك السيارات الشهري" /></div>
              <div><Label>البيان الافتراضي للقيد</Label><Input value={draft.defaults["description"] ?? ""} onChange={(e) => setDraft({ ...draft, defaults: { ...draft.defaults, description: e.target.value } })} /></div>
              <div>
                <Label>أطراف القيد (النسبة من المبلغ المُدخل عند التنفيذ)</Label>
                <div className="mt-1 space-y-2">
                  {draft.entry_lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[90px_1fr_70px_auto] gap-2">
                      <select className={sel} value={l.side} onChange={(e) => setLine(i, { side: e.target.value as CustomLine["side"] })}><option value="debit">مدين</option><option value="credit">دائن</option></select>
                      <select className={sel} value={l.account_id} onChange={(e) => setLine(i, { account_id: e.target.value })}><option value="">— اختر الحساب —</option>{accounts.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
                      <Input type="number" value={l.pct} onChange={(e) => setLine(i, { pct: Number(e.target.value) })} />
                      <Button size="icon" variant="ghost" onClick={() => setDraft({ ...draft, entry_lines: draft.entry_lines.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                  {(() => { const sum = (k: string) => draft.entry_lines.filter((l) => l.side === k).reduce((a, l) => a + Number(l.pct || 0), 0); const d = sum("debit"), c = sum("credit"); const ok = Math.abs(d - 100) < 0.001 && Math.abs(c - 100) < 0.001;
                    return <div className={`rounded-md px-3 py-1.5 text-xs font-semibold ${ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{ok ? "القيد متوازن ✓" : "القيد غير متوازن"} — مدين {d}% / دائن {c}% (يجب أن يكون كل منهما 100%)</div>; })()}
                  <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, entry_lines: [...draft.entry_lines, { account_id: "", side: "debit", pct: 100, note: "" }] })}><Plus className="size-4" />إضافة طرف</Button>
                </div>
              </div>
              <div><Label>شرح القيد وتأثيراته والإجراءات</Label><Textarea rows={4} value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} placeholder="مثال: يخفض قيمة الأصل ويحمّل مصروف الإهلاك على الفترة..." /></div>
              <div>
                <Label>المستخدمون المسموح لهم (بدون تحديد = الجميع)</Label>
                <div className="mt-1 grid max-h-32 grid-cols-2 gap-1 overflow-y-auto rounded border p-2 text-sm">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2"><input type="checkbox" checked={draft.allowed_user_ids.includes(u.id)} onChange={() => setDraft({ ...draft, allowed_user_ids: draft.allowed_user_ids.includes(u.id) ? draft.allowed_user_ids.filter((x) => x !== u.id) : [...draft.allowed_user_ids, u.id] })} />{u.full_name || u.email}</label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={() => draft && save.mutate(draft)} disabled={save.isPending}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!run} onOpenChange={(o) => !o && setRun(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>تنفيذ: {run?.name}</DialogTitle></DialogHeader>
          {run && (
            <div className="space-y-3">
              {run.explanation && <p className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">{run.explanation}</p>}
              <div className="grid grid-cols-2 gap-2">
                <div><Label>المبلغ</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              </div>
              <div><Label>البيان</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>العملة</Label><select className={sel} value={curCode} onChange={(e) => { setCur(e.target.value); setRate("1"); }}>{(refs.data?.currencies ?? []).map((c: any) => <option key={c.code} value={c.code}>{c.code} {c.name ?? ""}</option>)}</select></div>
                <div><Label>سعر الصرف</Label><Input type="number" value={curCode === baseCur ? "1" : rate} disabled={curCode === baseCur} onChange={(e) => setRate(e.target.value)} /></div>
              </div>
              <div><Label>مركز التكلفة</Label><select className={sel} value={cc} onChange={(e) => setCc(e.target.value)}><option value="">— بدون —</option>{(refs.data?.centers ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              {fx !== 1 && Number(amount) > 0 && <p className="text-xs text-muted-foreground">المعادل بالعملة الأساسية: {fmtMoney(Number(amount) * fx)} {baseCur}</p>}
              {Number(amount) > 0 && (
                <ul className="text-xs">{run.entry_lines.map((l, i) => <li key={i}>{l.side === "debit" ? "مدين" : "دائن"}: {accName(l.account_id)} — {fmtMoney((Number(amount) * l.pct) / 100)}</li>)}</ul>
              )}
            </div>
          )}
          <DialogFooter><Button onClick={() => post.mutate()} disabled={post.isPending || !(Number(amount) > 0)}>ترحيل القيد</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
