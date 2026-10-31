export const CLOSING_STAGES = ["balance_sheet", "profit_loss", "trading", "operating"] as const;
export type ClosingStage = (typeof CLOSING_STAGES)[number];
export type ClosingLinks = Partial<Record<ClosingStage, string>>;
export type ClosingAccount = { id: string; nature: string; is_group: boolean };

export function validateClosingLinks(accounts: ClosingAccount[], links: ClosingLinks) {
  for (const stage of CLOSING_STAGES) {
    const id = links[stage];
    if (!id) continue;
    const account = accounts.find((a) => a.id === id);
    if (!account || account.is_group || account.nature !== "closing") {
      throw new Error("اختر حساباً ختامياً فرعياً موجوداً من دليل الحسابات");
    }
  }
  if (!links.balance_sheet || !links.profit_loss) {
    throw new Error("حدد الحساب الختامي للميزانية والأرباح والخسائر في الربط المحاسبي");
  }
}