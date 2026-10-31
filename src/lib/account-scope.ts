export type AccountNode = { id: string; parent_id: string | null };

/** Membership follows ledger IDs, never customer/warehouse codes. */
export function accountSubtree(accounts: AccountNode[], root: string): Set<string> {
  const ids = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const account of accounts) {
      if (account.parent_id && ids.has(account.parent_id) && !ids.has(account.id)) {
        ids.add(account.id);
        changed = true;
      }
    }
  }
  return ids;
}