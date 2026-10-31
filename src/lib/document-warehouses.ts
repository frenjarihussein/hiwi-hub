/** Stock line warehouse overrides survive editing and document conversion. */
export const MULTI_WAREHOUSE = "__multi";
export type WarehouseLine = { product_id?: string | null; warehouse_id?: string | null };
export function warehouseMode(header: string | null | undefined, lines: WarehouseLine[]): string {
  return lines.some((line) => line.warehouse_id) ? MULTI_WAREHOUSE : header || "";
}
export function resolvedWarehouse(header: string | null | undefined, line: WarehouseLine): string | null {
  return line.warehouse_id || (header === MULTI_WAREHOUSE ? null : header) || null;
}
export function missingLineWarehouse(mode: string, lines: { product_id: string; qty: string; wh?: string }[]): boolean {
  return mode === MULTI_WAREHOUSE && lines.some((line) => line.product_id && Number(line.qty) > 0 && !line.wh);
}