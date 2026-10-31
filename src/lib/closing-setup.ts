import { db } from "@/lib/db";
import { validateClosingLinks, type ClosingLinks } from "./closing-rules";

const MFG = /صناع|تصنيع|إنتاج|انتاج|أجور عمال|مواد أولية|مواد خام|تحت التشغيل|manufactur|production/i;
const TRADING = /مبيع|مشتري|تكلفة المبيعات|تكلفة البضاعة|بضاعة|الحسم|نقل المشتريات|أجور نقل|مرتجع|sales|purchase|cost of sales|cogs/i;

/** Links to explicitly selected existing accounts; never creates closing accounts. */
export async function setupClosingAccounts(tenantId: string, links: ClosingLinks) {
  const { data, error } = await db.from("accounts")
    .select("id,name,nature,is_group,closing_account_id").eq("tenant_id", tenantId);
  if (error) throw error;
  const all = data ?? [];
  validateClosingLinks(all, links);
  const { data: settings, error: settingsError } = await db.from("tenant_settings")
    .select("*").eq("tenant_id", tenantId).maybeSingle();
  if (settingsError) throw settingsError;
  const s = (settings ?? {}) as Record<string, unknown>;
  const tradingIds = new Set(["sales_account_id", "purchases_account_id", "cogs_account_id", "sales_discount_account_id", "purchase_discount_account_id", "sales_freight_account_id", "purchase_freight_account_id", "inventory_adjust_account_id"].map((k) => s[k]).filter(Boolean));
  const groups: Record<string, string[]> = {};
  let linked = 0;
  for (const a of all) {
    if (a.nature === "closing") continue;
    let target: string | undefined;
    if (["assets", "liabilities", "equity", "balance_sheet"].includes(a.nature)) target = links.balance_sheet;
    else if (["revenues", "expenses", "profit_loss", "cost_centers"].includes(a.nature)) {
      target = links.profit_loss;
      if (MFG.test(a.name) || a.id === s["project_cost_account_id"]) target = links.operating || links.trading || target;
      else if (TRADING.test(a.name) || tradingIds.has(a.id)) target = links.trading || target;
    }
    if (!target) continue;
    (groups[target] ??= []).push(a.id);
    linked += 1;
  }
  for (const [target, ids] of Object.entries(groups)) {
    const { error: updateError } = await db.from("accounts").update({ closing_account_id: target }).eq("tenant_id", tenantId).in("id", ids);
    if (updateError) throw updateError;
  }
  return { linked };
}