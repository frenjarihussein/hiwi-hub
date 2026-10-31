import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { BulkTreeEditor } from "@/components/BulkTreeEditor";
import { categoryPath } from "@/lib/category-path";
import { can, useMe } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, Folder, FolderOpen, FileText, Minus, Pencil, Plus, RefreshCw, ScrollText, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { requestCrudEdit, requestCrudNew, suggestCode, suggestFreeCode, useCodingConfig, leafLenFor } from "@/lib/coding";
import { searchTree, treeAncestors } from "@/lib/tree-search";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; parent_id: string | null; is_group: boolean; name: string; [k: string]: any };

export type EntityTreeProps = {
  table: "accounts" | "products" | "projects" | "warehouses" | "partners" | "cost_centers";
  module: string;
  rowFilter?: { key: string; values: string[] };
  title: string;
  codeField?: string;
  extraSelect?: string;
  /** Build extra insert values; return null to cancel. */
  buildInsert?: (parent: Row | null, code: string) => Record<string, unknown> | null;
  usageCheck?: { table: string; column: string; message: string };
  /** Show and create only group rows (categories); leaf items are managed elsewhere. */
  groupsOnly?: boolean;
  /** Hide the edit button on category (group) rows. */
  noGroupEdit?: boolean;
  /** Tall tree panel that fills the screen, shown open by default. */
  large?: boolean;
};

export function EntityTree({ table, module, title, codeField = "code", extraSelect = "", buildInsert, usageCheck, groupsOnly, noGroupEdit, large, rowFilter }: EntityTreeProps) {
  const { data: me } = useMe();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const tree = useRef<HTMLUListElement>(null);
  const coding = useCodingConfig();
  const standard = coding.enabled;
  const leafLen = leafLenFor(coding, table);
  const [visible, setVisible] = useState(!!large);
  const list = useQuery({
    queryKey: [`${table}_tree`, me?.tenantId, groupsOnly ?? false, rowFilter?.values.join(",")],
    enabled: !!me,
    queryFn: async () => {
      const sel = `id,name,name_en,parent_id,is_group,${codeField}${extraSelect ? "," + extraSelect : ""}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = scope((db.from(table) as any).select(sel), me?.tenantId);
      if (rowFilter) q = q.in(rowFilter.key, rowFilter.values);
      if (groupsOnly) q = q.eq("is_group", true);
      const { data, error } = await q.order(codeField);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const children = useMemo(() => {
    const m: Record<string, Row[]> = {};
    const ids = new Set((list.data ?? []).map((a) => a.id));
    (list.data ?? []).forEach((a) => {
      const k = a.parent_id && ids.has(a.parent_id) ? a.parent_id : "root";
      (m[k] ??= []).push(a);
    });
    return m;
  }, [list.data]);
  const matches = useMemo(() => searchTree(list.data ?? [], search, codeField), [list.data, search, codeField]);
  function reveal(id: string) {
    setVisible(true);
    setOpen((previous) => ({ ...previous, ...Object.fromEntries(treeAncestors(list.data ?? [], id).map((parent) => [parent, true])) }));
    setSelected(id);
  }
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() => {
      const row = Array.from(tree.current?.querySelectorAll<HTMLElement>("[data-tree-id]") ?? []).find((element) => element.dataset['treeId'] === selected);
      row?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, open]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [`${table}_tree`] });
    qc.invalidateQueries({ queryKey: [table] });
    qc.invalidateQueries({ queryKey: ["crud", table] });
    qc.invalidateQueries({ queryKey: ["refs"] });
  };
  const [dlg, setDlg] = useState<{ id?: string; parent: string; code: string; name: string } | null>(null);
  const addGroup = useMutation({
    mutationFn: async () => {
      if (!dlg?.name.trim()) throw new Error("أدخل اسم التصنيف");
      if (!me?.tenantId) throw new Error("اختر شركة أولاً");
      if (dlg.id) {
        if (dlg.parent === dlg.id) throw new Error("لا يمكن أن يكون التصنيف أباً لنفسه");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (db.from(table) as any).update({ name: dlg.name.trim(), [codeField]: dlg.code || null, parent_id: dlg.parent || null }).eq("id", dlg.id);
        if (error) throw error;
        return;
      }
      const parent = (list.data ?? []).find((r) => r.id === dlg.parent) ?? null;
      const autoCode = standard ? suggestCode(parent?.[codeField], (list.data ?? []).filter((r) => (r.parent_id ?? "") === (parent?.id ?? "")).map((r) => r[codeField]), true, leafLen) : suggestFreeCode(parent?.[codeField], (list.data ?? []).filter((r) => (r.parent_id ?? "") === (parent?.id ?? "")).map((r) => r[codeField]), (list.data ?? []).map((r) => r[codeField]));
      if (!dlg.code && autoCode) dlg.code = autoCode;
      const extra = buildInsert ? buildInsert(parent, dlg.code || `CAT-${Date.now()}`) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from(table) as any).insert({
        tenant_id: me.tenantId, [codeField]: dlg.code || `CAT-${Date.now()}`, name: dlg.name.trim(), parent_id: parent?.id ?? null, is_group: true, ...(extra ?? {}),
      });
      if (error) throw error;
      if (parent) setOpen((o) => ({ ...o, [parent.id]: true }));
    },
    onSuccess: () => { toast.success(dlg?.id ? "تم تعديل التصنيف" : "تمت إضافة التصنيف"); setDlg(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: async (parent: Row | null) => {
      if (groupsOnly) { setDlg({ parent: parent?.id ?? "", code: "", name: "" }); return false; }
      const sib = children[parent?.id ?? "root"] ?? [];
      const pc = parent?.[codeField] ?? "";
      const sibCodes = sib.map((r) => r[codeField]);
      const suggested = standard ? suggestCode(pc, sibCodes, false, leafLen) : suggestFreeCode(pc, sibCodes, (list.data ?? []).map((r) => r[codeField]));
      // Prefer the full card form of the page when one is present.
      if (requestCrudNew(table, { parent_id: parent?.id ?? "", [codeField]: suggested, is_group: false, ...(buildInsert?.(parent, suggested) ?? {}) })) return false;
      const code = window.prompt("الرمز", suggested);
      if (code === null) return false;
      const name = window.prompt("الاسم");
      if (!name) return false;
      const extra = buildInsert ? buildInsert(parent, code) : {};
      if (extra === null) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from(table) as any).insert({
        tenant_id: me?.tenantId, [codeField]: code || null, name, parent_id: parent?.id ?? null, is_group: false, ...extra,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (parent && !parent.is_group) await (db.from(table) as any).update({ is_group: true }).eq("id", parent.id);
      if (parent) setOpen((o) => ({ ...o, [parent.id]: true }));
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تمت الإضافة"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });
  const rename = useMutation({
    mutationFn: async (a: Row) => {
      const name = window.prompt("الاسم", a.name);
      if (!name || name === a.name) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from(table) as any).update({ name }).eq("id", a.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تم التعديل"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (a: Row) => {
      if (children[a.id]?.length) throw new Error("لا يمكن حذف عنصر له فروع");
      if (!window.confirm(`حذف ${a.name}؟`)) return false;
      if (usageCheck) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (db.from(usageCheck.table) as any).select("id", { count: "exact", head: true }).eq(usageCheck.column, a.id);
        if (count) throw new Error(usageCheck.message);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from(table) as any).delete().eq("id", a.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تم الحذف"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });

  const canC = can(me, module, "create");
  const canE = can(me, module, "edit");
  const canD = can(me, module, "delete");

  const setAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    (list.data ?? []).forEach((a) => { next[a.id] = v; });
    setOpen(next);
  };

  function Node({ a, depth, last }: { a: Row; depth: number; last: boolean }) {
    const kids = children[a.id] ?? [];
    const isOpen = open[a.id] ?? false;
    const isFolder = kids.length > 0 || a.is_group;
    return (
      <li className="relative ps-5">
        {/* tree connectors */}
        <span className="pointer-events-none absolute start-1.5 top-0 border-s border-muted-foreground/40" style={{ height: last ? "1rem" : "100%" }} />
        <span className="pointer-events-none absolute start-1.5 top-4 w-3 border-t border-muted-foreground/40" />
        <div data-tree-id={a.id} className={`group flex items-center gap-1 rounded px-1 py-1 hover:bg-muted ${isFolder ? "border-s-4 border-primary bg-primary/5" : ""} ${selected === a.id ? "bg-accent ring-1 ring-primary" : ""}`}>
          <button type="button" className="flex size-4 items-center justify-center rounded-sm border bg-background text-muted-foreground disabled:border-transparent" onClick={() => setOpen({ ...open, [a.id]: !isOpen })} disabled={!kids.length}>
            {kids.length ? (isOpen ? <Minus className="size-3" /> : <Plus className="size-3" />) : null}
          </button>
          {isFolder ? (isOpen && kids.length ? <FolderOpen className="size-5 text-primary" /> : <Folder className="size-5 text-primary" />) : <FileText className="size-4 text-muted-foreground" />}
          {a[codeField] && <span className={`num text-xs ${isFolder ? "font-bold text-primary" : "text-muted-foreground"}`}>{a[codeField]}</span>}
          <span className={isFolder ? "text-[1.05rem] font-bold text-primary" : "text-sm"}>{lang === "en" && a["name_en"] ? a["name_en"] : a.name}</span>
          {(table === "accounts" || table === "partners") && !isFolder && (a["currency"] ? <span className="rounded border px-1 text-[10px] text-muted-foreground">{a["currency"]}</span> : table === "partners" && <span className="rounded border border-primary/40 bg-primary/10 px-1 text-[10px] text-primary">🌐 متعدد</span>)}
          <span className="order-first me-1 flex shrink-0 gap-0.5 opacity-50 group-hover:opacity-100">
            {canC && a.is_group && <Button size="icon" variant="ghost" className="size-7" title={groupsOnly ? "إضافة تصنيف فرعي" : "إضافة فرع"} onClick={() => add.mutate(a)}><Plus className="size-4" /></Button>}
            {table === "accounts" && !a.is_group && <Button asChild size="icon" variant="ghost" className="size-7" title="كشف حساب"><Link to="/ledgers" search={{ tab: "account", id: a.id }}><ScrollText className="size-4" /></Link></Button>}
            {table === "products" && !a.is_group && <Button asChild size="icon" variant="ghost" className="size-7" title="أستاذ المادة"><Link to="/ledgers" search={{ tab: "product", id: a.id }}><ScrollText className="size-4" /></Link></Button>}
            {canC && !groupsOnly && a.is_group && <Button size="icon" variant="ghost" className="size-7" title="إضافة حساب تجميعي فرعي" onClick={() => { if (!requestCrudNew(table, { parent_id: a.id, is_group: true })) setDlg({ parent: a.id, code: "", name: "" }); }}><Folder className="size-4" /></Button>}
            {canE && !(a.is_group && noGroupEdit) && <Button size="icon" variant="ghost" className="size-7" title={a.is_group ? "تعديل التصنيف" : "تعديل البطاقة"} onClick={() => { if (requestCrudEdit(table, a.id)) return; if (a.is_group) { setDlg({ id: a.id, parent: a.parent_id ?? "", code: a[codeField] ?? "", name: a.name }); return; } rename.mutate(a); }}><Pencil className="size-4" /></Button>}
            {canD && <Button size="icon" variant="ghost" className="size-7 text-destructive" title="حذف" onClick={() => remove.mutate(a)}><Trash2 className="size-4" /></Button>}
          </span>
        </div>
        {isOpen && kids.length > 0 && (
          <ul>
            {kids.map((k, i) => <Node key={k.id} a={k} depth={depth + 1} last={i === kids.length - 1} />)}
          </ul>
        )}
      </li>
    );
  }

  const roots = children["root"] ?? [];
  return (
    <div className="mb-8 border-y py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{visible ? "إخفاء الشجرة" : "إظهار الشجرة"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { refresh(); void list.refetch(); }} disabled={list.isFetching}><RefreshCw className={`size-4 ${list.isFetching ? "animate-spin" : ""}`} />تحديث الشجرة</Button>
          {(() => { const allOpen = (list.data ?? []).some((a) => children[a.id]?.length) && (list.data ?? []).every((a) => !children[a.id]?.length || open[a.id]); return (
            <Button size="sm" variant="secondary" onClick={() => { setVisible(true); setAll(!allOpen); }}>{allOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}{allOpen ? "طي الشجرة" : "فتح الشجرة بالكامل"}</Button>
          ); })()}
          {canC && !groupsOnly && <BulkTreeEditor table={table} codeField={codeField} extra={buildInsert?.(null, "") ?? {}} />}
          {canC && <Button size="sm" variant="outline" onClick={() => add.mutate(null)}><Plus className="size-4" />{groupsOnly ? "تصنيف جديد" : "عنصر رئيسي"}</Button>}
        </div>
      </div>
      <div className="mb-3 space-y-2">
        <Input aria-label="بحث الشجرة بالاسم أو الرقم" placeholder="بحث بالاسم أو الرقم" value={search} onChange={(event) => { setSearch(event.target.value); setSelected(null); }} onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) reveal(matches[0].id); }} />
        {search.trim() && <div className="max-h-36 overflow-y-auto border-b pb-2">
          {matches.length ? matches.map((row) => <Button key={row.id} variant="ghost" size="sm" className="flex w-full justify-start" onClick={() => reveal(row.id)}>{row[codeField]} — {lang === "en" && row["name_en"] ? row["name_en"] : row.name}</Button>) : <p className="text-sm text-muted-foreground">لا توجد نتائج</p>}
        </div>}
      </div>
      {visible && (list.isLoading ? <p className="text-sm text-muted-foreground">جارٍ التحميل...</p> : roots.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد عناصر بعد</p>
      ) : (
        <ul ref={tree} className={`${large ? "h-[calc(100vh-16rem)] min-h-[480px]" : "max-h-[480px]"} overflow-y-auto rounded-lg border p-2 text-sm`}>
          {roots.map((a, i) => <Node key={a.id} a={a} depth={0} last={i === roots.length - 1} />)}
        </ul>
      ))}
      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dlg?.id ? "تعديل التصنيف" : groupsOnly ? "إضافة تصنيف" : "إضافة عنصر تجميعي"}</DialogTitle></DialogHeader>
          {dlg && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>التصنيف الأب</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={dlg.parent} onChange={(e) => { const parent = (list.data ?? []).find((r) => r.id === e.target.value); const siblings = (list.data ?? []).filter((r) => r.id !== dlg.id && (r.parent_id ?? "") === e.target.value).map((r) => r[codeField]); const code = standard ? suggestCode(parent?.[codeField], siblings, true, leafLen) : suggestFreeCode(parent?.[codeField], siblings, (list.data ?? []).filter((r) => r.id !== dlg.id).map((r) => r[codeField])); setDlg({ ...dlg, parent: e.target.value, code: code ?? "" }); }}>
                  <option value="">— تصنيف رئيسي (بدون أب) —</option>
                  {(list.data ?? []).filter((r) => r.is_group && r.id !== dlg.id).map((r) => <option key={r.id} value={r.id}>{r[codeField]} - {categoryPath(list.data ?? [], r.id)}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>اسم التصنيف</Label><Input autoFocus value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>{standard ? "الرمز (يُولَّد تلقائياً بالترميز القياسي إن تُرك فارغاً)" : "الرمز (اختياري)"}</Label><Input value={dlg.code} onChange={(e) => setDlg({ ...dlg, code: e.target.value })} /></div>
              <Button onClick={() => addGroup.mutate()} disabled={addGroup.isPending}>حفظ التصنيف</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
