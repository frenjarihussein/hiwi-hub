export function referenceCodeField(table?: string): string | undefined {
  if (table === "products") return "sku";
  return table && ["accounts", "partners", "warehouses", "projects", "cost_centers"].includes(table) ? "code" : undefined;
}

export function referenceLabel(row: Record<string, unknown>, name: string, codeField?: string): string {
  const code = codeField ? row[codeField] : null;
  return code ? `${String(code)} - ${name}` : name;
}