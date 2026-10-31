import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, X, Bot } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe, can } from "@/lib/session";
import { pageHead } from "@/lib/page-head";
import { fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";
import { postEntry } from "@/lib/post-entry";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/ai-drafts")({
  head: () => pageHead("مسودات المساعد الذكي", "مراجعة واعتماد القيود والفواتير والسندات والجهات والأصناف التي جهّزها المساعد."),
  component: AiDraftsPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = { id: string; kind: string; title: string; payload: any; status: string; created_at: string; result_id: string | null };
const KIND: Record<string, { label: string; module: string }> = {
  journal: { label: "قيد يومية", module: "journal" },
  document: { label: "مستند", module: "documents" },
  partner: { label: "زبون / مورد", module: "partners" },
  product: { label: "صنف", module: "products" },
};
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "بانتظار المراجعة", cls: "bg-warning/15 text-warning-foreground" },
  approved: { label: "معتمدة", cls: "bg-status-posted text-status-posted-foreground" },
  rejected: { label: "مرفوضة", cls: "bg-destructive/10 text-destructive" },
};

function AiDraftsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const list = useQuery({
    queryKey: ["ai-drafts", tab],
    enabled: !!me,
    queryFn: async () => {
      let q = db.from("ai_drafts").select("*").order("created_at", { ascending: false }).limit(200);
      if (tab === "pending") q = q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      return data as Draft[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ d, approve }: { d: Draft; approve: boolean }) => {
      let resultId: string | null = null;
      if (approve) resultId = await apply(d, me!.tenantId!, me!.userId);
      const { error } = await db.from("ai_drafts").update({
        status: approve ? "approved" : "rejected", result_id: resultId, decided_by: me!.userId, decided_at: new Date().toISOString(),
      }).eq("id", d.id);
      if (error) throw error;
      return approve;
    },
    onSuccess: (approved, { d }) => {
      toast.success(approved ? (d.kind === "document" ? "تم إنشاء المستند كمسودة، يمكنك ترحيله من صفحة المستندات" : "تم الاعتماد والحفظ") : "تم رفض المسودة");
      qc.invalidateQueries({ queryKey: ["ai-drafts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="مسودات المساعد الذكي" subtitle="ما يجهّزه المساعد لا يدخل الدفاتر إلا بعد اعتمادك هنا." />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={tab === "pending" ? "default" : "outline"} size="sm" onClick={() => setTab("pending")}>بانتظار المراجعة</Button>
        <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")}>الكل</Button>
        <Button asChild variant="ghost" size="sm" className="ms-auto"><Link to="/assistant"><Bot className="size-4" /> اطلب من المساعد</Link></Button>
      </div>
      {list.isLoading && <p className="text-sm text-muted-foreground">جارِ التحميل…</p>}
      {list.data?.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا توجد مسودات. اطلب من المساعد مثلاً: «جهّز فاتورة بيع للزبون أحمد بـ 5 قطع من الصنف X بسعر 10».
        </div>
      )}
      <div className="grid gap-3">
        {list.data?.map((d) => {
          const allowed = can(me, KIND[d.kind]?.module ?? "", "create");
          return (
            <div key={d.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{KIND[d.kind]?.label ?? d.kind}</span>
                <span className="font-medium">{d.title}</span>
                <span className={`ms-auto rounded-full px-2.5 py-0.5 text-xs ${STATUS[d.status]?.cls}`}>{STATUS[d.status]?.label}</span>
              </div>
              <Details d={d} />
              {d.status === "pending" && d.kind === "document" && <DraftWarehouse d={d} />}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{fmtDateTime(d.created_at)}</span>
                {d.status === "pending" && (
                  <div className="ms-auto flex gap-2">
                    <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ d, approve: false })}><X className="size-4" /> رفض</Button>
                    <Button size="sm" disabled={decide.isPending || !allowed} title={allowed ? "" : "لا تملك صلاحية الإنشاء"} onClick={() => decide.mutate({ d, approve: true })}><Check className="size-4" /> اعتماد</Button>
                  </div>
                )}
                {d.status === "approved" && d.kind === "journal" && d.result_id && (
                  <Link className="ms-auto text-primary underline" to="/journal/$entryId" params={{ entryId: d.result_id }}>عرض القيد</Link>
                )}
                {d.status === "approved" && d.kind === "document" && d.result_id && <Link className="ms-auto text-primary underline" to="/documents" search={{ open: d.result_id }}>فتح المستند للتعديل</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Lets the user pick or change the warehouse of a document draft before approving it. */
function DraftWarehouse({ d }: { d: Draft }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const wh = useQuery({
    queryKey: ["draft-warehouses", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => (await db.from("warehouses").select("id,code,name").eq("tenant_id", me!.tenantId).eq("is_group", false).eq("is_active", true).order("name")).data ?? [],
  });
  const p = d.payload ?? {};
  const save = async (key: "warehouse_id" | "to_warehouse_id", v: string) => {
    const { error } = await db.from("ai_drafts").update({ payload: { ...p, [key]: v || null } }).eq("id", d.id);
    if (error) toast.error(error.message); else { toast.success("تم تعديل المستودع في المسودة"); qc.invalidateQueries({ queryKey: ["ai-drafts"] }); }
  };
  const sel = (key: "warehouse_id" | "to_warehouse_id", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select className="h-8 rounded-md border bg-background px-2" value={p[key] ?? ""} onChange={(e) => save(key, e.target.value)}>
        <option value="">— اختر المستودع —</option>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(wh.data ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.code ? `${w.code} - ` : ""}{w.name}</option>)}
      </select>
    </label>
  );
  return (
    <div className="flex flex-wrap gap-4 rounded-md bg-muted/40 p-2">
      {sel("warehouse_id", "المستودع")}
      {p.doc_type === "transfer" && sel("to_warehouse_id", "إلى المستودع")}
    </div>
  );
}

function Details({ d }: { d: Draft }) {
  const p = d.payload ?? {};
  if (d.kind === "journal")
    return (
      <div className="overflow-x-auto">
        <p className="mb-1 text-sm text-muted-foreground">{p.entry_date} · {p.currency}</p>
        <table className="w-full text-sm">
          <thead><tr className="text-muted-foreground"><th className="text-start font-normal">الحساب</th><th className="text-start font-normal">البيان</th><th className="text-end font-normal">مدين</th><th className="text-end font-normal">دائن</th></tr></thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(p.lines ?? []).map((l: any, i: number) => (
              <tr key={i} className="border-t"><td>{l.account_name}</td><td>{l.description}</td><td className="text-end">{l.debit ? fmtMoney(l.debit, p.currency) : ""}</td><td className="text-end">{l.credit ? fmtMoney(l.credit, p.currency) : ""}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (d.kind === "document")
    return (
      <div className="text-sm space-y-1">
        {(p.margin_warnings ?? []).map((w: string, i: number) => <p key={i} className="rounded bg-destructive/10 px-2 py-1 text-destructive">⚠ {w}</p>)}
        <p className="text-muted-foreground">{p.doc_date} · {p.partner_name ?? "بدون جهة"} · {fmtMoney(p.amount, p.currency)}{p.notes ? ` · ${p.notes}` : ""}</p>
        {(p.lines ?? []).length > 0 && (
          <table className="w-full">
            <thead><tr className="text-muted-foreground"><th className="text-start font-normal">الصنف</th><th className="text-end font-normal">الكمية</th><th className="text-end font-normal">السعر</th><th className="text-end font-normal">الإجمالي</th></tr></thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {p.lines.map((l: any, i: number) => (
                <tr key={i} className="border-t"><td>{l.product_name}</td><td className="text-end">{fmtNum(l.qty)}</td><td className="text-end">{fmtMoney(l.unit_price, p.currency)}</td><td className="text-end">{fmtMoney(l.qty * l.unit_price, p.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  return (
    <p className="text-sm text-muted-foreground">
      {Object.entries(p).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join(" · ")}
    </p>
  );
}

/** Turns an approved draft into a real record, using the same tables the regular screens use. */
async function apply(d: Draft, tenantId: string, userId: string): Promise<string | null> {
  const p = d.payload;
  if (d.kind === "journal") {
    return postEntry(tenantId, userId, { entry_date: p.entry_date, description: p.description, currency: p.currency },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p.lines.map((l: any) => ({ account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description, partner_id: l.partner_id })));
  }
  if (d.kind === "partner") {
    const { data, error } = await db.from("partners").insert({ tenant_id: tenantId, name: p.name, partner_type: p.partner_type, phone: p.phone, address: p.address }).select("id").single();
    if (error) throw error;
    return data.id;
  }
  if (d.kind === "product") {
    const { data, error } = await db.from("products").insert({
      tenant_id: tenantId, name: p.name, sku: p.sku || `AI-${Date.now().toString(36).toUpperCase()}`, unit: p.unit || "قطعة",
      sale_price: Number(p.sale_price) || 0, last_purchase_price: Number(p.purchase_price) || 0, avg_cost: Number(p.purchase_price) || 0,
      currency: p.currency || "USD", barcode: p.barcode || null,
    }).select("id").single();
    if (error) throw error;
    return data.id;
  }
  if (d.kind === "document") {
    const isInv = ["sale", "purchase"].includes(p.doc_type);
    const { data, error } = await db.from("documents").insert({
      tenant_id: tenantId, doc_type: p.doc_type, doc_date: p.doc_date, currency: p.currency, exchange_rate: 1,
      partner_id: p.partner_id || null, account_id: p.account_id || null, warehouse_id: p.warehouse_id || null, to_warehouse_id: p.to_warehouse_id || null, amount: Number(p.amount) || 0, notes: p.notes || null,
      payment_mode: isInv ? p.payment_mode || "credit" : "credit", status: "draft", created_by: userId,
      valid_until: p.doc_type === "quote" ? p.valid_until || null : null, terms: p.doc_type === "quote" ? p.terms || null : null,
    }).select("id").single();
    if (error) throw error;
    if ((p.lines ?? []).length) {
      const { error: lErr } = await db.from("document_lines").insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p.lines.map((l: any) => ({ tenant_id: tenantId, document_id: data.id, product_id: l.product_id, qty: Number(l.qty), unit_price: Number(l.unit_price) || 0 })),
      );
      if (lErr) { await db.from("documents").delete().eq("id", data.id); throw lErr; }
    }
    return data.id;
  }
  return null;
}
