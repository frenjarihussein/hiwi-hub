import { Watermark, BackButton } from "@/components/AppChrome";
import { collectDeviceInfo } from "@/lib/device";
import { WindowManager, openWindow, setNavMode, getNavMode } from "@/components/WindowManager";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import defaultMark from "@/assets/yousef-soft-mark.png.asset.json";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useMe, moduleEnabled, canDocType, isProjectsOnlyTenant } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppIdentity, useApplyBrandColor, useBranding, useRememberBrand, useSystemBrand, useSystemTitle } from "@/lib/branding";
import { useExtra, useSaveExtra, useTrackUsage, topUsed } from "@/lib/prefs";
import { ModernNavigation } from "@/components/ModernNavigation";
import { NotificationBell } from "@/components/NotificationBell";
import { FloatingHelp } from "@/components/FloatingHelp";
import { logLoginEvent } from "@/lib/login-log.functions";
import { thisDeviceId } from "@/lib/operating-mode";
import { QuickTools } from "@/components/QuickTools";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { BranchSwitcher, DataFileSwitcher } from "@/components/BranchSwitcher";
import { requestCrudNew } from "@/lib/coding";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { SHORTCUT_ACTIONS, comboFor, effectiveCombos, eventCombo, shortcutsEnabled } from "@/lib/shortcuts";
import { FxAutoRevaluation } from "@/components/FxRevaluationCard";
import { FxAutoFetch } from "@/components/ExchangeRatesCard";
import {
  BookOpen,
  Building2,
  ClipboardList,
  ClipboardCheck,
  BedDouble,
  CalendarClock,
  ChefHat,
  Factory,
  Repeat,
  UserCheck,
  ShoppingCart,
  Boxes,
  Coins,
  Gauge,
  HardHat,
  LogOut,
  KeyRound,
  Package,
  Receipt,
  ScrollText,
  Truck,
  Users,
  Warehouse,
  Landmark,
  FileText,
  Settings,
  PanelsTopLeft,
  Check,
  Languages,
  Bell,
  ScrollText as LedgerIcon,
  ChevronDown,
  Plus,
  Maximize,
  ArrowRight,
  Wallet,
  ShieldCheck,
  WalletCards, LayoutGrid, ListTodo, Bot, MessagesSquare, NotebookPen, LifeBuoy, Menu, AppWindow, User, DatabaseBackup, RefreshCw, Home } from "lucide-react";

export type NavGroup = { id: string; label: string; icon: typeof Gauge; items: string[] };

export const NAV_GROUPS: NavGroup[] = [
  { id: "finance", label: "المحاسبة", icon: BookOpen, items: ["/accounts", "/cost-centers", "/journal", "/opening-closing", "/recurring", "/assets"] },
  { id: "cash", label: "النقدية والبنوك", icon: Wallet, items: ["/treasury", "/cheques"] },
  { id: "sales", label: "المبيعات والمشتريات", icon: ShoppingCart, items: ["/partners", "/documents", "/doc-patterns", "/pos", "/purchase-pos", "/pos-stations", "/services", "/service-ops", "/hotel"] },
  { id: "stock", label: "المستودعات", icon: Warehouse, items: ["/products", "/warehouses", "/stock", "/stocktake", "/warehouse-desk", "/batches"] },
  { id: "mfg", label: "التصنيع", icon: Factory, items: ["/manufacturing", "/assembly", "/recipes"] },
  { id: "projects", label: "المشاريع", icon: HardHat, items: ["/projects", "/project-board", "/solar-fleet"] },
  { id: "hr", label: "الموارد البشرية", icon: UserCheck, items: ["/payroll"] },
  { id: "reports", label: "التقارير والكشوف", icon: LedgerIcon, items: ["/dashboard", "/reports", "/ledgers", "/audit"] },
  { id: "collab", label: "التواصل والتعاون", icon: MessagesSquare, items: ["/chat", "/notes", "/assistant", "/ai-drafts", "/approvals", "/collab", "/support"] },
  { id: "admin", label: "الإعدادات", icon: Settings, items: ["/settings", "/doc-patterns"] },
  { id: "owner", label: "إدارة النظام", icon: ShieldCheck, items: ["/owner-dashboard", "/companies", "/subscriptions", "/owner-finance", "/owner-reports", "/notifications", "/support"] },
];

export const QUICK_ACTIONS = [
  { to: "/journal", search: { new: "entry" }, label: "قيد يومية", desc: "", icon: ScrollText, module: "journal" },
  { to: "/treasury", search: { tab: "sheet" }, label: "يومية الصندوق السريعة", desc: "", icon: Wallet, module: "documents" },
  { to: "/documents", search: { new: "receipt" }, label: "سند قبض", desc: "", icon: Wallet, module: "documents" },
  { to: "/documents", search: { new: "payment" }, label: "سند دفع", desc: "", icon: Wallet, module: "documents" },
  { to: "/documents", search: { new: "sale" }, label: "فاتورة بيع", desc: "", icon: ShoppingCart, module: "documents" },
  { to: "/documents", search: { new: "purchase" }, label: "فاتورة شراء", desc: "", icon: Truck, module: "documents" },
  { to: "/documents", search: { new: "opening_inventory" }, label: "فاتورة بضاعة أول المدة", desc: "", icon: Warehouse, module: "documents" },
  { to: "/documents", search: { new: "closing_inventory" }, label: "فاتورة بضاعة آخر المدة", desc: "", icon: Warehouse, module: "documents" },
  { to: "/documents", search: { new: "sale_return" }, label: "مرتجع بيع", desc: "", icon: Receipt, module: "documents" },
  { to: "/documents", search: { new: "purchase_return" }, label: "مرتجع شراء", desc: "", icon: Receipt, module: "documents" },
  { to: "/documents", search: { new: "transfer" }, label: "مناقلة مستودعات", desc: "", icon: Boxes, module: "documents" },
  { to: "/documents", search: { new: "stock_in" }, label: "إدخال مستودع", desc: "", icon: Warehouse, module: "documents" },
  { to: "/documents", search: { new: "stock_out" }, label: "إخراج مستودع", desc: "", icon: HardHat, module: "documents" },
  { to: "/documents", search: { new: "quote" }, label: "عرض سعر", desc: "", icon: FileText, module: "documents" },
] as const;

export type NavItem = { to: string; label: string; icon: typeof Gauge; module?: string; superOnly?: boolean; both?: boolean; activity?: string };

export const NAV: NavItem[] = [
  { to: "/dashboard", label: "لوحة المؤشرات", icon: Gauge },
  { to: "/owner-dashboard", label: "الرئيسية", icon: Gauge, superOnly: true },
  { to: "/companies", label: "إدارة الشركات", icon: Building2, superOnly: true },
  { to: "/subscriptions", label: "الاشتراكات والمقبوضات", icon: Coins, superOnly: true },
  { to: "/owner-finance", label: "حسابات شركة البرمجيات", icon: WalletCards, superOnly: true },
  { to: "/owner-reports", label: "تقارير شركة البرمجيات", icon: WalletCards, superOnly: true },
  { to: "/notifications", label: "الإشعارات العامة", icon: Bell, superOnly: true },
  { to: "/assistant", label: "المساعد المالي الذكي", icon: Bot },
  { to: "/ai-drafts", label: "مسودات المساعد الذكي", icon: ClipboardCheck },
  { to: "/approvals", label: "الاعتمادات والموافقات", icon: ClipboardCheck },
  { to: "/collab", label: "الملاحظات واستفسارات الشركاء", icon: MessagesSquare },
  { to: "/support", label: "الدعم الفني", icon: LifeBuoy, both: true },
  { to: "/accounts", label: "شجرة الحسابات", icon: BookOpen, module: "accounts" },
  { to: "/cost-centers", label: "مراكز الكلفة", icon: BookOpen, module: "accounts" },
  { to: "/journal", label: "دفتر اليومية العامة", icon: ScrollText, module: "journal" },
  { to: "/documents", label: "المستندات والفواتير", icon: FileText, module: "documents" },
  { to: "/doc-patterns", label: "إدارة الأنماط (نماذج الفواتير)", icon: FileText, module: "documents" },
  { to: "/partners", label: "الزبائن والموردون", icon: Users, module: "partners" },
  { to: "/cheques", label: "الشيكات والبنوك", icon: Receipt, module: "cheques" },
  { to: "/treasury", label: "صرف العملات ومناقلة الصناديق", icon: Wallet, module: "documents" },
  { to: "/assets", label: "الأصول الثابتة", icon: Landmark, module: "assets" },
  { to: "/products", label: "بطاقات المواد", icon: Package, module: "products" },
  { to: "/services", label: "دليل الخدمات", icon: Package, module: "products" },
  { to: "/service-ops", label: "تشغيل الخدمات والعقود", icon: ClipboardCheck, module: "products" },
  { to: "/warehouses", label: "المستودعات", icon: Warehouse, module: "warehouses" },
  { to: "/stock", label: "حركات المخزون", icon: Truck, module: "stock" },
  { to: "/stocktake", label: "الجرد المخزني", icon: ClipboardCheck, module: "stock" },
  { to: "/pos", label: "نقطة البيع", icon: ShoppingCart, module: "documents" },
  { to: "/purchase-pos", label: "نقطة الشراء", icon: Truck, module: "documents" },
  { to: "/pos-stations", label: "إدارة نقاط البيع والشراء", icon: ShoppingCart, module: "settings" },
  { to: "/chat", label: "المحادثات", icon: MessagesSquare },
  { to: "/notes", label: "المهام والملاحظات", icon: NotebookPen },
  { to: "/warehouse-desk", label: "عمليات المستودع السريعة", icon: Boxes, module: "stock" },
  { to: "/recipes", label: "وصفات الأطباق", icon: ChefHat, module: "products", activity: "restaurant" },
  { to: "/batches", label: "دفعات وصلاحية", icon: CalendarClock, module: "stock", activity: "pharmacy" },
  { to: "/manufacturing", label: "أوامر التصنيع", icon: Factory, module: "stock", activity: "general_industrial" },
  { to: "/assembly", label: "الفك والتجميع", icon: Boxes, module: "stock" },
  { to: "/hotel", label: "الغرف والحجوزات", icon: BedDouble, module: "documents", activity: "hotel" },
  { to: "/projects", label: "المشاريع والتعهدات", icon: HardHat, module: "projects" },
  { to: "/project-board", label: "لوحة متابعة المشاريع", icon: HardHat, module: "projects" },
  { to: "/solar-fleet", label: "مركز المحطات", icon: Gauge, module: "projects" },
  { to: "/recurring", label: "القيود الدورية", icon: Repeat, module: "journal" },
  { to: "/opening-closing", label: "القيد الافتتاحي وقيد الإقفال", icon: ScrollText, module: "journal" },
  { to: "/payroll", label: "الموظفون والرواتب", icon: UserCheck, module: "payroll" },
  { to: "/reports", label: "التقارير المالية", icon: Coins, module: "reports" },
  { to: "/ledgers", label: "دفاتر الأستاذ والكشوف", icon: LedgerIcon, module: "reports" },
  { to: "/settings", label: "الإعدادات", icon: Settings },
  { to: "/audit", label: "سجل حركات المستخدمين", icon: ClipboardList, module: "audit" },
];

/** Side-panel actions shown next to each nav item inside the group dropdowns. */
type SubAction = { label: string; to: string; search?: Record<string, string>; table?: string };
const SUB_ACTIONS: Record<string, SubAction[]> = {
  "/accounts": [
    { label: "تعريف حساب جديد", to: "/accounts", table: "accounts" },
    { label: "دليل الحسابات", to: "/accounts" },
    { label: "كشف حساب", to: "/ledgers", search: { tab: "account" } },
  ],
  "/cost-centers": [
    { label: "تعريف مركز كلفة جديد", to: "/cost-centers", table: "cost_centers" },
    { label: "دليل مراكز الكلفة", to: "/cost-centers" },
    { label: "كشف مركز كلفة", to: "/cost-centers" },
  ],
  "/partners": [
    { label: "تعريف زبون / مورد جديد", to: "/partners", table: "partners" },
    { label: "دليل الزبائن والموردين", to: "/partners" },
    { label: "كشف زبون / مورد", to: "/ledgers", search: { tab: "partner" } },
  ],
  "/products": [
    { label: "تعريف مادة جديدة", to: "/products", table: "products" },
    { label: "دليل المواد", to: "/products" },
    { label: "كشف مادة", to: "/ledgers", search: { tab: "product" } },
  ],
  "/services": [
    { label: "تعريف خدمة جديدة", to: "/services", table: "products" },
    { label: "دليل الخدمات", to: "/services" },
    { label: "كشف خدمة", to: "/ledgers", search: { tab: "service" } },
    { label: "تقارير الخدمات", to: "/reports", search: { tab: "svc" } },
  ],
  "/warehouses": [
    { label: "تعريف مستودع جديد", to: "/warehouses", table: "warehouses" },
    { label: "دليل المستودعات", to: "/warehouses" },
    { label: "كشف مستودع", to: "/ledgers", search: { tab: "warehouse" } },
  ],
  "/projects": [
    { label: "تعريف مشروع جديد", to: "/projects", table: "projects" },
    { label: "دليل المشاريع", to: "/projects" },
    { label: "كشف مشروع", to: "/ledgers", search: { tab: "project" } },
  ],
  "/journal": [
    { label: "قيد يومية جديد", to: "/journal", search: { new: "entry" } },
    { label: "دفتر اليومية", to: "/journal" },
  ],
  "/ledgers": [
    { label: "كشف حساب", to: "/ledgers", search: { tab: "account" } },
    { label: "كشف مادة", to: "/ledgers", search: { tab: "product" } },
    { label: "كشف خدمة", to: "/ledgers", search: { tab: "service" } },
    { label: "كشف مستودع", to: "/ledgers", search: { tab: "warehouse" } },
    { label: "كشف زبون / مورد", to: "/ledgers", search: { tab: "partner" } },
    { label: "كشف مشروع", to: "/ledgers", search: { tab: "project" } },
  ],
  "/reports": [
    { label: "ميزان المراجعة", to: "/reports", search: { tab: "tb" } },
    { label: "الحسابات الختامية", to: "/reports", search: { tab: "final" } },
    { label: "قائمة الدخل", to: "/reports", search: { tab: "is" } },
    { label: "قائمة المركز المالي", to: "/reports", search: { tab: "bs" } },
    { label: "التدفقات النقدية", to: "/reports", search: { tab: "cf" } },
    { label: "أعمار الذمم", to: "/reports", search: { tab: "aging" } },
    { label: "تقارير الخدمات", to: "/reports", search: { tab: "svc" } },
  ],
  "/documents": [
    { label: "فاتورة بيع", to: "/documents", search: { new: "sale" } },
    { label: "فاتورة شراء", to: "/documents", search: { new: "purchase" } },
    { label: "سند قبض", to: "/documents", search: { new: "receipt" } },
    { label: "سند دفع", to: "/documents", search: { new: "payment" } },
    { label: "كل المستندات", to: "/documents" },
  ],
};

export type SettingsSection = { label: string; icon: typeof Gauge; items: SubAction[] };

/** Settings menu grouped by topic: personal, company, users, accounting, currencies, items, organisation, data. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { label: "الملف الشخصي", icon: User, items: [
    { label: "ملفي الشخصي", to: "/settings", search: { tab: "me", sec: "profile" } },
    { label: "طريقة الفتح والمزامنة", to: "/settings", search: { tab: "me", sec: "sync" } },
    { label: "إشعاراتي", to: "/settings", search: { tab: "me", sec: "notif" } },
  ] },
  { label: "الشركة", icon: Building2, items: [
    { label: "الشعار والألوان", to: "/settings", search: { tab: "company", sec: "brand" } },
    { label: "نشاط الشركة", to: "/settings", search: { tab: "company", sec: "activity" } },
  ] },
  { label: "المستخدمون والصلاحيات", icon: Users, items: [
    { label: "المستخدمون وصلاحياتهم", to: "/settings", search: { tab: "users", sec: "list" } },
  ] },
  { label: "المحاسبة", icon: BookOpen, items: [
    { label: "إعدادات القيود", to: "/settings", search: { tab: "accounting", sec: "entries" } },
    { label: "الضرائب", to: "/settings", search: { tab: "accounting", sec: "taxes" } },
    { label: "الحسابات الختامية", to: "/settings", search: { tab: "accounting", sec: "closing" } },
    { label: "الحسابات العامة", to: "/settings", search: { tab: "accounting", sec: "links" } },
    { label: "إدارة الأنماط والقيود", to: "/doc-patterns" },
    { label: "الترميز وفروع الأدلة", to: "/settings", search: { tab: "accounting", sec: "coding" } },
  ] },
  { label: "العملات", icon: Coins, items: [
    { label: "العملات", to: "/settings", search: { tab: "currency", sec: "list" } },
    { label: "أسعار الصرف", to: "/settings", search: { tab: "currency", sec: "rates" } },
    { label: "إعادة تقييم العملات", to: "/settings", search: { tab: "currency", sec: "reval" } },
  ] },
  { label: "المواد", icon: Package, items: [
    { label: "التسعير والمخزون", to: "/settings", search: { tab: "items", sec: "pricing" } },
    { label: "تسعير جديد", to: "/settings", search: { tab: "items", sec: "repricing" } },
    { label: "وحدات المواد", to: "/settings", search: { tab: "items", sec: "units" } },
    { label: "وحدات الخدمات", to: "/settings", search: { tab: "items", sec: "service-units" } },
  ] },
  { label: "التنظيم", icon: CalendarClock, items: [
    { label: "السنوات المالية", to: "/settings", search: { tab: "org", sec: "fiscal" } },
    { label: "الفروع", to: "/settings", search: { tab: "org", sec: "branches" } },
  ] },
  { label: "النسخ الاحتياطي", icon: DatabaseBackup, items: [
    { label: "النسخ الاحتياطي", to: "/settings", search: { tab: "data", sec: "backup" } },
    { label: "ملفات البيانات", to: "/settings", search: { tab: "data", sec: "files" } },
  ] },
];

type CashierTab = { to: string; label: string; search?: { new: string } };
export const CASHIER_TABS: Record<string, CashierTab[]> = {
  sales_cashier: [{ to: "/pos", label: "شاشة البيع" }, { to: "/chat", label: "المحادثات" }],
  purchase_cashier: [
    { to: "/purchase-pos", label: "شاشة الشراء" },
    { to: "/documents", search: { new: "purchase" }, label: "فاتورة شراء" },
    { to: "/documents", search: { new: "purchase_return" }, label: "مرتجع شراء" },
    { to: "/documents", search: { new: "payment" }, label: "سند دفع" },
    { to: "/partners", label: "الموردون" },
    { to: "/chat", label: "المحادثات" },
  ],
  projects_only: [
    { to: "/project-board", label: "لوحة المشاريع" },
    { to: "/solar-fleet", label: "مركز المحطات" },
    { to: "/chat", label: "المحادثات" },
    { to: "/collab", label: "التعاون والمهام" },
    { to: "/assistant", label: "مساعد المشاريع" },
    { to: "/support", label: "الدعم الفني" },
  ],
  warehouse_keeper: [
    { to: "/warehouse-desk", label: "عمليات المستودع" },
    { to: "/stocktake", label: "الجرد" },
  ],
};

/** Extra paths a restricted account may open without a menu tab (e.g. project detail pages). */
const KIND_TAB_ICON: Record<string, typeof Menu> = {
  "/project-board": LayoutGrid, "/solar-fleet": Gauge, "/chat": MessagesSquare, "/collab": ListTodo, "/assistant": Bot, "/support": LifeBuoy,
  "/pos": ShoppingCart, "/purchase-pos": ShoppingCart, "/documents": FileText, "/partners": Users, "/warehouse-desk": Warehouse, "/stocktake": ClipboardList,
};

export const CASHIER_EXTRA: Record<string, string[]> = { projects_only: ["/projects/", "/profile", "/notifications"] };
/** Projects-only company admins also manage their team and settings. */
const PROJECT_ADMIN_TABS: CashierTab[] = [
  { to: "/users", label: "المستخدمون" },
];
export function kindAllows(kind: string, pathname: string, tabsOverride?: CashierTab[]) {
  const tabs = tabsOverride ?? CASHIER_TABS[kind];
  if (!tabs) return true;
  return tabs.some((t) => pathname.startsWith(t.to)) || (CASHIER_EXTRA[kind] ?? []).some((p) => pathname.startsWith(p));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const brand = useBranding();
  const sysBrand = useSystemBrand().data;
  const sysName = (lang === "en" ? sysBrand?.system_name_en || t("يوسف سوفت") : sysBrand?.system_name) || t("يوسف سوفت");
  useSystemTitle(sysBrand?.system_name);
  useApplyBrandColor(brand.data?.primary_color, brand.data?.logo_url, brand.data?.theme_colors);
  const ownId = brand.data?.white_label !== false;
  useRememberBrand(brand.isSuccess ? (ownId ? brand.data?.logo_url ?? null : null) : undefined, me?.tenantName);
  useAppIdentity(me?.tenantId, me?.tenantName, ownId ? brand.data?.logo_url : null, brand.data?.theme_colors?.[0] ?? brand.data?.primary_color);
  useTrackUsage(me, pathname);
  const extra = useExtra(me);
  const navMode = extra.data?.navMode ?? "single";
  setNavMode(navMode);
  const saveExtra = useSaveExtra(me);
  const modern = extra.data?.appearance !== "classic";
  useEffect(() => {
    document.documentElement.dataset["appearance"] = modern ? "modern" : "classic";
    return () => { delete document.documentElement.dataset["appearance"]; };
  }, [modern]);
  function switchAppearance() {
    saveExtra.mutate({ appearance: modern ? "classic" : "modern" }, {
      onError: () => { void queryClient.invalidateQueries({ queryKey: ["user_prefs_extra", me?.userId] }); },
    });
  }
  const appearanceControl = <Button variant="ghost" size="icon" title={lang === "en" ? "Switch appearance" : "تبديل المظهر"} aria-label={lang === "en" ? "Switch appearance" : "تبديل المظهر"} aria-pressed={modern} disabled={!extra.isSuccess || saveExtra.isPending} onClick={switchAppearance}><PanelsTopLeft className="size-4" /></Button>;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroups, setMobileGroups] = useState<Record<string, boolean>>({});
  const pwState = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    await logLoginEvent({ data: { event: "sign_out", deviceId: thisDeviceId(), deviceInfo: collectDeviceInfo() } }).catch(() => {});
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const superAllowed = ["/owner-dashboard", "/companies", "/subscriptions", "/owner-finance", "/owner-reports", "/notifications", "/support"];
  const projectsOnlyTenant = isProjectsOnlyTenant(me);
  const kind = projectsOnlyTenant ? "projects_only" : (me?.accountKind ?? "standard");
  const cashierTabs = CASHIER_TABS[kind] ? [...CASHIER_TABS[kind]!, ...(projectsOnlyTenant && me?.isTenantAdmin ? PROJECT_ADMIN_TABS : [])] : null;
  useEffect(() => {
    if (me?.isSuperAdmin && !superAllowed.some((p) => pathname.startsWith(p))) {
      navigate({ to: "/owner-dashboard", replace: true });
    }
    if (cashierTabs && !kindAllows(kind, pathname, cashierTabs)) {
      const firstTab = cashierTabs[0];
      if (firstTab) navigate({ to: firstTab.to, ...(firstTab.search ? { search: firstTab.search } : {}), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.isSuperAdmin, pathname, kind]);


  function openTo(to: string, search?: Record<string, string>, table?: string) {
    if (getNavMode() === "windows" && !table) {
      const qs = new URLSearchParams(search ?? {}).toString();
      openWindow(to + (qs ? `?${qs}` : ""), t(to));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({ to: to as any, search: search as any });
    if (!table) return;
    let tries = 0;
    const tick = () => { if (requestCrudNew(table, {}) || ++tries > 25) return; setTimeout(tick, 150); };
    setTimeout(tick, 150);
  }

  // Global keyboard shortcuts (user-customisable on /shortcuts).
  const combos = effectiveCombos(extra.data);
  const scEnabled = shortcutsEnabled(extra.data) && !cashierTabs && !me?.isSuperAdmin && !!me;
  useEffect(() => {
    if (!scEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const c = eventCombo(e);
      if (!c) return;
      const a = SHORTCUT_ACTIONS.find((x) => combos[x.id] === c);
      if (!a) return;
      if (a.id === "act.refresh") { e.preventDefault(); void queryClient.invalidateQueries(); return; }
      if (!a.to) return;
      e.preventDefault();
      openTo(a.to, a.search, a.table);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scEnabled, JSON.stringify(combos)]);

  if (me?.tenantLocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center">
          <p className="font-bold">{t("حساب الشركة مقفل")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("انتهى اشتراك الشركة أو تم إيقافه. يرجى التواصل مع مدير النظام لتجديد الاشتراك.")}
          </p>
          <Button variant="outline" onClick={signOut} className="mt-4">
            {t("تسجيل الخروج")}
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoading && me === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("تم إيقاف هذا الحساب مؤقتاً أو لم يُربط بشركة بعد، يرجى مراجعة إدارة الشركة")}
          </p>
          <Button variant="outline" onClick={signOut} className="mt-4">
            {t("تسجيل الخروج")}
          </Button>
        </div>
      </div>
    );
  }

  const kiosk = pathname.startsWith("/pos") || pathname.startsWith("/warehouse-desk");
  function goFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const [pwOpen, setPwOpen] = [pwState[0], pwState[1]];
  const initials = (me?.fullName || me?.email || "?").trim().slice(0, 1).toUpperCase();
  const profileMenu = (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex shrink-0 items-center gap-2 rounded-full p-0.5 pe-2 hover:bg-accent" aria-label={t("الملف الشخصي")} title={me?.fullName || me?.email}>
          {me?.avatarUrl ? (
            <img src={me.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
          )}
          <span className="hidden max-w-[8rem] truncate text-sm font-medium lg:inline">{me?.fullName || me?.email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{me?.fullName || "—"}</div>
          <div className="truncate text-xs text-muted-foreground">{me?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{lang === "en" ? "Appearance" : "مظهر البرنامج"}</DropdownMenuLabel>
        <DropdownMenuItem disabled={!extra.isSuccess || saveExtra.isPending} onClick={() => { if (modern) switchAppearance(); }}>
          <PanelsTopLeft className="size-4" />{lang === "en" ? "Classic" : "المظهر الحالي"}{!modern && <Check className="ms-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!extra.isSuccess || saveExtra.isPending} onClick={() => { if (!modern) switchAppearance(); }}>
          <PanelsTopLeft className="size-4" />{lang === "en" ? "Modern" : "المظهر العصري"}{modern && <Check className="ms-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          <Languages className="size-4" />{lang === "ar" ? "English" : "Arabic"}
        </DropdownMenuItem>
        {!me?.isSuperAdmin && (
          <>
            <DropdownMenuItem onClick={() => navigate({ to: "/shortcuts" })}><Settings className="size-4" />{t("اختصارات لوحة المفاتيح")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/manual" })}><BookOpen className="size-4" />{t("دليل المستخدم")}</DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={() => setPwOpen(true)}><KeyRound className="size-4" />{t("تغيير كلمة السر")}</DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} className="text-destructive">
          <LogOut className="size-4" />{t("تسجيل الخروج")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );

  if (cashierTabs) {
    const company = (lang === "en" ? me?.tenantNameEn || me?.tenantName : me?.tenantName) ?? sysName;
    const activeTab = cashierTabs.find((tab) => pathname.startsWith(tab.to));
    const sideNav = (onPick?: () => void) => (
      <nav className="flex flex-col gap-1 p-3">
        {cashierTabs.map((tab) => {
          const Icon = KIND_TAB_ICON[tab.to] ?? LayoutGrid;
          const on = pathname.startsWith(tab.to) || (tab.to === "/project-board" && pathname.startsWith("/projects/"));
          return (
            <Link
              key={`${tab.to}-${tab.search?.new ?? ""}`}
              to={tab.to}
              {...(tab.search ? { search: tab.search } : {})}
              onClick={onPick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                on ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="truncate">{t(tab.label)}</span>
            </Link>
          );
        })}
      </nav>
    );
    const brandBlock = (
      <div className="flex items-center gap-3 border-b px-4 py-4">
        <img src={brand.data?.logo_url || sysBrand?.mark_url || sysBrand?.logo_url || defaultMark.url} alt="" className="size-10 shrink-0 rounded-lg object-contain" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{company}</p>
          <p className="truncate text-xs text-muted-foreground">{me?.fullName || me?.email}</p>
        </div>
      </div>
    );
    return (
      <div className="flex h-dvh bg-background">
        <aside className="no-print hidden w-60 shrink-0 flex-col border-e bg-card md:flex">
          {brandBlock}
          <div className="min-h-0 flex-1 overflow-y-auto">{sideNav()}</div>
        </aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side={lang === "ar" ? "right" : "left"} className="no-print w-72 p-0 md:hidden">
            <SheetTitle className="sr-only">{t("القائمة")}</SheetTitle>
            {brandBlock}
            {sideNav(() => setMobileOpen(false))}
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 md:px-4">
          <button className="grid size-9 shrink-0 place-items-center rounded-md border bg-card hover:bg-accent md:hidden" onClick={() => setMobileOpen(true)} aria-label={t("القائمة")}>
            <Menu className="size-5" />
          </button>
          <span className="min-w-0 truncate font-semibold">{activeTab ? t(activeTab.label) : company}</span>
          <div className="ms-auto flex shrink-0 items-center gap-0.5">
            <button onClick={goFullscreen} className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted sm:block" aria-label={t("ملء الشاشة")}><Maximize className="size-5" /></button>
            <span className="hidden sm:contents"><BackButton /></span>
            <NotificationBell /><FxAutoRevaluation /><FxAutoFetch />
            <button onClick={() => navigate({ to: "/settings" })} className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted" title={t("الإعدادات")} aria-label={t("الإعدادات")}><Settings className="size-4" /></button>
            <span className="hidden sm:contents">{appearanceControl}</span>
            {profileMenu}
          </div>
        </header>
        <main className="relative z-[1] min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:p-5">{children}</main>
        </div>
        <FloatingHelp showManual={!me?.isSuperAdmin} />
        <Watermark />
        <QuickTools />
        <WindowManager />
      </div>
    );
  }

  if (kiosk) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <header className="no-print flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
          <Link to="/dashboard" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowRight className="size-4 ltr:rotate-180" />{t("رجوع")}
          </Link>
          <span className="truncate text-sm font-semibold">{me?.tenantName}</span>
          <div className="ms-auto flex items-center gap-1">
            <button onClick={goFullscreen} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={t("ملء الشاشة")}><Maximize className="size-4" /></button>
            <BackButton />
            <NotificationBell /><FxAutoRevaluation /><FxAutoFetch />
            <button onClick={() => navigate({ to: "/settings" })} className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted" title={t("الإعدادات")} aria-label={t("الإعدادات")}><Settings className="size-4" /></button>
            {appearanceControl}
            {profileMenu}
          </div>
        </header>
        <main className="relative z-[1] min-h-0 min-w-0 flex-1 p-3">{children}</main>
        <FloatingHelp showManual={!me?.isSuperAdmin} />
        <Watermark />
        <QuickTools />
        <WindowManager />
      </div>
    );
  }

  const items = NAV.filter((n) => {
    if (me?.isSuperAdmin) return !!n.superOnly || !!n.both;
    if (n.superOnly) return false;
    if (n.activity && n.activity !== me?.businessActivity && !["/manufacturing", "/batches"].includes(n.to)) return false;
    if (!n.module) return true;
    return moduleEnabled(me, n.module);
  });
  const byTo = Object.fromEntries(items.map((i) => [i.to, i]));
  const groups = NAV_GROUPS.map((g) => ({ ...g, list: g.items.map((to) => byTo[to]).filter(Boolean) as NavItem[] })).filter((g) => g.list.length);
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quick = QUICK_ACTIONS.filter((a) => !me?.isSuperAdmin && moduleEnabled(me, a.module) && (!(a as any).search?.new || a.module !== "documents" || canDocType(me, (a as any).search.new, "create")));
  const Kbd = ({ c }: { c: string }) => c ? <kbd dir="ltr" className="ms-auto shrink-0 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">{c}</kbd> : null;
  const headerMenus: { label: string; icon: typeof Gauge; items: HeaderMenuItem[] }[] = [
    { label: "تعريفات", icon: Plus, items: [
      { label: "حساب جديد", to: "/accounts", table: "accounts" },
      { label: "مادة جديدة", to: "/products", table: "products" },
      { label: "خدمة جديدة", to: "/services", table: "products" },
      { label: "مستودع جديد", to: "/warehouses", table: "warehouses" },
      { label: "زبون / مورد جديد", to: "/partners", table: "partners" },
      { label: "مركز كلفة جديد", to: "/cost-centers", table: "cost_centers" },
      { label: "مشروع جديد", to: "/projects", table: "projects" },
    ] },
    { label: "الأدلة", icon: BookOpen, items: [
      { label: "دليل الحسابات", to: "/accounts" },
      { label: "دليل المواد", to: "/products" },
      { label: "دليل الخدمات", to: "/services" },
      { label: "دليل المستودعات", to: "/warehouses" },
      { label: "دليل الزبائن والموردين", to: "/partners" },
      { label: "دليل مراكز الكلفة", to: "/cost-centers" },
      { label: "دليل المشاريع", to: "/projects" },
    ] },
    { label: "الكشوف", icon: ScrollText, items: [
      { label: "كشف حساب", to: "/ledgers", search: { tab: "account" } },
      { label: "كشف مادة", to: "/ledgers", search: { tab: "product" } },
      { label: "كشف خدمة", to: "/ledgers", search: { tab: "service" } },
      { label: "كشف مستودع", to: "/ledgers", search: { tab: "warehouse" } },
      { label: "كشف زبون", to: "/ledgers", search: { tab: "partner" } },
      { label: "كشف مورد", to: "/ledgers", search: { tab: "partner" } },
      { label: "كشف مشروع", to: "/ledgers", search: { tab: "project" } },
      { label: "كشف مركز كلفة", to: "/cost-centers" },
    ] },
    { label: "التقارير", icon: ScrollText, items: [
      { label: "ميزان المراجعة", to: "/reports", search: { tab: "tb" } },
      { label: "الحسابات الختامية", to: "/reports", search: { tab: "final" } },
      { label: "قائمة الدخل", to: "/reports", search: { tab: "is" } },
      { label: "قائمة المركز المالي", to: "/reports", search: { tab: "bs" } },
      { label: "التدفقات النقدية", to: "/reports", search: { tab: "cf" } },
      { label: "أعمار الذمم", to: "/reports", search: { tab: "aging" } },
      { label: "تقارير الخدمات", to: "/reports", search: { tab: "svc" } },
    ] },
  ];



  return (
    <div className={cn("flex min-h-screen bg-background", !modern && "flex-col")}>
      {modern && <ModernNavigation navMode={navMode} settingsSections={SETTINGS_SECTIONS} subActions={SUB_ACTIONS as never} groups={groups} home={{ to: "/home", label: "الرئيسية", icon: Home }} onRefresh={() => { void queryClient.invalidateQueries(); }} pathname={pathname} company={(lang === "en" ? me?.tenantNameEn || me?.tenantName : me?.tenantName) ?? sysName} superAdmin={!!me?.isSuperAdmin} />}
      <div className="flex min-w-0 flex-1 flex-col">

        <header className={cn("app-topbar no-print sticky top-0 z-30 flex min-w-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:gap-3 md:px-6", modern ? "min-h-14 flex-wrap bg-card py-3" : "h-14")}>
          <button
            className="grid size-9 shrink-0 place-items-center rounded-md border bg-card transition hover:bg-accent md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t("القائمة")}
          >
            <Menu className="size-5" />
          </button>
          <span className="min-w-0 truncate font-semibold md:shrink-0">{modern ? t(items.find((i) => isActive(i.to))?.label ?? sysName) : lang === "en" ? me?.tenantNameEn || me?.tenantName : me?.tenantName ?? sysName}</span>
          <GlobalSearch nav={items} compact />
          <div className={cn("hidden min-w-0 md:block", modern ? "order-last basis-full" : "flex-1")}><GlobalSearch nav={items} /></div>
          <div className={cn("ms-auto flex items-center gap-1.5", modern ? "min-w-0 flex-wrap justify-end" : "shrink-0")}>
            <button
              className={cn("hidden size-9 place-items-center rounded-md border bg-card transition hover:bg-accent", navMode !== "single" && "md:grid")}
              title={t("فتح نافذة جديدة")}
              aria-label={t("فتح نافذة جديدة")}
              onClick={() => openWindow(window.location.pathname + window.location.search, document.title || t("نافذة"))}
            >
              <AppWindow className="size-4" />
            </button>
            {quick.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90">
                    <Plus className="size-4" /><span className="hidden sm:inline">{t("عملية جديدة")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto p-1.5">
                  {quick.map((a) => (
                    <DropdownMenuItem key={a.label} onClick={() => openTo(a.to, a.search as Record<string, string> | undefined)} className="gap-3 py-2">
                      <span className="grid size-8 place-items-center rounded-md border bg-muted"><a.icon className="size-4" /></span>
                      <span className="min-w-0"><span className="block text-sm font-medium">{t(a.label)}</span><span className="block text-xs text-muted-foreground">{t(a.desc)}</span></span>
                      {comboFor(combos, a.to, a.search as Record<string, string>) && <kbd dir="ltr" className="ms-auto rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">{comboFor(combos, a.to, a.search as Record<string, string>)}</kbd>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!me?.isSuperAdmin && (
              <div className="hidden items-center gap-1.5 sm:flex">
                {headerMenus.map((m) => (
                  <HeaderMenu key={m.label} label={t(m.label)} icon={m.icon} items={m.items.map((i) => ({ ...i, label: t(i.label), combo: comboFor(combos, i.to, i.search, i.table) }))} onPick={(i) => openTo(i.to, i.search, i.table)} />
                ))}
              </div>
            )}
            {!me?.isSuperAdmin && me?.tenantName && <DataFileSwitcher />}
            <BranchSwitcher />
            <BackButton />
            <NotificationBell /><FxAutoRevaluation /><FxAutoFetch />
            <button onClick={() => navigate({ to: "/settings" })} className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted" title={t("الإعدادات")} aria-label={t("الإعدادات")}><Settings className="size-4" /></button>
            {appearanceControl}
            {profileMenu}
          </div>
        </header>
        <nav className={cn("no-print sticky top-14 z-20 hidden items-center gap-0.5 overflow-x-auto border-b bg-card px-2 py-1", !modern && "md:flex")}>
          {byTo["/dashboard"] && (
            <Link to="/dashboard" className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm", isActive("/dashboard") ? "bg-accent font-medium" : "hover:bg-accent")}>
              <Gauge className="size-4" />{t("لوحة المؤشرات")}
            </Link>
          )}
          {groups.map((g) => {
            const active = g.list.some((i) => isActive(i.to));
            return (
              <DropdownMenu key={g.id}>
                <DropdownMenuTrigger asChild>
                  <button className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm data-[state=open]:bg-accent", active ? "bg-accent font-medium" : "hover:bg-accent")}>
                    <g.icon className="size-4" />{t(g.label)}<ChevronDown className="size-3.5 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
                  {g.list.map((i) => {
                    const subs = SUB_ACTIONS[i.to];
                    const mainCombo = comboFor(combos, i.to);
                    if (i.to === "/settings") {
                      return (
                        <Fragment key={i.to}>
                          {SETTINGS_SECTIONS.map((sec) => (
                            <DropdownMenuSub key={sec.label}>
                              <DropdownMenuSubTrigger className="gap-2">
                                <sec.icon className="size-4 opacity-70" />{t(sec.label)}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-60">
                                {sec.items.map((s) => (
                                  <DropdownMenuItem key={s.label} onClick={() => openTo(s.to, s.search, s.table)} className="gap-2">
                                    {t(s.label)}<Kbd c={comboFor(combos, s.to, s.search, s.table)} />
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ))}
                        </Fragment>
                      );
                    }
                    if (!subs) {
                      return (
                        <DropdownMenuItem key={i.to} onClick={() => openTo(i.to)} className={cn("gap-2", isActive(i.to) && "bg-accent font-medium")}>
                          <i.icon className="size-4 opacity-70" />{t(i.label)}<Kbd c={mainCombo} />
                        </DropdownMenuItem>
                      );
                    }
                    return (
                      <DropdownMenuSub key={i.to}>
                        <DropdownMenuSubTrigger className={cn("gap-2", isActive(i.to) && "bg-accent font-medium")}>
                          <i.icon className="size-4 opacity-70" />{t(i.label)}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-60">
                          <DropdownMenuItem onClick={() => openTo(i.to)} className="gap-2 font-medium">
                            <i.icon className="size-4 opacity-70" />{t(i.label)}<Kbd c={mainCombo} />
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {subs.map((s) => (
                            <DropdownMenuItem key={s.label} onClick={() => openTo(s.to, s.search, s.table)} className="gap-2">
                              {t(s.label)}<Kbd c={comboFor(combos, s.to, s.search, s.table)} />
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
          {!me?.isSuperAdmin && (
            <span className="ms-auto flex shrink-0 items-center gap-0.5 ps-2">
              <Link to="/home" className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground", pathname === "/home" ? "bg-accent font-medium text-foreground" : "hover:bg-accent")}>
                <Home className="size-4" />{t("الرئيسية")}
              </Link>
              <button type="button" title={t("تحديث البيانات")} aria-label={t("تحديث البيانات")} onClick={() => { void queryClient.invalidateQueries(); }}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <RefreshCw className="size-4" />
              </button>
              <Link to="/shortcuts" className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground", pathname.startsWith("/shortcuts") ? "bg-accent font-medium text-foreground" : "hover:bg-accent")}>
                <Settings className="size-4" />{t("اختصارات لوحة المفاتيح")}
              </Link>
              <Link to="/manual" className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground", pathname.startsWith("/manual") ? "bg-accent font-medium text-foreground" : "hover:bg-accent")}>
                <BookOpen className="size-4" />{t("دليل المستخدم")}
              </Link>
            </span>
          )}
        </nav>
        {!me?.isSuperAdmin && headerMenus.length > 0 && (
          <div className="no-print flex gap-2 overflow-x-auto border-b bg-card px-3 py-2 md:hidden" aria-label={t("اختصارات")}>
            <button type="button" aria-label={t("تحديث البيانات")} onClick={() => { void queryClient.invalidateQueries(); }}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
              <RefreshCw className="size-4" />{t("تحديث")}
            </button>
            {headerMenus.map((m) => (
              <button key={m.label} type="button" onClick={() => { setMobileGroups((s) => ({ ...s, ["h:" + m.label]: true })); setMobileOpen(true); }}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
                <m.icon className="size-4" />{t(m.label)}
              </button>
            ))}
          </div>
        )}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side={lang === "ar" ? "right" : "left"} className="no-print w-72 overflow-y-auto p-0 md:hidden">
            <SheetTitle className="sr-only">{t("القائمة")}</SheetTitle>
            <nav className="flex flex-col p-3 pb-8 pt-12">
              <Link
                to="/home"
                onClick={() => setMobileOpen(false)}
                className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", pathname === "/home" ? "bg-accent font-medium" : "hover:bg-accent")}
              >
                <Home className="size-4 opacity-70" />{t("الرئيسية")}
              </Link>
              {byTo["/dashboard"] && (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", isActive("/dashboard") ? "bg-accent font-medium" : "hover:bg-accent")}
                >
                  <Gauge className="size-4 opacity-70" />{t("لوحة المؤشرات")}
                </Link>
              )}
              {groups.map((g) => {
                const open = mobileGroups[g.id] ?? g.list.some((i) => isActive(i.to));
                return (
                <div key={g.id} className="mt-2">
                  <button type="button" aria-expanded={open} onClick={() => setMobileGroups((s) => ({ ...s, [g.id]: !open }))} className="flex w-full items-center gap-2 rounded-md bg-primary/10 px-3 py-2.5 text-start text-[15px] font-bold text-primary">
                    <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground"><g.icon className="size-4" /></span>
                    <span className="flex-1">{t(g.label)}</span>
                    <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                  </button>
                  {open && <div className="ms-4 mt-1 border-s-2 border-primary/30 ps-2">
                  {g.list.map((i) => i.to === "/settings" ? (
                    <div key={i.to}>
                      {SETTINGS_SECTIONS.map((sec) => {
                        const k = "s:" + sec.label;
                        const so = !!mobileGroups[k];
                        return <div key={sec.label} className="mt-0.5">
                          <button type="button" aria-expanded={so} onClick={() => setMobileGroups((s) => ({ ...s, [k]: !so }))} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm font-semibold hover:bg-accent">
                            <sec.icon className="size-4 opacity-70" /><span className="flex-1">{t(sec.label)}</span><ChevronDown className={cn("size-3.5 transition-transform", so && "rotate-180")} />
                          </button>
                          {so && <div className="ms-4 border-s ps-2">{sec.items.map((s) => (
                            <button key={s.label} type="button" onClick={() => { setMobileOpen(false); openTo(s.to, s.search); }} className="flex w-full rounded-md px-3 py-1.5 text-start text-sm hover:bg-accent">{t(s.label)}</button>
                          ))}</div>}
                        </div>;
                      })}
                    </div>
                  ) : (
                    SUB_ACTIONS[i.to] ? (() => {
                      const k = "i:" + i.to;
                      const io = !!mobileGroups[k];
                      return <div key={i.to} className="mt-0.5">
                        <button type="button" aria-expanded={io} onClick={() => setMobileGroups((s) => ({ ...s, [k]: !io }))} className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm", isActive(i.to) ? "bg-accent font-medium" : "hover:bg-accent")}>
                          <i.icon className="size-4 opacity-70" /><span className="flex-1">{t(i.label)}</span><ChevronDown className={cn("size-3.5 transition-transform", io && "rotate-180")} />
                        </button>
                        {io && <div className="ms-4 border-s ps-2">
                          <button type="button" onClick={() => { setMobileOpen(false); openTo(i.to); }} className="flex w-full rounded-md px-3 py-1.5 text-start text-sm font-medium hover:bg-accent">{t(i.label)}</button>
                          {SUB_ACTIONS[i.to]!.map((s) => (
                            <button key={s.label} type="button" onClick={() => { setMobileOpen(false); openTo(s.to, s.search, s.table); }} className="flex w-full rounded-md px-3 py-1.5 text-start text-sm hover:bg-accent">{t(s.label)}</button>
                          ))}
                        </div>}
                      </div>;
                    })() : (
                    <Link
                      key={i.to}
                      to={i.to}
                      onClick={() => setMobileOpen(false)}
                      className={cn("mt-0.5 flex items-center gap-2 rounded-md px-3 py-2 text-sm", isActive(i.to) ? "bg-accent font-medium" : "hover:bg-accent")}
                    >
                      <i.icon className="size-4 opacity-70" />{t(i.label)}
                    </Link>)
                  ))}
                  </div>}
                </div>
              );})}
              {!me?.isSuperAdmin && headerMenus.map((m) => {
                const hOpen = !!mobileGroups["h:" + m.label];
                return (
                <div key={m.label} className="mt-2">
                  <button type="button" aria-expanded={hOpen} onClick={() => setMobileGroups((s) => ({ ...s, ["h:" + m.label]: !hOpen }))} className="flex w-full items-center gap-2 rounded-md bg-highlight/15 px-3 py-2.5 text-start text-[15px] font-bold text-primary">
                    <span className="grid size-7 place-items-center rounded-md bg-highlight text-highlight-foreground"><m.icon className="size-4" /></span>
                    <span className="flex-1">{t(m.label)}</span>
                    <ChevronDown className={cn("size-4 transition-transform", hOpen && "rotate-180")} />
                  </button>
                  {hOpen && <div className="ms-4 mt-1 border-s-2 border-highlight/40 ps-2">
                  {m.items.map((i) => (
                    <button
                      key={i.label}
                      type="button"
                      onClick={() => { setMobileOpen(false); openTo(i.to, i.search, i.table); }}
                      className="mt-0.5 flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-accent"
                    >
                      {t(i.label)}
                    </button>
                  ))}
                  </div>}
                </div>
              );})}
              {!me?.isSuperAdmin && (
                <div className="mt-4 border-t pt-2">
                  <Link to="/shortcuts" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                    <Settings className="size-4" />{t("اختصارات لوحة المفاتيح")}
                  </Link>
                  <Link to="/manual" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                    <BookOpen className="size-4" />{t("دليل المستخدم")}
                  </Link>
                </div>
              )}
            </nav>
          </SheetContent>
        </Sheet>
        <main className={cn("app-content relative z-[1] mx-auto w-full min-w-0 flex-1 p-4 md:p-8", modern ? "max-w-none md:p-6" : "max-w-[1400px]")}>{children}</main>
        {me?.isTenantAdmin && me.tenantId && <OnboardingWizard tenantId={me.tenantId} tenantName={me.tenantName ?? ""} />}
        <FloatingHelp showManual={!me?.isSuperAdmin} />
        <Watermark />
        <QuickTools />
        <WindowManager />
      </div>
    </div>
  );
}

type HeaderMenuItem = { label: string; to: string; table?: string; search?: Record<string, string>; combo?: string };
function HeaderMenu({ label, icon: Icon, items, onPick }: { label: string; icon: typeof Gauge; items: HeaderMenuItem[]; onPick: (i: HeaderMenuItem) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium transition hover:bg-accent">
          <Icon className="size-4" /><span className="hidden lg:inline">{label}</span><ChevronDown className="size-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
        {items.map((i) => (
          <DropdownMenuItem key={i.label} onClick={() => onPick(i)} className="gap-2">{i.label}{i.combo && <kbd dir="ltr" className="ms-auto rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">{i.combo}</kbd>}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
