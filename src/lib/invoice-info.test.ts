import { describe, expect, it } from 'vitest';
import { invoiceAccountBalance, invoiceStockBalance } from './invoice-info';
describe('Invoice information balances', () => {
  it('converts account movement to company currency', () => {
    expect(invoiceAccountBalance([{ debit: 200, credit: 0, journal_entries: { currency: 'EUR', exchange_rate: 2 } }, { debit: 0, credit: 30, journal_entries: { exchange_rate: 1 } }], 'USD')).toBe(70);
  });
  it('shows stock after inbound and outbound movements', () => {
    expect(invoiceStockBalance([{ direction: 'in', qty: 12 }, { direction: 'out', qty: 5 }])).toBe(7);
  });
});