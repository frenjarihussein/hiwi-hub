/** Business sectors/activities: extra sub-accounts and automatic-posting defaults per activity. */
import type { SeedAccount } from "@/lib/coa-seed";

type Acc = Omit<SeedAccount, "nature"> & { nature?: SeedAccount["nature"] };
export type BusinessActivity = {
  value: string;
  label: string;
  sector: "commercial" | "industrial" | "services";
  accounts: Acc[];
  /** tenant_settings column → account code */
  settings: Record<string, string>;
};

export const SECTORS = [
  { value: "commercial", label: "تجاري" },
  { value: "industrial", label: "صناعي" },
  { value: "services", label: "خدمي" },
] as const;

const bs = (a: Acc): Acc => ({ nature: "balance_sheet", ...a });
const pl = (a: Acc): Acc => ({ nature: "profit_loss", ...a });

export const ACTIVITIES: BusinessActivity[] = [
  {
    value: "general_trading", label: "تجاري عام", sector: "commercial",
    accounts: [
      pl({ code: "4151", name: "مبيعات البضاعة", nameEn: "Merchandise Sales", parent: "4" }),
      pl({ code: "4152", name: "مردودات ومسموحات المبيعات", nameEn: "Sales Returns", parent: "4" }),
      bs({ code: "1341", name: "مخزون بضاعة بغرض البيع", nameEn: "Merchandise Inventory", parent: "1300" }),
      pl({ code: "5151", name: "تكلفة البضاعة المباعة", nameEn: "Cost of Goods Sold", parent: "51" }),
      pl({ code: "5152", name: "عجز وتلف المخزون", nameEn: "Inventory Shrinkage", parent: "51" }),
      pl({ code: "5251", name: "مصاريف الشحن والتوزيع", nameEn: "Shipping and Distribution", parent: "52" }),
    ],
    settings: { sales_account_id: "4151", inventory_account_id: "1341", cogs_account_id: "5151", inventory_adjust_account_id: "5152" },
  },
  {
    value: "pharmacy", label: "صيدلية", sector: "commercial",
    accounts: [
      pl({ code: "4131", name: "مبيعات الأدوية", nameEn: "Medicine Sales", parent: "4" }),
      pl({ code: "4132", name: "مبيعات المستحضرات والمستلزمات الطبية", nameEn: "Cosmetics and Supplies Sales", parent: "4" }),
      bs({ code: "1321", name: "مخزون الأدوية", nameEn: "Medicine Inventory", parent: "1300" }),
      bs({ code: "1322", name: "مخزون المستحضرات والمستلزمات", nameEn: "Cosmetics Inventory", parent: "1300" }),
      pl({ code: "5131", name: "تكلفة الأدوية المباعة", nameEn: "Cost of Medicines Sold", parent: "51" }),
      pl({ code: "5132", name: "خسائر انتهاء الصلاحية والتلف", nameEn: "Expiry and Damage Losses", parent: "51" }),
      pl({ code: "5231", name: "تراخيص ورسوم مهنية", nameEn: "Licenses and Professional Fees", parent: "52" }),
      pl({ code: "5232", name: "مصاريف التبريد والحفظ", nameEn: "Cold Storage Expenses", parent: "52" }),
    ],
    settings: { sales_account_id: "4131", inventory_account_id: "1321", cogs_account_id: "5131", inventory_adjust_account_id: "5132" },
  },
  {
    value: "general_industrial", label: "صناعي عام", sector: "industrial",
    accounts: [
      pl({ code: "4141", name: "مبيعات المنتجات المصنعة", nameEn: "Manufactured Goods Sales", parent: "4" }),
      bs({ code: "1331", name: "مخزون المواد الخام", nameEn: "Raw Materials", parent: "1300" }),
      bs({ code: "1332", name: "مخزون الإنتاج التام", nameEn: "Finished Goods", parent: "1300" }),
      pl({ code: "5141", name: "تكلفة المواد المباشرة", nameEn: "Direct Materials", parent: "51" }),
      pl({ code: "5142", name: "تكاليف صناعية غير مباشرة", nameEn: "Manufacturing Overhead", parent: "51" }),
      pl({ code: "5143", name: "هالك وتالف الإنتاج", nameEn: "Production Scrap", parent: "51" }),
      pl({ code: "5241", name: "طاقة ومحروقات المصنع", nameEn: "Factory Energy", parent: "52" }),
    ],
    settings: { sales_account_id: "4141", inventory_account_id: "1332", cogs_account_id: "5101", inventory_adjust_account_id: "5143" },
  },
  {
    value: "restaurant", label: "مطعم", sector: "services",
    accounts: [
      pl({ code: "4111", name: "مبيعات الأطعمة", nameEn: "Food Sales", parent: "4" }),
      pl({ code: "4112", name: "مبيعات المشروبات", nameEn: "Beverage Sales", parent: "4" }),
      pl({ code: "4113", name: "إيرادات التوصيل", nameEn: "Delivery Revenue", parent: "4" }),
      bs({ code: "1311", name: "مخزون المواد الغذائية", nameEn: "Food Inventory", parent: "1300" }),
      bs({ code: "1312", name: "مخزون المشروبات", nameEn: "Beverage Inventory", parent: "1300" }),
      pl({ code: "5111", name: "تكلفة الأطعمة والمشروبات", nameEn: "Food and Beverage Cost", parent: "51" }),
      pl({ code: "5112", name: "هدر وتالف المواد الغذائية", nameEn: "Food Waste", parent: "51" }),
      pl({ code: "5211", name: "عمولات تطبيقات التوصيل", nameEn: "Delivery App Commissions", parent: "52" }),
      pl({ code: "5212", name: "غاز ووقود المطبخ", nameEn: "Kitchen Gas and Fuel", parent: "52" }),
      pl({ code: "5213", name: "مستلزمات التغليف والتقديم", nameEn: "Packaging Supplies", parent: "52" }),
    ],
    settings: { sales_account_id: "4111", inventory_account_id: "1311", cogs_account_id: "5111", inventory_adjust_account_id: "5112" },
  },
  {
    value: "hotel", label: "فندق", sector: "services",
    accounts: [
      pl({ code: "4121", name: "إيرادات الغرف", nameEn: "Room Revenue", parent: "4" }),
      pl({ code: "4122", name: "إيرادات المطعم والخدمات", nameEn: "F&B and Services Revenue", parent: "4" }),
      pl({ code: "4123", name: "إيرادات خدمات أخرى (غسيل، نقل…)", nameEn: "Other Guest Services", parent: "4" }),
      bs({ code: "1211", name: "ذمم النزلاء", nameEn: "Guest Receivables", parent: "1200" }),
      bs({ code: "2111", name: "دفعات النزلاء المقدمة", nameEn: "Guest Advance Deposits", parent: "21" }),
      pl({ code: "5121", name: "تكلفة خدمات الضيافة", nameEn: "Hospitality Cost", parent: "51" }),
      pl({ code: "5221", name: "مصاريف التنظيف والغسيل", nameEn: "Housekeeping and Laundry", parent: "52" }),
      pl({ code: "5222", name: "مستلزمات الغرف", nameEn: "Room Supplies", parent: "52" }),
      pl({ code: "5223", name: "عمولات منصات الحجز", nameEn: "Booking Platform Commissions", parent: "52" }),
    ],
    settings: { sales_account_id: "4121", customers_account_id: "1211", cogs_account_id: "5121" },
  },
  {
    value: "marketing", label: "خدمات تسويق", sector: "services",
    accounts: [
      pl({ code: "4161", name: "إيرادات خدمات التسويق", nameEn: "Marketing Services Revenue", parent: "4" }),
      pl({ code: "4162", name: "إيرادات إدارة الحملات الرقمية", nameEn: "Digital Campaigns Revenue", parent: "4" }),
      pl({ code: "5161", name: "تكاليف الحملات المنفذة للعملاء", nameEn: "Client Campaign Costs", parent: "51" }),
      pl({ code: "5261", name: "اشتراكات أدوات التسويق", nameEn: "Marketing Tools Subscriptions", parent: "52" }),
    ],
    settings: { sales_account_id: "4161", cogs_account_id: "5161" },
  },
  {
    value: "software", label: "برمجة", sector: "services",
    accounts: [
      pl({ code: "4171", name: "إيرادات تطوير البرمجيات", nameEn: "Software Development Revenue", parent: "4" }),
      pl({ code: "4172", name: "إيرادات الاشتراكات والدعم الفني", nameEn: "Subscriptions and Support", parent: "4" }),
      pl({ code: "5171", name: "تكلفة الخوادم والتراخيص", nameEn: "Hosting and Licenses", parent: "51" }),
      pl({ code: "5172", name: "أجور مطورين متعاقدين", nameEn: "Contract Developers", parent: "51" }),
    ],
    settings: { sales_account_id: "4171", cogs_account_id: "5171" },
  },
  {
    value: "advertising", label: "دعاية وإعلان", sector: "services",
    accounts: [
      pl({ code: "4181", name: "إيرادات الإعلانات", nameEn: "Advertising Revenue", parent: "4" }),
      pl({ code: "4182", name: "إيرادات الطباعة والإنتاج", nameEn: "Printing and Production Revenue", parent: "4" }),
      pl({ code: "5181", name: "تكاليف الإنتاج والطباعة", nameEn: "Production and Printing Costs", parent: "51" }),
      pl({ code: "5182", name: "شراء مساحات إعلانية", nameEn: "Media Space Purchases", parent: "51" }),
    ],
    settings: { sales_account_id: "4181", cogs_account_id: "5181" },
  },
  {
    value: "other_services", label: "خدمات أخرى", sector: "services",
    accounts: [
      pl({ code: "4191", name: "إيرادات الخدمات", nameEn: "Service Revenue", parent: "4" }),
      pl({ code: "5191", name: "تكلفة الخدمات المقدمة", nameEn: "Cost of Services", parent: "51" }),
    ],
    settings: { sales_account_id: "4191", cogs_account_id: "5191" },
  },
];

export const activitiesOf = (sector: string) => ACTIVITIES.filter((a) => a.sector === sector);
export const findActivity = (v?: string | null) => ACTIVITIES.find((a) => a.value === v);
