import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtNum, today } from "@/lib/format";
import { AlertTriangle, Download, Pencil, Printer, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { printDocument } from "@/lib/print";
import { exportCsv } from "@/lib/export";
import { buildRows, inCategories, totals } from "@/lib/stocktake-report";
import { linkedAccounts, post2 } from "@/lib/auto-entries";
import { useBaseCurrency } from "@/lib/currencies";
import { BarcodeInput, findByCode } from "@/components/BarcodeInput";

export const Route = createFileRoute("/_authenticated/stocktake")({
  head: () => ({ meta: [{ title: "الجرد وتنبيهات النقص" }, { name: "description", content: "جرد المستودعات وتسوية الفروقات" }] }),
  component: StocktakePage,
});

const ST_REASONS = ["جرد دوري", "جرد سنوي", "جرد مفاجئ", "تسليم واستلام", "تسوية استثنائية", "أخرى"];
/** Stocktake header notes: first line "السبب: X", the rest is the free note. */
const packNotes = (reason: string, note: string) => `السبب: ${reason}${note.trim() ? "\n" + note.trim() : ""}`;
const unpackNotes = (n: string | null | undefined) => {
  const s = n ?? ""; const m = s.match(/^السبب: (.*)(?:\n([\s\S]*))?$/);
  return m ? { reason: m[1], note: m[2] ?? "" } : { reason: "", note: s === "جرد مخزني وتسوية فروقات" ? "" : s };
};
const REASONS = ["تسوية خطأ إدخال", "تلف", "كسر", "انتهاء صلاحية", "هدر", "سرقة", "أخرى"];


function StocktakePage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const baseCur = useBaseCurrency();
  const [mode, setMode] = useState<"report" | "count">("report");
  const [whs, setWhs] = useState<string[]>([]);
  const [wh, setWh] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [withValue, setWithValue] = useState(false);
  const [hideZero, setHideZero] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [stReason, setStReason] = useState<string>(ST_REASONS[0]!);
  const [stNotes, setStNotes] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [acc, setAcc] = useState<{ inv?: string; short?: string; surplus?: string }>({});

  const base = useQuery({
    queryKey: ["stocktake", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [p, w, m, a] = await Promise.all([
        scope(db.from("products").select("id,sku,barcode,name,unit,qty_on_hand,reorder_level,avg_cost,is_group,parent_id,item_type"), me?.tenantId).eq("is_active", true).order("name"),
        scope(db.from("warehouses").select("id,name").eq("is_group", false), me?.tenantId).order("name"),
        scope(db.from("stock_moves").select("product_id,warehouse_id,direction,qty"), me?.tenantId).range(0, 199999),
        scope(db.from("accounts").select("id,code,name,is_group"), me?.tenantId).eq("is_group", false).order("code"),
      ]);
      const bal: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m.data ?? []).forEach((x: any) => { const k = `${x.warehouse_id}|${x.product_id}`; bal[k] = (bal[k] ?? 0) + (x.direction === "in" ? 1 : -1) * Number(x.qty); });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = ((p.data ?? []) as any[]).filter((x) => x.item_type !== "service");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { all, products: all.filter((x) => !x.is_group), groups: all.filter((x) => x.is_group), warehouses: (w.data ?? []) as any[], accounts: (a.data ?? []) as any[], bal };
    },
  });
  const linked = useQuery({ queryKey: ["stocktake-accs", me?.tenantId], enabled: !!me?.tenantId, queryFn: () => linkedAccounts(me!.tenantId!) });
  const invAcc = acc.inv ?? linked.data?.inventory_account_id ?? "";
  const shortAcc = acc.short ?? linked.data?.stock_shortage_account_id ?? "";
  const surplusAcc = acc.surplus ?? linked.data?.stock_surplus_account_id ?? "";

  const products = base.data?.products ?? [];
  const low = products.filter((p) => Number(p.reorder_level) > 0 && Number(p.qty_on_hand) <= Number(p.reorder_level));
  const allWh = (base.data?.warehouses ?? []).map((w) => w.id as string);
  const activeWh = mode === "count" ? (wh ? [wh] : []) : (whs.length ? whs : allWh);
  const pById = new Map(products.map((p) => [p.id, p]));
  const filtered = inCategories(base.data?.all ?? [], cats);
  const rows = buildRows(filtered, activeWh, base.data?.bal ?? {}, counts, mode === "count", hideZero);
  const tot = totals(rows);
  const whName = (id: string) => base.data?.warehouses.find((w) => w.id === id)?.name ?? "";
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!wh) throw new Error("اختر المستودع");
      const diffs = rows.filter((r) => r.diffQty !== null && Math.abs(r.diffQty) > 1e-9);
      if (!diffs.length) throw new Error("لا توجد فروقات للتسوية");
      const val0 = (d: "in" | "out") => Math.round(diffs.filter((r) => (r.diffQty! > 0 ? "in" : "out") === d).reduce((t, r) => t + Math.abs(r.diffQty!) * r.cost, 0) * 100) / 100;
      if ((val0("out") > 0 || val0("in") > 0) && (!invAcc || (val0("out") > 0 && !shortAcc) || (val0("in") > 0 && !surplusAcc)))
        throw new Error("حدد حساب المخزون وحساب عجز الجرد وحساب زيادة الجرد");
      const cur = baseCur ?? "USD";
      // 1) the stocktake document (numbered by the server) with every counted line
      const notes = packNotes(stReason ?? "", stNotes);
      const { data: doc, error: de } = editId
        ? await db.from("documents").update({ doc_date: date, warehouse_id: wh, notes }).eq("id", editId).select("id,doc_no").single()
        : await db.from("documents").insert({ tenant_id: me!.tenantId, doc_type: "stocktake", doc_date: date, currency: cur, exchange_rate: 1, warehouse_id: wh, amount: 0, notes }).select("id,doc_no").single();
      if (de) throw de;
      if (editId) { const { error } = await db.from("document_lines").delete().eq("document_id", doc.id); if (error) throw error; }
      const counted = rows.filter((r) => r.actualQty !== null && (Math.abs(r.diffQty ?? 0) > 1e-9 || (r.actualQty ?? 0) > 0));
      const lines = counted.map((r) => ({ tenant_id: me!.tenantId, document_id: doc.id, product_id: r.id, warehouse_id: wh, qty: Math.abs(r.diffQty ?? 0) > 1e-9 ? Math.abs(r.diffQty!) : r.actualQty!, unit_price: Math.max(0, r.cost),
        description: JSON.stringify({ book: r.bookQty, actual: r.actualQty, diff: r.diffQty, reason: r.diffQty ? (reasons[r.id] || "تسوية خطأ إدخال") : "" }) }));
      if (lines.length) { const { error } = await db.from("document_lines").insert(lines); if (error) throw error; }
      const voucher = `جرد مخزني رقم ${doc.doc_no}`;
      const moves = diffs.map((r) => {
        const reason = reasons[r.id] || "تسوية خطأ إدخال";
        return { reason, tenant_id: me!.tenantId, product_id: r.id, warehouse_id: wh, move_date: date, direction: r.diffQty! > 0 ? "in" : "out", qty: Math.abs(r.diffQty!), unit_cost: r.cost, document_id: doc.id, reference: `${voucher} - ${reason}` };
      });
      const short = val0("out"), surplus = val0("in");
      for (const mv of moves.sort((a, b) => (a.direction === "in" ? -1 : 1) - (b.direction === "in" ? -1 : 1))) {
        const { reason: _r, ...row } = mv;
        const { error } = await db.from("stock_moves").insert(row);
        if (error) throw error;
      }
      const entries: string[] = [];
      for (const r of [...new Set(moves.map((m) => m.reason))]) {
        const sum = (d: string) => Math.round(moves.filter((m) => m.reason === r && m.direction === d).reduce((t, m) => t + m.qty * m.unit_cost, 0) * 100) / 100;
        const sh = sum("out"), su = sum("in");
        if (sh > 0) entries.push(await post2(me!.tenantId!, me?.userId, date, `${voucher} - عجز (${r})`, cur, 1, shortAcc, invAcc, sh));
        if (su > 0) entries.push(await post2(me!.tenantId!, me?.userId, date, `${voucher} - زيادة (${r})`, cur, 1, invAcc, surplusAcc, su));
      }
      const { error: fe } = await db.rpc("finalize_stocktake" as never, { _id: doc.id, _entries: entries } as never);
      if (fe) throw fe;
      await printStocktake(doc.id);
      return moves.length;
    },
    onSuccess: (n) => {
      toast.success(`تمت تسوية ${n} مادة`);
      setCounts({}); setReasons({}); setEditId(null); setStNotes("");
      qc.invalidateQueries({ queryKey: ["stocktake"] });
      qc.invalidateQueries({ queryKey: ["stocktake-docs"] });
      qc.invalidateQueries({ queryKey: ["stock_moves"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = () => {
    const c = ["المادة", "الوحدة"];
    if (mode === "report" && activeWh.length > 1) activeWh.forEach((w) => c.push(whName(w)));
    c.push("الكمية الدفترية");
    if (mode === "count") c.push("الكمية الفعلية", "الفرق");
    if (withValue) { c.push("التكلفة", "القيمة الدفترية"); if (mode === "count") c.push("القيمة الفعلية", "قيمة الفرق"); }
    return c;
  };
  const cells = (r: (typeof rows)[number]) => {
    const p = pById.get(r.id)!;
    const c: (string | number)[] = [`${p.sku ?? ""} - ${p.name}`, p.unit ?? ""];
    if (mode === "report" && activeWh.length > 1) activeWh.forEach((w) => c.push(fmtNum(r.book[w] ?? 0)));
    c.push(fmtNum(r.bookQty));
    if (mode === "count") c.push(r.actualQty === null ? "—" : fmtNum(r.actualQty), r.diffQty === null ? "—" : fmtNum(r.diffQty));
    if (withValue) { c.push(fmtNum(r.cost), fmtNum(r.bookValue)); if (mode === "count") c.push(r.actualValue === null ? "—" : fmtNum(r.actualValue), r.diffValue === null ? "—" : fmtNum(r.diffValue)); }
    return c;
  };
  const footer = (): [string, string][] => withValue ? [["إجمالي القيمة الدفترية", fmtNum(tot.book)], ...(mode === "count" ? [["إجمالي القيمة الفعلية", fmtNum(tot.actual)], ["صافي الفروقات", fmtNum(tot.diff)]] as [string, string][] : [])] : [];
  const printReport = () => printDocument({
    title: mode === "count" ? "تقرير الجرد الفعلي" : "تقرير الجرد المخزني",
    meta: [["التاريخ", date], ["المستودعات", activeWh.map(whName).join("، ") || "—"], ["التصنيفات", cats.length ? cats.map((id) => base.data?.groups.find((g) => g.id === id)?.name).join("، ") : "جميع التصنيفات"]],
    columns: columns(), rows: rows.map(cells), footer: footer(),
  });
  const csv = () => { const cols = columns(); exportCsv("stocktake", cols.map((l, i) => ({ key: String(i), label: l })), rows.map((r) => Object.fromEntries(cells(r).map((v, i) => [String(i), v])))); };
  const sel = "h-9 rounded-md border bg-background px-2 text-sm";
  const accSel = (label: string, v: string, k: "inv" | "short" | "surplus") => (
    <label className="flex flex-col gap-1 text-xs">{label}
      <select className={sel} value={v} onChange={(e) => setAcc({ ...acc, [k]: e.target.value })}>
        <option value="">— اختر الحساب —</option>
        {(base.data?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
      </select></label>
  );

  return (
    <div>
      <PageHeader title="تنبيهات نقص المخزون" subtitle="المواد التي وصل رصيدها إلى حد إعادة الطلب أو أقل" />
      <div className="mb-8 rounded-lg border bg-card p-4">
        {!low.length ? <p className="text-sm text-muted-foreground">لا توجد مواد ناقصة</p> : (
          <ul className="divide-y text-sm">
            {low.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1.5">
                <AlertTriangle className="size-4 text-destructive" />
                <span className="me-auto">{p.sku} - {p.name}</span>
                <span className="num">الرصيد {fmtNum(p.qty_on_hand)} {p.unit} / الحد {fmtNum(p.reorder_level)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PageHeader title="الجرد المخزني" subtitle="تقرير أرصدة لمستودع أو أكثر، أو جرد فعلي لمستودع واحد مع تسوية الفروقات" />
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={mode === "report" ? "default" : "outline"} size="sm" onClick={() => { setMode("report"); setCounts({}); }}>بدون كميات فعلية</Button>
          <Button variant={mode === "count" ? "default" : "outline"} size="sm" onClick={() => setMode("count")}>جرد فعلي (مستودع واحد)</Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          <label className="flex items-center gap-2 text-sm"><Switch checked={withValue} onCheckedChange={setWithValue} />مع القيمة</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={hideZero} onCheckedChange={setHideZero} />بدون المواد الصفرية</label>
          <Button variant="outline" size="sm" className="ms-auto" onClick={printReport}><Printer className="size-4" />طباعة</Button>
          <Button variant="outline" size="sm" onClick={csv}><Download className="size-4" />تصدير</Button>
        </div>

        <div>
          <div className="mb-1 text-xs text-muted-foreground">{mode === "count" ? "المستودع" : "المستودعات (بدون تحديد = جميع المستودعات)"}</div>
          {mode === "count" ? (
            <select className={sel} value={wh} onChange={(e) => { setWh(e.target.value); setCounts({}); }}>
              <option value="">— اختر المستودع —</option>
              {(base.data?.warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(base.data?.warehouses ?? []).map((w) => (
                <button key={w.id} type="button" onClick={() => toggle(whs, setWhs, w.id)} className={`rounded-full border px-3 py-1 text-xs ${whs.includes(w.id) ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{w.name}</button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs text-muted-foreground">التصنيفات (بدون تحديد = جميع التصنيفات)</div>
          <div className="flex flex-wrap gap-1.5">
            {(base.data?.groups ?? []).map((g) => (
              <button key={g.id} type="button" onClick={() => toggle(cats, setCats, g.id)} className={`rounded-full border px-3 py-1 text-xs ${cats.includes(g.id) ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{g.name}</button>
            ))}
            {!base.data?.groups.length && <span className="text-xs text-muted-foreground">لا توجد تصنيفات</span>}
          </div>
        </div>

        {mode === "count" && (
          <div className="grid gap-2 rounded-md border bg-muted/40 p-3 sm:grid-cols-3">
            {accSel("حساب المخزون", invAcc, "inv")}
            {accSel("حساب عجز الجرد (الخسائر)", shortAcc, "short")}
            {accSel("حساب زيادة الجرد (الأرباح)", surplusAcc, "surplus")}
            <label className="flex flex-col gap-1 text-xs">سبب الجرد
              <select className={sel} value={stReason} onChange={(e) => setStReason(e.target.value)}>{ST_REASONS.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">ملاحظات الجرد
              <Textarea rows={4} value={stNotes} onChange={(e) => setStNotes(e.target.value)} placeholder="اكتب ملاحظات الجرد..." /></label>
            {editId && <p className="text-xs text-primary sm:col-span-3">أنت تعدّل جرداً سابقاً — سيُعاد توليد القيود والفروقات عند الاعتماد. <button type="button" className="underline" onClick={() => { setEditId(null); setCounts({}); setReasons({}); setStNotes(""); }}>إلغاء التعديل</button></p>}
            {can(me, "stock", "create") && <Button className="sm:col-span-3" onClick={() => save.mutate()} disabled={!wh || save.isPending}>{editId ? "حفظ التعديل وإعادة التسوية" : "اعتماد الجرد وتسوية الفروقات"}</Button>}
          </div>
        )}

        {mode === "count" && wh && (
          <BarcodeInput onCode={(code) => {
            const p = findByCode(products, code);
            if (!p) { toast.error("لا توجد مادة بهذا الباركود: " + code); return; }
            setCounts((c) => ({ ...c, [p.id]: String(Number(c[p.id] || 0) + 1) }));
            toast.success(p.name + " +1");
          }} />
        )}

        {(mode === "report" || wh) && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary"><tr>
                {columns().map((c) => <th key={c} className="p-2 text-right">{c}</th>)}
                {mode === "count" && <th className="p-2 text-right">سبب الفرق</th>}
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const p = pById.get(r.id)!;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{p.sku} - {p.name}</td>
                      <td className="p-2 text-xs text-muted-foreground">{p.unit}</td>
                      {mode === "report" && activeWh.length > 1 && activeWh.map((w) => <td key={w} className="num p-2">{fmtNum(r.book[w] ?? 0)}</td>)}
                      <td className="num p-2 font-medium">{fmtNum(r.bookQty)}</td>
                      {mode === "count" && <>
                        <td className="p-2"><Input type="number" className="h-8 w-28" value={counts[r.id] ?? ""} onChange={(e) => setCounts({ ...counts, [r.id]: e.target.value })} /></td>
                        <td className={`num p-2 ${r.diffQty && r.diffQty < 0 ? "text-destructive" : ""}`}>{r.diffQty === null ? "—" : fmtNum(r.diffQty)}</td>
                      </>}
                      {withValue && <>
                        <td className="num p-2">{fmtNum(r.cost)}</td>
                        <td className="num p-2">{fmtNum(r.bookValue)}</td>
                        {mode === "count" && <>
                          <td className="num p-2">{r.actualValue === null ? "—" : fmtNum(r.actualValue)}</td>
                          <td className={`num p-2 ${r.diffValue && r.diffValue < 0 ? "text-destructive" : ""}`}>{r.diffValue === null ? "—" : fmtNum(r.diffValue)}</td>
                        </>}
                      </>}
                      {mode === "count" && <td className="p-2">{r.diffQty ? (
                        <select className="h-8 rounded-md border bg-background px-1 text-xs" value={reasons[r.id] ?? "تسوية خطأ إدخال"} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}>
                          {REASONS.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      ) : null}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {withValue && (
              <div className="mt-3 flex flex-wrap gap-4 rounded-md bg-secondary p-3 text-sm font-semibold">
                {footer().map(([k, v]) => <span key={k}>{k}: <span className="num">{v}</span> {baseCur}</span>)}
              </div>
            )}
            {!rows.length && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد مواد</p>}
          </div>
        )}
      </div>
      <StocktakeHistory tenantId={me?.tenantId} whName={whName} canEdit={can(me, "stock", "edit")} canDelete={can(me, "stock", "delete")} onEdit={async (id) => {
        try {
          const { data: d, error } = await db.from("documents").select("doc_date,warehouse_id,notes,status,document_lines(product_id,description)").eq("id", id).single();
          if (error) throw error;
          if (d.status === "posted") { const { error: ue } = await db.rpc("unpost_document", { _id: id }); if (ue) throw ue; }
          const c: Record<string, string> = {}, rs: Record<string, string> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((d as any).document_lines ?? []).forEach((l: any) => { try { const i = JSON.parse(l.description ?? "{}"); c[l.product_id] = String(i.actual ?? 0); if (i.reason) rs[l.product_id] = i.reason; } catch { /* ignore */ } });
          const n = unpackNotes(d.notes);
          setMode("count"); setWh(d.warehouse_id ?? ""); setDate(d.doc_date); setCounts(c); setReasons(rs);
          setStReason(n.reason || ST_REASONS[0]!); setStNotes(n.note); setEditId(id);
          qc.invalidateQueries({ queryKey: ["stocktake"] }); qc.invalidateQueries({ queryKey: ["stocktake-docs"] });
          toast.success("تم فتح الجرد للتعديل — عدّل الكميات ثم اعتمد");
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e) { toast.error((e as Error).message); }
      }} />
    </div>
  );
}

/** Prints a saved stocktake document from its stored lines (book/actual/diff/reason). */
async function printStocktake(id: string) {
  const { data: d } = await db.from("documents").select("doc_no,doc_date,notes,warehouses:warehouse_id(name),document_lines(qty,unit_price,description,products(sku,name,unit))").eq("id", id).single();
  if (!d) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ls = ((d as any).document_lines ?? []).map((l: any) => ({ ...l, info: (() => { try { return JSON.parse(l.description ?? "{}"); } catch { return {}; } })() }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (f: (x: any) => boolean) => ls.filter(f).reduce((t: number, l: any) => t + Math.abs(Number(l.info.diff) || 0) * Number(l.unit_price), 0);
  await printDocument({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    title: `جرد مخزني رقم ${d.doc_no}`, meta: [["رقم الجرد", String(d.doc_no)], ["التاريخ", d.doc_date], ["المستودع", (d as any).warehouses?.name ?? ""], ["سبب الجرد", unpackNotes(d.notes).reason || "—"], ["ملاحظات", unpackNotes(d.notes).note || "—"]],
    columns: ["المادة", "الوحدة", "الدفترية", "الفعلية", "الفرق", "التكلفة", "قيمة الفرق", "السبب"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: ls.map((l: any) => [`${l.products?.sku ?? ""} - ${l.products?.name ?? ""}`, l.products?.unit ?? "", fmtNum(l.info.book ?? 0), fmtNum(l.info.actual ?? 0), fmtNum(l.info.diff ?? 0), fmtNum(l.unit_price), fmtNum((Number(l.info.diff) || 0) * Number(l.unit_price)), l.info.reason ?? ""]),
    footer: [["إجمالي العجز", fmtNum(v((l) => Number(l.info.diff) < 0))], ["إجمالي الزيادة", fmtNum(v((l) => Number(l.info.diff) > 0))]],
    signatures: ["أمين المستودع", "المحاسب"],
  });
}

function StocktakeHistory({ tenantId, whName, onEdit, canEdit, canDelete }: { tenantId: string | null | undefined; whName: (id: string) => string; onEdit: (id: string) => void; canEdit: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (d: { id: string; status: string }) => {
      if (d.status === "posted") { const { error } = await db.rpc("unpost_document", { _id: d.id }); if (error) throw error; }
      const { error: le } = await db.from("document_lines").delete().eq("document_id", d.id); if (le) throw le;
      const { error } = await db.from("documents").delete().eq("id", d.id); if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حذف الجرد وعكس قيوده وفروقاته"); ["stocktake", "stocktake-docs", "stock_moves", "products"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e: Error) => toast.error(e.message),
  });
  const list = useQuery({
    queryKey: ["stocktake-docs", tenantId], enabled: !!tenantId,
    queryFn: async (): Promise<{ id: string; doc_no: number; doc_date: string; warehouse_id: string | null; status: string; notes: string | null }[]> => ((await scope(db.from("documents").select("id,doc_no,doc_date,warehouse_id,status,notes,created_at"), tenantId).eq("doc_type", "stocktake").order("doc_no", { ascending: false }).limit(200)).data ?? []) as never,
  });
  return (
    <div className="mt-8">
      <PageHeader title="سجل الجرودات السابقة" subtitle="كل جرد معتمد محفوظ كمستند «جرد مخزني» برقم تسلسلي" />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary"><tr><th className="p-2 text-right">الرقم</th><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">المستودع</th><th className="p-2 text-right">السبب</th><th className="p-2 text-right">ملاحظات</th><th className="p-2 text-right">الحالة</th><th className="p-2" /></tr></thead>
          <tbody>
            {(list.data ?? []).map((d) => (
              <tr key={d.id} className="border-t">
                <td className="num p-2 font-medium">{d.doc_no}</td>
                <td className="p-2">{d.doc_date}</td>
                <td className="p-2">{whName(d.warehouse_id ?? "")}</td>
                <td className="p-2">{unpackNotes(d.notes).reason || "—"}</td>
                <td className="max-w-xs truncate p-2 text-xs text-muted-foreground" title={unpackNotes(d.notes).note}>{unpackNotes(d.notes).note || "—"}</td>
                <td className="p-2">{d.status === "posted" ? "معتمد" : "غير مكتمل"}</td>
                <td className="flex justify-end gap-1 p-2">
                  <Button variant="outline" size="sm" onClick={() => printStocktake(d.id)}><Printer className="size-4" />طباعة</Button>
                  {canEdit && <Button variant="outline" size="sm" onClick={() => onEdit(d.id)}><Pencil className="size-4" />تعديل</Button>}
                  {canDelete && <Button variant="outline" size="sm" disabled={del.isPending} onClick={() => { if (confirm(`حذف الجرد رقم ${d.doc_no}؟ سيتم عكس قيوده وفروقات المستودع.`)) del.mutate(d); }}><Trash2 className="size-4 text-destructive" />حذف</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.length && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد جرودات محفوظة بعد</p>}
      </div>
    </div>
  );
}
