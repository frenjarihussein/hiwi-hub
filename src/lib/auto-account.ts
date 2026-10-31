import { db } from "@/lib/db";

/**
 * Ensures an account with the given code exists (creating it under
 * grandParentCode when missing), then creates a child account named `name`
 * under it and returns the new account id. Used to auto-link projects and
 * cost centers to the chart of accounts.
 */
export async function createLinkedAccount(
  tenantId: string,
  parentCode: string,
  parentName: string,
  grandParentCode: string | null,
  name: string,
): Promise<string> {
  const { data: parent } = await db
    .from("accounts")
    .select("id, code, nature, currency")
    .eq("tenant_id", tenantId)
    .eq("code", parentCode)
    .maybeSingle();

  let parentId: string | undefined = parent?.id;
  let nature: string | undefined = parent?.nature;
  let currency: string = parent?.currency ?? "USD";

  if (!parentId) {
    // Create the parent group first (e.g. cost-centers group for older tenants).
    let grandId: string | null = null;
    if (grandParentCode) {
      const { data: grand } = await db
        .from("accounts")
        .select("id, nature, currency")
        .eq("tenant_id", tenantId)
        .eq("code", grandParentCode)
        .maybeSingle();
      grandId = grand?.id ?? null;
      nature = nature ?? grand?.nature;
      currency = grand?.currency ?? currency;
    }
    const { data: created, error } = await db
      .from("accounts")
      .insert({
        tenant_id: tenantId,
        code: parentCode,
        name: parentName,
        parent_id: grandId,
        nature: nature ?? "expenses",
        currency,
        is_group: true,
      })
      .select("id, nature, currency")
      .single();
    if (error) throw error;
    parentId = created.id;
    nature = created.nature;
    currency = created.currency;
  }

  // Next numeric child code under the parent.
  const { data: children } = await db
    .from("accounts")
    .select("code")
    .eq("tenant_id", tenantId)
    .eq("parent_id", parentId);
  let max = 0;
  for (const c of children ?? []) {
    const codeStr = String(c.code);
    const n = Number(codeStr.slice(parentCode.length));
    if (codeStr.startsWith(parentCode) && Number.isFinite(n) && n > max) max = n;
  }
  const code = `${parentCode}${String(max + 1).padStart(2, "0")}`;

  const { data: account, error } = await db
    .from("accounts")
    .insert({
      tenant_id: tenantId,
      code,
      name,
      parent_id: parentId,
      nature: nature ?? "expenses",
      currency,
      is_group: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return account.id as string;
}
