import { useQuery } from '@tanstack/react-query';
import { db, scope } from '@/lib/db';
import { useMe } from '@/lib/session';
import { useBaseCurrency } from '@/lib/currencies';
import { balanceLabel } from '@/lib/ledger-display';
import { invoiceAccountBalance, invoiceStockBalance } from '@/lib/invoice-info';
import { fmtNum } from '@/lib/format';

export function InvoiceBalanceInfo({ accountId, partnerId, productId, warehouseId, unit }: { accountId?: string | undefined; partnerId?: string | undefined; productId?: string | undefined; warehouseId?: string | undefined; unit?: string | undefined }) {
  const me = useMe().data;
  const base = useBaseCurrency();
  const result = useQuery({
    queryKey: ['invoice-balance-info', me?.tenantId, me?.branchId || me?.activeBranchId, accountId, partnerId, productId, warehouseId],
    enabled: Boolean(me?.tenantId && (accountId || partnerId || productId)),
    queryFn: async () => {
      if (productId) {
        let q = scope(db.from('stock_moves').select('direction,qty').eq('product_id', productId), me?.tenantId);
        if (warehouseId && warehouseId !== '__multi') q = q.eq('warehouse_id', warehouseId);
        const { data, error } = await q;
        if (error) throw error;
        return `${fmtNum(invoiceStockBalance(data || []))} ${unit || ''}`;
      }
      let q = scope(db.from('journal_lines').select('debit,credit,journal_entries!inner(currency,exchange_rate)'), me?.tenantId);
      if (accountId) q = q.eq('account_id', accountId);
      else if (partnerId) q = q.eq('partner_id', partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return balanceLabel(invoiceAccountBalance(data || [], base), base);
    },
  });
  if (!accountId && !partnerId && !productId) return null;
  return <aside className="mt-1 border-s-2 border-primary bg-muted/40 px-2 py-1 text-xs" aria-live="polite">
    <span className="text-muted-foreground">{productId ? warehouseId && warehouseId !== '__multi' ? 'رصيد المستودع: ' : 'رصيد المادة: ' : 'الرصيد الحالي: '}</span>
    {result.isPending ? '…' : result.isError ? 'تعذر تحميل الرصيد' : result.data}
  </aside>;
}