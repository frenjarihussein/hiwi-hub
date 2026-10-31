import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDraftTools, type DraftCtx } from "./assistant-draft-tools";
import { buildAnalysisTools } from "./assistant-analysis-tools";

/* Read-only financial tools for the assistant. They run with the signed-in user's
   client, so database access rules limit them to that user's company. */

const DOC_LABEL: Record<string, string> = {
  sale: "فاتورة بيع", purchase: "فاتورة شراء", sale_return: "مرتجع بيع", purchase_return: "مرتجع شراء",
  receipt: "سند قبض", payment: "سند دفع", quote: "عرض سعر", transfer: "مناقلة", stock_in: "إدخال", stock_out: "إخراج",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildAssistantTools(sb: SupabaseClient<any>, ctx: DraftCtx) {
  return {
    ...buildDraftTools(sb, ctx),
    ...buildAnalysisTools(sb),
    financial_summary: tool({
      description: "ملخص الأداء المالي لفترة: إجمالي المبيعات والمشتريات والمقبوضات والمدفوعات، وأرصدة الحسابات حسب طبيعتها (إيرادات، مصاريف، أصول، خصوم...). التواريخ بصيغة YYYY-MM-DD.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      execute: async ({ from, to }) => {
        const docs = await sb.from("documents").select("doc_type,amount,currency,status").gte("doc_date", from).lte("doc_date", to).eq("status", "posted").limit(5000);
        if (docs.error) return { error: docs.error.message };
        const byType: Record<string, { count: number; total: number }> = {};
        for (const d of docs.data ?? []) {
          const k = `${DOC_LABEL[d.doc_type] ?? d.doc_type} (${d.currency ?? "USD"})`;
          byType[k] ??= { count: 0, total: 0 };
          byType[k].count++;
          byType[k].total += Number(d.amount) || 0;
        }
        const lines = await sb.from("journal_lines").select("debit,credit,accounts(nature),journal_entries!inner(entry_date)")
          .gte("journal_entries.entry_date", from).lte("journal_entries.entry_date", to).limit(20000);
        if (lines.error) return { error: lines.error.message, documents: byType };
        const byNature: Record<string, { debit: number; credit: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const l of (lines.data ?? []) as any[]) {
          const n = l.accounts?.nature ?? "other";
          byNature[n] ??= { debit: 0, credit: 0 };
          byNature[n].debit += Number(l.debit) || 0;
          byNature[n].credit += Number(l.credit) || 0;
        }
        return { period: { from, to }, documents: byType, account_movements_by_nature: byNature };
      },
    }),
    upcoming_cheques: tool({
      description: "الشيكات قيد التحصيل (الواردة والصادرة) التي يستحق موعدها خلال عدد أيام قادم، مع المتأخرة عن موعدها.",
      inputSchema: z.object({ days: z.number() }),
      execute: async ({ days }) => {
        const until = new Date(Date.now() + Math.max(1, Math.min(days, 365)) * 86400000);
        const { data, error } = await sb.from("cheques").select("cheque_no,direction,amount,currency,due_date,status,partners(name),banks(name)")
          .eq("status", "pending").lte("due_date", iso(until)).order("due_date").limit(100);
        if (error) return { error: error.message };
        const today = iso(new Date());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { today, cheques: (data ?? []).map((c: any) => ({ no: c.cheque_no, direction: c.direction === "incoming" ? "وارد" : "صادر", amount: c.amount, currency: c.currency, due_date: c.due_date, overdue: c.due_date < today, partner: c.partners?.name, bank: c.banks?.name })) };
      },
    }),
    partner_balances: tool({
      description: "أرصدة الزبائن والموردين (مدين - دائن) مرتبة من الأكبر. موجب = مستحق للشركة، سالب = مستحق على الشركة.",
      inputSchema: z.object({ partner_name: z.string().nullable() }),
      execute: async ({ partner_name }) => {
        let q = sb.from("journal_lines").select("debit,credit,partner_id,partners!inner(name,partner_type)").not("partner_id", "is", null).limit(20000);
        if (partner_name) q = q.ilike("partners.name", `%${partner_name}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const m: Record<string, { name: string; type: string; balance: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const l of (data ?? []) as any[]) {
          m[l.partner_id] ??= { name: l.partners?.name, type: l.partners?.partner_type, balance: 0 };
          m[l.partner_id]!.balance += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        }
        return { partners: Object.values(m).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 20) };
      },
    }),
    account_balance: tool({
      description: "البحث عن حساب في شجرة الحسابات بالاسم أو الرمز وإرجاع رصيده (مجموع المدين والدائن).",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const acc = await sb.from("accounts").select("id,code,name,nature").or(`name.ilike.%${query.replace(/[,()]/g, " ")}%,code.ilike.${query.replace(/[,()]/g, " ")}%`).limit(10);
        if (acc.error) return { error: acc.error.message };
        const ids = (acc.data ?? []).map((a) => a.id);
        if (!ids.length) return { accounts: [] };
        const { data } = await sb.from("journal_lines").select("account_id,debit,credit").in("account_id", ids).limit(20000);
        return {
          accounts: (acc.data ?? []).map((a) => {
            const ls = (data ?? []).filter((l) => l.account_id === a.id);
            const debit = ls.reduce((s, l) => s + Number(l.debit), 0);
            const credit = ls.reduce((s, l) => s + Number(l.credit), 0);
            return { code: a.code, name: a.name, nature: a.nature, debit, credit, balance: debit - credit };
          }),
        };
      },
    }),
    search_documents: tool({
      description: "البحث في المستندات والفواتير حسب النوع (sale, purchase, receipt, payment, sale_return, purchase_return, quote) والجهة والفترة.",
      inputSchema: z.object({ doc_type: z.string().nullable(), partner_name: z.string().nullable(), from: z.string().nullable(), to: z.string().nullable() }),
      execute: async ({ doc_type, partner_name, from, to }) => {
        let q = sb.from("documents").select("doc_no,doc_type,doc_date,amount,currency,status,notes,partners(name)").order("doc_date", { ascending: false }).limit(25);
        if (doc_type) q = q.eq("doc_type", doc_type);
        if (from) q = q.gte("doc_date", from);
        if (to) q = q.lte("doc_date", to);
        if (partner_name) q = sb.from("documents").select("doc_no,doc_type,doc_date,amount,currency,status,notes,partners!inner(name)").ilike("partners.name", `%${partner_name}%`).order("doc_date", { ascending: false }).limit(25);
        const { data, error } = await q;
        if (error) return { error: error.message };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { documents: (data ?? []).map((d: any) => ({ no: d.doc_no, type: DOC_LABEL[d.doc_type] ?? d.doc_type, date: d.doc_date, amount: d.amount, currency: d.currency, status: d.status === "posted" ? "مرحّل" : "مسودة", partner: d.partners?.name, notes: d.notes })) };
      },
    }),
  };
}
