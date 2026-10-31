import { EntityTree } from "@/components/EntityTree";
import { useBaseCurrency } from "@/lib/currencies";

export function AccountTree() {
  const baseCur = useBaseCurrency();
  return (
    <EntityTree
      table="accounts"
      module="accounts"
      title="الشجرة المرسومة للحسابات"
      large
      extraSelect="nature,currency"
      buildInsert={(p, code) => (code ? { nature: p?.["nature"] ?? "balance_sheet", currency: p?.["currency"] ?? baseCur } : null)}
      usageCheck={{ table: "journal_lines", column: "account_id", message: "لا يمكن حذف حساب له حركات محاسبية، يمكنك إلغاء تفعيله" }}
    />
  );
}
