import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIN_MARGIN } from "./assistant-draft-tools";

/* Read-only analysis tools: inventory health, cash-flow forecast and anomaly checks.
   They run under the signed-in user's access rules, so only that company's data is used. */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));
const clampDays = (n: number, def: number) => Math.max(1, Math.min(Number(n) || def, 730));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function salesByProduct(sb: Sb, from: string) {
  const { data, error } = await sb.from("document_lines")
    .select("product_id,qty,unit_price,documents!inner(doc_type,doc_date,status,currency)")
    .eq("documents.doc_type", "sale").eq("documents.status", "posted").gte("documents.doc_date", from).limit(50000);
  if (error) throw new Error(error.message);
  const m: Record<string, { qty: number; value: number; last: string }> = {};
  for (const l of (data ?? []) as Row[]) {
    const e = (m[l.product_id] ??= { qty: 0, value: 0, last: "" });
    e.qty += Number(l.qty) || 0;
    e.value += (Number(l.qty) || 0) * (Number(l.unit_price) || 0);
    if (l.documents.doc_date > e.last) e.last = l.documents.doc_date;
  }
  return m;
}

export function buildAnalysisTools(sb: Sb) {
  return {
    inventory_analysis: tool({
      description: "تحليل المخزون: الأصناف التي قاربت على النفاد (الكمية ≤ حد إعادة الطلب أو تكفي لأيام قليلة حسب معدل البيع)، الأصناف الراكدة (رصيد بلا مبيعات خلال الفترة)، والأكثر مبيعاً كمية وقيمة. period_days = فترة التحليل بالأيام (افتراضي 90).",
      inputSchema: z.object({ period_days: z.number().nullable() }),
      execute: async ({ period_days }) => {
        const days = clampDays(period_days ?? 90, 90);
        const pr = await sb.from("products").select("id,sku,name,unit,qty_on_hand,reorder_level,avg_cost,currency").eq("is_group", false).eq("is_active", true).limit(10000);
        if (pr.error) return { error: pr.error.message };
        let sales: Awaited<ReturnType<typeof salesByProduct>>;
        try { sales = await salesByProduct(sb, daysAgo(days)); } catch (e) { return { error: (e as Error).message }; }
        const rows = (pr.data ?? []).map((p: Row) => {
          const s = sales[p.id];
          const daily = s ? s.qty / days : 0;
          const qty = Number(p.qty_on_hand) || 0;
          return { sku: p.sku, name: p.name, unit: p.unit, qty_on_hand: qty, reorder_level: Number(p.reorder_level) || 0, sold_qty: s?.qty ?? 0, sales_value: Math.round((s?.value ?? 0) * 100) / 100, last_sale: s?.last ?? null, days_of_cover: daily > 0 ? Math.round(qty / daily) : null, stock_value: Math.round(qty * (Number(p.avg_cost) || 0) * 100) / 100, currency: p.currency };
        });
        const low = rows.filter((r) => r.qty_on_hand <= r.reorder_level || (r.days_of_cover !== null && r.days_of_cover <= 14))
          .sort((a, b) => (a.days_of_cover ?? 9999) - (b.days_of_cover ?? 9999)).slice(0, 30);
        const slow = rows.filter((r) => r.qty_on_hand > 0 && r.sold_qty === 0).sort((a, b) => b.stock_value - a.stock_value).slice(0, 30);
        const top = [...rows].filter((r) => r.sold_qty > 0).sort((a, b) => b.sales_value - a.sales_value).slice(0, 15);
        return { period_days: days, products_count: rows.length, near_out_of_stock: low, slow_moving: slow, slow_moving_value: slow.reduce((s, r) => s + r.stock_value, 0), top_sellers: top };
      },
    }),

    cash_flow_forecast: tool({
      description: "توقع التدفقات النقدية للأيام القادمة: المبالغ المتوقع تحصيلها من فواتير البيع الآجلة غير المسددة والمتوقع دفعها لفواتير الشراء، مع الشيكات الواردة والصادرة حسب تاريخ الاستحقاق، مجمّعة أسبوعياً. credit_days = مدة الائتمان المفترضة للفواتير (افتراضي 30).",
      inputSchema: z.object({ days: z.number().nullable(), credit_days: z.number().nullable() }),
      execute: async ({ days, credit_days }) => {
        const horizon = clampDays(days ?? 60, 60);
        const credit = clampDays(credit_days ?? 30, 30);
        const today = iso(new Date());
        const until = iso(new Date(Date.now() + horizon * 86400000));
        const inv = await sb.from("documents").select("id,doc_no,doc_type,doc_date,amount,exchange_rate,currency,partners(name)")
          .in("doc_type", ["sale", "purchase"]).eq("status", "posted").eq("payment_mode", "credit").limit(20000);
        if (inv.error) return { error: inv.error.message };
        const ids = (inv.data ?? []).map((d: Row) => d.id);
        const settled: Record<string, number> = {};
        for (let i = 0; i < ids.length; i += 300) {
          const pays = await sb.from("documents").select("settles_document_id,amount,exchange_rate").in("settles_document_id", ids.slice(i, i + 300));
          for (const p of (pays.data ?? []) as Row[]) settled[p.settles_document_id] = (settled[p.settles_document_id] ?? 0) + Number(p.amount) / (Number(p.exchange_rate) || 1);
        }
        type Item = { date: string; direction: "in" | "out"; amount: number; currency: string; source: string; overdue: boolean };
        const items: Item[] = [];
        for (const d of (inv.data ?? []) as Row[]) {
          const rem = Number(d.amount) / (Number(d.exchange_rate) || 1) - (settled[d.id] ?? 0);
          if (rem <= 0.005) continue;
          const due = iso(new Date(new Date(d.doc_date + "T00:00:00Z").getTime() + credit * 86400000));
          if (due > until) continue;
          items.push({ date: due < today ? today : due, direction: d.doc_type === "sale" ? "in" : "out", amount: Math.round(rem * 100) / 100, currency: d.currency ?? "USD", source: `${d.doc_type === "sale" ? "فاتورة بيع" : "فاتورة شراء"} ${d.doc_no ?? ""} - ${d.partners?.name ?? ""}`, overdue: due < today });
        }
        const ch = await sb.from("cheques").select("cheque_no,direction,amount,currency,due_date,partners(name)").eq("status", "pending").lte("due_date", until).limit(5000);
        if (ch.error) return { error: ch.error.message };
        for (const c of (ch.data ?? []) as Row[]) items.push({ date: c.due_date < today ? today : c.due_date, direction: c.direction === "incoming" ? "in" : "out", amount: Number(c.amount) || 0, currency: c.currency ?? "USD", source: `شيك ${c.cheque_no ?? ""} - ${c.partners?.name ?? ""}`, overdue: c.due_date < today });
        const weeks: Record<string, Record<string, { in: number; out: number; net: number }>> = {};
        for (const it of items) {
          const w = Math.floor((new Date(it.date).getTime() - new Date(today).getTime()) / (7 * 86400000));
          const key = `الأسبوع ${w + 1} (من ${iso(new Date(new Date(today).getTime() + w * 7 * 86400000))})`;
          const e = ((weeks[key] ??= {})[it.currency] ??= { in: 0, out: 0, net: 0 });
          e[it.direction] += it.amount;
          e.net = Math.round((e.in - e.out) * 100) / 100;
        }
        return {
          today, horizon_days: horizon, assumed_credit_days: credit, weekly: weeks,
          overdue: items.filter((i) => i.overdue).sort((a, b) => b.amount - a.amount).slice(0, 20),
          largest_upcoming: items.filter((i) => !i.overdue).sort((a, b) => b.amount - a.amount).slice(0, 15),
          note: "فواتير الآجل لا تحمل تاريخ استحقاق؛ يُفترض الاستحقاق بعد مدة الائتمان من تاريخ الفاتورة.",
        };
      },
    }),

    detect_anomalies: tool({
      description: "كشف الشذوذ خلال فترة: الفواتير/السندات المحتملة التكرار (نفس النوع والجهة والمبلغ خلال 3 أيام)، والمصاريف غير المعتادة (حركة على حساب مصروف تتجاوز 3 أضعاف متوسطه التاريخي)، والقيود ذات المبالغ الكبيرة جداً. period_days افتراضي 90.",
      inputSchema: z.object({ period_days: z.number().nullable() }),
      execute: async ({ period_days }) => {
        const days = clampDays(period_days ?? 90, 90);
        const from = daysAgo(days);
        const docs = await sb.from("documents").select("id,doc_no,doc_type,doc_date,amount,currency,status,partner_id,partners(name)")
          .gte("doc_date", from).neq("doc_type", "quote").order("doc_date").limit(20000);
        if (docs.error) return { error: docs.error.message };
        const groups: Record<string, Row[]> = {};
        for (const d of (docs.data ?? []) as Row[]) {
          if (!(Number(d.amount) > 0)) continue;
          (groups[`${d.doc_type}|${d.partner_id ?? "-"}|${Number(d.amount).toFixed(2)}|${d.currency}`] ??= []).push(d);
        }
        const duplicates: Row[] = [];
        for (const g of Object.values(groups)) {
          for (let i = 1; i < g.length; i++) {
            const gap = (new Date(g[i].doc_date).getTime() - new Date(g[i - 1].doc_date).getTime()) / 86400000;
            if (gap <= 3) duplicates.push({ type: g[i].doc_type, partner: g[i].partners?.name, amount: g[i].amount, currency: g[i].currency, documents: [`${g[i - 1].doc_no} (${g[i - 1].doc_date})`, `${g[i].doc_no} (${g[i].doc_date})`] });
          }
        }
        const hist = await sb.from("journal_lines").select("debit,description,accounts!inner(code,name,nature),journal_entries!inner(entry_no,entry_date)")
          .eq("accounts.nature", "expenses").gt("debit", 0).gte("journal_entries.entry_date", daysAgo(Math.max(days * 4, 365))).limit(50000);
        if (hist.error) return { error: hist.error.message, possible_duplicates: duplicates.slice(0, 30) };
        const stats: Record<string, { sum: number; n: number }> = {};
        for (const l of (hist.data ?? []) as Row[]) {
          const s = (stats[l.accounts.code] ??= { sum: 0, n: 0 });
          s.sum += Number(l.debit); s.n++;
        }
        const unusual = ((hist.data ?? []) as Row[])
          .filter((l) => l.journal_entries.entry_date >= from)
          .map((l) => { const s = stats[l.accounts.code]!; const avg = s.sum / s.n; return { entry_no: l.journal_entries.entry_no, date: l.journal_entries.entry_date, account: `${l.accounts.code} - ${l.accounts.name}`, amount: Number(l.debit), account_average: Math.round(avg * 100) / 100, ratio: Math.round((Number(l.debit) / avg) * 10) / 10, description: l.description, samples: s.n }; })
          .filter((x) => x.samples >= 4 && x.ratio >= 3)
          .sort((a, b) => b.ratio - a.ratio).slice(0, 25);
        return { period: { from, to: iso(new Date()) }, possible_duplicates: duplicates.slice(0, 30), unusual_expenses: unusual };
      },
    }),

    bank_reconcile: tool({
      description: "المطابقة البنكية: يقارن حركات كشف الحساب البنكي (التي قرأتها من الملف المرفوع) مع حركات حساب البنك في الدفاتر خلال الفترة. amount موجب للإيداع وسالب للسحب. يُرجع الحركات المتطابقة، والحركات الموجودة في الكشف وغير المسجلة في الدفاتر (اقترح لها قيوداً بـ draft_journal_entry)، والحركات المسجلة في الدفاتر وغير الظاهرة في الكشف.",
      inputSchema: z.object({
        account_id: z.string().describe("حساب البنك من lookup_accounts"),
        from: z.string(), to: z.string(),
        statement_closing_balance: z.number().nullable(),
        lines: z.array(z.object({ date: z.string(), description: z.string(), amount: z.number() })),
      }),
      execute: async ({ account_id, from, to, statement_closing_balance, lines }) => {
        const acc = await sb.from("accounts").select("code,name").eq("id", account_id).maybeSingle();
        if (!acc.data) return { error: "حساب البنك غير موجود؛ استخدم lookup_accounts" };
        const book = await sb.from("journal_lines").select("id,debit,credit,description,journal_entries!inner(entry_no,entry_date,description,exchange_rate)")
          .eq("account_id", account_id).gte("journal_entries.entry_date", iso(new Date(new Date(from).getTime() - 7 * 86400000)))
          .lte("journal_entries.entry_date", iso(new Date(new Date(to).getTime() + 7 * 86400000))).limit(20000);
        if (book.error) return { error: book.error.message };
        const all = await sb.from("journal_lines").select("debit,credit,journal_entries!inner(entry_date)").eq("account_id", account_id).lte("journal_entries.entry_date", to).limit(50000);
        const bookBalance = ((all.data ?? []) as Row[]).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        const pool = ((book.data ?? []) as Row[]).map((l) => ({ entry_no: l.journal_entries.entry_no, date: l.journal_entries.entry_date, amount: Math.round((Number(l.debit) - Number(l.credit)) * 100) / 100, description: l.description || l.journal_entries.description, used: false }));
        const dayDiff = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
        const matched: Row[] = [], missing: Row[] = [];
        for (const st of lines) {
          const cands = pool.filter((b) => !b.used && Math.abs(b.amount - st.amount) < 0.01 && dayDiff(b.date, st.date) <= 7).sort((a, b) => dayDiff(a.date, st.date) - dayDiff(b.date, st.date));
          if (cands[0]) { cands[0].used = true; matched.push({ statement: st, entry_no: cands[0].entry_no }); }
          else missing.push(st);
        }
        const notInStatement = pool.filter((b) => !b.used && b.date >= from && b.date <= to);
        return {
          account: `${acc.data.code} - ${acc.data.name}`, period: { from, to },
          matched_count: matched.length, statement_count: lines.length,
          missing_in_books: missing, not_in_statement: notInStatement.map(({ used: _u, ...r }) => r),
          book_balance_at_end: Math.round(bookBalance * 100) / 100,
          statement_closing_balance, difference: statement_closing_balance === null ? null : Math.round((statement_closing_balance - bookBalance) * 100) / 100,
        };
      },
    }),

    margin_review: tool({
      description: "مراجعة هوامش الربح في فواتير البيع المرحّلة خلال فترة: البنود المباعة بأقل من التكلفة أو بهامش ضعيف، مع الخسارة المقدرة، ومتوسط هامش كل صنف.",
      inputSchema: z.object({ period_days: z.number().nullable(), min_margin_percent: z.number().nullable() }),
      execute: async ({ period_days, min_margin_percent }) => {
        const days = clampDays(period_days ?? 30, 30);
        const minM = (min_margin_percent ?? MIN_MARGIN * 100) / 100;
        const { data, error } = await sb.from("document_lines").select("qty,unit_price,products(name,avg_cost,last_purchase_price),documents!inner(doc_no,doc_date,doc_type,status,exchange_rate,partners(name))")
          .eq("documents.doc_type", "sale").eq("documents.status", "posted").gte("documents.doc_date", daysAgo(days)).limit(50000);
        if (error) return { error: error.message };
        const flagged: Row[] = []; const per: Record<string, { rev: number; cost: number }> = {};
        for (const l of (data ?? []) as Row[]) {
          const cost = Number(l.products?.avg_cost) || Number(l.products?.last_purchase_price) || 0;
          const price = Number(l.unit_price) / (Number(l.documents.exchange_rate) || 1);
          const qty = Number(l.qty) || 0;
          const name = l.products?.name ?? "؟";
          const e = (per[name] ??= { rev: 0, cost: 0 }); e.rev += price * qty; e.cost += cost * qty;
          if (!(cost > 0) || !(price > 0)) continue;
          const m = (price - cost) / price;
          if (m < minM) flagged.push({ invoice: l.documents.doc_no, date: l.documents.doc_date, customer: l.documents.partners?.name, product: name, qty, price: Math.round(price * 100) / 100, cost: Math.round(cost * 100) / 100, margin_percent: Math.round(m * 1000) / 10, loss: price < cost ? Math.round((cost - price) * qty * 100) / 100 : 0 });
        }
        const products = Object.entries(per).filter(([, v]) => v.rev > 0).map(([name, v]) => ({ name, revenue: Math.round(v.rev), margin_percent: Math.round(((v.rev - v.cost) / v.rev) * 1000) / 10 })).sort((a, b) => a.margin_percent - b.margin_percent).slice(0, 20);
        return { period_days: days, min_margin_percent: minM * 100, flagged_lines: flagged.sort((a, b) => a.margin_percent - b.margin_percent).slice(0, 40), total_loss: flagged.reduce((s, f) => s + f.loss, 0), lowest_margin_products: products, note: "التكلفة = متوسط التكلفة الحالي للصنف" };
      },
    }),
  };
}
