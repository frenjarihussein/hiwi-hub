/** Group cards carry hierarchy, not operational values. */
export function leafOnlyField(table: string, key: string): boolean {
  if (["accounts", "partners", "products", "projects"].includes(table) && key === "currency") return true;
  if (table === "accounts") return ["cash_flow_type", "is_monetary", "closing_account_id", "closing_type"].includes(key);
  if (table === "partners") return ["phone", "address", "barcode", "credit_limit", "price_level", "is_monetary"].includes(key);
  if (table === "products") return ["unit", "barcode", "default_warehouse_id", "initial_quantity", "reorder_level", "purchase_price", "sale_price"].includes(key) || key.startsWith("prices.") || key.startsWith("price_rules.");
  return false;
}

export function accountNature(isClosing: boolean, existing?: string | null): string {
  return isClosing ? "closing" : existing && existing !== "closing" ? existing : "assets";
}

export function inventoryPosting(method: string) {
  return { postSaleCost: method !== "periodic", purchaseAccount: method === "periodic" ? "purchases_account_id" : "inventory_account_id" };
}