import { isProfitLoss } from "./format";

export type ClosingStage = "operating" | "trading" | "profit_loss" | "pl_distribution" | "balance_sheet";
type Account = { id: string; name: string; nature: string; parent_id: string | null; closing_account_id: string | null; closing_type: string | null; is_group: boolean };
const stages: ClosingStage[] = ["operating", "trading", "profit_loss", "pl_distribution", "balance_sheet"];
export function closingResolver(accounts: Account[], links: Record<string, string> = {}) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const typeOf = (account: Account): ClosingStage => {
    let current: Account | undefined = account;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (stages.includes(current.closing_type as ClosingStage)) return current.closing_type as ClosingStage;
      const linked = stages.find((stage) => links[stage] === current?.id || (stage === "operating" && links["operating"] === current?.id));
      if (linked) return linked;
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    if (/ميزاني|مركز مالي|balance/i.test(account.name)) return "balance_sheet";
    if (/تشغيل|إنتاج|انتاج|operating/i.test(account.name)) return "operating";
    if (/متاجر|trading/i.test(account.name)) return "trading";
    if (/توزيع|distribution/i.test(account.name)) return "pl_distribution";
    return "profit_loss";
  };
  const closingOf = (account: Account): { type: ClosingStage; closingId: string | null } => {
    let current: Account | undefined = account;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const target = current.closing_account_id ? byId.get(current.closing_account_id) : undefined;
      if (target?.nature === "closing" && !target.is_group) return { type: typeOf(target), closingId: target.id };
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return { type: isProfitLoss(account.nature) ? "profit_loss" : "balance_sheet", closingId: null };
  };
  return { closingOf, typeOf };
}