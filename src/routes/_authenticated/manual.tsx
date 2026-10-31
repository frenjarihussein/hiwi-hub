import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/session";
import { useExtra } from "@/lib/prefs";
import { SHORTCUT_ACTIONS, effectiveCombos } from "@/lib/shortcuts";
import {
  BookOpen, Building2, ListTree, FileText, Package, ShoppingCart, BarChart3,
  Users, Wallet, Settings2, Keyboard, Sparkles, DatabaseBackup, ChevronDown,
  Printer, Landmark, ClipboardCheck, AlertTriangle, Lightbulb, Search, HelpCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/manual")({
  component: ManualPage,
  head: () => ({
    meta: [
      { title: "دليل المستخدم | يوسف سوفت" },
      { name: "description", content: "دليل استخدام برنامج يوسف سوفت المحاسبي: الحسابات، القيود، المستندات، المخزون، نقاط البيع، التقارير والقوائم الختامية" },
      { property: "og:title", content: "دليل المستخدم | يوسف سوفت" },
      { property: "og:description", content: "دليل استخدام برنامج يوسف سوفت المحاسبي" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Section = { id: string; title: string; icon: React.ComponentType<{ className?: string }>; keywords?: string; body: React.ReactNode };

const H = ({ children }: { children: React.ReactNode }) => <h4 className="mt-4 mb-1.5 font-semibold">{children}</h4>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm leading-7 text-muted-foreground">{children}</p>;
const Li = ({ children }: { children: React.ReactNode }) => <li className="text-sm leading-7 text-muted-foreground">{children}</li>;
const K = ({ children }: { children: React.ReactNode }) => <kbd dir="ltr" className="mx-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{children}</kbd>;
const Steps = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="my-2 space-y-2">
    {items.map((it, i) => (
      <li key={i} className="flex gap-3 text-sm leading-7 text-muted-foreground">
        <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
        <span>{it}</span>
      </li>
    ))}
  </ol>
);
const Tip = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <div className={cn("my-3 flex gap-2 rounded-md border p-3 text-sm leading-7", warn ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5")}>
    {warn ? <AlertTriangle className="mt-1 size-4 shrink-0 text-destructive" /> : <Lightbulb className="mt-1 size-4 shrink-0 text-primary" />}
    <div>{children}</div>
  </div>
);

function LiveShortcuts() {
  const { data: me } = useMe();
  const extra = useExtra(me);
  const combos = effectiveCombos(extra.data);
  const groups = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))];
  return (
    <div className="my-2 space-y-3">
      {groups.map((g) => (
        <div key={g} className="overflow-hidden rounded-md border">
          <h5 className="border-b bg-muted/40 px-3 py-1.5 text-sm font-semibold">{g}</h5>
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUT_ACTIONS.filter((a) => a.group === g).map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5 text-muted-foreground">{a.label}</td>
                  <td className="w-32 px-2 py-1.5 text-left" dir="ltr">
                    {combos[a.id] ? <K>{combos[a.id]}</K> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <P>هذا الجدول يعرض اختصاراتك الحالية (بعد أي تخصيص). لتغيير أي اختصار افتح صفحة <Link to="/shortcuts" className="text-primary underline">«اختصارات لوحة المفاتيح»</Link>.</P>
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    id: "start", title: "البداية وإعداد الشركة", icon: Building2,
    keywords: "شركة جديدة إعدادات شعار عملة سنة مالية وحدات مستخدمين صلاحيات",
    body: <>
      <P>بعد إنشاء حسابك وتسجيل الدخول لأول مرة، اتبع هذه الخطوات بالترتيب:</P>
      <Steps items={[
        <>أنشئ شركتك من صفحة «الشركات» — أدخل الاسم والنشاط والعملة الأساسية.</>,
        <>افتح «الإعدادات» واضبط بيانات الشركة: الاسم بالعربية والإنكليزية، الشعار، اللون المميز، وبداية السنة المالية.</>,
        <>فعّل الوحدات التي تحتاجها فقط (المخزون، نقاط البيع، الرواتب، التصنيع، الفندقة…) — القائمة العلوية تعرض فقط الوحدات المفعّلة.</>,
        <>راجع شجرة الحسابات الجاهزة وعدّلها بما يناسب نشاطك (راجع قسم «شجرة الحسابات»).</>,
        <>أضف المستخدمين من صفحة «المستخدمين» وحدد دور كل واحد.</>,
        <>أدخل الأرصدة الافتتاحية من صفحة «الافتتاح والإقفال» إن كنت منتقلاً من برنامج آخر.</>,
      ]} />
      <H>المستخدمون والصلاحيات</H>
      <P>لكل مستخدم دور يحدد ما يراه: المدير يرى كل شيء، المحاسب يرى القيود والمستندات والتقارير، والكاشير يرى فقط شاشات نقاط البيع الخاصة به ولا يصل إلى بقية القوائم.</P>
      <Tip>أول حساب يُنشأ في البرنامج يصبح «مالك النظام» ويملك صلاحيات خاصة بإدارة كل الشركات والاشتراكات.</Tip>
    </>,
  },
  {
    id: "accounts", title: "شجرة الحسابات", icon: ListTree,
    keywords: "حساب حسابات دليل أب فرعي ختامي عملة كشف",
    body: <>
      <P>شجرة الحسابات هي أساس كل شيء في البرنامج — كل قيد ومستند وتقرير يعتمد عليها.</P>
      <H>إضافة حساب جديد</H>
      <Steps items={[
        <>افتح «المحاسبة ← حساب جديد» أو اضغط <K>Ctrl+Alt+Shift+A</K>.</>,
        <>اختر الحساب الأب من الشجرة (مثلاً: المصاريف).</>,
        <>أدخل الاسم واترك الترميز للبرنامج أو أدخله يدوياً.</>,
        <>حدد النوع الختامي (ميزانية / أرباح وخسائر / متاجرة) ليُرحّل رصيده تلقائياً عند الإقفال.</>,
        <>احفظ — يظهر الحساب فوراً في الشجرة وفي كل القوائم.</>,
      ]} />
      <H>نقاط مهمة</H>
      <Li>• الحساب الختامي: يمكن تحديد حساب إقفال معين لكل حساب، أو تركه ليُقفل حسب نوعه — ويمكن إضافة عدة حسابات ختامية للنوع الواحد.</Li>
      <Li>• حساب العملة: اربط الحساب بعملة أجنبية (كحساب بنك بالدولار) لتظهر فروقات الصرف عند التقييم.</Li>
      <Li>• الحسابات التي عليها حركات لا تُحذف، بل يمكن إيقافها.</Li>
      <H>الاختصارات</H>
      <Li>• <K>Ctrl+Alt+Shift+A</K> حساب جديد • <K>Alt+Shift+A</K> دليل الحسابات • <K>Ctrl+Alt+A</K> كشف حساب.</Li>
      <Tip>نظّم شجرتك من البداية: حساب رئيسي لكل مجموعة (أصول، التزامات، إيرادات، مصاريف) ثم فروع تحتها — هذا يجعل التقارير أوضح بكثير.</Tip>
    </>,
  },
  {
    id: "journal", title: "القيود اليومية", icon: FileText,
    keywords: "قيد قيود يومية مدين دائن ترحيل عكسي دورية مرفقات",
    body: <>
      <P>القيد اليومي هو طريقة تسجيل أي عملية مالية لا تغطيها المستندات (رواتب، مصاريف، تسويات…).</P>
      <H>إنشاء قيد</H>
      <Steps items={[
        <>افتح «القيود والمستندات ← قيد يومية» أو اضغط <K>Alt+J</K>.</>,
        <>أدخل التاريخ والبيان.</>,
        <>أضف السطور: اختر الحساب، ثم المبلغ في خانة المدين أو الدائن.</>,
        <>تأكد أن القيد متوازن (مجموع المدين = مجموع الدائن) — البرنامج يرفض ترحيل القيد غير المتوازن.</>,
        <>احفظ كمسودة إن أردت المراجعة لاحقاً، أو رحّل مباشرة.</>,
      ]} />
      <H>بعد الترحيل</H>
      <Li>• القيد المرحّل لا يُعدّل — إن اكتشفت خطأً، أنشئ قيداً عكسياً ثم قيداً صحيحاً.</Li>
      <Li>• يمكن إرفاق ملفات وصور بأي قيد، وإضافة ملاحظات، ومراجعة سجل التدقيق لمعرفة من أنشأ أو عدّل.</Li>
      <H>القيود الدورية</H>
      <P>للعمليات المتكررة (إيجار شهري، قسط…) عرّف قيداً دورياً مرة واحدة، والبرنامج يولّده تلقائياً في موعده.</P>
      <Tip warn>لا ترحّل قيداً قبل التأكد من توازنه ومن صحة الحسابات — الترحيل يؤثر مباشرة في الأرصدة والتقارير.</Tip>
    </>,
  },
  {
    id: "docs", title: "المستندات والفواتير", icon: Printer,
    keywords: "فاتورة بيع شراء مرتجع سند قبض دفع عرض سعر ضريبة خصم طباعة",
    body: <>
      <P>المستندات تغطي العمليات اليومية: فواتير البيع والشراء والمرتجعات، سندات القبض والدفع، وعروض الأسعار. كل مستند يولّد قيده المحاسبي تلقائياً عند الترحيل ويحرّك المخزون إن كان فيه مواد.</P>
      <H>إنشاء فاتورة بيع</H>
      <Steps items={[
        <>اضغط <K>Alt+S</K> أو افتح «القيود والمستندات ← فاتورة بيع».</>,
        <>اختر العميل (أو أضفه بسرعة من نفس الشاشة).</>,
        <>أضف المواد — اكتب الاسم أو امسح الباركود، وعدّل الكمية والسعر.</>,
        <>أضف الخصم أو الضريبة إن وجدت.</>,
        <>حدد طريقة الدفع: نقدي، آجل، أو جزئي.</>,
        <>رحّل الفاتورة — يُنشأ القيد وتُخصم الكميات من المستودع تلقائياً.</>,
      ]} />
      <H>ملاحظات</H>
      <Li>• ربط المستند بشريك (عميل/مورد) يجعله يظهر في كشف حسابه مباشرة.</Li>
      <Li>• المرتجعات (<K>Alt+Shift+S</K> مرتجع بيع، <K>Alt+Shift+B</K> مرتجع شراء) تعكس أثر الفاتورة الأصلية.</Li>
      <Li>• كل مستند قابل للطباعة بتصميم يحمل شعار شركتك وألوانها.</Li>
      <Tip>استخدم عروض الأسعار (<K>Alt+Q</K>) قبل الفاتورة — وعند قبول العميل حوّلها إلى فاتورة بضغطة دون إعادة إدخال.</Tip>
    </>,
  },
  {
    id: "stock", title: "المواد والمخزون", icon: Package,
    keywords: "مادة مواد مخزون مستودع جرد باركود تصنيع وصفة تحويل حد الطلب",
    body: <>
      <H>تعريف المواد</H>
      <Steps items={[
        <>افتح «المخزون ← المواد» وأضف مادة جديدة.</>,
        <>أدخل الاسم والباركود وسعر البيع والشراء ووحدة القياس.</>,
        <>صنّفها ضمن فئة من الفئات الشجرية لتسهيل البحث والتقارير.</>,
        <>حدد «حد الطلب» ليُنبّهك البرنامج عند انخفاض الكمية عنه.</>,
      ]} />
      <H>المستودعات والتحويل</H>
      <P>عرّف مستودعاتك من «المستودعات»، وانقل المواد بينها بمستند مناقلة (<K>Alt+T</K>). مستندات الإدخال (<K>Alt+I</K>) والإخراج (<K>Alt+O</K>) تسجّل الحركات غير المرتبطة بفواتير.</P>
      <H>الجرد</H>
      <Steps items={[
        <>افتح «الجرد» واختر المستودع والتاريخ.</>,
        <>أدخل الكميات الفعلية التي عددتها.</>,
        <>يقارن البرنامج الفعلي بالدفتري ويعرض الفروقات.</>,
        <>اعتمد الجرد — تُولّد قيود التسوية تلقائياً.</>,
      ]} />
      <H>التصنيع</H>
      <P>عرّف وصفة (مواد أولية → منتج تام) ثم نفّذ أمر إنتاج: يخصم البرنامج المواد الأولية ويضيف المنتج التام بتكلفة محسوبة.</P>
      <Tip>امسح الباركود مباشرة في أي حقل مواد — في الفواتير والجرد ونقاط البيع.</Tip>
    </>,
  },
  {
    id: "pos", title: "نقاط البيع", icon: ShoppingCart,
    keywords: "كاشير وردية درج نقدية مطعم طاولة فندق غرفة حجز",
    body: <>
      <P>شاشة «نقاط البيع» مصممة للمس السريع وتعمل حتى مع انقطاع الإنترنت (تُزامَن الفواتير عند عودته).</P>
      <H>الوردية</H>
      <Steps items={[
        <>افتح الوردية بمبلغ افتتاحي (العُملة الموجودة في الدرج).</>,
        <>بِع طوال الوردية — كل كاشير له درج نقدية خاص منفصل عن صندوق الشركة الرئيسي.</>,
        <>أغلق الوردية بنهاية الدوام: أدخل النقد الفعلي، والبرنامج يسوّي الفروقات تلقائياً ويسجّلها.</>,
      ]} />
      <H>الأوضاع الخاصة</H>
      <Li>• وضع المطعم: طاولات وطلبات تُرسل للمطبخ.</Li>
      <Li>• وضع الفندقة: إدارة الغرف والحجوزات والإشغال.</Li>
      <Tip warn>الكاشير لا يرى أرصدة الشركة ولا القوائم الأخرى — حسابه مقصور على شاشات البيع فقط.</Tip>
    </>,
  },
  {
    id: "reports", title: "التقارير والقوائم الختامية وسعر الصرف", icon: BarChart3,
    keywords: "تقرير ميزان مراجعة قائمة دخل ميزانية عمومية أعمار ذمم عملة صرف تقييم إقفال ختامي",
    body: <>
      <P>صفحة «التقارير» تجمع كل التقارير: ميزان المراجعة، قائمة الدخل، الميزانية العمومية، حركة المخزون، أعمار الذمم وغيرها.</P>
      <H>العملات وسعر الصرف</H>
      <Steps items={[
        <>اختر عملة العرض من أعلى صفحة التقرير.</>,
        <>يُعبّأ سعر الصرف تلقائياً من آخر سعر مسجّل قبل تاريخ «إلى» — ويمكنك تعديله يدوياً.</>,
        <>فعّل خيار «إعادة التقييم» ليحسب البرنامج فروقات تقييم العملة على أرصدة الحسابات الأجنبية بسعر نهاية الفترة.</>,
        <>يظهر الفرق كسطر «فروقات الصرف» في قائمة الدخل والميزانية، مع جدول يوضح الفرق لكل حساب.</>,
      ]} />
      <H>الحسابات الختامية (إقفال السنة)</H>
      <Steps items={[
        <>راجع ميزان المراجعة وتأكد من صحة كل الأرصدة.</>,
        <>خذ نسخة احتياطية قبل الإقفال (راجع قسم النسخ الاحتياطي).</>,
        <>افتح «القوائم الختامية» وولّد قيود الإقفال.</>,
        <>يُرحّل البرنامج رصيد كل حساب إلى حسابه الختامي (حسب النوع أو الحساب المحدد) وتظهر فروقات الصرف ضمن قائمة الدخل.</>,
      ]} />
      <Tip warn>الإقفال عملية كبيرة — لا تنفّذها قبل مراجعة السنة كاملة وأخذ نسخة احتياطية.</Tip>
    </>,
  },
  {
    id: "partners", title: "العملاء والموردون", icon: Users,
    keywords: "عميل مورد شريك كشف حساب مشاركة رابط واتساب",
    body: <>
      <P>صفحة «الشركاء» تجمع العملاء والموردين مع أرصدتهم وكشوف حساباتهم.</P>
      <Li>• اضغط <K>Alt+Shift+C</K> لفتح دليل الزبائن، و<K>Ctrl+Alt+C</K> لكشف حساب عميل.</Li>
      <Li>• شارك كشف الحساب مع العميل عبر رابط قراءة فقط — لا يحتاج حساباً في البرنامج ويرى أرقامه فقط.</Li>
      <Li>• يمكن إرسال كشف الحساب عبر واتساب مباشرة من صفحة الكشف.</Li>
      <Tip>رابط المشاركة يبقى فعالاً حتى تلغيه — ألغِه عندما لا يعود العميل بحاجته.</Tip>
    </>,
  },
  {
    id: "treasury", title: "الخزينة والشيكات والأصول", icon: Landmark,
    keywords: "صندوق بنك شيك شيكات أصل أصول إهلاك خزينة",
    body: <>
      <Li>• «الخزينة» تعرض الصناديق والحسابات البنكية وحركاتها وأرصدتها.</Li>
      <Li>• «الشيكات» يتابع شيكات القبض والدفع بحالاتها: تحت التحصيل، محصّلة، مرتجعة — مع تنبيهات قبل استحقاقها.</Li>
      <Li>• «الأصول الثابتة» يسجّل الأصول (سيارات، معدات، عقارات) ويحسب إهلاكاتها تلقائياً بقيود دورية حسب طريقة الإهلاك التي تختارها.</Li>
    </>,
  },
  {
    id: "payroll", title: "الموظفون والرواتب", icon: Wallet,
    keywords: "موظف راتب رواتب مسير سلفة جزاء خصم",
    body: <>
      <H>مسيّر الرواتب الشهري</H>
      <Steps items={[
        <>عرّف الموظفين ورواتبهم الأساسية والبدلات من صفحة «الموظفون».</>,
        <>سجّل السلف والجزاءات خلال الشهر على ملف كل موظف.</>,
        <>في نهاية الشهر افتح «الرواتب» وولّد المسيّر بضغطة واحدة.</>,
        <>يُنشئ البرنامج قيود الاستحقاق والدفع ويخصم السلف والجزاءات تلقائياً.</>,
      ]} />
    </>,
  },
  {
    id: "approvals", title: "الموافقات وسير العمل", icon: ClipboardCheck,
    keywords: "موافقة اعتماد طلب إشعار مدير",
    body: <>
      <P>يمكن اشتراط موافقة مدير قبل ترحيل بعض العمليات الحساسة. تظهر الطلبات المعلّقة في صفحة «الموافقات» وتصل إشعارات فورية لأصحاب الصلاحية، ويمكن تخصيص أنواع الإشعارات التي تصلك من إعدادات الإشعارات.</P>
    </>,
  },
  {
    id: "ai", title: "المساعد الذكي", icon: Sparkles,
    keywords: "ذكاء اصطناعي مساعد مسودة اقتراح صوت",
    body: <>
      <P>المساعد الذكي يجيب عن أسئلتك حول أرقام شركتك («كم صافي ربح الشهر الماضي؟») ويقترح قيوداً ومستندات جاهزة.</P>
      <Li>• يمكنك الكتابة أو الإملاء صوتياً.</Li>
      <Li>• المقترحات لا تدخل القيود مباشرة — تظهر في صفحة «مسودات الذكاء الاصطناعي».</Li>
      <Li>• راجع المسودة واعتمدها بضغطة لتصبح قيداً حقيقياً، أو احذفها.</Li>
      <Tip>المساعد لا يغيّر دفاترك أبداً من تلقاء نفسه — كل شيء يمر بموافقتك.</Tip>
    </>,
  },
  {
    id: "shortcuts", title: "اختصارات لوحة المفاتيح", icon: Keyboard,
    keywords: "اختصار اختصارات مفاتيح كيبورد تخصيص",
    body: <>
      <P>البرنامج مليء بالاختصارات، والحرف مأخوذ من الاسم الإنجليزي للعملية: <K>Alt+S</K> فاتورة بيع (Sale)، <K>Alt+B</K> شراء (Buy)، <K>Alt+R</K> سند قبض (Receipt)، <K>Alt+V</K> سند دفع (Voucher)، <K>Alt+J</K> قيد (Journal).</P>
      <Li>• <K>Alt+Shift+حرف</K> يفتح الدليل (A حسابات، P مواد، C زبائن).</Li>
      <Li>• <K>Ctrl+Alt+حرف</K> يفتح الكشف، و<K>Ctrl+Alt+Shift+حرف</K> إضافة جديد.</Li>
      <Li>• تعمل الاختصارات بأي لغة لوحة مفاتيح، وتظهر بجانب عناصر القوائم.</Li>
      <H>اختصاراتك الحالية</H>
      <LiveShortcuts />
    </>,
  },
  {
    id: "backup", title: "النسخ الاحتياطي والاستعادة", icon: DatabaseBackup,
    keywords: "نسخة احتياطية استعادة تنزيل بيانات",
    body: <>
      <Steps items={[
        <>افتح إعدادات الشركة واختر «النسخ الاحتياطي».</>,
        <>نزّل نسخة كاملة من بياناتك في ملف واحد واحتفظ بها في مكان آمن.</>,
        <>للاستعادة: ارفع الملف من نفس الصفحة — تُستعاد البيانات كما كانت.</>,
      ]} />
      <Tip warn>خذ نسخة دورياً، وخاصة قبل إقفال سنة مالية أو إجراء تغييرات كبيرة — الاستعادة تستبدل البيانات الحالية.</Tip>
    </>,
  },
  {
    id: "faq", title: "أسئلة شائعة", icon: HelpCircle,
    keywords: "سؤال مشكلة خطأ نسيت كلمة مرور حذف تعديل",
    body: <>
      <H>عدّلت قيداً مرحّلاً بالخطأ، ماذا أفعل؟</H>
      <P>القيد المرحّل لا يُعدّل. أنشئ قيداً عكسياً (نفس السطور بتبديل المدين والدائن) ثم أدخل القيد الصحيح.</P>
      <H>لا أرى وحدة معينة في القوائم (مثل نقاط البيع)؟</H>
      <P>الوحدات تُفعّل من إعدادات الشركة. إن كنت كاشيراً فحسابك مقصور على شاشات البيع فقط — راجع مديرك.</P>
      <H>الاختصار لا يعمل؟</H>
      <P>تأكد أن الاختصارات مفعّلة من صفحة «اختصارات لوحة المفاتيح»، وأنك لا تكتب داخل حقل نصي، وأن الاختصار لا يتعارض مع اختصار آخر خصّصته.</P>
      <H>كيف أنقل بياناتي من برنامج آخر؟</H>
      <P>أدخل الأرصدة الافتتاحية من صفحة «الافتتاح والإقفال»، واستورد المواد والشركاء من ملفات Excel عبر زر الاستيراد في صفحاتهم.</P>
      <H>نسيت كلمة المرور؟</H>
      <P>من صفحة الدخول اختر «نسيت كلمة المرور» وستصلك رسالة إعادة تعيين على بريدك.</P>
    </>,
  },
];

function ManualPage() {
  const [open, setOpen] = useState<string | null>("start");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => s.title.includes(q) || (s.keywords ?? "").includes(q));
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="دليل المستخدم" subtitle="شرح عملي لكل أقسام البرنامج خطوة بخطوة" />
      <div className="relative mb-4">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim()) setOpen(null); }}
          placeholder="ابحث في الدليل… (مثلاً: فاتورة، جرد، سعر الصرف)"
          className="w-full rounded-lg border bg-card py-2.5 pe-3 ps-9 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      {filtered.length === 0 && (
        <p className="rounded-lg border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          لا نتائج لـ «{query}» — جرّب كلمة أخرى أو اسأل المساعد الذكي.
        </p>
      )}
      <div className="space-y-2">
        {filtered.map((s) => {
          const isOpen = query.trim() ? true : open === s.id;
          const Icon = s.icon;
          return (
            <div key={s.id} className="overflow-hidden rounded-lg border bg-card">
              <button
                onClick={() => setOpen(isOpen && !query.trim() ? null : s.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted/50"
              >
                <Icon className="size-5 shrink-0 text-primary" />
                <span className="flex-1 font-semibold">{s.title}</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && <div className="border-t px-4 py-3">{s.body}</div>}
            </div>
          );
        })}
      </div>
      <p className="mt-6 flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <BookOpen className="size-4 shrink-0" />
        لم تجد إجابتك؟ اسأل المساعد الذكي من أيقونته العائمة، أو راسلنا من صفحة «الدعم».
      </p>
    </div>
  );
}
