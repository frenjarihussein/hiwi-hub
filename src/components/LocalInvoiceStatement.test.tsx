import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/currencies", () => ({ baseCurrencyOf: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }) }, scope: (q: unknown) => q }));
import { LocalInvoiceStatement } from "./LocalInvoiceStatement";
import { enqueue, newSale } from "@/lib/pos-offline";
import { setOfflineScope } from "@/lib/offline-store";

beforeEach(() => { localStorage.clear(); setOfflineScope({ userId: "seller", tenantId: "company", branchId: null }); });
afterEach(cleanup);
it("updates the estimate immediately after a local invoice and removes reconciled debt", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sale = newSale({ userId: "seller", tenantId: "company", mode: "sale", currency: "USD", partnerId: "customer", warehouseId: "wh", total: 100, paid: false, lines: [] });
  const renderStatement = (ids: string[]) => <QueryClientProvider client={client}><LocalInvoiceStatement partnerId="customer" tenantId="company" base="USD" officialBalance={50} officialReady journalDocumentIds={ids} /></QueryClientProvider>;
  const view = render(renderStatement([]));
  act(() => enqueue(sale));
  await waitFor(() => expect(screen.getByText(/الرصيد التقديري مع المحلي/).textContent).toContain("150"));
  view.rerender(renderStatement([sale.id]));
  await waitFor(() => expect(screen.queryByText(/الرصيد التقديري مع المحلي/)).toBeNull());
  client.clear();
});