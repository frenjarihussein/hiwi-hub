import { SOLAR_QUOTE_TEMPLATE } from "./solar-quote-template";
import type { SectionPerms, Access } from "./solar";

export type QuoteLine = { description: string; unit: string; qty: number; price: number; installation: number };
export type QuoteGroup = { name: string; markup: number; optional: boolean; included: boolean; lines: QuoteLine[] };
export type SolarQuote = { client: string; location: string; capacity: number; notes: string; terms: string; groups: QuoteGroup[] };
export const CIVIL_NOTE = "كافة الأعمال المدنية من حفر خنادق وتأمين قساطل للكابلات، ونظام تبريد الغرفة وحماية الحرائق والتنظيف والرافعات والتسوية والصبات البيتونية، وتبديل العدادات الكهربائية ومحولات الشدة: على نفقة المستفيد أو بالاتفاق بين الطرفين.";
export function newSolarQuote(client = "", location = ""): SolarQuote {
  return { client, location, capacity: 187.2, notes: CIVIL_NOTE, terms: "", groups: structuredClone(SOLAR_QUOTE_TEMPLATE) };
}
export const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const lineTotal = (l: QuoteLine) => roundMoney(l.qty * (l.price + l.installation));
export const groupSubtotal = (g: QuoteGroup) => roundMoney(g.lines.reduce((n, l) => n + lineTotal(l), 0));
export const groupTotal = (g: QuoteGroup) => roundMoney(groupSubtotal(g) * (1 + g.markup / 100));
export const quoteTotal = (q: SolarQuote) => roundMoney(q.groups.filter((g) => g.included).reduce((n, g) => n + groupTotal(g), 0));
export function validateQuote(q: SolarQuote): string | null {
  if (!q.groups.some((g) => g.included && g.lines.length)) return "أضف بنداً واحداً مشمولاً بالعرض على الأقل";
  if (!Number.isFinite(q.capacity) || q.capacity < 0) return "استطاعة المحطة غير صالحة";
  for (const g of q.groups) {
    if (!g.name.trim() || !Number.isFinite(g.markup) || g.markup < 0) return "تحقق من اسم المجموعة والنسبة";
    for (const l of g.lines) if (!l.description.trim() || ![l.qty, l.price, l.installation].every((v) => Number.isFinite(v) && v >= 0)) return "تحقق من وصف المادة والكمية والأسعار؛ لا تقبل القيم السالبة";
  }
  return null;
}
export function quotePermissions(perms: SectionPerms | null | undefined, access: Access, saved: boolean) {
  const fallback = access === "edit";
  return { create: perms?.create ?? fallback, edit: saved ? (perms?.edit ?? fallback) : (perms?.create ?? fallback), delete: perms?.delete ?? fallback };
}
export function studyFileAllowed(name: string, tag: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  if (tag === "survey:technical_offer") return ["pdf", "ppt", "pptx"].includes(ext ?? "");
  if (tag === "survey:drawings") return ["pdf", "dwg", "dxf", "png", "jpg", "jpeg", "webp"].includes(ext ?? "");
  return true;
}