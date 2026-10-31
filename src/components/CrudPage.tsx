import { useEffect, useMemo, useRef, useState } from "react";
import { CRUD_EDIT_EVENT, CRUD_NEW_EVENT, type CrudEditDetail, type CrudNewDetail, useCodingConfig, leafLenFor, validateCode, suggestFreeCode } from "@/lib/coding";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { TopScrollArea } from "@/components/TopScrollArea";
import { referenceCodeField, referenceLabel } from "@/lib/reference-label";
import { accountNature, leafOnlyField } from "@/lib/directory-rules";
import { accountSubtree } from "@/lib/account-scope";
import { categoryPath } from "@/lib/category-path";
import { can, useMe, type Me } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { exportCsv, printPage } from "@/lib/export";
import type { ImportColumn } from "@/lib/import";
import { ImportDialog, type Lookup } from "@/components/ImportDialog";
import { fmtDate, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { generateEan13 } from "@/lib/barcode";
import { StatCards, type Stat } from "@/components/StatCards";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Download, Eye, EyeOff, LayoutList, Pencil, Plus, Printer, Table2, Trash2 } from "lucide-react";
import {
  DataFilters,
  applyFilters,
  useDataFilters,
  type FacetConfig,
} from "@/components/DataFilters";

export type CrudField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "ref" | "textarea" | "checkbox" | "barcode";
  options?: { value: string; label: string }[];
  refTable?: string;
  refLabel?: string;
  refFilter?: { key: string; value: string | number | boolean };
  /** Limit account choices to the subtree of tenant_settings account(s), picked from the current form. */
  refUnderSettings?: (form: Record<string, unknown>) => string[];
  /** Scope ledger choices by the explicit ledger parent, then by the entity parent's linked account. */
  refAccountScope?: { explicitParent?: string; entityParent: string };
  /** Keep only rows that have no children in the same table (leaf nodes). */
  refLeafOnly?: boolean;
  /** Extra columns to load for refMatch. */
  refExtraSelect?: string;
  /** Keep only reference rows matching the current form (e.g. category type). */
  refMatch?: (form: Record<string, unknown>, row: Record<string, unknown>) => boolean;
  refQuickAdd?: { label: string; defaults?: Record<string, unknown> };
  /** Column holding the reference code, shown before the name in options. */
  refShowCode?: string;
  required?: boolean;
  disabled?: boolean;
  /** Disable dynamically based on the current form. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  disabledIf?: (form: Record<string, any>) => boolean;
  /** Extra form values to set when this select/ref changes. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPick?: (value: string, form: Record<string, any>) => Record<string, unknown> | null;
  /** Read-only once the record exists (chosen only when creating). */
  lockOnEdit?: boolean;
  defaultValue?: string | number | boolean;
  hideInTable?: boolean;
  /** Occupy a full form row (stack under each other). */
  fullRow?: boolean;
  hideInForm?: boolean;
  /** Show the field in the form only when this returns true. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  showIf?: (form: Record<string, any>) => boolean;
  digits?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (row: any) => string;
};

type Props = {
  table: string;
  module: string;
  title: string;
  subtitle?: string;
  fields: CrudField[];
  orderBy?: string;
  ascending?: boolean;
  /** When provided, a bulk "Import from Excel/CSV" button appears. */
  importColumns?: ImportColumn[];
  importLookups?: Lookup[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraRowAction?: (row: any) => React.ReactNode;
  /** Page-specific statistics computed from the filtered rows; replaces the generic sums. */
  stats?: (rows: any[]) => Stat[];
  /** Field key holding the row date; enables the date-range engine. */
  dateKey?: string;
  /** Field keys exposed as multi-select faceted filters. */
  facetKeys?: string[];
  /** Only rows where this column equals the value are listed. */
  rowFilter?: { key: string; value: unknown };
  /** On create, auto-create a ledger account under this parent code and link it via account_id. */
  autoAccount?: { parentCode: string; parentName: string; grandParentCode?: string };
  /** Return an error message to block saving. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate?: (payload: Record<string, any>) => string | null;
  /** Wide two-column add/edit dialog. */
  wideForm?: boolean;
  /** Filter input under every table column header. */
  columnFilters?: boolean;
  /** Which view the page opens with (default "compact" cards). */
  defaultView?: "compact" | "table";
  /** Number of columns shown in the full table (default 5). */
  maxColumns?: number;
  /** Enables row checkboxes, select-all, bulk delete and these extra bulk actions. */
  bulkActions?: ((ids: string[], done: () => void) => React.ReactNode) | undefined;
};


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refName(r: any, refLabel?: string) {
  if (typeof window !== "undefined" && localStorage.getItem("lang") === "en" && r["name_en"]) return String(r["name_en"]);
  return r[refLabel ?? "name"];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellValue(field: CrudField, row: any, refMaps: Record<string, Record<string, string>>) {
  if (field.render) return field.render(row);
  // Bilingual names: show the optional English name when the UI language is English.
  if (field.key === "name" && row["name_en"] && typeof window !== "undefined" && localStorage.getItem("lang") === "en") return String(row["name_en"]);
  const v = row[field.key];
  if (v === null || v === undefined || v === "") return "—";
  if (field.type === "ref") return refMaps[field.key]?.[v] ?? "—";
  if (field.type === "select") return field.options?.find((o) => o.value === String(v))?.label ?? String(v);
  if (field.type === "number") return fmtNum(v, field.digits ?? 2);
  if (field.type === "date") return fmtDate(v);
  if (field.type === "checkbox") return v ? "نعم" : "لا";
  return String(v);
}

export function CrudPage(props: Props) {
  const { table, module, title, subtitle, fields, orderBy = "created_at", ascending = false } = props;
  const { data: me } = useMe();
  const { t, dir } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<Record<string, any>>({});
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [filters, setFilters] = useDataFilters();
  const [view, setView] = useState<"compact" | "table">(props.defaultView ?? "table");
  const [shown, setShown] = useState((props.defaultView ?? "table") === "table");
  const codingCfg = useCodingConfig();
  const standardCoding = codingCfg.enabled;

  // Every read is explicitly scoped to the active company on top of RLS.
  const tenantId = me?.tenantId ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (q: any) => (tenantId ? q.eq("tenant_id", tenantId) : q);

  const rowsQuery = useQuery({
    queryKey: [table, tenantId],
    enabled: !!me,
    queryFn: async () => {
      let base = scoped(db.from(table).select("*"));
      if (props.rowFilter) base = base.eq(props.rowFilter.key, props.rowFilter.value);
      const { data, error } = await base.order(orderBy, { ascending }).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refFields = fields.filter((f) => f.type === "ref" && f.refTable);
  const refQueries = useQuery({
    queryKey: ["refs", table, refFields.map((f) => f.refTable).join(","), tenantId],
    enabled: !!me && refFields.length > 0,
    queryFn: async () => {
      const out: Record<string, { value: string; label: string; row?: Record<string, unknown> }[]> = {};
      for (const f of refFields) {
        const refTable = f.refTable;
        if (!refTable) continue;
        const codeField = f.refShowCode ?? referenceCodeField(refTable);
        const hasNameEn = ["accounts", "products", "partners", "warehouses", "cost_centers"].includes(refTable);
        let query = scoped(db.from(refTable).select(`id, ${f.refLabel ?? "name"}${hasNameEn ? ", name_en" : ""}${codeField ? `, ${codeField}` : ""}${f.refExtraSelect ? `, ${f.refExtraSelect}` : ""}${f.refFilter?.key === "is_group" || f.refLeafOnly ? ", parent_id" : ""}`));
        if (f.refFilter) query = query.eq(f.refFilter.key, f.refFilter.value);
        const { data, error } = await query.order(codeField ?? f.refLabel ?? "name");
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let rows = (data ?? []) as any[];
        if (f.refLeafOnly) {
          const parents = new Set(rows.map((r) => r.parent_id).filter(Boolean));
          rows = rows.filter((r) => !parents.has(r.id));
        }
        const allRows = data ?? [];
        if (f.refUnderSettings) {
          const { data: ts } = await db.from("tenant_settings").select("*").maybeSingle();
          const { data: accs } = await scoped(db.from("accounts").select("id,parent_id"));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const all = (accs ?? []) as any[];
          for (const key of ["customers_account_id", "suppliers_account_id"]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const root = (ts as any)?.[key];
            const set = new Set<string>(root ? [root] : []);
            let grew = true;
            while (grew) { grew = false; all.forEach((a) => { if (a.parent_id && set.has(a.parent_id) && !set.has(a.id)) { set.add(a.id); grew = true; } }); }
            out[`${f.key}::${key}`] = rows.filter((r) => set.has(r.id)).map((r) => ({ value: r.id, label: referenceLabel(r, refName(r, f.refLabel), codeField), row: r }));
          }
        }
        out[f.key] = rows.map((r) => { const lbl = f.refFilter?.key === "is_group" ? categoryPath(allRows, r.id) : refName(r, f.refLabel); return { value: r.id, label: referenceLabel(r, lbl, codeField), row: r }; });
      }
      return out;
    },
  });

  const accountHierarchy = useQuery({
    queryKey: ["account_hierarchy", tenantId],
    enabled: !!me && refFields.some((f) => f.refAccountScope),
    queryFn: async () => {
      const { data, error } = await scoped(db.from("accounts").select("id,parent_id"));
      if (error) throw error;
      return (data ?? []) as { id: string; parent_id: string | null }[];
    },
  });

  function referenceOptions(field: CrudField) {
    let options = refQueries.data?.[field.key] ?? [];
    if (field.refAccountScope) {
      const scope = field.refAccountScope;
      const parentId = form[scope.entityParent];
      const parent = (refQueries.data?.[scope.entityParent] ?? []).find((o) => o.value === parentId);
      const root = (scope.explicitParent ? form[scope.explicitParent] : null) || parent?.row?.["account_id"];
      if (root) {
        const ids = accountSubtree(accountHierarchy.data ?? [], String(root));
        options = options.filter((o) => o.value !== root && ids.has(o.value));
      }
    } else if (field.refUnderSettings) {
      const seen = new Set<string>();
      options = field.refUnderSettings(form).flatMap((key) => refQueries.data?.[`${field.key}::${key}`] ?? [])
        .filter((o) => !seen.has(o.value) && !!seen.add(o.value));
    }
    return options.filter((o) => o.value !== editing?.id || field.refTable !== table)
      .filter((o) => !field.refMatch || field.refMatch(form, o.row ?? {}));
  }

  const refMaps = useMemo(() => {
    const maps: Record<string, Record<string, string>> = {};
    Object.entries(refQueries.data ?? {}).forEach(([k, list]) => {
      maps[k] = Object.fromEntries(list.map((o) => [o.value, o.label]));
    });
    return maps;
  }, [refQueries.data]);

  const afterSave = useRef<"close" | "stay" | "new">("close");
  const saveMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {};
      for (const f of fields) {
        if (f.hideInForm || f.key === "is_closing") continue;
        if ((f.showIf && !f.showIf(form)) || (form["is_group"] && leafOnlyField(table, f.key))) continue;
        let v = form[f.key];
        if (v === "" || v === undefined) v = null;
        if (f.type === "number" && v !== null) v = Number(v);
        if (f.key.includes(".")) {
          // Nested jsonb field such as "prices.1": merged into the jsonb column.
          const [col, sub] = f.key.split(".") as [string, string];
          payload[col] = { ...((editing as Record<string, any> | null)?.[col] ?? {}), ...(payload[col] ?? {}), [sub]: v };
        } else payload[f.key] = v;
      }
      if (table === "accounts") { payload["nature"] = accountNature(!!form["is_closing"], editing?.nature); if (!form["is_closing"]) payload["closing_type"] = null; }
      if (props.validate) {
        const msg = props.validate(payload);
        if (msg) throw new Error(msg);
      }
      const codeKey = table === "accounts" || table === "warehouses" ? "code" : table === "products" ? "sku" : null;
      if (codeKey && standardCoding && payload[codeKey]) {
        const rows = (rowsQuery.data ?? []) as { id: string; code?: string; sku?: string }[];
        let parentCode: string | undefined;
        if (payload["parent_id"]) {
          const pr = await db.from(table).select(codeKey).eq("id", payload["parent_id"]).maybeSingle();
          parentCode = pr.data?.[codeKey];
        }
        void rows;
        const err = validateCode(String(payload[codeKey]), parentCode, !!payload["is_group"], leafLenFor(codingCfg, table));
        if (err) throw new Error(err);
      }
      if (!editing && hasCodeField) {
        const { all } = await codeContext(payload["parent_id"] as string | undefined);
        const c = String(payload["code"] ?? "").trim();
        if (!c) payload["code"] = (await suggestAutoCode(payload["parent_id"] as string | undefined)) || null;
        else if (all.includes(c)) throw new Error(`الرمز ${c} مستخدم مسبقاً — اختر رمزاً آخر أو اتركه فارغاً ليُولَّد تلقائياً`);
      }
      if (editing) {
        const { error } = await scoped(db.from(table).update(payload).eq("id", editing.id));
        if (error) throw error;
      } else {
        const { error } = await db.from(table).insert({
          ...payload,
          ...(props.rowFilter ? { [props.rowFilter.key]: props.rowFilter.value } : {}),
          tenant_id: tenantId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? t("تم حفظ التعديلات") : t("تمت الإضافة بنجاح"));
      const mode = afterSave.current; afterSave.current = "close";
      if (mode === "new") {
        // Carry the same settings (group flag, parent, unit, type...) to the next card; only identity fields reset.
        const carry: Record<string, unknown> = { ...form };
        for (const k of ["id", "code", "sku", "name", "name_en", "barcode"]) delete carry[k];
        openNewRef.current(carry);
      }
      else if (!(mode === "stay" && editing)) setOpen(false);
      queryClient.invalidateQueries({ queryKey: [table] });
      queryClient.invalidateQueries({ queryKey: [`${table}_tree`] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account_hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["refs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function quickAddRef(field: CrudField) {
    if (!field.refTable || !field.refQuickAdd || !tenantId) return;
    const name = window.prompt(field.refQuickAdd.label);
    if (!name?.trim()) return;
    const { data, error } = await db
      .from(field.refTable)
      .insert({ tenant_id: tenantId, name: name.trim(), ...field.refQuickAdd.defaults })
      .select(`id, ${field.refLabel ?? "name"}`)
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setForm((current) => ({ ...current, [field.key]: data.id }));
    await queryClient.invalidateQueries({ queryKey: ["refs", table] });
    await queryClient.invalidateQueries({ queryKey: [field.refTable] });
    toast.success("تمت إضافة التصنيف");
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await scoped(db.from(table).delete().eq("id", id));
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("تم الحذف"));
      if (editing && String(editing.id) === toDelete) setOpen(false);
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => {
      setToDelete(null);
      toast.error(e.message, { duration: 8000 });
    },
  });


  const hasCodeField = fields.some((f) => f.key === "code");
  const autoKey = hasCodeField ? "code" : fields.some((f) => f.key === "sku") ? "sku" : null;
  /** All tenant codes in this table plus the parent's code and its children's codes. */
  async function codeContext(parentId?: string | null, key: string = "code") {
    // Codes are unique per row kind (e.g. services vs stock items), so only compare within the same filter.
    let q = db.from(table).select(`id, ${key}, parent_id`);
    if (props.rowFilter) q = q.eq(props.rowFilter.key, props.rowFilter.value as never);
    const { data } = await q;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    const parentCode = parentId ? rows.find((r) => r.id === parentId)?.[key] ?? "" : "";
    const siblings = rows.filter((r) => (r.parent_id ?? null) === (parentId ?? null)).map((r) => String(r[key] ?? ""));
    return { all: rows.map((r) => String(r[key] ?? "")).filter(Boolean), parentCode, siblings };
  }
  async function suggestAutoCode(parentId?: string | null, key: string = "code") {
    const { all, parentCode, siblings } = await codeContext(parentId, key);
    return suggestFreeCode(parentCode, siblings, all);
  }

  function openNew(preset?: Record<string, unknown>) {
    setEditing(null);
    const init: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (f.defaultValue !== undefined) init[f.key] = f.defaultValue;
      else if (f.type === "checkbox") init[f.key] = false;
    });
    const start = { ...init, ...(preset ?? {}) };
    setForm(start);
    setOpen(true);
    if (autoKey && !start[autoKey]) {
      const k = autoKey;
      void suggestAutoCode(start["parent_id"] as string | undefined, k).then((c) => {
        if (c) setForm((f) => (f[k] ? f : { ...f, [k]: c }));
      }).catch(() => {});
    }
  }
  const openNewRef = useRef(openNew);
  openNewRef.current = openNew;
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<CrudNewDetail>).detail;
      if (d?.table !== table) return;
      e.preventDefault();
      openNewRef.current(d.preset);
    };
    window.addEventListener(CRUD_NEW_EVENT, h);
    return () => window.removeEventListener(CRUD_NEW_EVENT, h);
  }, [table]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function openEdit(row: any) {
    setEditing(row);
    const init: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (f.key.includes(".")) {
        const [col, sub] = f.key.split(".") as [string, string];
        init[f.key] = row[col]?.[sub] ?? "";
      } else init[f.key] = f.key === "is_closing" ? row.nature === "closing" : row[f.key] ?? "";
    });
    setForm(init);
    setOpen(true);
  }
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;
  useEffect(() => {
    const h = async (e: Event) => {
      const d = (e as CustomEvent<CrudEditDetail>).detail;
      if (d?.table !== table) return;
      e.preventDefault();
      const { data, error } = await db.from(table).select("*").eq("id", d.id).maybeSingle();
      if (error || !data) { toast.error("تعذر فتح البطاقة"); return; }
      openEditRef.current(data);
    };
    const handler = (e: Event) => { void h(e); };
    window.addEventListener(CRUD_EDIT_EVENT, handler);
    return () => window.removeEventListener(CRUD_EDIT_EVENT, handler);
  }, [table]);

  const allTableFields = fields.filter((f) => !f.hideInTable);
  const tableFields = allTableFields.slice(0, props.maxColumns ?? 5);
  const [colFilter, setColFilter] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detail, setDetail] = useState<any | null>(null);

  // Contextual facets are derived from the field definitions of this view.
  const facetConfigs: FacetConfig[] = (props.facetKeys ?? [])
    .map((key) => {
      const f = fields.find((x) => x.key === key);
      if (!f) return null;
      const options =
        f.type === "ref"
          ? (refQueries.data?.[key] ?? []).map((o) => ({ value: o.value, label: o.label }))
          : (f.options ?? []).map((o) => ({ value: o.value, label: t(o.label) }));
      return { key, label: t(f.label), options };
    })
    .filter((x): x is FacetConfig => x !== null);

  const rows = applyFilters(rowsQuery.data ?? [], filters, {
    dateKey: props.dateKey ?? "created_at",
    searchText: (r) => allTableFields.map((f) => String(cellValue(f, r, refMaps))).join(" "),
  }).filter((r: Record<string, unknown>) => tableFields.every((f) => { const q = (colFilter[f.key] ?? "").trim().toLowerCase(); return !q || String(cellValue(f, r, refMaps)).toLowerCase().includes(q); }));

  const allowCreate = can(me as Me, module, "create");
  const allowEdit = can(me as Me, module, "edit");
  const allowDelete = can(me as Me, module, "delete");
  const bulkOn = !!props.bulkActions;
  const [picked, setPicked] = useState<string[]>([]);
  const rowIds = rows.map((r: Record<string, unknown>) => String(r["id"]));
  const allPicked = rowIds.length > 0 && rowIds.every((id) => picked.includes(id));
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const bulkDone = () => { setPicked([]); void queryClient.invalidateQueries({ queryKey: [table] }); };
  async function bulkDelete() {
    if (!window.confirm(`${t("حذف")} ${picked.length}؟`)) return;
    let ok = 0; const failed: string[] = [];
    for (const id of picked) {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) failed.push(error.message); else ok++;
    }
    if (ok) toast.success(`تم حذف ${ok}`);
    if (failed.length) toast.error(`تعذر حذف ${failed.length}: ${failed[0]}`);
    bulkDone();
  }
  const pickBox = (id: string) => bulkOn ? (
    <input type="checkbox" className="size-4 accent-primary" checked={picked.includes(id)} onChange={() => togglePick(id)} onClick={(e) => e.stopPropagation()} aria-label={t("تحديد")} />
  ) : null;

  return (
    <div>
      <PageHeader
        title={t(title)}
        subtitle={subtitle}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(
                  title,
                  allTableFields.map((f) => ({ key: f.key, label: f.label })),
                  rows.map((r: Record<string, unknown>) =>
                    Object.fromEntries(allTableFields.map((f) => [f.key, cellValue(f, r, refMaps)])),
                  ),
                )
              }
            >
              <Download className="size-4" />
              {t("تصدير إلى إكسل")}
            </Button>
            {props.importColumns && allowCreate && (
              <ImportDialog
                table={table}
                title={title}
                columns={props.importColumns}
                lookups={props.importLookups}
              />
            )}
            <Button variant="outline" onClick={printPage}>
              <Printer className="size-4" />
              {t("طباعة")}
            </Button>
            {allowCreate && (
              <Button onClick={() => openNew()}>
                <Plus className="size-4" />
                {t("إضافة")}
              </Button>
            )}
          </>
        }
      />

      {!["accounts", "partners", "products", "warehouses", "projects", "cost_centers"].includes(table) && (() => {
        const all = rowsQuery.data ?? [];
        const hasActive = fields.some((f) => f.key === "is_active");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeN = rows.filter((r: any) => r.is_active !== false).length;
        const base: Stat[] = [
          { label: t("العدد الكلي"), value: all.length, hint: t(props.title) },
          ...(hasActive
            ? [
                { label: t("النشطة"), value: activeN, tone: "success" as const },
                { label: t("غير النشطة / المجمّدة"), value: rows.length - activeN, tone: "warning" as const },
              ]
            : [{ label: t("النتائج المعروضة"), value: rows.length, tone: "success" as const }]),
        ];
        const extra = props.stats ? props.stats(rows) : [];
        return (
          <StatCards
            stats={extra.length ? [base[0]!, ...extra].slice(0, 4) : base}
          />
        );
      })()}

      <DataFilters
        filters={filters}
        onChange={setFilters}
        facets={facetConfigs}
        showDate
        searchPlaceholder={t("بحث...")}
      />

      {bulkOn && shown && (
        <div className="no-print mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" className="size-4 accent-primary" checked={allPicked} onChange={() => setPicked(allPicked ? [] : rowIds)} />
            {t("تحديد الكل")}
          </label>
          <span className="text-muted-foreground">{picked.length ? `${picked.length} ${t("محدد")}` : t("حدد عناصر لتطبيق إجراء جماعي")}</span>
          {picked.length > 0 && (
            <>
              {props.bulkActions?.(picked, bulkDone)}
              {allowDelete && (
                <Button size="sm" variant="destructive" onClick={() => void bulkDelete()}>
                  <Trash2 className="size-4" />
                  {t("حذف المحددة")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setPicked([])}>{t("إلغاء التحديد")}</Button>
            </>
          )}
        </div>
      )}
      <div className="no-print mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setShown((v) => !v)}>
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {shown ? t("إخفاء الجدول") : t("إظهار الجدول")}
        </Button>
        <div className={shown ? "flex overflow-hidden rounded-lg border" : "hidden"}>
          <Button
            type="button"
            size="sm"
            variant={view === "compact" ? "default" : "ghost"}
            className="rounded-none"
            onClick={() => setView("compact")}
          >
            <LayoutList className="size-4" />
            {t("قائمة مبسّطة")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "table" ? "default" : "ghost"}
            className="rounded-none"
            onClick={() => setView("table")}
          >
            <Table2 className="size-4" />
            {t("الجدول الكامل")}
          </Button>
        </div>
      </div>

      {shown && view === "compact" && (
        <div className="print-area mt-3 divide-y rounded-xl border bg-card shadow-soft">
          {rowsQuery.isLoading && (
            <p className="px-4 py-6 text-center text-muted-foreground">{t("جارٍ التحميل...")}</p>
          )}
          {!rowsQuery.isLoading && rows.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">{t("لا توجد بيانات")}</p>
          )}
          {rows.map((row: Record<string, unknown>) => (
            <div
              key={String(row["id"])}
              onClick={() => setDetail(row)}
              className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              {pickBox(String(row["id"]))}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{cellValue(tableFields[0]!, row, refMaps)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {tableFields.slice(1, 4).map((f) => `${t(f.label)}: ${cellValue(f, row, refMaps)}`).join(" · ")}
                </p>
              </div>
              <div className="no-print flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                {props.extraRowAction?.(row)}
                {allowEdit && (
                  <Button size="icon" variant="ghost" onClick={() => openEdit(row)} title={t("تعديل")}>
                    <Pencil className="size-4" />
                  </Button>
                )}
                {allowDelete && (
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(String(row["id"]))} title={t("حذف")}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {shown && view === "table" && (
      <TopScrollArea className="print-area mt-3 border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="no-print sticky start-0 z-10 w-px bg-muted px-2 py-2.5 text-start font-medium">{t("إجراءات")}</th>
              {tableFields.map((f) => (
                <th key={f.key} className="whitespace-nowrap px-4 py-2.5 text-start font-medium">
                  {t(f.label)}
                </th>
              ))}
            </tr>
            {props.columnFilters !== false && (
              <tr className="no-print">
                <th className="sticky start-0 z-10 bg-muted" />
                {tableFields.map((f) => (
                  <th key={f.key} className="px-2 pb-2">
                    <Input className="h-8 text-xs" placeholder={t("فلتر...")} value={colFilter[f.key] ?? ""} onChange={(e) => setColFilter({ ...colFilter, [f.key]: e.target.value })} />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rowsQuery.isLoading && (
              <tr>
                <td colSpan={tableFields.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  {t("جارٍ التحميل...")}
                </td>
              </tr>
            )}
            {!rowsQuery.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={tableFields.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  {t("لا توجد بيانات")}
                </td>
              </tr>
            )}

            {rows.map((row: Record<string, unknown>) => (
              <tr key={String(row["id"])} onClick={() => setDetail(row)} className="cursor-pointer border-t transition-colors hover:bg-muted/50">
                <td className="no-print sticky start-0 z-10 whitespace-nowrap bg-card px-2 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {pickBox(String(row["id"]))}
                    {props.extraRowAction?.(row)}
                    {allowEdit && (
                      <Button size="icon" variant="ghost" onClick={() => openEdit(row)} title={t("تعديل")}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {allowDelete && (
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(String(row["id"]))} title={t("حذف")}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
                {tableFields.map((f) => (
                  <td key={f.key} className="whitespace-nowrap px-4 py-3">
                    {cellValue(f, row, refMaps)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TopScrollArea>
      )}

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side={dir === "rtl" ? "left" : "right"} className="w-full overflow-y-auto sm:max-w-md" dir={dir}>
          <SheetHeader>
            <SheetTitle className="text-start">{detail ? String(cellValue(fields[0]!, detail, refMaps)) : ""}</SheetTitle>
            <p className="text-start text-xs text-muted-foreground">{t(title)}</p>
          </SheetHeader>
          {detail && (
            <dl className="mt-6 divide-y rounded-xl border">
              {fields.filter((f) => !f.hideInForm || !f.hideInTable).map((f) => (
                <div key={f.key} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{t(f.label)}</dt>
                  <dd className="break-words font-medium">{cellValue(f, detail, refMaps)}</dd>
                </div>
              ))}
              {detail.created_at && (
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{t("تاريخ الإنشاء")}</dt>
                  <dd className="font-medium">{fmtDate(detail.created_at)}</dd>
                </div>
              )}
            </dl>
          )}
          {detail && (
            <div className="mt-6 flex flex-wrap gap-2">
              {props.extraRowAction?.(detail)}
              {allowEdit && (
                <Button onClick={() => { openEdit(detail); setDetail(null); }}>
                  <Pencil className="size-4" />{t("تعديل")}
                </Button>
              )}
              {allowDelete && (
                <Button variant="outline" onClick={() => { setToDelete(String(detail.id)); setDetail(null); }}>
                  <Trash2 className="size-4 text-destructive" />{t("حذف")}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`flex h-screen max-h-screen w-screen max-w-none flex-col gap-3 rounded-none overflow-y-auto p-4 sm:max-w-none`} dir={dir}>
          <DialogHeader>
            <DialogTitle>
              {editing ? `${t("تعديل")} - ${t(title)}` : `${t("إضافة")} - ${t(title)}`}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const idx = editing ? rows.findIndex((r: any) => r.id === editing.id) : -1;
            const go = (i: number) => { const r = rows[i]; if (r) openEdit(r); };
            return (
              <nav aria-label={t("التقليب بين البطاقات")} className="flex flex-wrap items-center gap-2">
                <Button type="button" size="icon" variant="outline" title={t("أول بطاقة")} disabled={idx === 0 || !rows.length} onClick={() => go(0)}><ChevronLast className="size-4" /></Button>
                <Button type="button" size="icon" variant="outline" title={t("السابق")} disabled={idx <= 0} onClick={() => go(idx - 1)}><ChevronRight className="size-4" /></Button>
                <span className="num min-w-16 text-center text-sm text-muted-foreground">{idx >= 0 ? `${idx + 1} / ${rows.length}` : t("جديد")}</span>
                <Button type="button" size="icon" variant="outline" title={t("التالي")} disabled={idx < 0 || idx >= rows.length - 1} onClick={() => go(idx + 1)}><ChevronLeft className="size-4" /></Button>
                <Button type="button" size="icon" variant="outline" title={t("آخر بطاقة")} disabled={idx === rows.length - 1 || !rows.length} onClick={() => go(rows.length - 1)}><ChevronFirst className="size-4" /></Button>
                {allowCreate && <Button type="button" size="sm" onClick={() => openNew()}><Plus className="size-4" />{t("جديد")}</Button>}
                {editing && allowDelete && <Button type="button" size="sm" variant="destructive" onClick={() => setToDelete(String(editing.id))}><Trash2 className="size-4" />{t("حذف")}</Button>}
              </nav>
            );
          })()}
          <form
            className={"grid gap-x-4 gap-y-3 md:grid-cols-2 lg:grid-cols-3"}
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            {fields
              .filter((f) => !f.hideInForm && (!f.showIf || f.showIf(form)) && !(form["is_group"] && leafOnlyField(table, f.key)))
              .map((f) => (
                <div key={f.key} className={`space-y-1.5 ${f.fullRow ? "md:col-span-2 lg:col-span-3" : props.wideForm && f.type === "textarea" ? "md:col-span-2" : ""}`}>
                  <Label htmlFor={f.key}>{t(f.label)}{f.required && <span className="text-destructive"> *</span>}</Label>
                  {f.type === "select" || f.type === "ref" ? (
                    <div className="flex gap-2">
                      <select
                        id={f.key}
                        className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                        value={String(form[f.key] ?? "")}
                        required={f.required}
                        disabled={f.disabled || !!f.disabledIf?.(form)}
                        onChange={(e) => setForm((current) => {
                          let next: Record<string, unknown> = { ...current, [f.key]: e.target.value };
                          const extra = f.onPick?.(e.target.value, next);
                          if (extra) next = { ...next, ...extra };
                          for (const linked of refFields) {
                            if (linked.refAccountScope?.entityParent === f.key || linked.refAccountScope?.explicitParent === f.key) next[linked.key] = "";
                          }
                          return next;
                        })}
                      >
                        <option value="">{f.key === "parent_id" ? t("— بدون أب (عنصر رئيسي) —") : t("— اختر —")}</option>
                        {(f.type === "ref" ? referenceOptions(f) : (f.options ?? [])).map((o) => (
                          <option key={o.value} value={o.value}>
                            {t(o.label)}
                          </option>
                        ))}
                      </select>
                      {f.type === "ref" && f.refQuickAdd && (
                        <Button type="button" variant="outline" onClick={() => quickAddRef(f)}>
                          <Plus className="size-4" />
                          {t(f.refQuickAdd.label)}
                        </Button>
                      )}
                    </div>
                  ) : f.type === "textarea" ? (
                    <Textarea
                      id={f.key}
                      value={String(form[f.key] ?? "")}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  ) : f.type === "checkbox" ? (
                    <input
                      id={f.key}
                      type="checkbox"
                      className="size-5 align-middle"
                      checked={!!form[f.key]}
                      disabled={f.disabled || (f.lockOnEdit && !!editing)}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                    />
                  ) : f.type === "barcode" ? (
                    <div className="flex gap-2">
                      <Input
                        id={f.key}
                        dir="ltr"
                        placeholder="امسح أو اكتب الباركود"
                        value={String(form[f.key] ?? "")}
                        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      />
                      <BarcodeScanner onScan={(c) => setForm((p) => ({ ...p, [f.key]: c }))} />
                      <Button type="button" variant="outline" size="sm" onClick={() => setForm((p) => ({ ...p, [f.key]: generateEan13() }))}>توليد</Button>
                    </div>
                  ) : (
                    <Input
                      id={f.key}
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      step="any"
                      required={f.required}
                      value={String(form[f.key] ?? "")}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            <DialogFooter className="gap-2 md:col-span-2 lg:col-span-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("إلغاء")}
              </Button>
              {editing && (
                <Button type="button" variant="secondary" disabled={saveMutation.isPending} onClick={(e) => { afterSave.current = "stay"; e.currentTarget.form?.requestSubmit(); }}>
                  {t("حفظ")}
                </Button>
              )}
              <Button type="button" variant="secondary" disabled={saveMutation.isPending} onClick={(e) => { afterSave.current = "new"; e.currentTarget.form?.requestSubmit(); }}>
                {t("حفظ وجديد")}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} onClick={() => { afterSave.current = "close"; }}>
                {t("حفظ وإغلاق")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("تأكيد الحذف")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t("إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && deleteMutation.mutate(toDelete)}>
              {t("حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
