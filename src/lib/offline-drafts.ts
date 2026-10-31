import { canQueueWrite, type PendingWrite } from "./offline-store";

export function draftPath(w: Pick<PendingWrite, "url" | "table" | "method">, base: string): string {
  const target = new URL(w.url, base);
  const allowed = new URL(base);
  if (target.origin !== allowed.origin || target.pathname !== `${allowed.pathname.replace(/\/$/, "")}/rest/v1/${w.table}` || !canQueueWrite(w.table, w.method)) throw new Error("وجهة المسودة غير مسموحة");
  if (w.method === "PATCH" && !/^(eq|in)\..+/.test(target.searchParams.get("id") ?? "")) throw new Error("مسودة التعديل لا تحدد السجل المطلوب");
  return target.href;
}

export function parseDraftExport(value: unknown, scope: string, base: string): PendingWrite[] {
  if (!value || typeof value !== "object" || !("drafts" in value) || !Array.isArray(value.drafts)) throw new Error("ملف المسودات غير صالح");
  const unique = new Map<string, PendingWrite>();
  for (const item of value.drafts) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.table !== "string" || typeof item.method !== "string" || typeof item.url !== "string" || item.scope !== scope || !Number.isFinite(item.createdAt) || !item.body || typeof item.body !== "object") throw new Error("المسودات لا تخص المستخدم والشركة والفرع الحاليين، أو أن الملف قديم ولا يحتوي معلومات التنفيذ");
    if (!["review", "pending"].includes(item.state)) continue;
    const url = draftPath(item, base);
    unique.set(item.id, { id: item.id, table: item.table, method: item.method, scope, url, createdAt: item.createdAt, body: item.body, headers: [], state: "review" });
  }
  return [...unique.values()];
}