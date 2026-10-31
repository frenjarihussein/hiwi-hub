import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileDown, Plus, Save, Trash2, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBranding } from "@/lib/branding";
import logo from "@/assets/yousef-soft-logo.png.asset.json";
import { fmtNum } from "@/lib/format";
import { newSolarQuote, groupTotal, lineTotal, quoteTotal, quotePermissions, validateQuote, type SolarQuote, type QuoteGroup } from "@/lib/solar-quote";
import { exportQuoteExcel, exportQuotePdf, type QuoteMeta } from "@/lib/solar-quote-export";
import type { Access, SectionPerms } from "@/lib/solar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SavedQuote = { id: string; title: string; quote_date: string; currency: string; payload: SolarQuote };
export function SolarQuotation({ projectId, tenantId, projectName, client, location, access, perms }: {
  projectId: string; tenantId: string; projectName: string; client?: string; location?: string; access: Access; perms?: SectionPerms | null;
}) {
  const qc = useQueryClient();
  const { data: me } = useMe(); const brand = useBranding();
  const quotes = useQuery({ queryKey: ["solar-quotes", projectId], queryFn: async () => {
    const { data, error } = await db.from("project_quotes").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (error) throw error; return (data ?? []) as SavedQuote[];
  } });
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState<SolarQuote>(() => newSolarQuote(client, location));
  const [title, setTitle] = useState("العرض المالي"); const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("USD"); const [open, setOpen] = useState(false); const [preview, setPreview] = useState(false); const [busy, setBusy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const rights = quotePermissions(perms, access, !!id);
  const meta: QuoteMeta = { title, date, currency, projectName, company: me?.tenantName ?? "يوسف سوفت", logo: brand.data?.logo_url || logo.url };
  const updateGroup = (i: number, patch: Partial<QuoteGroup>) => setQ({ ...q, groups: q.groups.map((g, j) => j === i ? { ...g, ...patch } : g) });
  function start(row?: SavedQuote) {
    setId(row?.id ?? null); setQ(row ? structuredClone(row.payload) : newSolarQuote(client, location));
    setTitle(row?.title ?? "العرض المالي"); setDate(row?.quote_date ?? new Date().toISOString().slice(0, 10)); setCurrency(row?.currency ?? "USD"); setPreview(false); setOpen(true);
  }
  async function save() {
    if (!rights.edit || busy) return;
    const invalid = validateQuote(q); if (invalid || !title.trim() || !date || !currency.trim()) { toast.error(invalid || "أكمل عنوان العرض وتاريخه وعملته"); return; }
    setBusy(true);
    try {
      const values = { title, quote_date: date, currency, payload: q, updated_at: new Date().toISOString() };
      const result = id ? await db.from("project_quotes").update(values).eq("id", id).eq("project_id", projectId).select("id").single()
        : await db.from("project_quotes").insert({ ...values, tenant_id: tenantId, project_id: projectId }).select("id").single();
      if (result.error) throw result.error;
      setId(result.data.id); await qc.invalidateQueries({ queryKey: ["solar-quotes", projectId] }); toast.success("تم حفظ العرض المالي");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(row: SavedQuote) {
    if (!rights.delete || !window.confirm(`حذف العرض «${row.title}»؟`)) return;
    const { error } = await db.from("project_quotes").delete().eq("id", row.id).eq("project_id", projectId).select("id").single();
    if (error) toast.error(error.message); else { await qc.invalidateQueries({ queryKey: ["solar-quotes", projectId] }); toast.success("تم حذف العرض"); }
  }
  async function exportFile(pdf: boolean) {
    const invalid = validateQuote(q); if (invalid) { toast.error(invalid); return; }
    setBusy(true); setPreview(true);
    try {
      if (pdf) { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); const el = printRef.current; if (!el) throw new Error("تعذرت معاينة العرض"); await document.fonts.ready; await exportQuotePdf(el, meta); }
      else await exportQuoteExcel(q, meta);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-b pb-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="size-5 text-primary" />العروض المالية</h3>
      {rights.create && <Button variant="outline" onClick={() => start()}><Plus className="size-4" />عرض مالي جديد</Button>}
    </div>
    {quotes.isError && <p className="text-sm text-destructive">تعذر تحميل العروض المالية: {quotes.error.message}</p>}
    {quotes.isLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل العروض...</p> : !quotes.data?.length ? <p className="text-sm text-muted-foreground">لا توجد عروض مالية محفوظة</p> :
      <ul className="divide-y">{quotes.data.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-3 py-3"><Button variant="link" className="min-w-0 px-0" onClick={() => start(r)}>{r.title} · {r.quote_date}</Button><span className="num ms-auto font-semibold">{fmtNum(quoteTotal(r.payload))} {r.currency}</span>{rights.delete && <Button size="icon" variant="ghost" title="حذف العرض" onClick={() => void remove(r)}><Trash2 className="size-4" /></Button>}</li>)}</ul>}
    {open && <Dialog open onOpenChange={(v) => { if (!busy && !v && (!rights.edit || window.confirm("إغلاق العرض؟ التغييرات غير المحفوظة لن تُحفظ."))) setOpen(false); }}>
      <DialogContent className="w-[96vw] max-w-6xl"><DialogHeader><DialogTitle>{title} — {projectName}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2 border-b pb-3">
          {rights.edit && <Button disabled={busy} onClick={() => void save()}><Save className="size-4" />حفظ العرض</Button>}
          <Button variant="outline" disabled={busy} onClick={() => void exportFile(false)}><FileSpreadsheet className="size-4" />Excel</Button>
          <Button variant="outline" disabled={busy} onClick={() => void exportFile(true)}><FileDown className="size-4" />PDF</Button>
          <Button variant="outline" onClick={() => setPreview(!preview)}><Eye className="size-4" />{preview ? "العودة للبنود" : "معاينة"}</Button>
          <strong className="num ms-auto self-center">{fmtNum(quoteTotal(q))} {currency}</strong>
        </div>
        <div className="max-h-[68vh] overflow-auto">
          {!preview ? <div className="space-y-5 py-2">
            <div className="grid gap-3 sm:grid-cols-3">{[
              ["عنوان العرض", title, setTitle, "text"], ["تاريخ العرض", date, setDate, "date"], ["العملة", currency, setCurrency, "text"],
            ].map(([label, value, setter, type]) => <label key={String(label)} className="space-y-1"><Label>{String(label)}</Label><Input aria-label={String(label)} disabled={!rights.edit} type={String(type)} value={String(value)} onChange={(e) => { if (typeof setter === "function") setter(e.target.value); }} /></label>)}
              <label className="space-y-1"><Label>العميل / المستفيد</Label><Input aria-label="العميل / المستفيد" disabled={!rights.edit} value={q.client} onChange={(e) => setQ({ ...q, client: e.target.value })} /></label>
              <label className="space-y-1"><Label>الموقع</Label><Input aria-label="الموقع" disabled={!rights.edit} value={q.location} onChange={(e) => setQ({ ...q, location: e.target.value })} /></label>
              <label className="space-y-1"><Label>استطاعة المحطة (kWp)</Label><Input aria-label="استطاعة المحطة" disabled={!rights.edit} type="number" min="0" value={q.capacity} onChange={(e) => setQ({ ...q, capacity: Number(e.target.value) })} /></label>
            </div>
            {q.groups.map((g, gi) => <div key={gi} className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap items-center gap-2"><Input className="min-w-48 flex-1 font-semibold" aria-label={`اسم المجموعة ${gi + 1}`} disabled={!rights.edit} value={g.name} onChange={(e) => updateGroup(gi, { name: e.target.value })} />
                <label className="flex items-center gap-1 text-xs">إضافة %<Input aria-label={`نسبة الإضافة ${gi + 1}`} className="w-20" disabled={!rights.edit} min="0" type="number" value={g.markup} onChange={(e) => updateGroup(gi, { markup: Number(e.target.value) })} /></label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={!rights.edit} checked={g.optional} onChange={(e) => updateGroup(gi, { optional: e.target.checked })} />اختياري</label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={!rights.edit} checked={g.included} onChange={(e) => updateGroup(gi, { included: e.target.checked })} />مشمول بالإجمالي</label>
                {rights.edit && <Button size="icon" variant="ghost" title="حذف المجموعة" onClick={() => setQ({ ...q, groups: q.groups.filter((_, i) => i !== gi) })}><X className="size-4" /></Button>}
              </div>
              <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-secondary"><tr>{["التجهيزة", "الواحدة", "الكمية", "السعر الإفرادي", "أجور التركيب", "الإفرادي مع التركيب", "الإجمالي", ""].map((h) => <th key={h} className="border p-2 text-right">{h}</th>)}</tr></thead><tbody>
                {g.lines.map((l, li) => <tr key={li}>
                  {(["description", "unit", "qty", "price", "installation"] as const).map((k) => <td key={k} className="border p-1"><Input className={k === "description" ? "min-w-64" : k === "unit" ? "w-24" : "w-24 num"} aria-label={`${g.name} ${li + 1} ${k}`} disabled={!rights.edit} type={k === "description" || k === "unit" ? "text" : "number"} min="0" step="any" value={l[k]} onChange={(e) => updateGroup(gi, { lines: g.lines.map((x, i) => i === li ? { ...x, [k]: k === "description" || k === "unit" ? e.target.value : Number(e.target.value) } : x) })} /></td>)}
                  <td className="num border p-2">{fmtNum(l.price + l.installation)}</td><td className="num border p-2">{fmtNum(lineTotal(l))}</td><td className="border">{rights.edit && <Button size="icon" variant="ghost" title="حذف البند" onClick={() => updateGroup(gi, { lines: g.lines.filter((_, i) => i !== li) })}><Trash2 className="size-4" /></Button>}</td>
                </tr>)}
              </tbody></table></div>
              <div className="flex items-center justify-between gap-2">{rights.edit && <Button size="sm" variant="outline" onClick={() => updateGroup(gi, { lines: [...g.lines, { description: "مادة جديدة", unit: "عدد", qty: 1, price: 0, installation: 0 }] })}><Plus className="size-4" />إضافة بند</Button>}<b className="num">{fmtNum(groupTotal(g))} {currency}</b></div>
            </div>)}
            {rights.edit && <Button variant="outline" onClick={() => setQ({ ...q, groups: [...q.groups, { name: "مجموعة جديدة", markup: 0, optional: false, included: true, lines: [] }] })}><Plus className="size-4" />إضافة مجموعة</Button>}
            <label className="block space-y-1"><Label>الأعمال المستثناة والملاحظات</Label><Textarea disabled={!rights.edit} value={q.notes} onChange={(e) => setQ({ ...q, notes: e.target.value })} /></label>
            <label className="block space-y-1"><Label>شروط الدفع والتسليم وصلاحية العرض</Label><Textarea disabled={!rights.edit} value={q.terms} onChange={(e) => setQ({ ...q, terms: e.target.value })} /></label>
          </div> : <div className="overflow-x-auto py-3"><div ref={printRef} className="quote-print-document"><QuotePreview q={q} meta={meta} /></div></div>}
        </div>
      </DialogContent>
    </Dialog>}
  </section>;
}

function QuotePreview({ q, meta }: { q: SolarQuote; meta: QuoteMeta }) {
  const pages: { group: QuoteGroup; index: number; start: number; last: boolean }[][] = [];
  let used = 0;
  const add = (part: { group: QuoteGroup; index: number; start: number; last: boolean }) => {
    const height = 105 + part.group.lines.reduce((n, l) => n + Math.max(38, Math.ceil(l.description.length / 27) * 16), 0);
    if (!pages.length || used + height > 670) { pages.push([]); used = 0; }
    pages[pages.length - 1]?.push(part); used += height;
  };
  for (const [index, group] of q.groups.entries()) {
    if (!group.lines.length) { add({ group, index, start: 0, last: true }); continue; }
    for (let start = 0; start < group.lines.length; start += 10) add({ group: { ...group, lines: group.lines.slice(start, start + 10) }, index, start, last: start + 10 >= group.lines.length });
  }
  if (used + 100 + Math.ceil((q.notes.length + q.terms.length) / 90) * 20 > 670) pages.push([]);
  return <>{pages.map((parts, pi) => <article key={pi} className="quote-print-page" dir="rtl">
    <header className="quote-print-header"><div><b>{meta.company}</b><h2>{meta.title}</h2><p>{meta.projectName} · {q.client}</p><p>{q.location} · {meta.date} · {q.capacity} kWp · {meta.currency}</p></div>{meta.logo && <img src={meta.logo} crossOrigin="anonymous" alt={meta.company} />}</header>
    {parts.map(({ group: g, index, start, last }) => <div key={index}>
      <h3>{index + 1}. {g.name}{g.optional ? " (اختياري)" : ""}{!g.included ? " — غير مشمول بالإجمالي" : ""}{start ? " — تابع" : ""}</h3>
      <table><thead><tr>{["البند", "التجهيزة", "الواحدة", "الكمية", "السعر الإفرادي", "أجور التركيب", "الإفرادي", "الإجمالي"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{g.lines.map((l, li) => <tr key={li}><td>{index + 1}_{start + li + 1}</td><td>{l.description}</td><td>{l.unit}</td><td>{fmtNum(l.qty)}</td><td>{fmtNum(l.price)}</td><td>{fmtNum(l.installation)}</td><td>{fmtNum(l.price + l.installation)}</td><td>{fmtNum(lineTotal(l))}</td></tr>)}</tbody>
        {last && <tfoot><tr><th colSpan={7}>قيمة البند /{index + 1}/ {g.markup ? `مع إضافة ${g.markup}%` : ""}</th><th>{fmtNum(groupTotal(q.groups[index] ?? g))}</th></tr></tfoot>}
      </table>
    </div>)}
    {pi === pages.length - 1 && <><div className="quote-print-total">المجموع الإجمالي المشمول بالعرض <b>{fmtNum(quoteTotal(q))} {meta.currency}</b></div><p className="quote-print-note">{q.notes}</p>{q.terms && <p className="quote-print-note">الشروط: {q.terms}</p>}</>}
    <footer>{meta.title} · {meta.date}<span>{pi + 1} / {pages.length}</span></footer>
  </article>)}</>;
}