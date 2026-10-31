import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, Trash2, FilePlus2 } from "lucide-react";
import { PATTERN_DOC_TYPES, PATTERN_FIXED_FIELDS, PATTERN_HIDEABLE, type DocPattern } from "@/lib/doc-patterns";
import { useCurrencies } from "@/lib/currencies";
import { PatternGuide, PrimaryPatterns, useTenantPatternSettings } from "@/components/PrimaryPatterns";
import { Textarea } from "@/components/ui/textarea";
import { MAIN_OVERRIDABLE, PRIMARY_GUIDE, expandPartnerScope, fieldAppliesTo } from "@/lib/doc-patterns";
import { ChipSelect } from "@/components/ChipSelect";
import { CustomEntryPatterns } from "@/components/CustomEntryPatterns";
import { CUSTOM_ENTRY_TYPE } from "@/lib/custom-entry";

export const Route = createFileRoute("/_authenticated/doc-patterns")({
  head: () => ({ meta: [
    { title: "إدارة الأنماط | يوسف سوفت" },
    { name: "description", content: "نماذج مخصصة للفواتير والسندات بقيم ثابتة وحقول مختارة." },
    { property: "og:title", content: "إدارة الأنماط | يوسف سوفت" },
    { property: "og:description", content: "نماذج مخصصة للفواتير والسندات بقيم ثابتة وحقول مختارة." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: DocPatternsPage,
});

type Draft = Omit<DocPattern, "id"> & { id?: string };
const blank: Draft = { name: "", doc_type: "sale", defaults: {}, locked: [], hidden: [], partner_ids: [], warehouse_ids: [], cash_account_ids: [], currency_codes: [], partner_group_ids: [], partner_account_ids: [], allowed_user_ids: [], is_active: true, explanation: "", accounts: {} };
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

function DocPatternsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const editable = !!me && (me.isTenantAdmin || can(me, "settings", "edit"));
  const [draft, setDraft] = useState<Draft | null>(null);
  const curs = useCurrencies().data ?? [];
  const hideProjects = me?.features?.["projects"] === false;
  const fixedFields = PATTERN_FIXED_FIELDS.filter((f) => !(hideProjects && f.key === "project_id"));
  const hideable = PATTERN_HIDEABLE.filter(([k]) => !(hideProjects && k === "project_id"));
  const pst = useTenantPatternSettings(me?.tenantId);

  const list = useQuery({
    queryKey: ["doc_patterns", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await db.from("doc_patterns").select("*").order("doc_type").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as DocPattern[];
    },
  });
  const refs = useQuery({
    queryKey: ["doc_pattern_refs", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [w, p, a, pr, us] = await Promise.all([
        scope(db.from("warehouses").select("id,name").eq("is_group", false), me?.tenantId).order("name"),
        scope(db.from("partners").select("id,name,partner_type,is_group,parent_id,account_id"), me?.tenantId).order("name"),
        scope(db.from("accounts").select("id,code,name,is_group,parent_id"), me?.tenantId).order("code"),
        scope(db.from("projects").select("id,name"), me?.tenantId).order("name"),
        scope(db.from("profiles").select("id,full_name,email"), me?.tenantId).order("full_name"),
      ]);
      return {
        warehouses: (w.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name] as [string, string]),
        allPartners: (p.data ?? []) as { id: string; name: string; is_group: boolean; parent_id: string | null; account_id: string | null }[],
        accountParent: new Map<string, string | null>(((a.data ?? []) as { id: string; parent_id: string | null }[]).map((x) => [x.id, x.parent_id ?? null])),
        partners: ((p.data ?? []) as { id: string; name: string; partner_type: string | null; is_group: boolean }[]).filter((x) => !x.is_group),
        partnerGroups: ((p.data ?? []) as { id: string; name: string; is_group: boolean }[]).filter((x) => x.is_group),
        allAccounts: (a.data ?? []) as { id: string; code: string; name: string; is_group: boolean }[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        capitalAccounts: ((a.data ?? []) as any[]).map((x) => [x.id, `${x.is_group ? "▸ رئيسي: " : ""}${x.code} - ${x.name}`] as [string, string]),
        accounts: ((a.data ?? []) as { id: string; code: string; name: string; is_group: boolean }[]).filter((x) => !x.is_group).map((x: { id: string; code: string; name: string }) => [x.id, `${x.code} - ${x.name}`] as [string, string]),
        projects: (pr.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name] as [string, string]),
        users: (us.data ?? []) as { id: string; full_name: string | null; email: string | null }[],
      };
    },
  });
  const optionsFor = (ref?: string): [string, string][] =>
    ref === "warehouses" ? refs.data?.warehouses ?? []
    : ref === "partners" ? (refs.data?.partners ?? []).map((p) => [p.id, p.name])
    : ref === "accounts" ? refs.data?.accounts ?? []
    : ref === "projects" ? refs.data?.projects ?? []
    : ref === "currencies" ? curs.filter((c) => c.is_active !== false).map((c) => [c.code, `${c.name} (${c.code})`])
    : [];
  const nameOf = (ref: string | undefined, v: string) => optionsFor(ref).find(([id]) => id === v)?.[1] ?? v;

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.name.trim()) throw new Error("أدخل اسم النمط");
      const row = { name: d.name.trim(), doc_type: d.doc_type, defaults: d.defaults, locked: d.locked.filter((k) => d.defaults[k]), hidden: d.hidden, partner_ids: d.partner_ids, warehouse_ids: d.warehouse_ids ?? [], cash_account_ids: d.cash_account_ids ?? [], currency_codes: d.currency_codes ?? [], partner_group_ids: d.partner_group_ids ?? [], partner_account_ids: d.partner_account_ids ?? [], allowed_user_ids: d.allowed_user_ids ?? [], is_active: d.is_active, explanation: d.explanation?.trim() || null, accounts: Object.fromEntries(Object.entries(d.accounts ?? {}).filter(([, v]) => v)) };
      const { error } = d.id ? await db.from("doc_patterns").update(row).eq("id", d.id) : await db.from("doc_patterns").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حفظ النمط"); setDraft(null); qc.invalidateQueries({ queryKey: ["doc_patterns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("doc_patterns").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("تم حذف النمط"); qc.invalidateQueries({ queryKey: ["doc_patterns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (arr: string[], k: string) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  /** Category/account selection auto-adds the partner cards and accounts they cover. */
  const setPartnerScope = (d: Draft, groups: string[], accs: string[]) => {
    const added = expandPartnerScope(groups.filter((g) => !(d.partner_group_ids ?? []).includes(g)), accs.filter((a) => !(d.partner_account_ids ?? []).includes(a)), refs.data?.allPartners ?? [], refs.data?.accountParent ?? new Map());
    setDraft({ ...d, partner_group_ids: groups, partner_account_ids: [...new Set([...accs, ...added.accountIds])], partner_ids: [...new Set([...d.partner_ids, ...added.partnerIds])] });
  };

  return (
    <div>
      <PageHeader
        title="إدارة الأنماط"
        subtitle="الأنماط الأساسية تحدد حسابات وقيد كل نوع مستند، والأنماط الثانوية نسخ مخصصة منها (مستودع، صندوق، زبائن، مستخدمون...)"
        actions={editable ? <Button onClick={() => setDraft({ ...blank })}><Plus className="size-4" />نمط ثانوي جديد</Button> : null}
      />
      {me?.tenantId && <PrimaryPatterns tenantId={me.tenantId} editable={editable} accounts={refs.data?.accounts ?? []} capitalAccounts={refs.data?.capitalAccounts ?? []} hideProjects={hideProjects} onDerive={(t) => setDraft({ ...blank, doc_type: t, name: `${PATTERN_DOC_TYPES.find(([v]) => v === t)?.[1] ?? ""} - ` })} />}
      <CustomEntryPatterns editable={editable} accounts={refs.data?.accounts ?? []} users={refs.data?.users ?? []} />
      <h2 className="mb-3 text-lg font-semibold">الأنماط الثانوية</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(list.data ?? []).filter((p) => p.doc_type !== CUSTOM_ENTRY_TYPE).map((p) => (
          <div key={p.id} className={`rounded-lg border bg-card p-4 ${p.is_active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">{PATTERN_DOC_TYPES.find(([v]) => v === p.doc_type)?.[1]}{p.is_active ? "" : " · موقوف"}</div>
              </div>
              <div className="flex gap-1">
                {p.is_active && <Button asChild size="icon" variant="ghost" title="فتح مستند بهذا النمط"><Link to="/documents" search={{ pattern: p.id }}><FilePlus2 className="size-4" /></Link></Button>}
                {editable && <Button size="icon" variant="ghost" title="تعديل" onClick={() => setDraft({ ...p })}><Pencil className="size-4" /></Button>}
                {editable && <Button size="icon" variant="ghost" className="text-destructive" title="حذف" onClick={() => { if (confirm(`حذف النمط «${p.name}»؟`)) remove.mutate(p.id); }}><Trash2 className="size-4" /></Button>}
              </div>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {fixedFields.filter((f) => p.defaults?.[f.key]).map((f) => (
                <li key={f.key}>{f.label}: <span className="text-foreground">{"options" in f ? f.options.find(([v]) => v === p.defaults[f.key])?.[1] : nameOf("ref" in f ? f.ref : undefined, p.defaults[f.key]!)}</span>{p.locked.includes(f.key) ? " 🔒" : ""}</li>
              ))}
              {(p.warehouse_ids?.length ?? 0) > 0 && <li>مستودعات مسموحة: {p.warehouse_ids!.length}</li>}
              {p.partner_ids.length > 0 && <li>زبائن/موردون محددون: {p.partner_ids.length}</li>}
              {(p.partner_group_ids?.length ?? 0) > 0 && <li>تصنيفات مسموحة: {p.partner_group_ids!.length}</li>}
              {(p.partner_account_ids?.length ?? 0) > 0 && <li>حسابات مسموحة: {p.partner_account_ids!.length}</li>}
              {(p.allowed_user_ids?.length ?? 0) > 0 && <li>مستخدمون محددون: {p.allowed_user_ids.length}</li>}
              <li>حقول ظاهرة: {hideable.length - p.hidden.filter((k) => hideable.some(([h]) => h === k)).length} من {hideable.length}</li>
              {p.accounts?.["main"] && <li>الحساب الرئيسي: <span className="text-foreground">{nameOf("accounts", p.accounts["main"])}</span></li>}
              {p.explanation && <li className="whitespace-pre-wrap text-foreground">{p.explanation}</li>}
            </ul>
          </div>
        ))}
        {list.data?.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أنماط ثانوية بعد. انسخ نمطاً أساسياً أو اضغط «نمط ثانوي جديد».</p>}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? "تعديل نمط" : "نمط جديد"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2"><Label>اسم النمط</Label><Input value={draft.name} placeholder="مثال: فاتورة بيع الفرقان" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>نوع المستند</Label>
                  <select className={sel} value={draft.doc_type} onChange={(e) => { const t = e.target.value; const keep = (k: string) => fieldAppliesTo(k, t); setDraft({ ...draft, doc_type: t, accounts: {}, defaults: Object.fromEntries(Object.entries(draft.defaults).filter(([k]) => keep(k))), locked: draft.locked.filter(keep), warehouse_ids: keep("warehouse_id") ? (draft.warehouse_ids ?? []) : [], ...(keep("partner_id") ? {} : { partner_ids: [], partner_group_ids: [], partner_account_ids: [] }) }); }}>
                    {PATTERN_DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <Tabs defaultValue="basic"><TabsList className="mb-3 flex-wrap h-auto"><TabsTrigger value="basic">البيانات والقيد</TabsTrigger><TabsTrigger value="defaults">القيم الثابتة والقفل</TabsTrigger><TabsTrigger value="scope">الشركاء والمستودعات والصلاحيات</TabsTrigger><TabsTrigger value="access">الحقول الظاهرة</TabsTrigger></TabsList>
              <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2 rounded-lg border p-3">
                <h3 className="text-sm font-semibold">القيد المحاسبي للنمط</h3>
                <PatternGuide docType={draft.doc_type} note={pst.data?.pattern_notes?.[draft.doc_type]} />
                {MAIN_OVERRIDABLE.includes(draft.doc_type) && (
                  <div className="space-y-1">
                    <Label>{PRIMARY_GUIDE[draft.doc_type]?.main?.label ?? "الحساب الرئيسي"} لهذا النمط</Label>
                    <select className={sel} value={draft.accounts?.["main"] ?? ""} onChange={(e) => setDraft({ ...draft, accounts: { ...(draft.accounts ?? {}), main: e.target.value } })}>
                      <option value="">— حسب النمط الأساسي —</option>
                      {((draft.doc_type === "opening_inventory" ? refs.data?.capitalAccounts : refs.data?.accounts) ?? []).map(([v, l]: [string, string]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {draft.doc_type === "opening_inventory" && <p className="text-xs text-muted-foreground">اختر حساباً رئيسياً ليحدد المستخدم حساب رأس المال الفرعي عند إدخال المستند، أو حساباً فرعياً ليُثبَّت مباشرة.</p>}
                    {["purchase", "purchase_return"].includes(draft.doc_type) && <p className="text-xs text-muted-foreground">في الجرد المستمر تُرحّل المشتريات إلى حساب مخزون المستودع.</p>}
                  </div>
                )}
                <div className="space-y-1">
                  <Label>شرح النمط والإجراءات</Label>
                  <Textarea rows={3} value={draft.explanation ?? ""} placeholder="مثال: فاتورة نقدية لمعرض الفرقان، تُقبض فوراً في صندوق المعرض" onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />النمط فعّال</label>

              </TabsContent><TabsContent value="defaults" className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold">القيم الثابتة (اترك الحقل فارغاً ليختاره المستخدم)</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {fixedFields.filter((f) => fieldAppliesTo(f.key, draft.doc_type)).map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label>{f.label}</Label>
                      {f.key === "notes" ? (
                        <Input value={draft.defaults[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, defaults: { ...draft.defaults, [f.key]: e.target.value } })} />
                      ) : (
                        <select className={sel} value={draft.defaults[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, defaults: { ...draft.defaults, [f.key]: e.target.value } })}>
                          <option value="">— يختاره المستخدم —</option>
                          {("options" in f ? (f.options as unknown as [string, string][]) : optionsFor("ref" in f ? f.ref : undefined)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      )}
                      {draft.defaults[f.key] && f.key !== "notes" && (
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={draft.locked.includes(f.key)} onChange={() => setDraft({ ...draft, locked: toggle(draft.locked, f.key) })} />قفل الحقل (لا يمكن تغييره في المستند)</label>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              </TabsContent><TabsContent value="scope" className="space-y-4">
              {fieldAppliesTo("partner_id", draft.doc_type) && (
                <div className="space-y-3 rounded-lg border p-3">
                  <h3 className="text-sm font-semibold">الزبائن / الموردون المسموحون</h3>
                  <p className="text-xs text-muted-foreground">اختيار تصنيف أو حساب يضيف تلقائياً كل الزبائن والحسابات التابعة له، ويمكنك بعدها حذف أو إضافة أي بطاقة. إذا لم تختر شيئاً تظهر كل البطاقات.</p>
                  <div className="space-y-1"><Label>التصنيفات</Label>
                    <ChipSelect options={(refs.data?.partnerGroups ?? []).map((g) => [g.id, g.name])} value={draft.partner_group_ids ?? []} onChange={(v) => setPartnerScope(draft, v, draft.partner_account_ids ?? [])} />
                  </div>
                  <div className="space-y-1"><Label>الحسابات (الحساب الرئيسي يشمل ما تحته)</Label>
                    <ChipSelect options={(refs.data?.allAccounts ?? []).map((a) => [a.id, `${a.code} - ${a.name}`])} value={draft.partner_account_ids ?? []} onChange={(v) => setPartnerScope(draft, draft.partner_group_ids ?? [], v)} />
                  </div>
                  <div className="space-y-1"><Label>بطاقات الزبائن / الموردين ({draft.partner_ids.length})</Label>
                    <ChipSelect options={(refs.data?.partners ?? []).map((p) => [p.id, p.name])} value={draft.partner_ids} onChange={(v) => setDraft({ ...draft, partner_ids: v })} />
                  </div>
                </div>
              )}

              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                {fieldAppliesTo("warehouse_id", draft.doc_type) && <div className="space-y-1"><Label>المستودعات المسموحة</Label>
                  <ChipSelect options={refs.data?.warehouses ?? []} value={draft.warehouse_ids ?? []} onChange={(v) => setDraft({ ...draft, warehouse_ids: v })} />
                </div>}
                <div className="space-y-1"><Label>الصناديق / المصارف المسموحة</Label>
                  <ChipSelect options={refs.data?.accounts ?? []} value={draft.cash_account_ids ?? []} onChange={(v) => setDraft({ ...draft, cash_account_ids: v })} />
                </div>
                <div className="space-y-1"><Label>العملات المسموحة</Label>
                  <ChipSelect options={optionsFor("currencies")} value={draft.currency_codes ?? []} onChange={(v) => setDraft({ ...draft, currency_codes: v })} />
                </div>
                <div className="space-y-1"><Label>المستخدمون المسموح لهم</Label>
                  <ChipSelect options={(refs.data?.users ?? []).map((u) => [u.id, u.full_name || u.email || u.id.slice(0, 8)])} value={draft.allowed_user_ids} onChange={(v) => setDraft({ ...draft, allowed_user_ids: v })} emptyText="كل من يملك صلاحية نوع المستند" />
                </div>
              </div>

              </TabsContent><TabsContent value="access" className="space-y-4">
              <div className="space-y-1">
                <Label>الحقول الظاهرة في المستند</Label>
                <ChipSelect options={hideable.map(([k, l]) => [k, l])} value={hideable.map(([k]) => k).filter((k) => !draft.hidden.includes(k))} onChange={(v) => setDraft({ ...draft, hidden: hideable.map(([k]) => k as string).filter((k) => !v.includes(k)) })} emptyText="كل الحقول الاختيارية مخفية" />
              </div>
              </TabsContent></Tabs>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>إلغاء</Button>
            <Button disabled={save.isPending} onClick={() => draft && save.mutate(draft)}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
