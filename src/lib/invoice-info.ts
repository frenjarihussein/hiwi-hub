import { ledgerAmounts, type LedgerLine } from './ledger-display';
export function invoiceAccountBalance(lines: LedgerLine[], base: string) {
  return lines.reduce((sum, line) => { const value = ledgerAmounts(line, base); return sum + value.debitBase - value.creditBase; }, 0);
}
export function invoiceStockBalance(moves: { direction: string; qty: number }[]) {
  return moves.reduce((sum, move) => sum + (move.direction === 'in' ? 1 : -1) * Number(move.qty), 0);
}