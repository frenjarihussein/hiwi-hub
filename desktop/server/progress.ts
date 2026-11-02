export const STARTUP_STEPS = [
  { id: "init", label: "تهيئة محرك قاعدة البيانات", sec: 15 },
  { id: "start", label: "تشغيل قاعدة البيانات", sec: 5 },
  { id: "roles", label: "إنشاء الصلاحيات والأمان", sec: 3 },
  { id: "auth", label: "تشغيل خدمة الدخول", sec: 6 },
  { id: "schema", label: "بناء الجداول والقيود المحاسبية", sec: 60 },
  { id: "services", label: "تشغيل الخدمات المحلية", sec: 6 },
  { id: "app", label: "تشغيل واجهة البرنامج", sec: 10 },
] as const;

export function startupSnapshot(progress: { step: number; stepStart: number; skip: Set<string>; done: boolean; error: string; started: number }, now = Date.now()) {
  const active = STARTUP_STEPS.filter((s) => !progress.skip.has(s.id));
  const current = STARTUP_STEPS[progress.step] ?? STARTUP_STEPS[0];
  const index = active.findIndex((s) => s.id === current.id);
  const completed = Math.max(0, index);
  // Percentage is completed stages, not a fabricated timer-based measure of SQL work.
  const pct = progress.done ? 100 : Math.floor(completed / Math.max(active.length, 1) * 100);
  const elapsedStep = Math.max(0, (now - progress.stepStart) / 1000);
  const remaining = progress.done ? 0 : elapsedStep > current.sec ? null : Math.ceil(active.slice(completed).reduce((n, s) => n + s.sec, 0) - elapsedStep);
  return { pct, label: progress.done ? "البرنامج جاهز" : current.label, step: completed + 1, steps: active.length, remaining, done: progress.done, error: progress.error, elapsed: Math.round((now - progress.started) / 1000) };
}