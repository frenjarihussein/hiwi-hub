export type BillingPeriod = "monthly" | "quarterly" | "yearly" | string;

/** Adds one billing cycle to an ISO date, keeping month-end dates inside the target month. */
export function addBillingPeriod(date: string, period: BillingPeriod): string {
  const months = period === "yearly" ? 12 : period === "quarterly" ? 3 : 1;
  const [y, m, d] = date.slice(0, 10).split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export type BillableContract = {
  status: string;
  next_billing_date: string | null;
  end_date: string | null;
  product_id: string | null;
  partner_id: string | null;
  price: number | string;
};

/** A contract is due when it is active, its next cycle date has arrived and is not past the contract end. */
export function isContractDue(c: BillableContract, today: string): boolean {
  if (c.status !== "active" || !c.next_billing_date || !c.product_id || !c.partner_id) return false;
  if (!(Number(c.price) > 0)) return false;
  if (c.next_billing_date > today) return false;
  if (c.end_date && c.next_billing_date > c.end_date) return false;
  return true;
}
