/** Document patterns: saved per-tenant presets for a document type (fixed values, locked/hidden fields, allowed partners). */
export type DocPattern = {
  id: string;
  name: string;
  doc_type: string;
  defaults: Record<string, string>;
  locked: string[];
  hidden: string[];
  partner_ids: string[];
  /** Allowed warehouses; empty means all. */
  warehouse_ids?: string[];
  /** Allowed cash/bank accounts; empty means all. */
  cash_account_ids?: string[];
  /** Allowed currencies; empty means all. */
  currency_codes?: string[];
  /** Partner categories (is_group partners); any card under them is allowed. */
  partner_group_ids?: string[];
  /** Ledger accounts (leaf or group); partners whose account sits under them are allowed. */
  partner_account_ids?: string[];
  /** Users allowed to use this pattern; empty means everyone with the document-type permission. */
  allowed_user_ids: string[];
  is_active: boolean;
  /** Editable description of the entry/procedure this sub-pattern produces. */
  explanation?: string | null;
  /** Account overrides; `main` replaces the primary pattern's main account when posting. */
  accounts?: Record<string, string>;
};

export const PATTERN_DOC_TYPES: [string, string][] = [
  ["sale", "فاتورة مبيع"], ["purchase", "فاتورة شراء"], ["sale_return", "مرتجع مبيع"], ["purchase_return", "مرتجع شراء"],
  ["quote", "عرض سعر"], ["receipt", "سند قبض"], ["payment", "سند دفع"], ["transfer", "مناقلة بين المستودعات"],
  ["stock_in", "إدخال مستودع"], ["stock_out", "سند تسليم مواد (إخراج مستودع)"], ["purchase_request", "طلب شراء"],
  ["purchase_order", "أمر شراء"], ["payment_order", "أمر صرف"], ["opening_inventory", "بضاعة أول المدة"], ["closing_inventory", "بضاعة آخر المدة"],
  ["stocktake", "جرد مخزني"],
];

/** Header fields a pattern can fix (and optionally lock). */
export const PATTERN_FIXED_FIELDS = [
  { key: "warehouse_id", label: "المستودع", ref: "warehouses" },
  { key: "to_warehouse_id", label: "مستودع الوجهة (للمناقلة)", ref: "warehouses" },
  { key: "partner_id", label: "الزبون / المورد", ref: "partners" },
  { key: "cash_account_id", label: "الصندوق النقدي", ref: "accounts" },
  { key: "account_id", label: "الحساب المقابل (صندوق / مصرف)", ref: "accounts" },
  { key: "project_id", label: "المشروع", ref: "projects" },
  { key: "payment_mode", label: "طريقة الدفع", options: [["credit", "آجل"], ["cash", "نقدي"]] },
  { key: "currency", label: "العملة", ref: "currencies" },
  { key: "notes", label: "ملاحظات افتراضية" },
] as const;

/** Fields that can be hidden from the document form. */
export const PATTERN_HIDEABLE = [
  ["currency", "العملة وسعر الصرف"],
  ["partner_account_id", "حساب الزبون / المورد"],
  ["project_id", "المشروع"],
  ["payment_mode", "طريقة الدفع"],
  ["notes", "الملاحظات"],
  ["balance_info", "صندوق معلومات الرصيد"],
  ["expiry", "تاريخ الصلاحية في الأسطر"],
  ["line_adjust", "حسم وإضافة السطر"],
  ["charges", "حسميات وإضافات الفاتورة"],
] as const;

/** Form values after applying a pattern's fixed values to a fresh document. */
export function applyPattern<T extends Record<string, unknown>>(form: T, p: Pick<DocPattern, "defaults" | "doc_type"> & { id?: string }): T {
  const out: Record<string, unknown> = { ...form, doc_type: p.doc_type };
  if ("id" in p && p.id) out["pattern_id"] = p.id;
  for (const [k, v] of Object.entries(p.defaults ?? {})) if (v !== "" && v != null) out[k] = v;
  return out as T;
}

/** Partners allowed by a pattern; no cards, categories or accounts selected means no restriction. */
export function patternAllowsPartner(
  p: Pick<DocPattern, "partner_ids" | "partner_group_ids" | "partner_account_ids"> | null | undefined,
  partner: string | { id: string; parent_id?: string | null; account_id?: string | null },
  partnerParent: Map<string, string | null> = new Map(),
  accountParent: Map<string, string | null> = new Map(),
): boolean {
  if (!p) return true;
  const ids = p.partner_ids ?? [], groups = p.partner_group_ids ?? [], accs = p.partner_account_ids ?? [];
  if (!ids.length && !groups.length && !accs.length) return true;
  const pt = typeof partner === "string" ? { id: partner } : partner;
  if (ids.includes(pt.id)) return true;
  const under = (start: string | null | undefined, parents: Map<string, string | null>, set: string[]) => {
    const seen = new Set<string>();
    for (let c = start ?? null; c && !seen.has(c); c = parents.get(c) ?? null) { if (set.includes(c)) return true; seen.add(c); }
    return false;
  };
  if (groups.length && under("parent_id" in pt ? pt.parent_id : partnerParent.get(pt.id), partnerParent, groups)) return true;
  if (accs.length && under("account_id" in pt ? pt.account_id : null, accountParent, accs)) return true;
  return false;
}

/** Visible-field choice is stored as the complement (hidden) so older patterns keep working. */
export const visibleFromHidden = (hidden: string[], all: readonly string[]) => all.filter((k) => !hidden.includes(k));

/** Whether a user may open/use a pattern: admins always; otherwise empty list = everyone. */
export function patternAllowsUser(p: Pick<DocPattern, "allowed_user_ids"> | null | undefined, userId: string | null | undefined, isAdmin = false): boolean {
  if (!p) return false;
  if (isAdmin) return true;
  const list = p.allowed_user_ids ?? [];
  return list.length === 0 || (!!userId && list.includes(userId));
}

/** Primary-pattern accounting guide: usual entry, automatic procedures, and which setting holds the main account. */
export type PrimaryGuide = { entry: string[]; steps: string[]; main?: { setting: string; label: string } };
export const PRIMARY_GUIDE: Record<string, PrimaryGuide> = {
  sale: { entry: ["من حـ/ الزبون أو الصندوق (مدين) بصافي الفاتورة", "إلى حـ/ المبيعات (دائن)", "من حـ/ تكلفة المبيعات (مدين) — إلى حـ/ مخزون المستودع (دائن) في الجرد المستمر", "الحسم الممنوح مدين، والإضافات دائنة"], steps: ["يُخرج الكميات من المستودع المحدد", "يحسب الكلفة حسب طريقة التسعير (وسطي / آخر شراء)", "يسجّل الحركة في كشف حساب الزبون أو الصندوق"], main: { setting: "sales_account_id", label: "حساب المبيعات" } },
  sale_return: { entry: ["من حـ/ مردودات المبيعات (مدين)", "إلى حـ/ الزبون أو الصندوق (دائن)", "من حـ/ المخزون — إلى حـ/ تكلفة المبيعات (عكس الكلفة)"], steps: ["يعيد الكميات إلى المستودع", "يخفض رصيد الزبون"], main: { setting: "sales_account_id", label: "حساب مردودات المبيعات" } },
  purchase: { entry: ["من حـ/ مخزون المستودع أو المشتريات (مدين)", "إلى حـ/ المورد أو الصندوق (دائن)", "الحسم المكتسب دائن، ومصاريف النقل تُحمّل على الكلفة أو على حسابها"], steps: ["يدخل الكميات إلى المستودع", "يعيد حساب متوسط الكلفة وآخر سعر شراء", "يسجّل الحركة في كشف حساب المورد"], main: { setting: "inventory_account_id", label: "حساب المخزون / المشتريات" } },
  purchase_return: { entry: ["من حـ/ المورد أو الصندوق (مدين)", "إلى حـ/ المخزون أو مردودات المشتريات (دائن)"], steps: ["يخرج الكميات من المستودع", "يخفض رصيد المورد"], main: { setting: "inventory_account_id", label: "حساب المخزون / مردودات المشتريات" } },
  receipt: { entry: ["من حـ/ الصندوق أو المصرف (مدين)", "إلى حـ/ الزبون أو الحساب المقابل (دائن)"], steps: ["يزيد رصيد الصندوق", "يسدد فواتير الزبون المرتبطة إن وجدت"], main: { setting: "cash_account_id", label: "الصندوق الافتراضي" } },
  payment: { entry: ["من حـ/ المورد أو المصروف (مدين)", "إلى حـ/ الصندوق أو المصرف (دائن)"], steps: ["ينقص رصيد الصندوق", "يسدد فواتير المورد المرتبطة إن وجدت"], main: { setting: "cash_account_id", label: "الصندوق الافتراضي" } },
  transfer: { entry: ["من حـ/ مخزون مستودع الوجهة (مدين)", "إلى حـ/ مخزون مستودع المصدر (دائن) بالكلفة"], steps: ["ينقل الكميات بين المستودعين دون ربح"] },
  stock_in: { entry: ["من حـ/ مخزون المستودع (مدين)", "إلى حـ/ الحساب المقابل (دائن)"], steps: ["يدخل الكميات ويعدّل الكلفة"] },
  stock_out: { entry: ["من حـ/ الحساب المقابل أو تكاليف المشروع (مدين)", "إلى حـ/ مخزون المستودع (دائن) بالكلفة"], steps: ["يخرج الكميات بالكلفة"] },
  opening_inventory: { entry: ["من حـ/ مخزون كل مستودع (مدين)", "إلى حـ/ رأس المال (دائن) ضمن القيد الافتتاحي"], steps: ["يضيف الكميات الافتتاحية"], main: { setting: "capital_account_id", label: "حساب رأس المال" } },
  closing_inventory: { entry: ["تقييم فقط: من حـ/ المخزون (مدين) — إلى حـ/ الحساب المقابل (دائن) في الجرد الدوري"], steps: ["لا يضيف أي كمية للمخزون"] },
  quote: { entry: ["لا يولد قيداً"], steps: ["مستند عرض فقط يمكن تحويله لفاتورة"] },
  purchase_request: { entry: ["لا يولد قيداً"], steps: ["طلب داخلي يحتاج موافقة"] },
  purchase_order: { entry: ["لا يولد قيداً"], steps: ["التزام مع المورد يُحوّل لفاتورة شراء"] },
  payment_order: { entry: ["لا يولد قيداً حتى الصرف"], steps: ["أمر يُحوّل إلى سند دفع"] },
};
/** Settings accounts that a primary pattern edits (moved here from the old accounting-links screen). */
export const PRIMARY_ACCOUNTS: Record<string, [string, string][]> = {
  sale: [["customers_account_id", "حساب الزبائن"], ["sales_account_id", "حساب المبيعات"], ["cogs_account_id", "حساب تكلفة المبيعات"], ["sales_discount_account_id", "الحسم الممنوح"], ["sales_freight_account_id", "مصاريف النقل"]],
  sale_return: [["customers_account_id", "حساب الزبائن"], ["cogs_account_id", "حساب تكلفة المبيعات"]],
  purchase: [["suppliers_account_id", "حساب الموردين"], ["inventory_account_id", "حساب المخزون الاحتياطي"], ["purchases_account_id", "حساب المشتريات (جرد دوري)"], ["purchase_discount_account_id", "الحسم المكتسب"], ["purchase_freight_account_id", "مصاريف النقل"]],
  purchase_return: [["suppliers_account_id", "حساب الموردين"], ["inventory_account_id", "حساب المخزون الاحتياطي"]],
  receipt: [["cash_account_id", "الصندوق / المصرف"], ["notes_receivable_account_id", "أوراق القبض"]],
  payment: [["cash_account_id", "الصندوق / المصرف"], ["notes_payable_account_id", "أوراق الدفع"]],
  stock_out: [["project_cost_account_id", "تكاليف المشاريع"]],
  opening_inventory: [["capital_account_id", "حساب رأس المال"]],
  closing_inventory: [["inventory_account_id", "حساب المخزون"]],
  stocktake: [["inventory_account_id", "حساب المخزون"], ["stock_shortage_account_id", "حساب عجز الجرد"], ["stock_surplus_account_id", "حساب زيادة الجرد"]],
};
/** doc types whose main account per document type (doc_type_accounts) can be overridden. */
export const MAIN_OVERRIDABLE = ["sale", "sale_return", "purchase", "purchase_return", "receipt", "payment"];

/** Warehouses a pattern allows; empty list means all. */
export const patternAllowsWarehouse = (p: Pick<DocPattern, "warehouse_ids"> | null | undefined, id: string) => !p?.warehouse_ids?.length || p.warehouse_ids.includes(id);
/** Cash/bank accounts a pattern allows; empty list means all. */
export const patternAllowsCash = (p: Pick<DocPattern, "cash_account_ids"> | null | undefined, id: string) => !p?.cash_account_ids?.length || p.cash_account_ids.includes(id);
/** Currencies a pattern allows; empty list means all. */
export const patternAllowsCurrency = (p: Pick<DocPattern, "currency_codes"> | null | undefined, code: string) => !p?.currency_codes?.length || p.currency_codes.includes(code);

/** Header fields that make sense for a document type (e.g. destination warehouse only for transfers). */
export function fieldAppliesTo(key: string, docType: string): boolean {
  if (key === "to_warehouse_id") return docType === "transfer";
  if (key === "warehouse_id") return !["receipt", "payment", "payment_order"].includes(docType);
  if (key === "cash_account_id" || key === "payment_mode") return ["sale", "purchase", "sale_return", "purchase_return"].includes(docType);
  if (key === "account_id") return ["receipt", "payment", "payment_order", "stock_in", "stock_out", "opening_inventory", "closing_inventory"].includes(docType);
  if (key === "partner_id") return !["transfer", "stock_in", "stock_out", "opening_inventory", "closing_inventory"].includes(docType);
  return true;
}

/**
 * Selecting categories/accounts also selects what they cover: every partner card under a chosen category
 * or whose ledger account sits under a chosen account, plus those partners' accounts.
 */
export function expandPartnerScope(
  groups: string[], accounts: string[],
  partners: { id: string; parent_id?: string | null; account_id?: string | null; is_group?: boolean }[],
  accountParent: Map<string, string | null>,
): { partnerIds: string[]; accountIds: string[] } {
  const pParent = new Map(partners.map((p) => [p.id, p.parent_id ?? null]));
  const under = (start: string | null | undefined, parents: Map<string, string | null>, set: string[]) => {
    const seen = new Set<string>();
    for (let c = start ?? null; c && !seen.has(c); c = parents.get(c) ?? null) { if (set.includes(c)) return true; seen.add(c); }
    return false;
  };
  const hit = partners.filter((p) => !p.is_group && ((groups.length && under(p.parent_id, pParent, groups)) || (accounts.length && under(p.account_id, accountParent, accounts))));
  return { partnerIds: hit.map((p) => p.id), accountIds: hit.map((p) => p.account_id).filter((x): x is string => !!x) };
}

/** Primary (unpatterned) document access; tenant_settings.primary_pattern_denied maps user id -> denied doc types. */
export function primaryAllowed(denied: Record<string, string[]> | null | undefined, userId: string | null | undefined, docType: string, isAdmin = false): boolean {
  if (isAdmin || !userId) return true;
  return !(denied?.[userId] ?? []).includes(docType);
}
