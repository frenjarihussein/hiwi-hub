export type CategoryNode = { id: string; name: string; parent_id?: string | null };

export function categoryPath(rows: CategoryNode[], id: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return names.join(" / ");
}
/** True when `id` sits anywhere below `ancestor` (child, grandchild, ...). */
export function isUnderCategory(rows: { id: string; parent_id?: string | null }[], id: string, ancestor: string): boolean {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  let parent = byId.get(id)?.parent_id;
  while (parent && !seen.has(parent)) {
    if (parent === ancestor) return true;
    seen.add(parent);
    parent = byId.get(parent)?.parent_id;
  }
  return false;
}
