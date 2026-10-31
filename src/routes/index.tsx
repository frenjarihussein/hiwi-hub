// ============= Full file contents =============
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  BadgeCheck,
  BookOpen,
  Building2,
  Check,
  FileText,
  Handshake,
  HardHat,
  Landmark,
  Lock,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Receipt,
  ShieldCheck,
  Sparkles,
  Warehouse,
} from "lucide-react";
import logoAsset from "@/assets/yousef-soft-logo.png.asset.json";
import markAsset from "@/assets/yousef-soft-mark.png.asset.json";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "يوسف سوفت — نظام المحاسبة وإدارة الشركات | حلب، سوريا" },
      {
        name: "description",
        content:
          "اكتشف مميزات يوسف سوفت: المحاسبة والعملات، المبيعات والمشتريات، المخزون والتسعير، نقاط البيع، الرواتب، المشاريع، التصنيع، الفنادق، التقارير والمساعد الذكي.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "يوسف سوفت — نظام المحاسبة وإدارة الشركات" },
      {
        property: "og:description",
        content:
          "المحاسبة والمخزون والعملات ونقاط البيع والرواتب والمشاريع والتصنيع والفنادق والتعاون والمساعد الذكي في برنامج واحد. تعرّف إلى المميزات حسب كل قسم.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const WHATSAPP = "https://wa.me/963945068369";
const WHATSAPP_TRIAL = `https://wa.me/963945068369?text=${encodeURIComponent(
  "اريد تجربة برنامج يوسف سوف للمحاسبة",
)}`;
const PHONE_TEL = "tel:+963945068369";
const PHONE_DISPLAY = "0945 068 369";

const features = [
  { icon: Building2, title: "شركات وملفات بيانات متعددة", desc: "أكثر من شركة وسنة مالية، مع عزل كامل للبيانات ونسخ البيانات الأساسية بين الملفات." },
  { icon: BookOpen, title: "محاسبة دقيقة", desc: "شجرة حسابات مرنة، قيود متوازنة إجبارياً، حسابات ختامية، مراكز كلفة وتدفق نقدي." },
  { icon: Landmark, title: "العملات وفروق الصرف", desc: "نشرة أسعار، حسابات أرباح وخسائر لكل عملة، إعادة تقييم الحسابات النقدية وسجل تغيّر الأسعار." },
  { icon: Receipt, title: "نقاط البيع والشراء", desc: "شاشات سريعة بالباركود، بيع وشراء ومرتجعات، ورديات وصندوق خاص لكل بائع وطباعة حرارية." },
  { icon: Warehouse, title: "المخازن والمواد", desc: "مستودعات وتصنيفات ووحدات وباركود، دفعات وصلاحية، جرد ونقل وتقييم مخزون بالمتوسط المرجّح أو آخر شراء." },
  { icon: FileText, title: "فواتير ومستندات", desc: "بيع وشراء ومرتجعات وعروض أسعار، حسميات وإضافات على الفاتورة والسطر، وترحيل تلقائي للقيود." },
  { icon: Handshake, title: "الزبائن والموردون", desc: "شجرة تصنيفات، كشوف حساب، شيكات، وروابط مشاركة آمنة للشركاء." },
  { icon: HardHat, title: "المشاريع والتعهدات", desc: "بطاقة مشروع، جدول كميات، نسبة إنجاز ومصاريف مقابل الموازنة." },
  { icon: Building2, title: "الفروع والصلاحيات", desc: "فروع مستقلة، صلاحيات تفصيلية لكل شاشة ومستخدم، وسجل تدقيق لكل عملية." },
  { icon: BadgeCheck, title: "الموظفون والرواتب", desc: "بطاقات موظفين وتفاصيلهم، إدارة الرواتب وربطها بالحسابات والمستحقات." },
  { icon: Landmark, title: "الخزينة والشيكات", desc: "قبض وصرف وتحويلات وتسويات عملات، متابعة الشيكات وحالاتها ومواعيد استحقاقها." },
  { icon: Receipt, title: "التسعير والكلفة", desc: "أسعار بيع مسمّاة، تسعير ثابت أو بنسبة على الكلفة أو الشراء، وإعادة تسعير جماعية مع التقريب." },
  { icon: Building2, title: "الأصول الثابتة", desc: "بطاقات الأصول، متابعة قيمتها واهتلاكها وربطها بالحسابات المحاسبية." },
  { icon: HardHat, title: "التصنيع والإنتاج", desc: "أوامر تصنيع ومكونات إنتاج، متابعة المواد الداخلة والمنتجات الناتجة وكلفة التصنيع." },
  { icon: Building2, title: "الفنادق والحجوزات", desc: "إدارة الغرف وأسعار الليالي وحالات الغرف، الحجوزات والإقامة والدخول والمغادرة." },
  { icon: BookOpen, title: "الوصفات والمكونات", desc: "تعريف وصفات الأطباق وربط كل وصفة بموادها وكمياتها لمتابعة كلفة المكونات." },
  { icon: Sparkles, title: "مساعد ذكي", desc: "اسأل عن حساباتك بالعربية، ويقترح المساعد قيوداً تعتمدها أنت قبل الحفظ." },
  { icon: MessageCircle, title: "تواصل وتعاون", desc: "محادثة داخلية، مهام وملاحظات وتذكيرات، وإشعارات فورية للفريق." },
  { icon: FileText, title: "تقارير مالية فورية", desc: "ميزان مراجعة، ميزانية، أرباح وخسائر، تقييم مخزون وكشوف لأي فترة." },
  { icon: Printer, title: "طباعة بهوية شركتك", desc: "فواتير ومستندات PDF بشعار شركتك، وعلامة مائية على كل الشاشات." },
  { icon: ShieldCheck, title: "أمان وسحابة", desc: "بياناتك محمية على مستوى قاعدة البيانات، وتعمل من أي جهاز بأي مكان." },
  { icon: Lock, title: "واجهة عربية وإنجليزية", desc: "بحث عام ونوافذ متعددة واختصارات وأدوات سريعة، مع إعدادات مصنّفة وتفضيلات خاصة بكل مستخدم." },
  { icon: ShieldCheck, title: "البيانات والنسخ الاحتياطي", desc: "استيراد وتصدير البيانات، نسخ احتياطي واستعادة، وملفات شركات وسنوات مالية منفصلة." },
];

const featureGroups = [
  { title: "المحاسبة والحسابات", items: [
    "شجرة حسابات متعددة المستويات، حسابات تجميعية وتفصيلية وحسابات ختامية.",
    "تحديد عملة الحساب، وطبيعته النقدية أو غير النقدية، وتصنيف التدفق النقدي.",
    "قيود يومية ومسودات وترحيل، ومراكز كلفة وقيود دورية.",
    "أرصدة افتتاحية وإقفال، وأستاذ حساب مع أرصدة حسب العملة والفترة.",
    "ربط المستند بالقيد الناتج عنه والتنقل بينهما، مع حماية القيود الناتجة عن المستندات من التعديل المباشر.",
  ] },
  { title: "العملات وأسعار الصرف", items: [
    "اختيار عملة الشركة عند الإعداد الأول، وتعريف عملات إضافية ونشرة أسعار مؤرخة.",
    "عملة مستقلة للحساب والزبون والمورد، وعرض المبالغ الأصلية ومعادلها بعملة الشركة.",
    "حساب أرباح وحساب خسائر صرف لكل عملة، وتحديد الحسابات المشمولة بإعادة التقييم.",
    "معاينة فروق إعادة تقييم الحسابات النقدية ثم ترحيل قيدها بقرار المستخدم.",
    "سجل لتعديلات الأسعار وإعادة التقييم، مع الحسابات المتأثرة ورابط القيد المولّد.",
    "خيار اعتماد سعر المستند في النشرة، ومنع حذف العملة المستخدمة مع إمكانية إيقافها.",
  ] },
  { title: "الفواتير والمبيعات والمشتريات", items: [
    "فواتير بيع وشراء ومرتجعات وعروض أسعار، وترقيم المستندات وحفظها كمسودات قبل الترحيل.",
    "ربط الفواتير بالمستودع والجهة والعملات، وتوليد الحركات المخزنية والقيود عند الترحيل.",
    "حسميات وإضافات بمبلغ أو نسبة على الفاتورة وعلى كل سطر.",
    "توزيع الإضافات والحسميات بلا حساب على كلفة المواد حسب قيمة كل مادة؛ والمربوطة بحساب تُرحّل إليه.",
    "اقتراح سعر الشراء من آخر شراء أو بطاقة المادة، واختيار سعر البيع المناسب للزبون.",
    "إدخال معادلات في الكمية والسعر، وتقليب المستندات والطباعة بهوية الشركة.",
  ] },
  { title: "نقاط البيع والشراء والورديات", items: [
    "شاشة نقطة بيع وشاشة نقطة شراء، مع مسح الباركود وإضافة المواد والمرتجعات.",
    "فتح وإغلاق الورديات ومتابعة تسليم النقد، وصندوق مستقل لكل مستخدم نقطة بيع.",
    "حسابات كاشير بقوائم خاصة وصلاحيات مناسبة للعمل اليومي.",
    "الدفع بعملة مختلفة في نقطة البيع وطباعة الإيصالات الحرارية.",
  ] },
  { title: "المواد والمستودعات والجرد", items: [
    "شجرة تصنيفات ومواد، وحدات وباركود وربط المواد بالمستودعات.",
    "إدخال وإخراج ونقل مخزني، وتتبع الدفعات وتواريخ الصلاحية وحد إعادة الطلب.",
    "جرد فعلي وتسوية فروق الكميات، ومتابعة الأرصدة لكل مستودع.",
    "أستاذ مواد ومستودعات يعرض الوحدة والكمية وسعر الحركة وقيمتها.",
    "الكلفة الوسطية بعد كل حركة ورصيد المادة بالكلفة، وتقييم المخزون بالمتوسط المرجّح أو آخر سعر شراء.",
    "تقرير قيمة المخزون بالكلفة والمبيع، ومعاينة وترحيل قيد تسوية تقييم آخر شراء.",
  ] },
  { title: "الأسعار وإعادة التسعير", items: [
    "سعر شراء اختياري وأسعار بيع متعددة بتسميات تختارها الشركة.",
    "سعر ثابت أو كلفة / سعر شراء مضافاً إليه نسبة، مع خيار التحديث التلقائي.",
    "تحديث سعر الشراء عند ترحيل المشتريات وربط كلفة المواد بالحسميات والإضافات الموزعة.",
    "تحديد مستوى السعر الافتراضي للزبون، وإعادة تسعير جماعية بالزيادة أو التخفيض.",
    "تقريب الأسعار وتعديلها يدوياً قبل حفظ نتائج إعادة التسعير.",
  ] },
  { title: "الزبائن والموردون والخزينة", items: [
    "بطاقات زبائن وموردين ضمن تصنيفات، مع ربط الحساب المحاسبي والعملة ومستوى السعر.",
    "كشوف حساب تفصيلية حسب الفترة والعملة، وروابط مشاركة آمنة للكشوف وإرسالها عبر واتساب.",
    "سندات قبض وصرف وتحويلات بين الحسابات وتسويات عملات.",
    "إدارة الشيكات الواردة والصادرة وحالاتها، وتقارير وتنبيهات الاستحقاقات.",
  ] },
  { title: "التقارير والأصول والموارد البشرية", items: [
    "ميزان مراجعة وميزانية وأرباح وخسائر وتدفق نقدي وحسابات ختامية.",
    "تقارير وأساتذة الحسابات والجهات والمواد والمستودعات، مع فلاتر للفترة والعملة.",
    "تقارير قيمة المخزون والاستحقاقات، وطباعة وتصدير النتائج.",
    "بطاقات الأصول الثابتة ومتابعة الاهتلاك والقيمة المحاسبية.",
    "ملفات موظفين وتفاصيل الموظف وإدارة الرواتب وربطها بالحسابات.",
  ] },
  { title: "المشاريع والتصنيع والقطاعات المتخصصة", items: [
    "تصنيفات وبطاقات مشاريع وتعهدات، قيمة العقود وجدول الكميات ونسب الإنجاز.",
    "متابعة مصاريف المشروع وموازنته وربطه بالحسابات ومراكز الكلفة.",
    "أوامر تصنيع ومكونات إنتاج وكميات المواد المستخدمة والمنتجات الناتجة.",
    "وصفات أطباق ومكوناتها وكمياتها لمتابعة كلفة المواد.",
    "بطاقات غرف وأسعار ليالٍ وحالات الغرف، وحجوزات وإقامة ودخول ومغادرة.",
  ] },
  { title: "الشركات والفروع والصلاحيات", items: [
    "إدارة شركات وملفات بيانات متعددة والتنقل بينها، ونسخ البيانات الأساسية المختارة لملف جديد.",
    "فروع واختيار الفرع النشط، مع تقييد ظهور البيانات حسب فرع المستخدم وصلاحياته.",
    "سنوات مالية وإعداد أول للشركة وهويتها وشعارها ونشاطها.",
    "إدارة المستخدمين والصلاحيات التفصيلية حسب الشاشات وميزات الشركة.",
    "سجل تدقيق لمتابعة العمليات، وطلبات موافقة ومراجعة المستندات.",
  ] },
  { title: "المساعد الذكي والتواصل", items: [
    "مساعد للمحادثة والاستفسار عن بيانات الشركة وتحليلها ضمن صلاحيات المستخدم.",
    "اقتراح مسودات قيود ومستندات؛ يعتمدها المستخدم قبل إنشاء السجل الفعلي.",
    "محادثة داخلية خاصة وغرفة للشركة، وملاحظات مرتبطة بالسجلات.",
    "مهام وطلبات للزملاء وردود وحالات وتذكيرات.",
    "إشعارات مرتبطة بالسجلات، مع اختيار أنواع الإشعارات لكل مستخدم.",
  ] },
  { title: "البيانات وأدوات العمل", items: [
    "استيراد وتصدير البيانات ونسخ احتياطي واستعادة، مع حماية الوصول لبيانات الشركة.",
    "واجهة عربية وإنجليزية، وبحث عام للوصول إلى السجلات.",
    "فتح نوافذ متعددة والتنقل والرجوع بينها، وحاسبة وأدوات سريعة.",
    "إعدادات ضمن تبويبات للشركة والحسابات والعملات والمواد والفروع والبيانات.",
    "طباعة الفواتير والمستندات بشعار الشركة وعلامتها المائية، ومرفقات وملاحظات للسجلات.",
    "دليل استخدام ودعم داخل البرنامج، ورسائل خطأ تقود إلى مكان معالجة السبب.",
  ] },
];

const steps = [
  { n: "١", title: "تواصل معنا", desc: "اتصل أو راسلنا على واتساب لتفعيل حسابك." },
  { n: "٢", title: "تجربة مجانية 30 يوماً", desc: "جرّب النظام كاملاً بدون أي دفع مسبق." },
  { n: "٣", title: "إعداد وترحيل بياناتك", desc: "نساعدك في إدخال حساباتك وموادك والبدء بثقة." },
];

function Landing() {
  const navigate = useNavigate();
  // Opening the program goes straight to the workspace when already signed in,
  // otherwise to sign-in; the info page stays reachable with ?about.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("about")) return;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      navigate({ to: data.session?.user ? "/home" : "/auth", replace: true });
    })();
  }, [navigate]);
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2 font-bold">
            <img src={markAsset.url} alt="شعار يوسف سوفت" className="size-10 object-contain" />
            <span>يوسف سوفت</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">المميزات</a>
            <a href="#included" className="transition-colors hover:text-foreground">المميزات بالتفصيل</a>
            <a href="#trial" className="transition-colors hover:text-foreground">التجربة المجانية</a>
            <a href="#contact" className="transition-colors hover:text-foreground">تواصل معنا</a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="/auth"
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              تسجيل الدخول
            </a>
            <a
              href={WHATSAPP_TRIAL}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
            >
              جرّب مجاناً
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-highlight/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-16 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-highlight">
                <Sparkles className="size-4" />
                تجربة مجانية كاملة لمدة 30 يوماً
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.2] md:text-5xl">
                يوسف سوفت
                <span className="mt-2 block text-2xl font-bold text-highlight md:text-3xl">للمحاسبة وإدارة الشركات</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                حسابات وعملات ومبيعات ومشتريات، مخزون وتسعير ونقاط بيع، رواتب وأصول
                ومشاريع وتصنيع وحجوزات — وحدات مترابطة مع تقارير مالية ومساعد ذكي وتواصل للفريق.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={WHATSAPP_TRIAL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-pop transition-colors hover:bg-primary/90"
                >
                  ابدأ تجربتك المجانية
                  <MessageCircle className="size-4" />
                </a>
                <a
                  href={WHATSAPP}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 font-semibold transition-colors hover:bg-accent"
                >
                  <MessageCircle className="size-4 text-success" />
                  تواصل معنا عبر واتساب
                </a>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <BadgeCheck className="size-4 text-success" />
                بالتعاون مع مكتب يوسف فرنجاري للمحاسبة والتدقيق
              </p>
            </div>

            {/* Mock panel */}
            <div className="relative" aria-hidden>
              <img src={logoAsset.url} alt="" className="mx-auto mb-6 w-56 object-contain md:w-72" />
              <div className="hidden lg:block">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-pop">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-sm font-semibold">لوحة التحكم</span>
                  <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success-foreground">
                    مبيعات اليوم
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted p-4">
                    <p className="text-xs text-muted-foreground">الإيرادات</p>
                    <p className="mt-1 text-2xl font-bold text-highlight">$ 24,800</p>
                  </div>
                  <div className="rounded-xl bg-muted p-4">
                    <p className="text-xs text-muted-foreground">صافي التدفق</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">$ 9,150</p>
                  </div>
                </div>
                <div className="mt-3 flex h-32 items-end gap-2 rounded-xl bg-muted p-4">
                  {[35, 55, 40, 70, 50, 85, 65].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-md bg-highlight"
                      style={{ height: `${h}%`, opacity: 0.35 + i * 0.1 }}
                    />
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {["قيد يومية رقم ١٠٤٢ — متوازن", "فاتورة بيع رقم ٣٢٧ — مرحّلة", "إغلاق وردة الكاشير — تم"].map((r) => (
                    <div key={r} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                      <Check className="size-3.5 text-success" />
                      {r}
                    </div>
                  ))}
              </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-card/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-extrabold">مميزات البرنامج</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            من إدارة الحسابات والمواد إلى متابعة الفريق والقطاعات المتخصصة، تعرّف إلى أقسام يوسف سوفت.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-pop"
              >
                <span className="flex size-11 items-center justify-center rounded-lg bg-highlight/10 text-highlight transition-colors group-hover:bg-highlight group-hover:text-highlight-foreground">
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's included */}
      <section id="included" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-extrabold">مميزات البرنامج بالتفصيل</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
            جميع الأقسام في مكان واحد، مرتّبة حسب عملك. يختلف ظهور الأقسام داخل حسابك حسب الميزات المفعّلة للشركة وصلاحيات المستخدم.
          </p>
          <nav aria-label="أقسام مميزات البرنامج" className="mt-6 grid gap-x-6 gap-y-3 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-3">
            {featureGroups.map((group, index) => (
              <a key={group.title} href={`#feature-group-${index}`} className="text-sm font-medium text-highlight underline-offset-4 hover:underline">
                {group.title}
              </a>
            ))}
          </nav>
          <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
            {featureGroups.map((group, index) => (
              <section key={group.title} id={`feature-group-${index}`} className="min-w-0 scroll-mt-24 border-t border-border pt-5">
                <h3 className="text-xl font-bold">{group.title}</h3>
                <ul className="mt-5 space-y-3">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                      <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="mt-14 border-t border-border pt-8">
              <h3 className="font-bold text-highlight">كيف تبدأ؟</h3>
              <ol className="mt-6 grid gap-6 md:grid-cols-3">
                {steps.map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                      {s.n}
                    </span>
                    <div>
                      <p className="font-semibold">{s.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 rounded-xl bg-highlight/10 p-4 text-sm">
                <span className="font-bold text-highlight">30 يوماً مجاناً</span> — بدون بطاقة وبدون
                أي التزام. جرّب كل الوحدات كاملة.
              </div>
          </div>
        </div>
      </section>

      {/* Trial CTA band */}
      <section id="trial" className="px-6 pb-20">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-pop">
          <h2 className="text-3xl font-extrabold">جرّب النظام مجاناً لمدة 30 يوماً</h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">
            إذا أعجبك البرنامج وترددت في البدء، تواصل معنا على الرقم أو الواتساب وسنفعّل لك تجربة
            مجانية كاملة لمدة 30 يوماً بدون أي مقدم.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-card px-6 py-3 font-semibold text-foreground transition-opacity hover:opacity-90"
            >
              <MessageCircle className="size-4 text-success" />
              راسلنا على واتساب
            </a>
            <a
              href={PHONE_TEL}
              className="inline-flex items-center gap-2 rounded-lg border border-primary-foreground/30 px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              <Phone className="size-4" />
              اتصل الآن
            </a>
          </div>
        </div>
      </section>

      {/* Partnership */}
      <section className="border-t border-border bg-card/50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-card p-8 text-center shadow-soft md:flex-row md:text-start">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-highlight/10 text-highlight">
              <Handshake className="size-7" />
            </span>
            <div>
              <h2 className="text-xl font-bold">بالتعاون مع مكتب يوسف فرنجاري للمحاسبة والتدقيق</h2>
              <p className="mt-2 text-muted-foreground">
                دقة محاسبية معتمدة على أيدي مختصين: النظام مبني بالشراكة مع مكتب محاسبة وتدقيق،
                فتكون قيودك وتقاريرك مطابقة للمعايير المحاسبية وجاهزة لأي مراجعة.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-extrabold">تواصل معنا</h2>
          <p className="mt-3 text-muted-foreground">نحن في خدمتك للإجابة على أسئلتك وتفعيل تجربتك المجانية.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <a
              href={PHONE_TEL}
              className="group rounded-xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-pop"
            >
              <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-highlight/10 text-highlight">
                <Phone className="size-6" />
              </span>
              <h3 className="mt-4 font-bold">اتصل بنا</h3>
              <p className="mt-2 text-lg font-semibold text-highlight" dir="ltr">{PHONE_DISPLAY}</p>
            </a>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-pop"
            >
              <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-success/15 text-success-foreground">
                <MessageCircle className="size-6" />
              </span>
              <h3 className="mt-4 font-bold">واتساب</h3>
              <p className="mt-2 text-lg font-semibold text-highlight" dir="ltr">{PHONE_DISPLAY}</p>
            </a>
            <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
              <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-highlight/10 text-highlight">
                <MapPin className="size-6" />
              </span>
              <h3 className="mt-4 font-bold">عنواننا</h3>
              <p className="mt-2 text-muted-foreground">حلب سوريا — حلب الجديدة، مقابل جامع زين العابدين</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck className="size-4" />
            يوسف سوفت
          </div>
          <p>تحت تطوير شركة يوسف للبرمجيات 2026</p>
          <div className="flex items-center gap-4">
            <a href={PHONE_TEL} className="transition-colors hover:text-foreground" dir="ltr">
              {PHONE_DISPLAY}
            </a>
            <Lock className="size-3.5" aria-label="آمن ومشفّر" />
          </div>
        </div>
      </footer>
    </div>
  );
}
