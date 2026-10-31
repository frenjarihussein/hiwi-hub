import { toast } from "sonner";

/** Error text patterns mapped to the screen where the user can fix the problem. */
export const ERROR_FIXES: { test: RegExp; label: string; to: string }[] = [
  { test: /اذهب لبطاقة الزبون|اذهب لبطاقة المورد/, label: "فتح دليل الزبائن والموردين", to: "/partners" },
  { test: /اذهب لبطاقة المستودع/, label: "فتح دليل المستودعات", to: "/warehouses" },
  { test: /اذهب لبطاقة مركز الكلفة/, label: "فتح مراكز الكلفة", to: "/cost-centers" },
  { test: /اذهب لبطاقة المشروع/, label: "فتح المشاريع", to: "/projects" },
  { test: /حدد الحساب التجميعي الأب/, label: "اختيار فروع الحسابات", to: "/settings?tab=accounting&sec=coding" },
  { test: /الربط المحاسبي|حساب غير محدد|حدد حساب/, label: "انتقل إلى إدارة الأنماط", to: "/doc-patterns" },
  { test: /سعر الصرف|العملة/, label: "انتقل إلى إعدادات العملات", to: "/settings" },
  { test: /الحساب الختامي|دليل الحسابات/, label: "انتقل إلى دليل الحسابات", to: "/accounts" },
  { test: /المستودع/, label: "انتقل إلى المستودعات", to: "/warehouses" },
  { test: /السنة المالية|الفترة المالية|مغلقة/, label: "انتقل إلى إعدادات السنة المالية", to: "/settings" },
  { test: /غير مصرح|صلاحية/, label: "انتقل إلى المستخدمين والصلاحيات", to: "/users" },
];

export function fixFor(message: string) {
  return ERROR_FIXES.find((f) => f.test.test(message)) ?? null;
}

let installed = false;
/** Adds a "go fix it" button to every error toast whose text matches a known problem. */
export function installErrorActions() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = toast.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (toast as any).error = (msg: any, opts?: any) => {
    const fix = typeof msg === "string" && !opts?.action ? fixFor(msg) : null;
    if (!fix) return orig(msg, opts);
    return orig(msg, {
      duration: 10000,
      ...opts,
      action: { label: fix.label, onClick: () => window.location.assign(fix.to) },
    });
  };
}
