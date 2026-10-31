/** Built-in and custom project templates used by the new-project wizard. */
import { TEMPLATE, type SolarSection } from "@/lib/solar";

export type TNode = { name: string; weight: number; data?: Record<string, unknown>; children?: TNode[] };
export type TSection = { section: SolarSection; weight: number; continuous?: boolean; children: TNode[] };
export type ProjectTemplate = { key: string; name: string; description: string; tree: TSection[]; custom?: boolean };

const M = { media: true };
const leaf = (name: string, weight: number, media = false): TNode => (media ? { name, weight, data: M } : { name, weight });
const fin: TSection = { section: "finance", weight: 5, continuous: true, children: [leaf("العقد والدفعة المقدمة", 40), leaf("الدفعات المرحلية", 30), leaf("التسوية والإغلاق المالي", 30)] };

const HYBRID: TSection[] = [
  { section: "survey", weight: 10, children: [leaf("زيارة الموقع والكشف", 30, true), leaf("دراسة الأحمال الحرجة وساعات الانقطاع", 30), leaf("تحديد سعة البطاريات والإنفرتر", 20), leaf("عرض السعر", 20)] },
  { section: "procurement", weight: 15, children: [leaf("الألواح الشمسية", 25), leaf("إنفرتر هايبرد", 25), leaf("بنك البطاريات (ليثيوم / جل)", 30), leaf("الهياكل والكابلات والقواطع", 20)] },
  { section: "civil", weight: 10, children: [leaf("تجهيز السطح / القواعد", 60, true), leaf("غرفة أو رف البطاريات وتهويتها", 40, true)] },
  { section: "mechanical", weight: 15, children: [leaf("تركيب الهياكل وضبط الميل", 50, true), leaf("تثبيت الألواح", 50, true)] },
  { section: "electrical", weight: 40, children: [
    leaf("توصيل الأوتار DC", 20, true),
    leaf("تركيب الإنفرتر وتوصيل البطاريات", 25, true),
    leaf("لوحة التحويل ATS وربط المولد والشبكة", 20, true),
    { name: "التأريض والحماية", weight: 15, children: [leaf("أوتاد التأريض", 50, true), { name: "قياس مقاومة الأرضي (أوم)", weight: 50, data: { media: true, ohms: true } }] },
    leaf("برمجة الإنفرتر وفحص دورات الشحن والتفريغ", 20),
  ] },
  fin,
  { section: "permits", weight: 5, continuous: true, children: [leaf("الوثائق والموافقات", 100)] },
];

const WATER_HOME: TSection[] = [
  { section: "survey", weight: 15, children: [leaf("الكشف على المنزل ومصدر المياه", 40, true), leaf("حساب الاحتياج اليومي للمياه والارتفاع", 30), leaf("اختيار المضخة / السخان وعرض السعر", 30)] },
  { section: "procurement", weight: 15, children: [leaf("الألواح أو لواقط التسخين", 40), leaf("المضخة المنزلية أو الغطاس", 30), leaf("الخزان والأنابيب والوصلات", 30)] },
  { section: "civil", weight: 10, children: [leaf("قاعدة الخزان والألواح", 100, true)] },
  { section: "mechanical", weight: 25, children: [leaf("تثبيت الألواح / اللواقط", 40, true), leaf("تمديد الأنابيب والخزان", 40, true), leaf("فحص ضغط الأنابيب والتسريب", 20, true)] },
  { section: "electrical", weight: 30, children: [leaf("توصيل المضخة ولوحة التحكم", 50, true), leaf("حماية الجفاف وعوامة الخزان", 25, true), leaf("التشغيل التجريبي", 25)] },
  fin,
];

const WATER_IND: TSection[] = [
  { section: "survey", weight: 10, children: [leaf("الكشف على البئر والموقع", 30, true), leaf("سبر واختبار إنتاجية البئر (م³/ساعة)", 30, true), leaf("حساب الرفع الكلي واستطاعة المضخة", 20), leaf("التصميم وعرض السعر", 20)] },
  { section: "procurement", weight: 15, children: [leaf("الألواح الشمسية", 35), leaf("إنفرتر مضخات VFD", 25), leaf("المضخة الغاطسة وكابل الغطاس", 25), leaf("الأنابيب والمحابس والعدادات", 15)] },
  { section: "civil", weight: 15, children: [leaf("قواعد الهياكل", 50, true), leaf("غرفة التحكم والخنادق", 30, true), leaf("الخزان / الحوض", 20, true)] },
  { section: "mechanical", weight: 20, children: [leaf("تجميع الهياكل وتثبيت الألواح", 50, true), leaf("تنزيل المضخة في البئر", 25, true), leaf("شبكة الأنابيب ومحابس الضغط", 25, true)] },
  { section: "electrical", weight: 35, children: [
    leaf("توصيل الأوتار DC", 25, true),
    leaf("تركيب وبرمجة إنفرتر VFD", 25, true),
    leaf("حساسات مستوى المياه والحماية من الجفاف", 15, true),
    { name: "التأريض والصواعق", weight: 15, children: [leaf("أوتاد التأريض", 50, true), { name: "قياس مقاومة الأرضي (أوم)", weight: 50, data: { media: true, ohms: true } }] },
    leaf("اختبار التدفق والتشغيل", 20),
  ] },
  fin,
  { section: "permits", weight: 5, continuous: true, children: [leaf("ترخيص البئر والموافقات", 100)] },
];

const BLANK: TSection[] = (["survey", "procurement", "civil", "mechanical", "electrical", "finance"] as SolarSection[]).map((section) => ({ section, weight: section === "finance" ? 0 : 20, continuous: section === "finance", children: [] }));

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  { key: "solar_industrial", name: "طاقة شمسية صناعية (On-Grid)", description: "معامل وتصدير للشبكة: هياكل، إنفرترات مركزية، تأريض، تراخيص ربط.", tree: TEMPLATE as TSection[] },
  { key: "solar_hybrid", name: "طاقة شمسية هايبرد", description: "ألواح + بطاريات + إنفرتر هايبرد مع ربط المولد والشبكة.", tree: HYBRID },
  { key: "water_home", name: "طاقة شمسية مائية منزلية", description: "ضخ أو تسخين مياه منزلي: مضخة صغيرة، خزان، حماية جفاف.", tree: WATER_HOME },
  { key: "water_industrial", name: "طاقة شمسية مائية صناعية / زراعية", description: "آبار وري: اختبار البئر، إنفرتر VFD، غطاس، شبكة أنابيب.", tree: WATER_IND },
  { key: "blank", name: "قالب فارغ", description: "أقسام فارغة تبني مراحلها ومهامها بنفسك.", tree: BLANK },
];

/** Count of tasks (all nodes below sections) for display. */
export function taskCount(tree: TSection[]) {
  const c = (n: TNode): number => 1 + (n.children ?? []).reduce((a, x) => a + c(x), 0);
  return tree.reduce((a, s) => a + s.children.reduce((b, n) => b + c(n), 0), 0);
}

/** Rebuilds a template tree from existing WBS rows of a project (to save it as a custom template). */
export function treeFromWbs(rows: { id: string; parent_id: string | null; section: string; name: string; weight: number; is_continuous?: boolean; data?: unknown; sort_order?: number }[]): TSection[] {
  const kids = new Map<string | null, typeof rows>();
  for (const r of [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) kids.set(r.parent_id, [...(kids.get(r.parent_id) ?? []), r]);
  const node = (r: (typeof rows)[number]): TNode => {
    const ch = kids.get(r.id) ?? [];
    const out: TNode = { name: r.name, weight: Number(r.weight) };
    if (r.data && typeof r.data === "object" && Object.keys(r.data).length) out.data = r.data as Record<string, unknown>;
    if (ch.length) out.children = ch.map(node);
    return out;
  };
  return (kids.get(null) ?? []).map((r) => ({ section: r.section as SolarSection, weight: Number(r.weight), continuous: !!r.is_continuous, children: (kids.get(r.id) ?? []).map(node) }));
}
