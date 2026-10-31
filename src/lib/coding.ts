import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";

/** Total length of a postable (leaf) account or product code under the standard scheme. */
export const LEAF_CODE_LEN = 12;
/** Digits added per group level (01 → 0101 → 010101 ...). */
export const GROUP_STEP = 2;

function nextSeq(parentCode: string, siblingCodes: string[], width: number) {
  let max = 0;
  for (const c of siblingCodes) {
    if (!c || !c.startsWith(parentCode) || c.length !== parentCode.length + width) continue;
    const n = Number(c.slice(parentCode.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(width, "0");
}

/** Suggests the next code under a parent: groups add 2 digits, leaves fill up to 12 digits. */
export function suggestCode(parentCode: string | null | undefined, siblingCodes: string[], isGroup: boolean, leafLen: number = LEAF_CODE_LEN): string {
  const p = (parentCode ?? "").trim();
  if (isGroup) return p + nextSeq(p, siblingCodes, GROUP_STEP);
  const width = leafLen - p.length;
  if (width <= 0) return p;
  return p + nextSeq(p, siblingCodes, width);
}

/** Returns an error message when a code breaks the standard scheme, otherwise null. */
export function validateCode(code: string, parentCode: string | null | undefined, isGroup: boolean, leafLen: number = LEAF_CODE_LEN): string | null {
  const c = (code ?? "").trim();
  if (!/^\d+$/.test(c)) return "الترميز القياسي: الرمز يجب أن يتكون من أرقام فقط";
  const p = (parentCode ?? "").trim();
  if (p && !c.startsWith(p)) return `الترميز القياسي: الرمز يجب أن يبدأ برمز الأب ${p}`;
  if (isGroup) {
    if (c.length % GROUP_STEP !== 0 || c.length >= leafLen) return "الترميز القياسي: رمز الحساب التجميعي يزيد خانتين عن رمز الأب (مثال 01، 0101، 010101)";
    if (p && c.length !== p.length + GROUP_STEP) return "الترميز القياسي: رمز الحساب التجميعي يزيد خانتين عن رمز الأب";
  } else if (c.length !== leafLen) return `الترميز القياسي: الحساب أو المادة أو المستودع الذي يُكتب عليه يجب أن يتألف رمزه من ${leafLen} خانة`;
  return null;
}

export type CodingConfig = { enabled: boolean; accounts: number; products: number; warehouses: number };

/** Company coding scheme: whether standard coding is on and the leaf length per kind. */
export function useCodingConfig(): CodingConfig {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ["standard_coding", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data } = await db.from("tenant_settings").select("standard_coding,account_code_len,product_code_len,warehouse_code_len").eq("tenant_id", me!.tenantId).maybeSingle();
      return {
        enabled: !!data?.standard_coding,
        accounts: Number(data?.account_code_len) || LEAF_CODE_LEN,
        products: Number(data?.product_code_len) || LEAF_CODE_LEN,
        warehouses: Number(data?.warehouse_code_len) || LEAF_CODE_LEN,
      } as CodingConfig;
    },
  });
  return q.data ?? { enabled: false, accounts: LEAF_CODE_LEN, products: LEAF_CODE_LEN, warehouses: LEAF_CODE_LEN };
}

/** Leaf code length for a table under the company coding scheme. */
export function leafLenFor(cfg: CodingConfig, table: string): number {
  return table === "products" ? cfg.products : table === "warehouses" ? cfg.warehouses : cfg.accounts;
}

/** Whether the company chose the standard coding scheme. */
export function useStandardCoding() {
  return useCodingConfig().enabled;
}

/** Event a tree fires to open the full card form of the page's CrudPage. */
export const CRUD_NEW_EVENT = "crud:new";
export type CrudNewDetail = { table: string; preset: Record<string, unknown> };
export function requestCrudNew(table: string, preset: Record<string, unknown>): boolean {
  const ev = new CustomEvent<CrudNewDetail>(CRUD_NEW_EVENT, { detail: { table, preset }, cancelable: true });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}

/** Event a tree fires to open the full card edit form of the page's CrudPage. */
export const CRUD_EDIT_EVENT = "crud:edit";
export type CrudEditDetail = { table: string; id: string };
export function requestCrudEdit(table: string, id: string): boolean {
  const ev = new CustomEvent<CrudEditDetail>(CRUD_EDIT_EVENT, { detail: { table, id }, cancelable: true });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}

/** Free-form coding: continue the siblings' numbering (same width), never reusing an existing code. */
export function suggestFreeCode(parentCode: string | null | undefined, siblingCodes: string[], allCodes: string[]): string {
  const p = (parentCode ?? "").trim();
  const used = new Set(allCodes.filter(Boolean));
  const tails = siblingCodes.filter((c) => c && c.startsWith(p) && /^\d+$/.test(c.slice(p.length)) && c.length > p.length).map((c) => c.slice(p.length));
  const width = tails.length ? Math.max(...tails.map((t) => t.length)) : 2;
  let n = tails.length ? Math.max(...tails.map(Number)) + 1 : 1;
  let code = p + String(n).padStart(width, "0");
  while (used.has(code)) { n++; code = p + String(n).padStart(width, "0"); }
  return code;
}
