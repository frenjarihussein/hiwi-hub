import type { Extra } from "@/lib/prefs";

export type ShortcutAction = {
  id: string;
  group: string;
  label: string;
  to: string;
  search?: Record<string, string>;
  table?: string;
  combo: string; // default
};

const q = (id: string, label: string, kind: string, combo: string): ShortcutAction => ({ id, group: "عمليات جديدة", label, to: kind === "entry" ? "/journal" : "/documents", search: { new: kind }, combo });

/**
 * Default scheme — every letter comes from the English name of the thing:
 *  Alt+letter            → new transaction (S=Sale, B=Buy, R=Receipt, V=payment Voucher, J=Journal, Q=Quote, T=Transfer, I=In, O=Out)
 *  Alt+Shift+letter      → open the directory of that entity (A=Accounts, P=Products, W=Warehouses, C=Customers, K=cost centers, R=pRojects)
 *  Ctrl+Alt+letter       → statement/ledger of the same entity
 *  Ctrl+Alt+Shift+letter → create a new record of the same entity
 */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  q("new.sale", "فاتورة بيع", "sale", "Alt+S"),
  q("new.purchase", "فاتورة شراء", "purchase", "Alt+B"),
  q("new.sale_return", "مرتجع بيع", "sale_return", "Alt+Shift+S"),
  q("new.purchase_return", "مرتجع شراء", "purchase_return", "Alt+Shift+B"),
  q("new.receipt", "سند قبض", "receipt", "Alt+R"),
  q("new.payment", "سند دفع", "payment", "Alt+V"),
  q("new.transfer", "مناقلة مستودعات", "transfer", "Alt+T"),
  q("new.stock_in", "إدخال مستودع", "stock_in", "Alt+I"),
  q("new.stock_out", "إخراج إلى مشروع", "stock_out", "Alt+O"),
  q("new.quote", "عرض سعر", "quote", "Alt+Q"),
  q("new.entry", "قيد يومية", "entry", "Alt+J"),
  q("new.opening_inventory", "فاتورة بضاعة أول المدة", "opening_inventory", "Alt+1"),
  q("new.closing_inventory", "فاتورة بضاعة آخر المدة", "closing_inventory", "Alt+2"),

  { id: "def.account", group: "تعريفات", label: "حساب جديد", to: "/accounts", table: "accounts", combo: "Ctrl+Alt+Shift+A" },
  { id: "def.product", group: "تعريفات", label: "مادة جديدة", to: "/products", table: "products", combo: "Ctrl+Alt+Shift+P" },
  { id: "def.service", group: "تعريفات", label: "خدمة جديدة", to: "/services", table: "products", combo: "Ctrl+Alt+Shift+V" },
  { id: "def.warehouse", group: "تعريفات", label: "مستودع جديد", to: "/warehouses", table: "warehouses", combo: "Ctrl+Alt+Shift+W" },
  { id: "def.partner", group: "تعريفات", label: "زبون / مورد جديد", to: "/partners", table: "partners", combo: "Ctrl+Alt+Shift+C" },
  { id: "def.cost_center", group: "تعريفات", label: "مركز كلفة جديد", to: "/cost-centers", table: "cost_centers", combo: "Ctrl+Alt+Shift+K" },
  { id: "def.project", group: "تعريفات", label: "مشروع جديد", to: "/projects", table: "projects", combo: "Ctrl+Alt+Shift+R" },

  { id: "dir.accounts", group: "الأدلة", label: "دليل الحسابات", to: "/accounts", combo: "Alt+Shift+A" },
  { id: "dir.products", group: "الأدلة", label: "دليل المواد", to: "/products", combo: "Alt+Shift+P" },
  { id: "dir.services", group: "الأدلة", label: "دليل الخدمات", to: "/services", combo: "Alt+Shift+V" },
  { id: "dir.warehouses", group: "الأدلة", label: "دليل المستودعات", to: "/warehouses", combo: "Alt+Shift+W" },
  { id: "dir.partners", group: "الأدلة", label: "دليل الزبائن والموردين", to: "/partners", combo: "Alt+Shift+C" },
  { id: "dir.cost_centers", group: "الأدلة", label: "دليل مراكز الكلفة", to: "/cost-centers", combo: "Alt+Shift+K" },
  { id: "dir.projects", group: "الأدلة", label: "دليل المشاريع", to: "/projects", combo: "Alt+Shift+R" },

  { id: "led.account", group: "الكشوف", label: "كشف حساب", to: "/ledgers", search: { tab: "account" }, combo: "Ctrl+Alt+A" },
  { id: "led.product", group: "الكشوف", label: "كشف مادة", to: "/ledgers", search: { tab: "product" }, combo: "Ctrl+Alt+P" },
  { id: "led.service", group: "الكشوف", label: "كشف خدمة", to: "/ledgers", search: { tab: "service" }, combo: "Ctrl+Alt+S" },
  { id: "led.warehouse", group: "الكشوف", label: "كشف مستودع", to: "/ledgers", search: { tab: "warehouse" }, combo: "Ctrl+Alt+W" },
  { id: "led.partner", group: "الكشوف", label: "كشف زبون / مورد", to: "/ledgers", search: { tab: "partner" }, combo: "Ctrl+Alt+C" },
  { id: "led.project", group: "الكشوف", label: "كشف مشروع", to: "/ledgers", search: { tab: "project" }, combo: "Ctrl+Alt+R" },

  { id: "rep.tb", group: "التقارير", label: "ميزان المراجعة", to: "/reports", search: { tab: "tb" }, combo: "Alt+Shift+T" },
  { id: "rep.final", group: "التقارير", label: "الحسابات الختامية", to: "/reports", search: { tab: "final" }, combo: "Alt+Shift+F" },
  { id: "rep.is", group: "التقارير", label: "قائمة الدخل", to: "/reports", search: { tab: "is" }, combo: "Alt+Shift+I" },
  { id: "rep.bs", group: "التقارير", label: "قائمة المركز المالي", to: "/reports", search: { tab: "bs" }, combo: "Alt+Shift+G" },
  { id: "rep.cf", group: "التقارير", label: "التدفقات النقدية", to: "/reports", search: { tab: "cf" }, combo: "Alt+Shift+D" },
  { id: "rep.aging", group: "التقارير", label: "أعمار الذمم", to: "/reports", search: { tab: "aging" }, combo: "Alt+Shift+N" },

  { id: "nav.home", group: "الصفحات", label: "الرئيسية (الساعة والمهام)", to: "/home", combo: "Alt+H" },
  { id: "nav.dashboard", group: "الصفحات", label: "لوحة المؤشرات", to: "/dashboard", combo: "Alt+D" },
  { id: "nav.journal", group: "الصفحات", label: "دفتر اليومية العامة", to: "/journal", combo: "Alt+Shift+J" },
  { id: "nav.recurring", group: "الصفحات", label: "القيود الدورية", to: "/recurring", combo: "Ctrl+Alt+J" },
  { id: "nav.opening_closing", group: "الصفحات", label: "القيد الافتتاحي وقيد الإقفال", to: "/opening-closing", combo: "Ctrl+Alt+O" },
  { id: "nav.documents", group: "الصفحات", label: "المستندات والفواتير", to: "/documents", combo: "Alt+E" },
  { id: "nav.treasury", group: "الصفحات", label: "الصناديق والعملات", to: "/treasury", combo: "Alt+3" },
  { id: "nav.cheques", group: "الصفحات", label: "الشيكات والبنوك", to: "/cheques", combo: "Alt+K" },
  { id: "nav.assets", group: "الصفحات", label: "الأصول الثابتة", to: "/assets", combo: "Alt+8" },
  { id: "nav.pos", group: "الصفحات", label: "نقطة البيع", to: "/pos", combo: "Alt+C" },
  { id: "nav.stock", group: "الصفحات", label: "حركات المخزون", to: "/stock", combo: "Alt+M" },
  { id: "nav.stocktake", group: "الصفحات", label: "الجرد المخزني", to: "/stocktake", combo: "Alt+6" },
  { id: "nav.batches", group: "الصفحات", label: "دفعات وصلاحية", to: "/batches", combo: "Alt+7" },
  { id: "nav.manufacturing", group: "الصفحات", label: "أوامر التصنيع", to: "/manufacturing", combo: "Alt+4" },
  { id: "nav.assembly", group: "الصفحات", label: "الفك والتجميع", to: "/assembly", combo: "Alt+5" },
  { id: "nav.project_board", group: "الصفحات", label: "لوحة متابعة المشاريع", to: "/project-board", combo: "Alt+0" },
  { id: "nav.payroll", group: "الصفحات", label: "الموظفون والرواتب", to: "/payroll", combo: "Alt+9" },
  { id: "nav.reports", group: "الصفحات", label: "التقارير المالية", to: "/reports", combo: "Alt+G" },
  { id: "nav.ledgers", group: "الصفحات", label: "دفاتر الأستاذ والكشوف", to: "/ledgers", combo: "Alt+L" },
  { id: "nav.audit", group: "الصفحات", label: "سجل حركات المستخدمين", to: "/audit", combo: "Alt+Shift+U" },
  { id: "nav.chat", group: "الصفحات", label: "المحادثات", to: "/chat", combo: "Alt+Shift+M" },
  { id: "nav.notes", group: "الصفحات", label: "المهام والملاحظات", to: "/notes", combo: "Alt+N" },
  { id: "nav.assistant", group: "الصفحات", label: "المساعد الذكي", to: "/assistant", combo: "Alt+Shift+Y" },
  { id: "nav.settings", group: "الصفحات", label: "الإعدادات", to: "/settings", combo: "Alt+," },
  { id: "nav.shortcuts", group: "الصفحات", label: "الاختصارات", to: "/shortcuts", combo: "Alt+/" },
  { id: "act.refresh", group: "النوافذ", label: "تحديث بيانات الشاشة", to: "", combo: "Alt+U" },
  { id: "win.close", group: "النوافذ", label: "إغلاق النافذة المفتوحة (أو Esc)", to: "", combo: "Alt+W" },
];

export type ShortcutPrefs = { enabled?: boolean; map?: Record<string, string> };

export function shortcutsEnabled(extra: Extra | undefined) {
  return extra?.shortcuts?.enabled !== false;
}

/** Effective combo for each action id (user overrides on top of defaults). */
export function effectiveCombos(extra: Extra | undefined): Record<string, string> {
  const map = extra?.shortcuts?.map ?? {};
  return Object.fromEntries(SHORTCUT_ACTIONS.map((a) => [a.id, map[a.id] ?? a.combo]));
}

/** Finds the combo shown next to a menu entry that opens `to` (+search/table). */
export function comboFor(combos: Record<string, string>, to: string, search?: Record<string, string>, table?: string) {
  const s = JSON.stringify(search ?? {});
  const a = SHORTCUT_ACTIONS.find((x) => x.to === to && JSON.stringify(x.search ?? {}) === s && (x.table ?? "") === (table ?? ""));
  return a ? combos[a.id] || "" : "";
}

/** Converts a keyboard event into "Ctrl+Alt+Shift+K" using physical keys (works with Arabic layout). */
export function eventCombo(e: KeyboardEvent): string | null {
  const c = e.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit\d$/.test(c)) key = c.slice(5);
  else if (/^Numpad\d$/.test(c)) key = c.slice(6);
  else if (/^F\d{1,2}$/.test(c)) key = c;
  else if (c === "Slash") key = "/";
  else if (c === "Period") key = ".";
  else if (c === "Comma") key = ",";
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (!parts.length && !key.startsWith("F")) return null; // plain letters would break typing
  return [...parts, key].join("+");
}
