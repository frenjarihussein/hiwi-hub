/** Ready-made permission sets for project-only users; each section = project_<section> module. */
type P = { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };
const F: P = { can_view: true, can_create: true, can_edit: true, can_delete: true };
const W: P = { can_view: true, can_create: true, can_edit: true, can_delete: false };
const V: P = { can_view: true, can_create: false, can_edit: false, can_delete: false };

export type ProjectPreset = { id: string; label: string; desc: string; perms: Record<string, P> };

const S = ["survey", "procurement", "civil", "mechanical", "electrical", "finance", "permits"] as const;
const sec = (m: Partial<Record<(typeof S)[number], P>>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [`project_${k}`, v])) as Record<string, P>;
const viewAllBut = (hide: string[]) => Object.fromEntries(S.filter((s) => !hide.includes(s)).map((s) => [s, V]));

export const PROJECT_PRESETS: ProjectPreset[] = [
  { id: "surveyor", label: "كاشف مبدئي", desc: "يضيف عملاء مهتمين ومشاريع ويعبّئ الكشف الأولي", perms: { projects: W, ...sec({ survey: W }) } },
  { id: "study", label: "مسؤول دراسة", desc: "الكشف والدراسة والتصميم، واطلاع على التوريدات", perms: { projects: V, ...sec({ survey: F, procurement: V }) } },
  { id: "electrical", label: "مسؤول أعمال كهربائية", desc: "الأعمال الكهربائية والتشغيل", perms: { projects: V, ...sec({ survey: V, procurement: V, electrical: W }) } },
  { id: "mechanical", label: "مسؤول أعمال ميكانيكية", desc: "الهياكل وتثبيت الألواح", perms: { projects: V, ...sec({ survey: V, procurement: V, mechanical: W }) } },
  { id: "civil", label: "مسؤول أعمال إنشائية", desc: "الأعمال المدنية والبيتونية", perms: { projects: V, ...sec({ survey: V, procurement: V, civil: W }) } },
  { id: "manager", label: "مدير المشاريع", desc: "كل الأقسام، حالة المشروع وهويته، وإدارة فريق المشاريع وصلاحياتهم", perms: { projects: F, project_users: F, ...sec(Object.fromEntries(S.map((s) => [s, F]))) } },
  { id: "finance", label: "مسؤول مالي", desc: "القسم المالي والتوريدات، واطلاع على الباقي", perms: { projects: V, ...sec({ ...viewAllBut([]), finance: F, procurement: W }) } },
  { id: "permits", label: "مسؤول التراخيص", desc: "التراخيص والموافقات الحكومية", perms: { projects: V, ...sec({ ...viewAllBut(["finance", "procurement"]), permits: F }) } },
];

/** Modules that belong to the projects area (directory, sections and team management). */
export function isProjectModule(m: string) {
  return m === "projects" || m.startsWith("project_");
}

/** Keeps only project permissions; project team management only when allowed. */
export function keepProjectPerms<T extends { module: string }>(perms: T[], allowTeam: boolean): T[] {
  return perms.filter((p) => isProjectModule(p.module) && (allowTeam || p.module !== "project_users"));
}

/** A company subscribed to project management only: projects on, accounting off. */
export function projectsOnlyFeatures(f: Record<string, boolean | undefined>) {
  return f["projects"] !== false && f["accounts"] === false && f["journal"] === false;
}
