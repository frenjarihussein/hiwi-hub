/** Browser-safe Sungrow helpers: plant kind, fault code explanations and one date/time format. */

export type PlantKind = "ess" | "ongrid";
/** Sungrow ps_type 5 = Residential ESS (home battery); every other type is a grid-tied PV plant. */
export function plantKindFromType(psType: unknown, typeName?: unknown): PlantKind {
  return Number(psType) === 5 || /ess/i.test(String(typeName ?? "")) ? "ess" : "ongrid";
}
export function plantKindLabel(kind: unknown): string {
  return kind === "ess" ? "🔋 نظام بطاريات منزلي" : kind === "ongrid" ? "⚡ نظام أون جريد" : "";
}

/** Single date/time format for site and bot: 2026/10/31 11:36 (Damascus time). */
export function fmtSolarTime(v: unknown): string {
  if (!v) return "—";
  const s = String(v);
  // Sungrow device_time 20261031113500
  const d = /^\d{14}$/.test(s)
    ? new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}+03:00`)
    : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Damascus", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p["year"]}/${p["month"]}/${p["day"]} ${p["hour"] === "24" ? "00" : p["hour"]}:${p["minute"]}`;
}

type FaultInfo = { name: string; explain: string; advice: string };
/** Common Sungrow inverter fault codes (per Sungrow user manuals). */
const CODES: Record<string, FaultInfo> = {
  "2": { name: "Grid Overvoltage", explain: "جهد الشبكة أعلى من قيمة حماية الجهد المضبوطة.", advice: "عادةً يعود الإنفرتر للاتصال بالشبكة تلقائياً بعد عودتها لوضعها الطبيعي. إذا تكرر العطل:\n1. قِس جهد الشبكة الفعلي، وإذا كان أعلى من القيمة المضبوطة تواصل مع شركة الكهرباء المحلية.\n2. تحقق من ضبط قيم الحماية بشكل صحيح عبر التطبيق أو الشاشة.\n3. تأكد أن مقطع كابل AC مناسب وأن الكابل مثبت بإحكام.\n4. إذا لم يكن العطل بسبب ما سبق واستمر، تواصل مع خدمة سن غرو." },
  "3": { name: "Grid Transient Overvoltage", explain: "جهد الشبكة تجاوز لحظياً قيمة الحماية.", advice: "عادةً يعود الإنفرتر للعمل تلقائياً. إذا تكرر العطل:\n1. قِس جهد الشبكة الفعلي وراجع شركة الكهرباء إن كان مرتفعاً.\n2. تحقق من قيم الحماية عبر التطبيق أو الشاشة.\n3. إذا استمر العطل، تواصل مع خدمة سن غرو." },
  "4": { name: "Grid Undervoltage", explain: "جهد الشبكة أقل من قيمة حماية الجهد المضبوطة.", advice: "عادةً يعود الإنفرتر للاتصال بالشبكة تلقائياً بعد عودتها لوضعها الطبيعي. إذا تكرر العطل:\n1. قِس جهد الشبكة الفعلي، وإذا كان أقل من القيمة المضبوطة تواصل مع شركة الكهرباء المحلية لإيجاد حل.\n2. تحقق من ضبط قيم الحماية بشكل صحيح عبر التطبيق أو الشاشة.\n3. تأكد أن كابل AC مثبت بإحكام.\n4. إذا لم يكن العطل بسبب ما سبق واستمر، تواصل مع خدمة سن غرو." },
  "5": { name: "Grid Undervoltage", explain: "جهد الشبكة أقل بكثير من قيمة الحماية المضبوطة.", advice: "عادةً يعود الإنفرتر للعمل تلقائياً بعد عودة الشبكة. إذا تكرر العطل:\n1. قِس جهد الشبكة الفعلي وراجع شركة الكهرباء.\n2. تحقق من قيم الحماية عبر التطبيق أو الشاشة.\n3. تأكد من إحكام كابل AC والقاطع.\n4. إذا استمر العطل، تواصل مع خدمة سن غرو." },
  "7": { name: "AC Overcurrent", explain: "تيار خرج AC أعلى من الحد.", advice: "أعد تشغيل الإنفرتر؛ إن تكرر تواصل مع الدعم الفني." },
  "8": { name: "Grid Overfrequency", explain: "تردد الشبكة أعلى من المسموح.", advice: "انتظر عودة الشبكة لوضعها الطبيعي؛ إن تكرر راجع إعدادات بلد الشبكة." },
  "9": { name: "Grid Underfrequency", explain: "تردد الشبكة أقل من المسموح.", advice: "تحقق من استقرار الشبكة أو المولدة؛ راجع إعدادات التردد." },
  "10": { name: "Grid Power Outage", explain: "انقطاع كهرباء الشبكة (حماية الجزيرة).", advice: "تأكد من وجود الكهرباء ومن قاطع AC؛ يعود العمل تلقائياً بعد رجوع الشبكة." },
  "11": { name: "Device Fault", explain: "عطل داخلي في الجهاز.", advice: "افصل وأعد تشغيل الإنفرتر؛ إن استمر تواصل مع دعم سن غرو." },
  "12": { name: "Excessive Leakage Current", explain: "تيار تسريب مرتفع.", advice: "افحص عزل كوابل الألواح والتأريض، خاصة بعد المطر أو الرطوبة." },
  "13": { name: "Grid Abnormal", explain: "خلل في الشبكة.", advice: "تحقق من الشبكة وتوصيلات AC." },
  "14": { name: "10-minute Grid Overvoltage", explain: "متوسط جهد الشبكة لعشر دقائق مرتفع.", advice: "افحص مقطع كابل AC وطوله، وراجع جهد الشبكة." },
  "15": { name: "Grid Overvoltage", explain: "جهد الشبكة مرتفع.", advice: "قِس الجهد وراجع شركة الكهرباء." },
  "16": { name: "Output Overload", explain: "حمل زائد على الخرج.", advice: "خفّف الأحمال وتحقق من مطابقة الاستطاعة." },
  "17": { name: "Grid Voltage Unbalance", explain: "عدم توازن في جهود الأطوار.", advice: "افحص الأطوار الثلاثة وتوزيع الأحمال." },
  "19": { name: "Device Abnormal (Bus Overvoltage)", explain: "ارتفاع جهد الباص الداخلي.", advice: "أعد التشغيل؛ تحقق أن جهد الألواح ضمن المواصفات." },
  "28": { name: "PV Reverse Connection", explain: "توصيل قطبية سلسلة ألواح معكوس.", advice: "افصل DC وصحّح قطبية السلسلة بواسطة فني." },
  "29": { name: "PV Reverse Connection", explain: "توصيل قطبية معكوس.", advice: "افحص قطبية السلاسل." },
  "36": { name: "Module Temperature Too High", explain: "حرارة الإنفرتر مرتفعة.", advice: "تأكد من التهوية ونظافة المراوح وعدم تعرضه لشمس مباشرة." },
  "37": { name: "Ambient Temperature Too High", explain: "حرارة المحيط مرتفعة.", advice: "حسّن التهوية حول الإنفرتر." },
  "38": { name: "Relay Fault", explain: "عطل في مرحلات الشبكة.", advice: "أعد التشغيل؛ إن تكرر تواصل مع الدعم." },
  "39": { name: "Low System Insulation Resistance", explain: "انخفاض مقاومة العزل في جهة الألواح.", advice: "افحص كوابل DC والوصلات MC4 والتأريض بحثاً عن تلف أو رطوبة." },
  "43": { name: "Ambient Temperature Too Low", explain: "حرارة المحيط منخفضة.", advice: "يعود العمل عند ارتفاع الحرارة." },
  "47": { name: "PV Input Configuration Abnormal", explain: "خطأ في إعداد مداخل الألواح.", advice: "راجع توزيع السلاسل على MPPT وإعداد وضع الإدخال." },
  "48": { name: "Phase Current Sampling Fault", explain: "خلل في قياس التيار.", advice: "أعد التشغيل؛ إن استمر تواصل مع الدعم." },
  "70": { name: "Fan Alarm", explain: "عطل أو انسداد في المروحة.", advice: "نظّف المروحة وتحقق من عملها." },
  "106": { name: "Grounding Cable Fault", explain: "خلل في التأريض.", advice: "افحص كابل التأريض وإحكامه." },
  "88": { name: "Electric Arc Fault", explain: "اكتشاف قوس كهربائي في DC.", advice: "افصل DC فوراً وافحص الوصلات بواسطة فني." },
  "514": { name: "Meter Communication Abnormal", explain: "انقطاع الاتصال مع العداد.", advice: "افحص كابل RS485 للعداد وإعداداته." },
  "832": { name: "Battery Overvoltage", explain: "جهد البطارية مرتفع.", advice: "راجع إعدادات البطارية وحالة BMS." },
  "833": { name: "Battery Undervoltage", explain: "جهد البطارية منخفض.", advice: "اشحن البطارية وتحقق من إعداد حد التفريغ." },
  "834": { name: "Battery Overtemperature", explain: "حرارة البطارية مرتفعة.", advice: "حسّن تهوية البطارية." },
  "835": { name: "Battery Undertemperature", explain: "حرارة البطارية منخفضة.", advice: "يعود الشحن عند ارتفاع الحرارة." },
  "714": { name: "BMS Communication Abnormal", explain: "انقطاع الاتصال مع نظام إدارة البطارية.", advice: "افحص كابل الاتصال CAN/RS485 بين الإنفرتر والبطارية." },
};
const STATUS: Record<string, FaultInfo> = {
  "DEV-OFFLINE": { name: "Device Offline", explain: "الجهاز لا يرسل بيانات إلى iSolarCloud.", advice: "تحقق من الكهرباء ومن الإنترنت/الواي فاي لوحدة الاتصال (WiNet)." },
  "DEV-1": { name: "Fault", explain: "سن غرو يبلّغ عن عطل في الجهاز.", advice: "افتح iSolarCloud لمعرفة رمز العطل التفصيلي؛ أعد التشغيل إن كان آمناً." },
  "DEV-2": { name: "Alarm", explain: "سن غرو يبلّغ عن تنبيه في الجهاز.", advice: "راقب الجهاز وتحقق من رمز التنبيه في iSolarCloud." },
  "1": { name: "Fault", explain: "المحطة في حالة عطل.", advice: "افتح تفاصيل الأجهزة لمعرفة الجهاز المتعطل." },
  "2": { name: "Alarm", explain: "المحطة في حالة تنبيه.", advice: "راجع الأجهزة للتأكد." },
};

/** Returns code, Sungrow name, explanation and suggestion; unknown codes keep the provider text. */
export function describeFault(code: unknown, text?: unknown) {
  const c = String(code ?? "").trim();
  const num = c.replace(/^0+(?=\d)/, "");
  const info = STATUS[c] ?? CODES[num] ?? null;
  return { code: c || "—", name: info?.name ?? "", explain: info?.explain ?? String(text ?? ""), advice: info?.advice ?? "راجع تفاصيل العطل في iSolarCloud ودليل الجهاز، واستعن بفني مؤهل.", text: String(text ?? "") };
}

/** One-line Telegram text for an alarm. */
export function faultLine(a: { code?: unknown; text?: unknown; at?: unknown }, esc: (s: string) => string) {
  const f = describeFault(a.code, a.text);
  return `• <b>رمز العطل:</b> ${esc(f.code)}${f.name ? ` (${esc(f.name)})` : ""}\n  ${esc(f.text)}\n  <b>الشرح:</b> ${esc(f.explain)}\n  <b>الاقتراح:</b> ${esc(f.advice)}${a.at ? `\n  <b>الوقت:</b> ${fmtSolarTime(a.at)}` : ""}`;
}
