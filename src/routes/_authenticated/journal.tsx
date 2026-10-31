import { JournalNavigation } from "@/components/JournalNavigation";
import { pageHead } from "@/lib/page-head";
import { RecordNotesButton } from "@/components/collab/RecordNotes";
import { AccountPicker } from "@/components/AccountPicker";
import { ApprovalButton } from "@/components/collab/ApprovalButton";
import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { CurrencyOptions, useBaseCurrency, useLatestRates } from "@/lib/currencies";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveSharedDraft, loadSharedDraft, deleteSharedDraft } from "@/lib/shared-drafts";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { exportCsv, printPage } from "@/lib/export";
import { printJournalEntry } from "@/lib/print-entry";
import { useBranding } from "@/lib/branding";
import { fmtDate, fmtMoney, fmtNum, today } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText, MessageCircle, Pencil, Plus, Printer, Save, Scale, Trash2, X } from "lucide-react";
import { SourceDoc } from "@/components/SourceDoc";
import { AttachmentsButton } from "@/components/AttachmentsButton";
import { nowParts, useManualDatetime } from "@/lib/datetime-pref";
import {
  DataFilters,
  applyFilters,
  resolveRange,
  useDataFilters,
  type FacetConfig,
} from "@/components/DataFilters";

export const Route = createFileRoute("/_authenticated/journal")({ head: () => pageHead("القيود اليومية", "إدخال القيود اليومية ومراجعتها وربطها بالمستندات. في يوسف سوفت."),
  validateSearch: (s: Record<string, unknown>): { new?: string } => typeof s['new'] === "string" ? { new: s['new'] } : {},
  component: JournalLayout,
});

function JournalLayout() {
  const hasChild = useChildMatches().length > 0;
  if (hasChild) return <Outlet />;
  return <JournalPage />;
}

type LineDraft = {
  account_id: string;
  partner_id: string;
  project_id: string;
  cost_center_id: string;
  description: string;
  debit: string;
  credit: string;
  line_currency?: string;
  line_rate?: string;
  fc_amount?: string;
  /** Multi-currency mode: amounts typed in the account's own currency. */
  fcd?: string;
  fcc?: string;
};

const emptyLine = (): LineDraft => ({
  account_id: "",
  partner_id: "",
  project_id: "",
  cost_center_id: "",
  description: "",
  debit: "",
  credit: "",
});

type CurMode = "multi" | "single";
const r2 = (n: number) => String(Math.round(n * 100) / 100);

function JournalPage() {
  const { data: me } = useMe();
  const baseCur = useBaseCurrency();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const manualDt = useManualDatetime();
  const [head, setHead] = useState({
    entry_date: today(),
    description: "",
    currency: baseCur,
    exchange_rate: "1",
  });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);
  const [curMode, setCurMode] = useState<CurMode>("single");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNo, setEditingNo] = useState<number | null>(null);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const draftKey = `journal-draft-${me?.tenantId ?? ""}`;
  function resetNew() {
    setEditingId(null);
    setEditingNo(null);
    setCurMode("single");
    setHead({ entry_date: today(), description: "", currency: baseCur, exchange_rate: "1" });
    setLines([emptyLine(), emptyLine()]);
  }
  useEffect(() => {
    if (search.new !== "entry" || !me || !can(me, "journal", "create")) return;
    resetNew();
    setOpen(true);
    void navigate({ search: {}, replace: true });
  }, [search.new, me, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveDraft() {
    localStorage.setItem(draftKey, JSON.stringify({ head, lines, curMode }));
    void saveSharedDraft("journal", "new-entry", { head, lines, curMode }).then((ok) =>
      toast.success(ok ? "حُفظ القيد كمسودة وتظهر من أي جهاز — استعدها من «قيد جديد»" : "حُفظ القيد كمسودة على هذا الجهاز"));
    setOpen(false);
  }
  async function restoreDraft() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = (await loadSharedDraft("journal", "new-entry")) ?? JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (!d) return;
      setHead(d.head); setLines(d.lines); setCurMode(d.curMode ?? "single");
      toast.success("تمت استعادة المسودة");
    } catch { /* ignore */ }
  }
  const cloudDraft = useQuery({ queryKey: ["shared_draft", "journal", me?.tenantId, open], enabled: !!me?.tenantId && open, queryFn: async () => !!(await loadSharedDraft("journal", "new-entry")) });
  const hasDraft = (typeof window !== "undefined" && !!me?.tenantId && !!localStorage.getItem(draftKey)) || !!cloudDraft.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function startEdit(e: any) {
    if (e.document_id) { toast.error("لا يمكن تعديل قيد ناتج عن فاتورة أو مستند — عدّل المستند نفسه"); return; }
    const { data, error } = await db.from("journal_lines").select("*").eq("entry_id", e.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHead({
      entry_date: e.entry_date,
      description: e.description ?? "",
      currency: e.currency ?? baseCur,
      exchange_rate: String(e.exchange_rate ?? 1),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const multi = (data ?? []).some((l: any) => l.line_currency);
    setCurMode(multi ? "multi" : "single");
    setLines(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((l: any) => ({
        account_id: l.account_id,
        partner_id: l.partner_id ?? "",
        project_id: l.project_id ?? "",
        cost_center_id: l.cost_center_id ?? "",
        description: l.description ?? "",
        debit: Number(l.debit) ? String(l.debit) : "",
        credit: Number(l.credit) ? String(l.credit) : "",
        line_currency: l.line_currency ?? "",
        line_rate: l.line_rate ? String(l.line_rate) : "",
        fc_amount: l.fc_amount ? String(l.fc_amount) : "",
        fcd: l.fc_amount && Number(l.debit) ? String(l.fc_amount) : "",
        fcc: l.fc_amount && Number(l.credit) ? String(l.fc_amount) : "",
      })),
    );
    setEditingId(e.id);
    setEditingNo(e.entry_no ?? null);
    setOpen(true);
  }

  const [filters, setFilters] = useDataFilters();
  const brand = useBranding();
  const [auditFilter, setAuditFilter] = useState<"all" | "yes" | "no">("all");
  const canAudit = !!me?.isAuditor;
  async function toggleAudit(id: string, ok: boolean) {
    const { error } = await db.rpc("set_entry_audited", { _id: id, _ok: ok });
    if (error) toast.error(error.message);
    else { toast.success(ok ? "تم تدقيق القيد" : "تم إلغاء التدقيق"); qc.invalidateQueries({ queryKey: ["journal_entries"] }); }
  }
  const range = resolveRange(filters);

  // The date range is pushed into the backend query; the rest filters in place.
  const entries = useQuery({
    queryKey: ["journal_entries", me?.tenantId, range.from, range.to],
    enabled: !!me,
    queryFn: async () => {
      let q = db
        .from("journal_entries")
        .select("*, journal_lines(debit, credit)")
        .order("entry_date", { ascending: false }).order("created_at", { ascending: false });
      if (range.from) q = q.gte("entry_date", range.from);
      if (range.to) q = q.lte("entry_date", range.to);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const refs = useQuery({
    queryKey: ["journal_refs", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const [acc, par, prj, cc] = await Promise.all([
        scope(db.from("accounts").select("id,code,name,is_group,currency").eq("is_active", true), me?.tenantId).order("code"),
        scope(db.from("partners").select("id,name").eq("is_group", false), me?.tenantId).order("name"),
        scope(db.from("projects").select("id,name").eq("is_group", false), me?.tenantId).order("name"),
        scope(db.from("cost_centers").select("id,code,name").eq("is_active", true).eq("is_group", false), me?.tenantId).order("code"),
      ]);
      return { accounts: acc.data ?? [], partners: par.data ?? [], projects: prj.data ?? [], costCenters: cc.data ?? [] };
    },
  });

  const nextNo = editingNo ?? ((entries.data ?? []).reduce((m: number, e: { entry_no?: number | null }) => Math.max(m, Number(e.entry_no) || 0), 0) + 1);
  const rates = useLatestRates();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accCur = (id: string): string => ((refs.data?.accounts ?? []).find((a: any) => a.id === id)?.currency as string | undefined) || baseCur;
  /** Multi mode: base amounts from the account-currency amounts (rates are units per 1 base unit). */
  const recalcMulti = (l: LineDraft): LineDraft => {
    const cur = l.account_id ? accCur(l.account_id) : baseCur;
    if (cur === baseCur) return { ...l, line_currency: "", line_rate: "", fc_amount: "", debit: l.fcd ?? l.debit, credit: l.fcc ?? l.credit };
    const rate = Number(l.line_rate || rates[cur] || 0);
    const conv = (v?: string) => (Number(v) && rate ? r2(Number(v) / rate) : "");
    return { ...l, line_currency: cur, line_rate: rate ? String(rate) : "", fc_amount: l.fcd || l.fcc || "", debit: conv(l.fcd), credit: conv(l.fcc) };
  };
  const totals = lines.reduce(
    (acc, l) => ({ debit: acc.debit + Number(l.debit || 0), credit: acc.credit + Number(l.credit || 0) }),
    { debit: 0, credit: 0 },
  );
  const balanced = Math.abs(totals.debit - totals.credit) < 0.005 && totals.debit > 0;
  /** Lines normalised for saving according to the currency mode. */
  const prepared = (): LineDraft[] =>
    curMode === "multi" ? lines : lines.map((l) => ({ ...l, line_currency: "", line_rate: "", fc_amount: "" }));
  const effHead = curMode === "multi" ? { ...head, currency: baseCur, exchange_rate: "1" } : head.currency === baseCur ? { ...head, exchange_rate: "1" } : head;

  function sendEntryWhatsApp() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accs = (refs.data?.accounts ?? []) as any[];
    const body = lines.filter((l) => l.account_id && (Number(l.debit) || Number(l.credit))).map((l) => {
      const a = accs.find((x) => x.id === l.account_id);
      const fc = curMode === "multi" && l.line_currency ? ` (${l.fc_amount} ${l.line_currency})` : "";
      return `${a ? `${a.code} ${a.name}` : ""}: ${Number(l.debit) ? "مدين " + fmtNum(Number(l.debit)) : "دائن " + fmtNum(Number(l.credit))}${fc}`;
    });
    const msg = [me?.tenantName ?? "", `قيد يومية رقم ${nextNo}`, `التاريخ: ${fmtDate(head.entry_date)}`, head.description, ...body, `الإجمالي: ${fmtNum(totals.debit)} ${effHead.currency}`].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  /** Puts the remaining difference on an empty line (or a new one), in that line's account currency. */
  function balanceEntry() {
    const diff = Math.round((totals.debit - totals.credit) * 100) / 100;
    if (Math.abs(diff) < 0.005) { toast.info("القيد متوازن"); return; }
    const next = [...lines];
    let i = next.findIndex((l) => !Number(l.debit) && !Number(l.credit));
    if (i < 0) { next.push(emptyLine()); i = next.length - 1; }
    const l = next[i];
    if (!l) return;
    const side = diff > 0 ? "credit" : "debit";
    const base = Math.abs(diff);
    if (curMode === "multi") {
      const cur = l.account_id ? accCur(l.account_id) : baseCur;
      const rate = cur === baseCur ? 1 : Number(l.line_rate || rates[cur] || 1);
      const fc = r2(base * rate);
      const upd = recalcMulti({ ...l, fcd: side === "debit" ? fc : "", fcc: side === "credit" ? fc : "" });
      // Keep the exact base difference despite rounding of the foreign amount.
      next[i] = { ...upd, debit: side === "debit" ? r2(base) : "", credit: side === "credit" ? r2(base) : "" };
    } else {
      next[i] = { ...l, debit: side === "debit" ? r2(base) : "", credit: side === "credit" ? r2(base) : "" };
    }
    setLines(next);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!balanced) throw new Error("لا يمكن الحفظ: مجموع المدين لا يساوي مجموع الدائن");
      if (editingId) {
        const { error: u } = await db
          .from("journal_entries")
          .update({
            entry_date: head.entry_date,
            description: effHead.description ?? "",
            currency: effHead.currency,
            exchange_rate: Number(effHead.exchange_rate || 1),
          })
          .eq("id", editingId);
        if (u) throw u;
        const { data: oldLines } = await db.from("journal_lines").select("*").eq("entry_id", editingId);
        const { error: d } = await db.from("journal_lines").delete().eq("entry_id", editingId);
        if (d) throw d;
        const newLines = prepared()
          .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({
            tenant_id: me?.tenantId,
            entry_id: editingId,
            account_id: l.account_id,
            partner_id: l.partner_id || null,
            project_id: l.project_id || null,
          cost_center_id: l.cost_center_id || null,
            description: l.description || null,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            line_currency: l.line_currency && Number(l.fc_amount) ? l.line_currency : null,
            line_rate: l.line_currency && Number(l.fc_amount) ? Number(l.line_rate || 1) : null,
            fc_amount: l.line_currency && Number(l.fc_amount) ? Number(l.fc_amount) : null,
          }));
        const { error: i } = await db.from("journal_lines").insert(newLines);
        if (i) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (oldLines?.length) await db.from("journal_lines").insert(oldLines.map(({ id: _id, ...r }: any) => r));
          throw i;
        }
        return;
      }
      const { data: maxRow } = await db
        .from("journal_entries")
        .select("entry_no")
        .order("entry_no", { ascending: false })
        .limit(1);
      const nextNo = (maxRow?.[0]?.entry_no ?? 0) + 1;

      const { data: entry, error: e1 } = await db
        .from("journal_entries")
        .insert({
          tenant_id: me?.tenantId,
          entry_no: nextNo,
          entry_date: manualDt ? head.entry_date : nowParts().date,
          description: effHead.description ?? "",
          currency: effHead.currency,
          exchange_rate: Number(effHead.exchange_rate || 1),
          created_by: me?.userId,
        })
        .select()
        .single();
      if (e1) throw e1;

      const payload = prepared()
        .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l) => ({
          tenant_id: me?.tenantId,
          entry_id: entry.id,
          account_id: l.account_id,
          partner_id: l.partner_id || null,
          project_id: l.project_id || null,
          cost_center_id: l.cost_center_id || null,
          description: l.description || null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
            line_currency: l.line_currency && Number(l.fc_amount) ? l.line_currency : null,
            line_rate: l.line_currency && Number(l.fc_amount) ? Number(l.line_rate || 1) : null,
            fc_amount: l.line_currency && Number(l.fc_amount) ? Number(l.fc_amount) : null,
        }));
      const { error: e2 } = await db.from("journal_lines").insert(payload);
      if (e2) {
        await db.from("journal_entries").delete().eq("id", entry.id);
        throw e2;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "تم حفظ تعديلات القيد" : "تم ترحيل القيد بنجاح");
      if (!editingId) { localStorage.removeItem(draftKey); void deleteSharedDraft("journal", "new-entry"); }
      setOpen(false);
      resetNew();
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("journal_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف القيد");
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = (entries.data ?? []).map((e: any) => ({
    ...e,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    total: (e.journal_lines ?? []).reduce((s: number, l: any) => s + Number(l.debit), 0),
  }));

  const facets: FacetConfig[] = [
    {
      key: "currency",
      label: "العملة",
      options: [
        { value: "USD", label: "دولار ($)" },
        { value: "SYP", label: "ليرة سورية (ل.س)" },
      ],
    },
    {
      key: "doc_type",
      label: "المصدر",
      options: [
        { value: "sale", label: "فاتورة مبيع" },
        { value: "purchase", label: "فاتورة شراء" },
        { value: "receipt", label: "سند قبض" },
        { value: "payment", label: "سند دفع" },
        { value: "stock_in", label: "إدخال مستودع" },
        { value: "stock_out", label: "إخراج إلى مشروع" },
      ],
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = applyFilters<any>(allRows, filters, { dateKey: "entry_date" }).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => auditFilter === "all" || (auditFilter === "yes" ? e.audited : !e.audited),
  );

  return (
    <div>
      <PageHeader
        title="دفتر اليومية العامة"
        subtitle="لا يقبل النظام أي قيد غير متوازن (المدين يجب أن يساوي الدائن)"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(
                  "دفتر اليومية العامة",
                  [
                    { key: "entry_no", label: "رقم القيد" },
                    { key: "entry_date", label: "التاريخ" },
                    { key: "description", label: "البيان" },
                    { key: "currency", label: "العملة" },
                    { key: "exchange_rate", label: "سعر الصرف" },
                    { key: "total", label: "المبلغ" },
                  ],
                  rows,
                )
              }
            >
              <Download className="size-4" />
              تصدير إلى إكسل
            </Button>
            <Button variant="outline" onClick={printPage}>
              <Printer className="size-4" />
              طباعة
            </Button>
            {can(me, "journal", "create") && (
              <Button
                onClick={() => {
                  resetNew();
                  setOpen(true);
                }}
              >
                <Plus className="size-4" />
                قيد جديد
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">حالة التدقيق:</span>
        <select className="h-9 rounded-md border bg-background px-2" value={auditFilter} onChange={(e) => setAuditFilter(e.target.value as "all" | "yes" | "no")}>
          <option value="all">الكل</option>
          <option value="no">غير مدقق</option>
          <option value="yes">مدقق</option>
        </select>
      </div>
      <DataFilters
        filters={filters}
        onChange={setFilters}
        facets={facets}
        searchPlaceholder="بحث برقم القيد أو البيان..."
      />

      <div className="print-area overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2 text-right">رقم القيد</th>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2 text-right">البيان</th>
              <th className="px-3 py-2 text-right">أصل السند</th>
              <th className="px-3 py-2 text-right">العملة</th>
              <th className="px-3 py-2 text-right">سعر الصرف</th>
              <th className="px-3 py-2 text-right">المبلغ</th>
              <th className="px-3 py-2 text-right">التدقيق</th>
              <th className="no-print px-3 py-2 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  لا توجد قيود
                </td>
              </tr>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {rows.map((e: any) => (
              <tr key={e.id} className="border-t hover:bg-muted/40">
                <td className="px-3 py-2">{e.entry_no}</td>
                <td className="px-3 py-2">{fmtDate(e.entry_date)}</td>
                <td className="px-3 py-2">{e.description || "—"}</td>
                <td className="px-3 py-2"><SourceDoc docType={e.doc_type} documentId={e.document_id} /></td>
                <td className="px-3 py-2">{e.currency === "USD" ? "دولار" : e.currency === "SYP" ? "ليرة سورية" : e.currency}</td>
                <td className="px-3 py-2">{fmtNum(e.exchange_rate, 2)}</td>
                <td className="px-3 py-2 num">{fmtMoney(e.total, e.currency)}</td>
                <td className="px-3 py-2">
                  <span className="mb-1 inline-flex rounded-full bg-status-posted px-2 py-0.5 text-[11px] font-medium text-status-posted-foreground">مرحّل</span>
                  {canAudit ? (
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!!e.audited} onChange={(ev) => toggleAudit(e.id, ev.target.checked)} />
                      {e.audited ? "مدقق" : "غير مدقق"}
                    </label>
                  ) : (
                    <span className={e.audited ? "text-xs font-semibold text-primary" : "text-xs text-muted-foreground"}>{e.audited ? "مدقق" : "غير مدقق"}</span>
                  )}
                </td>
                <td className="no-print px-3 py-2">
                  <div className="flex gap-1">
                    <Button asChild size="icon" variant="ghost" title="سند القيد">
                      <Link to="/journal/$entryId" params={{ entryId: e.id }}>
                        <FileText className="size-4" />
                      </Link>
                    </Button>
                    <Button size="icon" variant="ghost" title="طباعة" onClick={() =>
                      printJournalEntry(e.id, me?.tenantName, brand.data?.logo_url).catch((err) => toast.error(err.message))}>
                      <Printer className="size-4" />
                    </Button>
                    <AttachmentsButton entityType="journal_entry" entityId={e.id} />
                    <RecordNotesButton entityType="journal_entry" entityId={e.id} label={`قيد رقم ${e.entry_no}`} />
                    <ApprovalButton entityType="journal_entry" entityId={e.id} title={`قيد رقم ${e.entry_no}`} />
                    {can(me, "journal", "edit") && !e.audited && e.doc_type === "opening" && (
                      <Button asChild size="icon" variant="ghost" title="تعديل القيد الافتتاحي">
                        <Link to="/opening-closing"><Pencil className="size-4" /></Link>
                      </Button>
                    )}
                    {can(me, "journal", "edit") && !e.audited && !e.document_id && e.doc_type !== "opening" && (
                      <Button size="icon" variant="ghost" onClick={() => startEdit(e)} title="تعديل">
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {can(me, "journal", "delete") && !e.audited && (
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)} title="حذف">
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditingId(null); }}>
        <DialogContent className="flex h-screen max-h-screen w-screen max-w-none flex-col gap-3 overflow-hidden rounded-none p-4 sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل قيد يومية" : "قيد يومية جديد"} — رقم القيد: <span className="num">{nextNo}</span>{!editingId && <span className="text-xs font-normal text-muted-foreground"> (متوقع)</span>}</DialogTitle>
          </DialogHeader>

          {!editingId && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={resetNew}>+ قيد جديد</Button></div>}
          {editingId && <JournalNavigation id={editingId} onSelect={(e) => { void navigate({ to: "/journal/$entryId", params: { entryId: e.id } }); setOpen(false); }} onNew={resetNew} />}

          <div className="grid shrink-0 gap-3 md:grid-cols-6">
            <div className="space-y-1.5">
              <Label>رقم القيد</Label>
              <Input value={String(nextNo)} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>التاريخ</Label>
              <Input
                type="date"
                disabled={!manualDt && !editingId}
                value={!manualDt && !editingId ? nowParts().date : head.entry_date}
                onChange={(e) => setHead({ ...head, entry_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>شرح القيد (اختياري)</Label>
              <Input value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>عملة القيد</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={curMode === "multi" ? "__multi" : head.currency}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__multi") {
                    setCurMode("multi");
                    setHead({ ...head, currency: baseCur, exchange_rate: "1" });
                    setLines(lines.map((l) => recalcMulti({ ...l, fcd: l.debit, fcc: l.credit })));
                  } else {
                    setCurMode("single");
                    setHead({ ...head, currency: v, exchange_rate: v === baseCur ? "1" : String(rates[v] ?? head.exchange_rate) });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setLines(lines.map((l) => (l.account_id && accCur(l.account_id) !== v ? { ...l, account_id: "" } : { ...l, line_currency: "", line_rate: "", fc_amount: "" })));
                  }
                }}
              >
                <option value="__multi">متعدد العملات</option>
                <CurrencyOptions />
              </select>
            </div>
            {curMode === "single" && head.currency !== baseCur && (
              <div className="space-y-1.5">
                <Label>سعر الصرف (كم {head.currency} = 1 {baseCur})</Label>
                <Input type="number" step="any" value={head.exchange_rate} onChange={(e) => setHead({ ...head, exchange_rate: e.target.value })} />
              </div>
            )}
          </div>
          {curMode === "multi" && <p className="text-xs text-muted-foreground">متعدد العملات: عملة كل سطر هي عملة حسابه، والمبالغ تُكتب بعملة الحساب ويُحسب المعادل بـ {baseCur} تلقائياً.</p>}

          <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="px-2 py-2 text-right">الحساب *</th>
                  <th className="px-2 py-2 text-right">العملة</th>
                  <th className="px-2 py-2 text-right">البيان</th>
                  {curMode === "multi" && <th className="px-2 py-2 text-right">سعر الصرف</th>}
                  <th className="px-2 py-2 text-right">مدين{curMode === "multi" ? " (بعملة الحساب)" : ""}</th>
                  <th className="px-2 py-2 text-right">دائن{curMode === "multi" ? " (بعملة الحساب)" : ""}</th>
                  {curMode === "multi" && <th className="px-2 py-2 text-right">المعادل {baseCur}</th>}
                  <th className="px-2 py-2 text-right">المشروع</th>
                  <th className="px-2 py-2 text-right">مركز الكلفة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const set = (patch: Partial<LineDraft>) => {
                    const next = [...lines];
                    const merged = { ...l, ...patch };
                    next[i] = curMode === "multi" ? recalcMulti(merged) : merged;
                    setLines(next);
                  };
                  const cur = curMode === "multi" ? (l.account_id ? accCur(l.account_id) : "") : head.currency;
                  const foreign = curMode === "multi" && !!cur && cur !== baseCur;
                  return (
                  <tr key={i} className="border-t">
                    <td className="p-1">
                      <AccountPicker
                        accounts={refs.data?.accounts ?? []}
                        currency={curMode === "single" ? head.currency : undefined}
                        value={l.account_id}
                        onChange={(id) => set({ account_id: id, line_rate: "" })}
                      />
                    </td>
                    <td className="p-1 text-center font-medium">{cur || "—"}</td>
                    <td className="p-1">
                      <Input className="h-9 w-40" value={l.description} onChange={(e) => set({ description: e.target.value })} />
                    </td>
                    {curMode === "multi" && (
                      <td className="p-1">
                        {foreign ? (
                          <Input aria-label="سعر صرف السطر" title={`كم ${cur} = 1 ${baseCur}`} className="h-9 w-24" type="number" step="any"
                            value={l.line_rate || String(rates[cur] ?? "")} onChange={(e) => set({ line_rate: e.target.value })} />
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    <td className="p-1">
                      <Input className="h-9 w-28" type="number" step="any"
                        value={curMode === "multi" ? (l.fcd ?? l.debit) : l.debit}
                        onChange={(e) => curMode === "multi"
                          ? set({ fcd: e.target.value, fcc: e.target.value ? "" : (l.fcc ?? "") })
                          : set({ debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                    </td>
                    <td className="p-1">
                      <Input className="h-9 w-28" type="number" step="any"
                        value={curMode === "multi" ? (l.fcc ?? l.credit) : l.credit}
                        onChange={(e) => curMode === "multi"
                          ? set({ fcc: e.target.value, fcd: e.target.value ? "" : (l.fcd ?? "") })
                          : set({ credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
                    </td>
                    {curMode === "multi" && <td className="num p-1">{Number(l.debit) ? fmtNum(Number(l.debit)) : Number(l.credit) ? fmtNum(Number(l.credit)) : ""}</td>}
                    <td className="p-1">
                      <select className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm" value={l.project_id} onChange={(e) => set({ project_id: e.target.value })}>
                        <option value="">—</option>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(refs.data?.projects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <select className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm" value={l.cost_center_id} onChange={(e) => set({ cost_center_id: e.target.value })}>
                        <option value="">—</option>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(refs.data?.costCenters ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ` : ""}{c.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted font-semibold">
                <tr>
                  <td colSpan={curMode === "multi" ? 6 : 3} className="px-2 py-2 text-left">الإجمالي ({curMode === "multi" ? baseCur : head.currency})</td>
                  {curMode === "multi" ? (
                    <td className="px-2 py-2" colSpan={1}>{fmtNum(totals.debit)} / {fmtNum(totals.credit)}</td>
                  ) : (<>
                    <td className="px-2 py-2">{fmtMoney(totals.debit, head.currency)}</td>
                    <td className="px-2 py-2">{fmtMoney(totals.credit, head.currency)}</td>
                  </>)}
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
                <Plus className="size-4" />
                إضافة سطر
              </Button>
              <Button variant="outline" size="sm" onClick={balanceEntry}>
                <Scale className="size-4" />
                وازن القيد
              </Button>
              {!editingId && hasDraft && (
                <Button variant="ghost" size="sm" onClick={restoreDraft}>استعادة المسودة</Button>
              )}
            </div>
            <span className={balanced ? "text-sm font-semibold text-primary" : "text-sm font-semibold text-destructive"}>
              {balanced ? "القيد متوازن ✓" : "القيد غير متوازن — الفرق " + fmtNum(totals.debit - totals.credit)}
            </span>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X className="size-4" />خروج
            </Button>
            {!editingId && (
              <Button variant="outline" onClick={saveDraft}>
                <Save className="size-4" />حفظ كمسودة
              </Button>
            )}
            {editingId && (
              <>
                <AttachmentsButton entityType="journal_entry" entityId={editingId} variant="outline" label="المرفقات" />
                <Button variant="outline" onClick={() => printJournalEntry(editingId, me?.tenantName, brand.data?.logo_url).catch((err) => toast.error(err.message))}>
                  <Printer className="size-4" />معاينة / طباعة
                </Button>
              </>
            )}
            <Button variant="outline" onClick={sendEntryWhatsApp}>
              <MessageCircle className="size-4" />واتساب
            </Button>
            {editingId && can(me, "journal", "delete") && (
              <Button variant="outline" className="text-destructive" onClick={() => { if (window.confirm("حذف هذا القيد؟")) { del.mutate(editingId); setOpen(false); } }}>
                <Trash2 className="size-4" />حذف
              </Button>
            )}
            <Button onClick={() => save.mutate()} disabled={!balanced || save.isPending}>
              {editingId ? "حفظ التعديلات" : "ترحيل القيد"}
            </Button>
          </DialogFooter>
          {!editingId && <p className="text-xs text-muted-foreground">المرفقات والمعاينة تُتاح بعد ترحيل القيد من قائمة القيود أو عند تعديله.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
