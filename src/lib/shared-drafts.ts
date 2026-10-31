import { db } from "@/lib/db";

/** Cloud drafts shared across devices/users in the company; falls back to this device when offline. */
export async function saveSharedDraft(kind: string, key: string, data: unknown, title?: string) {
  localStorage.setItem(`draft:${kind}:${key}`, JSON.stringify(data));
  const { error } = await db.from("shared_drafts").upsert(
    { kind, draft_key: key, data: data as never, title: title ?? null, updated_at: new Date().toISOString() },
    { onConflict: "tenant_id,kind,draft_key" },
  );
  return !error;
}

export async function loadSharedDraft<T>(kind: string, key: string): Promise<T | null> {
  try {
    const { data, error } = await db.from("shared_drafts").select("data").eq("kind", kind).eq("draft_key", key).maybeSingle();
    if (!error && data) return data.data as T;
  } catch { /* offline */ }
  const local = localStorage.getItem(`draft:${kind}:${key}`);
  return local ? (JSON.parse(local) as T) : null;
}

export async function deleteSharedDraft(kind: string, key: string) {
  localStorage.removeItem(`draft:${kind}:${key}`);
  await db.from("shared_drafts").delete().eq("kind", kind).eq("draft_key", key);
}
