export const CURRENCY_LABEL: Record<string, string> = { USD: "$", SYP: "ل.س" };

export const ACCOUNT_NATURE_LABEL: Record<string, string> = {
  assets: "أصول",
  liabilities: "خصوم",
  equity: "حقوق ملكية",
  revenues: "إيرادات",
  expenses: "مصاريف",
  closing: "حسابات ختامية",
  cost_centers: "مراكز كلفة",
  balance_sheet: "ميزانية",
  profit_loss: "أرباح وخسائر",
};

/** Natures that belong to the income statement (أرباح وخسائر). */
export const PL_NATURES = ["profit_loss", "revenues", "expenses"];

export function isProfitLoss(nature: string | null | undefined): boolean {
  return PL_NATURES.includes(nature ?? "");
}

export const PARTNER_TYPE_LABEL: Record<string, string> = {
  customer: "زبون",
  supplier: "مورد",
  both: "زبون ومورد",
};

export const CHEQUE_STATUS_LABEL: Record<string, string> = {
  pending: "قيد التحصيل",
  collected: "محصّل",
  returned: "مرتجع",
  cancelled: "ملغى",
};

export const CHEQUE_DIRECTION_LABEL: Record<string, string> = {
  incoming: "وارد (برسم التحصيل)",
  outgoing: "صادر (مدفوع)",
};

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  lead: "عميل مهتم",
  active: "قيد التنفيذ",
  on_hold: "متوقف",
  completed: "تم الإنجاز",
  closed: "مغلق",
};

export const MOVE_DIRECTION_LABEL: Record<string, string> = { in: "إدخال", out: "إخراج" };

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  INSERT: "إضافة",
  UPDATE: "تعديل",
  DELETE: "حذف",
};

export const MODULE_LABEL: Record<string, string> = {
  accounts: "الحسابات",
  journal: "اليومية العامة",
  documents: "المستندات والفواتير (كل الأنواع)",
  sales: "دورة المبيعات (عروض، فواتير، مرتجعات، قبض)",
  purchases: "دورة المشتريات (طلبات، أوامر، فواتير، مرتجعات، دفع، صرف)",
  inventory: "دورة المخازن (إدخال، تسليم مواد، مناقلة)",
  partners: "الزبائن والموردون",
  cheques: "الشيكات والبنوك",
  assets: "الأصول الثابتة",
  products: "بطاقات المواد",
  warehouses: "المستودعات",
  stock: "حركات المخزون",
  projects: "إدارة المشاريع (كل أقسام المشروع)",
  project_survey: "↳ مشروع: الكشف والدراسة الأولية",
  project_procurement: "↳ مشروع: تأمين المواد والتوريدات",
  project_civil: "↳ مشروع: الأعمال المدنية",
  project_mechanical: "↳ مشروع: الأعمال المعدنية والألواح",
  project_electrical: "↳ مشروع: الأعمال الكهربائية والتشغيل",
  project_finance: "↳ مشروع: القسم المالي",
  project_permits: "↳ مشروع: التراخيص والموافقات",
  project_users: "↳ مشروع: إدارة فريق المشاريع",
  payroll: "الموظفون والرواتب",
  reports: "التقارير",
  users: "المستخدمون",
  audit: "سجل الحركات",
};

export function fmtNum(v: number | string | null | undefined, digits = 2) {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtMoney(v: number | string | null | undefined, currency = "USD") {
  return `${fmtNum(v)} ${CURRENCY_LABEL[currency] ?? currency}`;
}

export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  // Latin digits as YYYY/MM/DD: Arabic-Indic digits with bidi marks mixed with doc numbers in RTL text.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("ar-SY");
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
