import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { ChipSelect } from "@/components/ChipSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Settings2 } from "lucide-react";
import { MAIN_OVERRIDABLE, PATTERN_DOC_TYPES, PRIMARY_ACCOUNTS, PRIMARY_GUIDE } from "@/lib/doc-patterns";

const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
type Settings = Record<string, unknown> & { primary_pattern_denied?: Record<string, string[]>; doc_type_accounts?: Record<string, string>; pattern_notes?: Record<string, string> };

export function useTenantPatternSettings(tenantId?: string | null) {
  return useQuery({
    queryKey: ["tenant_settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => ((await db.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle()).data ?? {}) as Settings,
  });
}

/** Usual entry + procedures for a doc type, with the company's editable explanation. */
export function PatternGuide({ docType, note }: { docType: string; note?: string | null | undefined }) {
  const g = PRIMARY_GUIDE[docType];
  if (!g) return null;
  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
      <div className="font-semibold">القيد المحاسبي المعتاد</div>
      <ul className="list-disc ps-4">{g.entry.map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="pt-1 font-semibold">الإجراءات التي تتم</div>
      <ul className="list-disc ps-4">{g.steps.map((x) => <li key={x}>{x}</li>)}</ul>
      {note && <p className="whitespace-pre-wrap border-t pt-1 text-foreground">{note}</p>}
    </div>
  );
}

export function PrimaryPatterns({ tenantId, editable, accounts, capitalAccounts, onDerive, hideProjects }: {
  tenantId: string; editable: boolean; accounts: [string, string][]; capitalAccounts?: [string, string][]; onDerive: (docType: string) => void; hideProjects: boolean;
}) {
  const qc = useQueryClient();
  const st = useTenantPatternSettings(tenantId);
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const types = PATTERN_DOC_TYPES;
  const users = useQuery({
    queryKey: ["primary_pattern_users", tenantId],
    queryFn: async () => ((await scope(db.from("profiles").select("id,full_name,email"), tenantId).order("full_name")).data ?? []) as { id: string; full_name: string | null; email: string | null }[],
  });
  const [allowed, setAllowed] = useState<string[]>([]);
  useEffect(() => {
    if (!edit) return;
    const d = st.data?.primary_pattern_denied ?? {};
    setAllowed((users.data ?? []).filter((u) => !(d[u.id] ?? []).includes(edit)).map((u) => u.id));
  }, [edit, st.data, users.data]);

  useEffect(() => {
    if (!edit || !st.data) return;
    const s = st.data;
    const f: Record<string, string> = {};
    for (const [k] of PRIMARY_ACCOUNTS[edit] ?? []) f[k] = String(s[k] ?? "");
    f["__main"] = s.doc_type_accounts?.[edit] ?? "";
    f["__note"] = s.pattern_notes?.[edit] ?? "";
    setForm(f);
  }, [edit, st.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!edit) return;
      const s = st.data ?? {};
      const row: Record<string, unknown> = {};
      for (const [k] of PRIMARY_ACCOUNTS[edit] ?? []) row[k] = form[k] || null;
      const dta = { ...(s.doc_type_accounts ?? {}) };
      if (form["__main"]) dta[edit] = form["__main"]; else delete dta[edit];
      row["doc_type_accounts"] = dta;
      const notes = { ...(s.pattern_notes ?? {}) };
      if (form["__note"]?.trim()) notes[edit] = form["__note"].trim(); else delete notes[edit];
      row["pattern_notes"] = notes;
      const denied: Record<string, string[]> = { ...(s.primary_pattern_denied ?? {}) };
      for (const u of users.data ?? []) {
        const cur = (denied[u.id] ?? []).filter((t) => t !== edit);
        if (!allowed.includes(u.id)) cur.push(edit);
        if (cur.length) denied[u.id] = cur; else delete denied[u.id];
      }
      row["primary_pattern_denied"] = denied;
      const { error } = await db.from("tenant_settings").update(row).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حفظ النمط الأساسي"); setEdit(null); qc.invalidateQueries({ queryKey: ["tenant_settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const acc = (k: string, label: string) => (
    <div key={k} className="grid gap-1 sm:grid-cols-[1fr_2fr] sm:items-center">
      <Label>{label}</Label>
      <select className={sel} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
        <option value="">— غير محدد —</option>
        {(k === "capital_account_id" && capitalAccounts ? capitalAccounts : accounts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-lg font-semibold">الأنماط الأساسية</h2>
      <p className="mb-3 text-xs text-muted-foreground">لكل نوع مستند نمط أساسي يحدد حساباته وقيده. اصنع منه نمطاً ثانوياً لتخصيص المستودع أو الزبائن أو الصندوق.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {types.map(([v, l]) => (
          <div key={v} className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="font-semibold">{l}</div>
              <div className="flex gap-1">
                {editable && <Button size="icon" variant="ghost" title="نمط ثانوي من هذا النمط" onClick={() => onDerive(v)}><Copy className="size-4" /></Button>}
                {editable && <Button size="icon" variant="ghost" title="الحسابات والشرح" onClick={() => setEdit(v)}><Settings2 className="size-4" /></Button>}
              </div>
            </div>
            <PatternGuide docType={v} note={st.data?.pattern_notes?.[v]} />
          </div>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>النمط الأساسي: {PATTERN_DOC_TYPES.find(([v]) => v === edit)?.[1]}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <PatternGuide docType={edit} />
              {MAIN_OVERRIDABLE.includes(edit) && acc("__main", `الحساب الرئيسي لهذا النمط${PRIMARY_GUIDE[edit]?.main ? ` (${PRIMARY_GUIDE[edit]!.main!.label})` : ""}`)}
              {(PRIMARY_ACCOUNTS[edit] ?? []).filter(([k]) => !(hideProjects && k === "project_cost_account_id")).map(([k, label]) => acc(k, label))}
              <div className="space-y-1">
                <Label>المستخدمون المسموح لهم بهذا النمط الأساسي</Label>
                <p className="text-xs text-muted-foreground">احذف أي مستخدم لمنعه من استخدام النمط الأساسي (يبقى يستخدم الأنماط الثانوية المسموحة له). المدير مسموح دائماً.</p>
                <ChipSelect options={(users.data ?? []).map((u) => [u.id, u.full_name || u.email || u.id.slice(0, 8)])} value={allowed} onChange={setAllowed} emptyText="لا أحد غير المدير" />
              </div>
              <div className="space-y-1">
                <Label>شرح النمط والإجراءات (قابل للتعديل)</Label>
                <Textarea rows={4} value={form["__note"] ?? ""} placeholder="اكتب ملاحظاتك عن القيد والإجراءات المتبعة في شركتك" onChange={(e) => setForm({ ...form, __note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>إلغاء</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
