/** Industrial on-grid solar project module: sections, roles, templates and progress roll-up. */

export type SolarSection =
  "survey" | "procurement" | "civil" | "mechanical" | "electrical" | "finance" | "permits";
export type SolarRole =
  "admin" | "sales" | "civil" | "electrical" | "finance" | "permits" | "viewer";
export type Access = "edit" | "view" | "hidden";

export const SECTION_LABEL: Record<SolarSection, string> = {
  survey: "الكشف والدراسة الأولية",
  procurement: "تأمين المواد والتوريدات",
  civil: "الأعمال المدنية والبيتونية",
  mechanical: "الأعمال المعدنية وتثبيت الألواح",
  electrical: "الأعمال الكهربائية والتشغيل",
  finance: "القسم المالي ومركز الكلفة",
  permits: "التراخيص والموافقات الحكومية",
};
export const SECTIONS = Object.keys(SECTION_LABEL) as SolarSection[];

export const ROLE_LABEL: Record<SolarRole, string> = {
  admin: "الإدارة",
  sales: "المبيعات والكشف",
  civil: "مدني وميكانيك",
  electrical: "كهرباء وتشغيل",
  finance: "المالية والمشتريات",
  permits: "التراخيص",
  viewer: "اطلاع فقط",
};

const E: Access = "edit",
  V: Access = "view",
  H: Access = "hidden";
const MATRIX: Record<SolarRole, Record<SolarSection, Access>> = {
  admin: {
    survey: E,
    procurement: E,
    civil: E,
    mechanical: E,
    electrical: E,
    finance: E,
    permits: E,
  },
  sales: {
    survey: E,
    procurement: H,
    civil: H,
    mechanical: H,
    electrical: H,
    finance: V,
    permits: H,
  },
  civil: {
    survey: V,
    procurement: V,
    civil: E,
    mechanical: E,
    electrical: H,
    finance: H,
    permits: H,
  },
  electrical: {
    survey: V,
    procurement: V,
    civil: H,
    mechanical: H,
    electrical: E,
    finance: H,
    permits: H,
  },
  finance: {
    survey: V,
    procurement: E,
    civil: V,
    mechanical: V,
    electrical: V,
    finance: E,
    permits: V,
  },
  permits: {
    survey: V,
    procurement: H,
    civil: V,
    mechanical: V,
    electrical: V,
    finance: H,
    permits: E,
  },
  viewer: {
    survey: V,
    procurement: V,
    civil: V,
    mechanical: V,
    electrical: V,
    finance: H,
    permits: V,
  },
};

/** Access of a role to a section; the permits section is hidden when the plant does not export to the grid. */
export function sectionAccess(
  role: SolarRole,
  section: SolarSection,
  exportToGrid: boolean,
): Access {
  void exportToGrid; // permits stay visible: zero-export plants still need a no-objection paper
  return MATRIX[role][section];
}

/** Sales sees only the final price from finance, never budgets or costs. */
export type SectionPerms = { view: boolean; create: boolean; edit: boolean; delete: boolean };
type PermRowLike = { module: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };

/**
 * Per-user section permissions (modules project_<section>), mirroring project_section_ok in the DB.
 * Returns null when the user has no section rows — the solar role matrix then applies.
 */
export function sectionPermsFor(
  perms: PermRowLike[],
  section: SolarSection,
  isAdmin: boolean,
): SectionPerms | null {
  if (isAdmin) return { view: true, create: true, edit: true, delete: true };
  if (!perms.some((p) => p.module.startsWith("project_"))) return null;
  const p = perms.find((x) => x.module === `project_${section}`);
  const view = !!p && (p.can_view || p.can_create || p.can_edit || p.can_delete);
  return { view, create: !!p?.can_create, edit: !!p?.can_edit, delete: !!p?.can_delete };
}

export function accessFromPerms(p: SectionPerms): Access {
  return !p.view ? "hidden" : p.edit || p.create ? "edit" : "view";
}

export function canSeeCosts(role: SolarRole) {
  return role === "admin" || role === "finance";
}

export type WbsNode = { id: string; parent_id: string | null; weight: number; progress: number };

/** Weighted roll-up: leaves keep their own progress, each parent = Σ(child × weight) / Σweight. */
export function rollup(nodes: WbsNode[]): { byId: Map<string, number>; total: number } {
  const kids = new Map<string | null, WbsNode[]>();
  for (const n of nodes) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n]);
  const byId = new Map<string, number>();
  const calc = (n: WbsNode, seen: Set<string>): number => {
    if (seen.has(n.id)) return 0;
    seen.add(n.id);
    const ch = kids.get(n.id) ?? [];
    const v = ch.length
      ? avg(ch.map((c) => [calc(c, seen), Number(c.weight)]))
      : clamp(Number(n.progress));
    byId.set(n.id, v);
    return v;
  };
  const roots = kids.get(null) ?? [];
  const total = avg(roots.map((r) => [calc(r, new Set()), Number(r.weight)]));
  return { byId, total };
}
function avg(pairs: [number, number][]) {
  const w = pairs.reduce((a, [, x]) => a + Math.max(0, x), 0);
  return w ? pairs.reduce((a, [p, x]) => a + p * Math.max(0, x), 0) / w : 0;
}
function clamp(v: number) {
  return Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));
}

/** Milestone is due once project progress reaches its trigger percentage. */
export function milestoneDue(completion: number, triggerPct: number | null | undefined) {
  return triggerPct != null && completion >= Number(triggerPct);
}

type T = { name: string; weight: number; data?: Record<string, unknown>; children?: T[] };
export const TEMPLATE: {
  section: SolarSection;
  weight: number;
  continuous?: boolean;
  children: T[];
}[] = [
  {
    section: "survey",
    weight: 10,
    children: [
      { name: "زيارة الموقع والكشف الميداني", weight: 40, data: { media: true } },
      { name: "دراسة الأحمال وفواتير الكهرباء", weight: 20 },
      { name: "التصميم الأولي ومخطط SLD", weight: 20 },
      { name: "تقرير PVsyst وعرض السعر", weight: 20 },
    ],
  },
  {
    section: "procurement",
    weight: 10,
    children: [
      {
        name: "الألواح الشمسية",
        weight: 40,
        children: [
          { name: "طلب الشراء", weight: 30 },
          { name: "الشحن والتخليص", weight: 30 },
          { name: "الاستلام في الموقع", weight: 40 },
        ],
      },
      {
        name: "الإنفرترات",
        weight: 30,
        children: [
          { name: "طلب الشراء", weight: 30 },
          { name: "الشحن والتخليص", weight: 30 },
          { name: "الاستلام في الموقع", weight: 40 },
        ],
      },
      { name: "الهياكل ومستلزمات التثبيت", weight: 15 },
      { name: "الكابلات وقواطع الحماية", weight: 15 },
    ],
  },
  {
    section: "civil",
    weight: 20,
    children: [
      { name: "تسوية الموقع وتجهيز السطح", weight: 25, data: { media: true } },
      { name: "صب قواعد الهياكل", weight: 40, data: { media: true } },
      { name: "قواعد الإنفرترات والمحولة", weight: 20, data: { media: true } },
      { name: "الخنادق ومسارات الكابلات", weight: 15, data: { media: true } },
    ],
  },
  {
    section: "mechanical",
    weight: 20,
    children: [
      { name: "تجميع الهياكل وضبط زاوية الميل", weight: 45, data: { media: true } },
      { name: "فحص عزم الشد (Torque)", weight: 15, data: { media: true } },
      { name: "تثبيت الألواح بالمشابك", weight: 40, data: { media: true } },
    ],
  },
  {
    section: "electrical",
    weight: 25,
    children: [
      {
        name: "أعمال التيار المستمر DC",
        weight: 30,
        children: [
          { name: "توصيل الأوتار (Strings)", weight: 60, data: { media: true } },
          { name: "صناديق التجميع", weight: 40, data: { media: true } },
        ],
      },
      {
        name: "الإنفرترات ولوحات AC",
        weight: 25,
        children: [
          { name: "تركيب وبرمجة الإنفرترات", weight: 50, data: { media: true } },
          { name: "لوحات AC ومحولة الرفع", weight: 50, data: { media: true } },
        ],
      },
      {
        name: "التأريض والصواعق",
        weight: 15,
        children: [
          { name: "شبكة أوتاد التأريض", weight: 50, data: { media: true } },
          { name: "قياس مقاومة الأرضي (أوم)", weight: 30, data: { media: true, ohms: true } },
          { name: "حوافظ الجهد", weight: 20, data: { media: true } },
        ],
      },
      {
        name: "التشغيل والتجريب",
        weight: 30,
        children: [
          { name: "اختبار اللاحمل", weight: 30 },
          { name: "الفحص الحراري وفحص الأداء", weight: 30 },
          { name: "المزامنة مع الشبكة وصافي القياس", weight: 40 },
        ],
      },
    ],
  },
  {
    section: "finance",
    weight: 5,
    continuous: true,
    children: [
      { name: "العقد والدفعة المقدمة", weight: 30 },
      { name: "مستخلصات المقاولين", weight: 40 },
      { name: "التسوية والإغلاق المالي", weight: 30 },
    ],
  },
  {
    section: "permits",
    weight: 10,
    continuous: true,
    children: [
      { name: "الوثائق", weight: 10 },
      { name: "الموافقة المبدئية من شركة الكهرباء", weight: 20 },
      { name: "الاتفاقية مع شركة الكهرباء ودراسة المشروع", weight: 25 },
      { name: "مطابقة الدراسة مع الواقع (شركة الكهرباء)", weight: 25 },
      { name: "تركيب العدادات", weight: 20 },
    ],
  },
];

/** Flattens the template into insertable rows with client UUIDs. */
export function templateRows(
  projectId: string,
  tenantId: string,
  exportToGrid: boolean,
  tree: { section: SolarSection; weight: number; continuous?: boolean; children: T[] }[] = TEMPLATE,
) {
  const rows: Record<string, unknown>[] = [];
  const push = (t: T, parent: string, section: SolarSection, i: number) => {
    const id = crypto.randomUUID();
    rows.push({
      id,
      tenant_id: tenantId,
      project_id: projectId,
      parent_id: parent,
      section,
      name: t.name,
      weight: t.weight,
      is_final: !t.children?.length,
      is_continuous: false,
      sort_order: i,
      data: t.data ?? {},
    });
    t.children?.forEach((c, j) => push(c, id, section, j));
  };
  tree.forEach((s, i) => {
    const id = crypto.randomUUID();
    const weight = s.section === "permits" && !exportToGrid ? 2 : s.weight;
    rows.push({
      id,
      tenant_id: tenantId,
      project_id: projectId,
      parent_id: null,
      section: s.section,
      name: SECTION_LABEL[s.section],
      weight,
      is_final: false,
      is_continuous: !!s.continuous,
      sort_order: i,
      data: {},
    });
    s.children.forEach((c, j) => push(c, id, s.section, j));
  });
  return rows;
}

export const AZIMUTHS = [
  "شمال",
  "جنوب",
  "شرق",
  "غرب",
  "شمال شرقي",
  "شمال غربي",
  "جنوب شرقي",
  "جنوب غربي",
];
export const MOUNT_TYPES = [
  "سطح هنغار معدني / ساندوتش بانل",
  "سطح زينكو معرج",
  "سطح بيتوني",
  "قاعدة بيتونية مستمرة",
  "تركيب أرضي على قواعد منفصلة",
  "مظلات مواقف سيارات",
  "هياكل متحركة (Trackers)",
];
export const SURVEY_RESULTS = [
  "مقبول فنياً وجاهز للدراسة",
  "مقبول بشروط وتعديلات",
  "غير ملائم فنياً",
];
export const EARTHING = ["موجود ومطابق", "موجود ويحتاج تأهيل", "غير موجود"];
export const SHIFTS = ["وردية واحدة", "ورديتان", "ثلاث ورديات (24 ساعة)"];
export const BOM_CATEGORIES: Record<string, string> = {
  panels: "ألواح",
  inverters: "إنفرترات",
  structures: "هياكل",
  cables: "كابلات",
  protection: "حماية",
  other: "أخرى",
};
export const SUPPLY_STATUS: Record<string, string> = {
  requested: "طلب شراء",
  shipping: "قيد الشحن/التخليص",
  warehouse: "في المستودع",
  site: "سُلّم للموقع",
};

/** Supporting documents (stage 1) — all optional. */
export const PERMIT_DOCS: { key: string; label: string; optional?: boolean }[] = [
  { key: "owner_id", label: "هوية المالك", optional: true },
  { key: "owner_residence", label: "إثبات سكن المالك", optional: true },
  { key: "title_deed", label: "سند الملكية أو عقد الإيجار", optional: true },
  { key: "land_registry", label: "المخطط المساحي / النافذة الواحدة", optional: true },
  { key: "commercial_register", label: "السجل التجاري أو الصناعي", optional: true },
  { key: "location_cert", label: "شهادة موقع المصنع", optional: true },
  { key: "zone_approval", label: "موافقة المدينة الصناعية أو البلدية", optional: true },
  { key: "poa", label: "الوكالة القانونية (إن وجدت)", optional: true },
  { key: "clearance", label: "براءة ذمة شركة الكهرباء", optional: true },
];
export const AGRI_DOC: { key: string; label: string; optional?: boolean } = {
  key: "agri_approval",
  label: "موافقة وزارة الزراعة",
};
export const MUNICIPALITY_DOC: { key: string; label: string; optional?: boolean } = {
  key: "municipality_approval",
  label: "موافقة البلدية",
};
export const NO_OBJECTION_DOC: { key: string; label: string; optional?: boolean } = {
  key: "no_objection",
  label: "لا مانع من التركيب",
  optional: true,
};

/** Licensing stages for grid-exporting plants, in order. */
export const PERMIT_STAGES: { key: string; label: string; doc: string }[] = [
  { key: "docs", label: "الوثائق (كلها اختيارية)", doc: "" },
  { key: "initial", label: "الموافقة المبدئية من شركة الكهرباء", doc: "grid_initial" },
  { key: "agreement", label: "كتابة الاتفاقية مع شركة الكهرباء ودراسة المشروع", doc: "grid_agreement" },
  { key: "inspection", label: "مطابقة الدراسة مع الواقع من طرف شركة الكهرباء", doc: "grid_inspection" },
  { key: "meters", label: "تركيب العدادات", doc: "meters" },
];

/**
 * Required approvals. Outside the industrial city: municipality + agriculture
 * (agriculture needs a letter from the electricity company first). Inside: none extra.
 * Zero-export plants need nothing mandatory (only an optional no-objection paper).
 */
export function requiredPermits(outsideIndustrial: boolean, exportToGrid = true) {
  if (!exportToGrid) return [];
  return outsideIndustrial ? [MUNICIPALITY_DOC, AGRI_DOC] : [];
}

/** Current kWh prices (USD). */
export const KWH_TARIFF = { factory: 0.02, farm: 0.04 } as const;
