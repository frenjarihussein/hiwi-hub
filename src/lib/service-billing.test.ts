import { describe, expect, it } from "vitest";
import { addBillingPeriod, isContractDue } from "./service-billing";

const base = { status: "active", next_billing_date: "2026-10-01", end_date: null, product_id: "p", partner_id: "c", price: 100 };

describe("service contract billing", () => {
  it("monthly cycle advances one month", () => expect(addBillingPeriod("2026-10-15", "monthly")).toBe("2026-11-15"));
  it("quarterly cycle advances three months", () => expect(addBillingPeriod("2026-10-15", "quarterly")).toBe("2027-01-15"));
  it("yearly cycle advances twelve months", () => expect(addBillingPeriod("2026-10-15", "yearly")).toBe("2027-10-15"));
  it("month-end stays inside a shorter month", () => expect(addBillingPeriod("2027-01-31", "monthly")).toBe("2027-02-28"));
  it("active contract whose date has arrived is due", () => expect(isContractDue(base, "2026-10-24")).toBe(true));
  it("future cycle date is not due", () => expect(isContractDue({ ...base, next_billing_date: "2026-11-01" }, "2026-10-24")).toBe(false));
  it("cancelled contract is never due", () => expect(isContractDue({ ...base, status: "cancelled" }, "2026-10-24")).toBe(false));
  it("cycle after contract end is not due", () => expect(isContractDue({ ...base, end_date: "2026-09-30" }, "2026-10-24")).toBe(false));
  it("contract without a service is not billed", () => expect(isContractDue({ ...base, product_id: null }, "2026-10-24")).toBe(false));
});
