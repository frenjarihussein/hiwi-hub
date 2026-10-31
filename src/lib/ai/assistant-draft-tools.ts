import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Draft-only "executive" tools. They never touch the books: each one validates the
   proposal and stores it in ai_drafts, where a person reviews and approves it. */

export type DraftCtx = { userId: string; tenantId: string | null; threadId: string };

const clean = (s: string) => s.replace(/[,()%]/g, " ").trim();
const CURRENCIES = ["USD", "SYP", "EUR", "TRY", "SAR", "AED"];

export const MIN_MARGIN = 0.1;

/** Flags sale lines priced below cost or under the minimum margin. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function marginWarnings(lines: { product_id: string; unit_price: number }[], products: any[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const p = products.find((x) => x.id === l.product_id);
    const cost = Number(p?.avg_cost) || Number(p?.last_purchase_price) || 0;
    if (!p || !(cost > 0)) continue;
    const margin = (l.unit_price - cost) / l.unit_price;
    if (l.unit_price < cost) out.push(`${p.name}: سعر البيع ${l.unit_price} أقل من التكلفة ${cost.toFixed(2)} (خسارة ${(cost - l.unit_price).toFixed(2)} للوحدة)`);
    else if (margin < MIN_MARGIN) out.push(`${p.name}: هامش الربح ضعيف ${(margin * 100).toFixed(1)}% (التكلفة ${cost.toFixed(2)})`);
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDraftTools(sb: SupabaseClient<any>, ctx: DraftCtx) {
  const save = async (kind: string, title: string, payload: unknown) => {
    if (!ctx.tenantId) return { error: "لا توجد شركة مرتبطة بالمستخدم" };
    const { data, error } = await sb.from("ai_drafts")
      .insert({ tenant_id: ctx.tenantId, kind, title, payload, thread_id: ctx.threadId, created_by: ctx.userId })
      .select("id").single();
    if (error) return { error: "تعذّر حفظ المسودة: " + error.message };
    return { ok: true, draft_id: data.id, review_page: "/ai-drafts", note: "المسودة بانتظار مراجعة المستخدم واعتماده." };
  };

  return {
    lookup_accounts: tool({
      description: "البحث عن حسابات في شجرة الحسابات بالاسم أو الرمز لإرجاع معرّفاتها (id) قبل تجهيز قيد أو سند.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const q = clean(query);
        const { data, error } = await sb.from("accounts").select("id,code,name,nature,is_group").or(`name.ilike.%${q}%,code.ilike.${q}%`).limit(15);
        return error ? { error: error.message } : { accounts: data };
      },
    }),
    lookup_partners: tool({
      description: "البحث عن زبائن أو موردين بالاسم لإرجاع معرّفاتهم (id).",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const { data, error } = await sb.from("partners").select("id,name,partner_type,phone,code").ilike("name", `%${clean(query)}%`).limit(15);
        return error ? { error: error.message } : { partners: data };
      },
    }),
    lookup_products: tool({
      description: "البحث عن أصناف (مواد) بالاسم أو الرمز أو الباركود لإرجاع معرّفاتها وأسعارها.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const q = clean(query);
        const { data, error } = await sb.from("products").select("id,sku,name,unit,sale_price,last_purchase_price,currency,is_group")
          .or(`name.ilike.%${q}%,sku.ilike.${q}%,barcode.eq.${q}`).eq("is_group", false).limit(15);
        return error ? { error: error.message } : { products: data };
      },
    }),

    draft_journal_entry: tool({
      description: "تجهيز مسودة قيد يومية متوازن (مجموع المدين = مجموع الدائن). استخدم معرّفات حسابات حقيقية من lookup_accounts.",
      inputSchema: z.object({
        entry_date: z.string().describe("YYYY-MM-DD"),
        description: z.string(),
        currency: z.string().describe("USD, SYP, EUR ..."),
        lines: z.array(z.object({
          account_id: z.string(),
          debit: z.number(),
          credit: z.number(),
          description: z.string().nullable(),
          partner_id: z.string().nullable(),
        })),
      }),
      execute: async (input) => {
        const lines = input.lines.filter((l) => l.debit > 0 || l.credit > 0);
        if (lines.length < 2) return { error: "القيد يحتاج سطرين على الأقل" };
        const dr = lines.reduce((s, l) => s + l.debit, 0), cr = lines.reduce((s, l) => s + l.credit, 0);
        if (Math.abs(dr - cr) > 0.005) return { error: `القيد غير متوازن: مدين ${dr} ≠ دائن ${cr}` };
        const ids = [...new Set(lines.map((l) => l.account_id))];
        const acc = await sb.from("accounts").select("id,name,code,is_group").in("id", ids);
        if (acc.error) return { error: acc.error.message };
        if ((acc.data ?? []).length !== ids.length) return { error: "بعض معرّفات الحسابات غير موجودة؛ استخدم lookup_accounts" };
        if ((acc.data ?? []).some((a) => a.is_group)) return { error: "لا يمكن القيد على حساب تجميعي، اختر حساباً فرعياً" };
        const names = Object.fromEntries((acc.data ?? []).map((a) => [a.id, `${a.code} - ${a.name}`]));
        return save("journal", `قيد: ${input.description} (${dr} ${input.currency})`, {
          ...input, currency: CURRENCIES.includes(input.currency) ? input.currency : "USD",
          lines: lines.map((l) => ({ ...l, account_name: names[l.account_id] })),
        });
      },
    }),

    draft_document: tool({
      description: "تجهيز مسودة مستند: فاتورة بيع sale، فاتورة شراء purchase، مرتجع بيع sale_return، مرتجع شراء purchase_return (تحتاج بنوداً بأصناف)، أو سند قبض receipt / سند دفع payment (تحتاج مبلغاً وحساب الصندوق/البنك account_id)، أو عرض سعر quote للزبون (بنود + valid_until + terms). لفواتير البيع وعروض الأسعار تُرجع الأداة تحذيرات هامش الربح margin_warnings؛ أبلغ المستخدم بها.",
      inputSchema: z.object({
        doc_type: z.enum(["sale", "purchase", "sale_return", "purchase_return", "receipt", "payment", "quote"]),
        doc_date: z.string().describe("YYYY-MM-DD"),
        currency: z.string(),
        partner_id: z.string().nullable(),
        account_id: z.string().nullable().describe("حساب الصندوق أو البنك للسندات"),
        amount: z.number().nullable().describe("مبلغ السند؛ للفواتير يُحسب من البنود"),
        payment_mode: z.enum(["cash", "credit"]).nullable(),
        notes: z.string().nullable(),
        lines: z.array(z.object({ product_id: z.string(), qty: z.number(), unit_price: z.number() })).nullable(),
        valid_until: z.string().nullable().describe("لعرض السعر: YYYY-MM-DD"),
        terms: z.string().nullable().describe("لعرض السعر: شروط الدفع والتسليم"),
      }),
      execute: async (input) => {
        const isVoucher = input.doc_type === "receipt" || input.doc_type === "payment";
        let partnerName: string | null = null;
        if (input.partner_id) {
          const p = await sb.from("partners").select("name").eq("id", input.partner_id).maybeSingle();
          if (!p.data) return { error: "الجهة غير موجودة؛ استخدم lookup_partners أو draft_partner" };
          partnerName = p.data.name;
        } else if (!isVoucher) return { error: "الفاتورة تحتاج زبوناً أو مورداً" };
        let lines: { product_id: string; qty: number; unit_price: number; product_name?: string }[] = [];
        let warnings: string[] = [];
        let amount = input.amount ?? 0;
        if (isVoucher) {
          if (!(amount > 0)) return { error: "حدد مبلغ السند" };
          if (!input.account_id) return { error: "حدد حساب الصندوق أو البنك" };
        } else {
          lines = (input.lines ?? []).filter((l) => l.qty > 0);
          if (!lines.length) return { error: "أضف بنداً واحداً على الأقل" };
          const pr = await sb.from("products").select("id,name,avg_cost,last_purchase_price").in("id", [...new Set(lines.map((l) => l.product_id))]);
          if (input.doc_type === "sale" || input.doc_type === "quote") warnings = marginWarnings(lines, pr.data ?? []);
          const map = Object.fromEntries((pr.data ?? []).map((p) => [p.id, p.name]));
          if (lines.some((l) => !map[l.product_id])) return { error: "بعض الأصناف غير موجودة؛ استخدم lookup_products أو draft_product" };
          lines = lines.map((l) => ({ ...l, product_name: map[l.product_id] }));
          amount = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
        }
        const label: Record<string, string> = { sale: "فاتورة بيع", purchase: "فاتورة شراء", sale_return: "مرتجع بيع", purchase_return: "مرتجع شراء", receipt: "سند قبض", payment: "سند دفع", quote: "عرض سعر" };
        const saved = await save("document", `${label[input.doc_type]}${partnerName ? " - " + partnerName : ""} (${amount} ${input.currency})`, {
          ...input, currency: CURRENCIES.includes(input.currency) ? input.currency : "USD", amount, lines, partner_name: partnerName, margin_warnings: warnings,
        });
        return warnings.length ? { ...saved, margin_warnings: warnings } : saved;
      },
    }),

    draft_partner: tool({
      description: "تجهيز مسودة زبون أو مورد جديد. تحقق أولاً بـ lookup_partners أنه غير موجود.",
      inputSchema: z.object({
        name: z.string(),
        partner_type: z.enum(["customer", "supplier", "both"]),
        phone: z.string().nullable(),
        address: z.string().nullable(),
      }),
      execute: async (input) => {
        const ex = await sb.from("partners").select("id").ilike("name", input.name.trim()).limit(1);
        if (ex.data?.length) return { error: "يوجد طرف بنفس الاسم مسبقاً", existing_id: ex.data[0]!.id };
        const t = input.partner_type === "customer" ? "زبون" : input.partner_type === "supplier" ? "مورد" : "زبون/مورد";
        return save("partner", `${t} جديد: ${input.name}`, input);
      },
    }),

    draft_product: tool({
      description: "تجهيز مسودة صنف (مادة) جديد. تحقق أولاً بـ lookup_products أنه غير موجود.",
      inputSchema: z.object({
        name: z.string(),
        sku: z.string().nullable(),
        unit: z.string().nullable(),
        sale_price: z.number().nullable(),
        purchase_price: z.number().nullable(),
        currency: z.string().nullable(),
        barcode: z.string().nullable(),
      }),
      execute: async (input) => {
        const ex = await sb.from("products").select("id").ilike("name", input.name.trim()).limit(1);
        if (ex.data?.length) return { error: "يوجد صنف بنفس الاسم مسبقاً", existing_id: ex.data[0]!.id };
        return save("product", `صنف جديد: ${input.name}`, input);
      },
    }),
  };
}
