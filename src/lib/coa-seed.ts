/** Standard unified chart of accounts (hierarchical, Arabic + English). */
export type SeedAccount = {
  code: string;
  name: string;
  nameEn: string;
  parent?: string;
  nature: "assets" | "liabilities" | "equity" | "revenues" | "expenses" | "balance_sheet" | "profit_loss" | "closing";
  isGroup?: boolean;
};

export const UNIFIED_COA: SeedAccount[] = [
  { code: "1", name: "الأصول", nameEn: "Assets", nature: "assets", isGroup: true },
  { code: "11", name: "الأصول المتداولة", nameEn: "Current Assets", parent: "1", nature: "assets", isGroup: true },
  { code: "1100", name: "النقدية وما يعادلها", nameEn: "Cash and Equivalents", parent: "11", nature: "assets", isGroup: true },
  { code: "1101", name: "الصندوق", nameEn: "Cash on Hand", parent: "1100", nature: "assets" },
  { code: "1102", name: "المصارف", nameEn: "Banks", parent: "1100", nature: "assets" },
  { code: "1103", name: "شيكات برسم التحصيل", nameEn: "Cheques Under Collection", parent: "1100", nature: "assets" },
  { code: "1200", name: "الذمم المدينة", nameEn: "Receivables", parent: "11", nature: "assets", isGroup: true },
  { code: "1201", name: "الزبائن", nameEn: "Customers", parent: "1200", nature: "assets" },
  { code: "1202", name: "سلف وأمانات", nameEn: "Advances and Deposits", parent: "1200", nature: "assets" },
  { code: "1300", name: "المخزون", nameEn: "Inventory", parent: "11", nature: "assets", isGroup: true },
  { code: "1301", name: "مخزون المواد", nameEn: "Materials Inventory", parent: "1300", nature: "assets" },
  { code: "1302", name: "أعمال تحت التنفيذ", nameEn: "Work in Progress", parent: "1300", nature: "assets" },
  { code: "12", name: "الأصول الثابتة", nameEn: "Fixed Assets", parent: "1", nature: "assets", isGroup: true },
  { code: "1201F", name: "الآليات والمعدات", nameEn: "Machinery and Equipment", parent: "12", nature: "assets" },
  { code: "1202F", name: "السيارات", nameEn: "Vehicles", parent: "12", nature: "assets" },
  { code: "1203F", name: "الأثاث والتجهيزات", nameEn: "Furniture and Fixtures", parent: "12", nature: "assets" },
  { code: "1290", name: "مجمع الاهتلاك", nameEn: "Accumulated Depreciation", parent: "12", nature: "assets" },

  { code: "2", name: "الخصوم", nameEn: "Liabilities", nature: "liabilities", isGroup: true },
  { code: "21", name: "الخصوم المتداولة", nameEn: "Current Liabilities", parent: "2", nature: "liabilities", isGroup: true },
  { code: "2101", name: "الموردون", nameEn: "Suppliers", parent: "21", nature: "liabilities" },
  { code: "2102", name: "شيكات صادرة", nameEn: "Cheques Payable", parent: "21", nature: "liabilities" },
  { code: "2103", name: "مصاريف مستحقة", nameEn: "Accrued Expenses", parent: "21", nature: "liabilities" },
  { code: "2104", name: "دفعات مقبوضة مقدماً", nameEn: "Advance Payments Received", parent: "21", nature: "liabilities" },
  { code: "22", name: "الخصوم طويلة الأجل", nameEn: "Long-Term Liabilities", parent: "2", nature: "liabilities", isGroup: true },
  { code: "2201", name: "قروض طويلة الأجل", nameEn: "Long-Term Loans", parent: "22", nature: "liabilities" },

  { code: "3", name: "حقوق الملكية", nameEn: "Equity", nature: "equity", isGroup: true },
  { code: "3101", name: "رأس المال", nameEn: "Capital", parent: "3", nature: "equity" },
  { code: "3102", name: "الاحتياطيات", nameEn: "Reserves", parent: "3", nature: "equity" },
  { code: "3103", name: "الأرباح المدورة", nameEn: "Retained Earnings", parent: "3", nature: "equity" },
  { code: "3104", name: "حساب الجاري للشركاء", nameEn: "Partners Current Account", parent: "3", nature: "equity" },

  { code: "4", name: "الإيرادات", nameEn: "Revenue", nature: "revenues", isGroup: true },
  { code: "4101", name: "إيرادات المبيعات", nameEn: "Sales Revenue", parent: "4", nature: "revenues" },
  { code: "4102", name: "إيرادات المقاولات والمشاريع", nameEn: "Contracting and Project Revenue", parent: "4", nature: "revenues" },
  { code: "4103", name: "إيرادات أخرى", nameEn: "Other Revenue", parent: "4", nature: "revenues" },
  { code: "4104", name: "الحسم المكتسب", nameEn: "Purchase Discounts Earned", parent: "4", nature: "revenues" },
  { code: "4105", name: "أجور نقل محمّلة على الزبائن", nameEn: "Freight Charged to Customers", parent: "4", nature: "revenues" },

  { code: "5", name: "المصاريف والتكاليف", nameEn: "Expenses and Costs", nature: "expenses", isGroup: true },
  { code: "51", name: "التكاليف المباشرة", nameEn: "Direct Costs", parent: "5", nature: "expenses", isGroup: true },
  { code: "5101", name: "تكلفة المبيعات", nameEn: "Cost of Sales", parent: "51", nature: "expenses" },
  { code: "5102", name: "تكاليف المشاريع", nameEn: "Project Costs", parent: "51", nature: "expenses" },
  { code: "5103", name: "أجور عمال", nameEn: "Labour Wages", parent: "51", nature: "expenses" },
  { code: "5104", name: "مصاريف نقل المشتريات", nameEn: "Purchase Freight", parent: "51", nature: "expenses" },
  { code: "52", name: "المصاريف التشغيلية", nameEn: "Operating Expenses", parent: "5", nature: "expenses", isGroup: true },
  { code: "5201", name: "الرواتب والأجور", nameEn: "Salaries and Wages", parent: "52", nature: "expenses" },
  { code: "5202", name: "الإيجارات", nameEn: "Rent", parent: "52", nature: "expenses" },
  { code: "5203", name: "الكهرباء والماء والاتصالات", nameEn: "Utilities and Communications", parent: "52", nature: "expenses" },
  { code: "5204", name: "المحروقات والنقل", nameEn: "Fuel and Transport", parent: "52", nature: "expenses" },
  { code: "5205", name: "الصيانة", nameEn: "Maintenance", parent: "52", nature: "expenses" },
  { code: "5206", name: "مصاريف الاهتلاك", nameEn: "Depreciation Expense", parent: "52", nature: "expenses" },
  { code: "5207", name: "مصاريف إدارية وعمومية", nameEn: "General and Administrative", parent: "52", nature: "expenses" },
  { code: "5208", name: "الحسم الممنوح", nameEn: "Sales Discounts Allowed", parent: "52", nature: "expenses" },
  { code: "5209", name: "فروق أسعار الصرف", nameEn: "Exchange Rate Differences", parent: "52", nature: "expenses" },
  { code: "5300", name: "مراكز الكلفة", nameEn: "Cost Centers", parent: "5", nature: "expenses", isGroup: true },

  { code: "9", name: "الحسابات الختامية", nameEn: "Closing Accounts", nature: "closing", isGroup: true },
  { code: "9101", name: "حساب المتاجرة", nameEn: "Trading Account", parent: "9", nature: "closing" },
  { code: "9102", name: "حساب الأرباح والخسائر", nameEn: "Profit and Loss Account", parent: "9", nature: "closing" },
];

/** Account codes wired into the automatic posting settings. */
export const SETTINGS_MAP = {
  cash_account_id: "1101",
  customers_account_id: "1201",
  suppliers_account_id: "2101",
  inventory_account_id: "1301",
  sales_account_id: "4101",
  cogs_account_id: "5101",
  project_cost_account_id: "5102",
  sales_discount_account_id: "5208",
  purchase_discount_account_id: "4104",
  sales_freight_account_id: "4105",
  purchase_freight_account_id: "5104",
  fx_account_id: "5209",
};

/** Default accounts for invoice discounts and freight: [settings key, code, name, nameEn, nature, parent code]. */
export const DISCOUNT_FREIGHT_DEFAULTS = [
  ["sales_discount_account_id", "5208", "الحسم الممنوح", "Sales Discounts Allowed", "expenses", "52"],
  ["purchase_discount_account_id", "4104", "الحسم المكتسب", "Purchase Discounts Earned", "revenues", "4"],
  ["sales_freight_account_id", "4105", "أجور نقل محمّلة على الزبائن", "Freight Charged to Customers", "revenues", "4"],
  ["purchase_freight_account_id", "5104", "مصاريف نقل المشتريات", "Purchase Freight", "expenses", "51"],
] as const;

export const DEMO_WAREHOUSES = [
  { code: "WH1", name: "المستودع الرئيسي", name_en: "Main Warehouse", location: "المقر العام" },
  { code: "WH2", name: "مستودع الموقع", name_en: "Site Warehouse", location: "موقع المشروع" },
  { code: "WH3", name: "مستودع الفرع", name_en: "Branch Warehouse", location: "الفرع الثاني" },
];

export const DEMO_PRODUCTS = [
  { sku: "P-001", name: "إسمنت بورتلاندي", name_en: "Portland Cement", unit: "طن", category: "مواد بناء", sale_price: 95, purchase_price: 80 },
  { sku: "P-002", name: "حديد تسليح 12 مم", name_en: "Rebar 12mm", unit: "طن", category: "مواد بناء", sale_price: 720, purchase_price: 650 },
  { sku: "P-003", name: "رمل ناعم", name_en: "Fine Sand", unit: "م3", category: "مواد بناء", sale_price: 18, purchase_price: 12 },
  { sku: "P-004", name: "بلوك إسمنتي", name_en: "Cement Block", unit: "قطعة", category: "مواد بناء", sale_price: 1.2, purchase_price: 0.9 },
  { sku: "P-005", name: "بحص مغسول", name_en: "Washed Gravel", unit: "م3", category: "مواد بناء", sale_price: 22, purchase_price: 15 },
  { sku: "P-006", name: "خشب سويد", name_en: "Swedish Timber", unit: "م3", category: "أخشاب", sale_price: 480, purchase_price: 410 },
  { sku: "P-007", name: "دهان أبيض داخلي", name_en: "Interior White Paint", unit: "غالون", category: "دهانات", sale_price: 35, purchase_price: 26 },
  { sku: "P-008", name: "أنابيب PVC 2 إنش", name_en: "PVC Pipe 2in", unit: "قطعة", category: "سباكة", sale_price: 8, purchase_price: 5.5 },
  { sku: "P-009", name: "كابل كهرباء 2.5 مم", name_en: "Electric Cable 2.5mm", unit: "لفة", category: "كهربائيات", sale_price: 60, purchase_price: 48 },
  { sku: "P-010", name: "سيراميك أرضيات 60×60", name_en: "Floor Ceramic 60x60", unit: "م2", category: "تشطيبات", sale_price: 14, purchase_price: 10 },
];

export const DEMO_PARTNERS = [
  { code: "S-001", name: "مؤسسة البناء للتوريدات", name_en: "Al-Bina Supplies Co.", partner_type: "supplier", account: "2101", phone: "011-2233445", credit_limit: 50000 },
  { code: "S-002", name: "شركة الحديد الوطنية", name_en: "National Steel Co.", partner_type: "supplier", account: "2101", phone: "011-5566778", credit_limit: 100000 },
  { code: "S-003", name: "معمل الدهانات الحديثة", name_en: "Modern Paints Factory", partner_type: "supplier", account: "2101", phone: "011-8899000", credit_limit: 30000 },
  { code: "C-001", name: "بلدية المدينة", name_en: "City Municipality", partner_type: "customer", account: "1201", phone: "011-1122334", credit_limit: 200000 },
  { code: "C-002", name: "شركة الإعمار الحديثة", name_en: "Modern Reconstruction Co.", partner_type: "customer", account: "1201", phone: "011-4455667", credit_limit: 150000 },
  { code: "C-003", name: "مؤسسة الأفق للمقاولات", name_en: "Al-Ofoq Contracting", partner_type: "customer", account: "1201", phone: "011-7788990", credit_limit: 80000 },
  { code: "B-001", name: "شركة التبادل التجاري", name_en: "Trade Exchange Co.", partner_type: "both", account: "1201", phone: "011-9900112", credit_limit: 60000 },
];

export const DEMO_PROJECTS = [
  { code: "PRJ-01", name: "مشروع تأهيل الطريق العام", name_en: "Highway Rehabilitation", contract_value: 250000, status: "active" },
  { code: "PRJ-02", name: "مشروع بناء مدرسة", name_en: "School Construction", contract_value: 400000, status: "active" },
  { code: "PRJ-03", name: "مشروع شبكة مياه الحي الشمالي", name_en: "North District Water Network", contract_value: 180000, status: "active" },
];

export const DEMO_COST_CENTERS = [
  { code: "CC1", name: "الإدارة العامة", name_en: "General Administration" },
  { code: "CC2", name: "المشاريع", name_en: "Projects" },
  { code: "CC3", name: "المستودعات", name_en: "Warehouses" },
];

/** Opening journal entry: capital, cash and bank balances. */
export const DEMO_OPENING = [
  { account: "1101", debit: 50000, credit: 0, description: "رصيد افتتاحي - الصندوق" },
  { account: "1102", debit: 150000, credit: 0, description: "رصيد افتتاحي - المصارف" },
  { account: "1301", debit: 80000, credit: 0, description: "رصيد افتتاحي - المخزون" },
  { account: "1201", debit: 45000, credit: 0, description: "رصيد افتتاحي - الزبائن" },
  { account: "2101", debit: 0, credit: 35000, description: "رصيد افتتاحي - الموردون" },
  { account: "3101", debit: 0, credit: 290000, description: "رصيد افتتاحي - رأس المال" },
];

type A = SeedAccount;
const g = (code: string, name: string, nameEn: string, nature: A["nature"], parent?: string): A => ({ code, name, nameEn, nature, ...(parent ? { parent } : {}), isGroup: true });
const l = (code: string, name: string, nameEn: string, nature: A["nature"], parent: string): A => ({ code, name, nameEn, nature, parent });

/** Shared accounts that do not depend on the inventory method. */
const COMMON: A[] = [
  g("1", "الأصول", "Assets", "assets"),
  g("11", "الأصول المتداولة", "Current Assets", "assets", "1"),
  g("1101", "النقدية وما يعادلها", "Cash and Equivalents", "assets", "11"),
  l("110101", "الصندوق الرئيسي", "Main Cash", "assets", "1101"),
  l("110102", "المصارف", "Banks", "assets", "1101"),
  l("110103", "شيكات برسم التحصيل", "Cheques Under Collection", "assets", "1101"),
  g("1102", "الذمم المدينة", "Receivables", "assets", "11"),
  l("110201", "الزبائن", "Customers", "assets", "1102"),
  l("110202", "أوراق القبض", "Notes Receivable", "assets", "1102"),
  l("110203", "سلف الموظفين", "Employee Advances", "assets", "1102"),
  l("110204", "مصاريف مدفوعة مقدماً", "Prepaid Expenses", "assets", "1102"),
  g("12", "الأصول الثابتة", "Fixed Assets", "assets", "1"),
  l("1201", "الأراضي والمباني", "Land and Buildings", "assets", "12"),
  l("1202", "الآليات والمعدات", "Machinery and Equipment", "assets", "12"),
  l("1203", "السيارات", "Vehicles", "assets", "12"),
  l("1204", "الأثاث والتجهيزات", "Furniture and Fixtures", "assets", "12"),
  l("1290", "مجمع الاهتلاك", "Accumulated Depreciation", "assets", "12"),

  g("2", "الخصوم", "Liabilities", "liabilities"),
  g("21", "الخصوم المتداولة", "Current Liabilities", "liabilities", "2"),
  l("2101", "الموردون", "Suppliers", "liabilities", "21"),
  l("2102", "أوراق الدفع", "Notes Payable", "liabilities", "21"),
  l("2103", "مصاريف مستحقة", "Accrued Expenses", "liabilities", "21"),
  l("2104", "دفعات مقبوضة مقدماً", "Advance Payments Received", "liabilities", "21"),
  l("2105", "رواتب مستحقة", "Salaries Payable", "liabilities", "21"),
  g("22", "الخصوم طويلة الأجل", "Long-Term Liabilities", "liabilities", "2"),
  l("2201", "قروض طويلة الأجل", "Long-Term Loans", "liabilities", "22"),

  g("3", "حقوق الملكية", "Equity", "equity"),
  l("3101", "رأس المال", "Capital", "equity", "3"),
  l("3102", "الاحتياطيات", "Reserves", "equity", "3"),
  l("3103", "الأرباح المدورة", "Retained Earnings", "equity", "3"),
  l("3104", "جاري الشركاء", "Partners Current Account", "equity", "3"),

  g("4", "الإيرادات", "Revenue", "revenues"),
  g("41", "إيرادات النشاط", "Operating Revenue", "revenues", "4"),
  l("4101", "المبيعات", "Sales", "revenues", "41"),
  l("4102", "مردودات المبيعات", "Sales Returns", "revenues", "41"),
  l("4103", "الحسم الممنوح على المبيعات", "Sales Discounts", "revenues", "41"),
  g("42", "إيرادات أخرى", "Other Revenue", "revenues", "4"),
  l("4201", "إيرادات متنوعة", "Miscellaneous Revenue", "revenues", "42"),
  l("4202", "أرباح فروق الصرف", "FX Gains", "revenues", "42"),
  l("4203", "أجور نقل محمّلة على الزبائن", "Freight Charged to Customers", "revenues", "42"),

  g("5", "المصاريف والتكاليف", "Expenses and Costs", "expenses"),
  g("52", "المصاريف التشغيلية", "Operating Expenses", "expenses", "5"),
  l("5201", "الرواتب والأجور", "Salaries and Wages", "expenses", "52"),
  l("5202", "الإيجارات", "Rent", "expenses", "52"),
  l("5203", "الكهرباء والماء والاتصالات", "Utilities", "expenses", "52"),
  l("5204", "المحروقات والنقل", "Fuel and Transport", "expenses", "52"),
  l("5205", "الصيانة", "Maintenance", "expenses", "52"),
  l("5206", "مصاريف الاهتلاك", "Depreciation Expense", "expenses", "52"),
  l("5207", "مصاريف إدارية وعمومية", "General and Administrative", "expenses", "52"),
  l("5208", "خسائر فروق الصرف", "FX Losses", "expenses", "52"),

];

/** Perpetual: stock is valued continuously; each sale posts cost of sales. */
const PERPETUAL: A[] = [
  g("1103", "المخزون", "Inventory", "assets", "11"),
  l("110301", "مخزون البضاعة", "Merchandise Inventory", "assets", "1103"),
  l("110302", "بضاعة بالطريق", "Goods in Transit", "assets", "1103"),
  g("51", "تكلفة المبيعات", "Cost of Sales", "expenses", "5"),
  l("5101", "تكلفة البضاعة المباعة", "Cost of Goods Sold", "expenses", "51"),
  l("5102", "عجز المخزون", "Inventory Shortage", "expenses", "51"),
  l("5103", "مصاريف نقل المشتريات", "Purchase Freight", "expenses", "51"),
  l("5104", "الحسم المكتسب على المشتريات", "Purchase Discounts", "expenses", "51"),
  l("4204", "زيادة المخزون", "Inventory Surplus", "revenues", "42"),
];

/** Periodic: purchases are expensed; stock is counted at period end through the trading account. */
const PERIODIC: A[] = [
  g("1103", "المخزون", "Inventory", "assets", "11"),
  l("110301", "بضاعة آخر المدة", "Closing Stock", "assets", "1103"),
  g("51", "المشتريات وتكاليفها", "Purchases and Costs", "expenses", "5"),
  l("5101", "المشتريات", "Purchases", "expenses", "51"),
  l("5102", "مردودات المشتريات", "Purchase Returns", "expenses", "51"),
  l("5103", "مصاريف نقل المشتريات", "Purchase Freight", "expenses", "51"),
  l("5104", "الحسم المكتسب على المشتريات", "Purchase Discounts", "expenses", "51"),
  l("5105", "بضاعة أول المدة", "Opening Stock", "expenses", "51"),
];

export function chartFor(method: string | null | undefined): A[] {
  return [...COMMON, ...(method === "periodic" ? PERIODIC : PERPETUAL)];
}

/** Settings key → account code, per inventory method. */
export function settingsMapFor(method: string | null | undefined): Record<string, string> {
  const common = {
    cash_account_id: "110101", customers_account_id: "110201", suppliers_account_id: "2101",
    notes_receivable_account_id: "110202", notes_payable_account_id: "2102", advances_account_id: "110203",
    salaries_account_id: "5201", retained_earnings_account_id: "3103", sales_account_id: "4101",
    sales_discount_account_id: "4103", sales_freight_account_id: "4203", purchase_freight_account_id: "5103",
    purchase_discount_account_id: "5104", fx_gain_account_id: "4202", fx_loss_account_id: "5208", fx_account_id: "5208",
    dep_expense_account_id: "5206", accum_dep_account_id: "1290", inventory_account_id: "110301",
  };
  return method === "periodic"
    ? { ...common, purchases_account_id: "5101" }
    : { ...common, cogs_account_id: "5101", stock_shortage_account_id: "5102", stock_surplus_account_id: "4204", inventory_adjust_account_id: "5102" };
}

/** Which closing account each top-level branch flows into. */
export function closingTarget(code: string, method: string | null | undefined): string | null {
  if (code.startsWith("9")) return null;
  if (code.startsWith("1") || code.startsWith("2") || code.startsWith("3")) return "9103";
  if (code.startsWith("41") || code.startsWith("51") || code === "4204") return "9101";
  return method ? "9102" : "9102";
}
