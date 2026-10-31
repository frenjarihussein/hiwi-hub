export type SearchRow = { id: string; parent_id: string | null; name: string; name_en?: string | null; [key: string]: unknown };

export function searchTree<T extends SearchRow>(rows: T[], query: string, codeField = "code") {
  const term = query.trim().toLocaleLowerCase();
  return term ? rows.filter((row) => [row.name, row.name_en, row[codeField]].some((value) => String(value ?? "").toLocaleLowerCase().includes(term))) : [];
}

export function treeAncestors(rows: SearchRow[], id: string): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set([id]);
  const ancestors: string[] = [];
  let parent = byId.get(id)?.parent_id;
  while (parent && !seen.has(parent) && byId.has(parent)) {
    seen.add(parent); ancestors.push(parent); parent = byId.get(parent)?.parent_id;
  }
  return ancestors;
}