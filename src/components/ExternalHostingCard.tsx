import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Eye, EyeOff, Plug } from "lucide-react";

const URL_ = import.meta.env.VITE_SUPABASE_URL ?? "";
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const PID = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";

const VARS = [
  { name: "VITE_SUPABASE_URL", value: URL_, from: "Supabase ← Project Settings ← API ← Project URL", secret: false },
  { name: "VITE_SUPABASE_PUBLISHABLE_KEY", value: KEY, from: "Supabase ← Project Settings ← API Keys ← Publishable / anon key", secret: true },
  { name: "VITE_SUPABASE_PROJECT_ID", value: PID, from: "Supabase ← Project Settings ← General ← Project ID", secret: false },
  { name: "SUPABASE_URL", value: URL_, from: "نفس قيمة Project URL", secret: false },
  { name: "SUPABASE_PUBLISHABLE_KEY", value: KEY, from: "نفس قيمة Publishable / anon key", secret: true },
];

const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast.success("تم النسخ"));

export function ExternalHostingCard() {
  const [show, setShow] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const envText = VARS.map((v) => `${v.name}=${v.value}`).join("\n");

  async function test() {
    const u = url.trim().replace(/\/+$/, ""); const k = key.trim();
    if (!/^https:\/\//.test(u) || !k) { toast.error("أدخل الرابط والمفتاح"); return; }
    setState("busy"); setMsg("");
    try {
      const h = await fetch(`${u}/auth/v1/health`, { headers: { apikey: k } });
      if (!h.ok) throw new Error(`خدمة الدخول لا تستجيب (${h.status}) — تأكد من المفتاح`);
      const r = await fetch(`${u}/rest/v1/tenants?select=id&limit=1`, { headers: { apikey: k } });
      if (r.status === 404 || r.status === 400) { setState("err"); setMsg("الاتصال ناجح لكن الجداول غير موجودة — شغّل ملف هيكل قاعدة البيانات في SQL Editor أولاً"); return; }
      if (!r.ok && r.status !== 401) throw new Error(`خطأ في قاعدة البيانات (${r.status})`);
      setState("ok"); setMsg("متصل وجاهز — الصق هذه القيم في Cloudflare");
    } catch (e: any) { setState("err"); setMsg(e?.message ?? "تعذر الاتصال"); }
  }

  return (
    <div className="mb-8 max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">الاستضافة والربط الخارجي</h2>
        <p className="text-sm text-muted-foreground">انسخ متغيرات الربط وضعها في Cloudflare Pages، وافحص أي قاعدة بيانات Supabase خارجية قبل اعتمادها.</p>
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">1) متغيرات الربط الحالية</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {show ? "إخفاء" : "إظهار"}</Button>
            <Button size="sm" onClick={() => copy(envText)}><Copy className="h-4 w-4" /> نسخ الكل (صيغة .env)</Button>
          </div>
        </div>
        {VARS.map((v) => (
          <div key={v.name} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0 space-y-1">
              <div className="font-mono text-sm font-semibold" dir="ltr">{v.name}</div>
              <div className="truncate font-mono text-xs text-muted-foreground" dir="ltr">{v.secret && !show ? "•".repeat(24) : v.value || "—"}</div>
              <div className="text-xs">📋 من أين تنسخه: <bdi dir="ltr">{v.from}</bdi></div>
              <div className="text-xs">📌 أين تلصقه: Cloudflare ← مشروعك ← Settings ← Variables and Secrets ← Add</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(v.name)}>نسخ الاسم</Button>
              <Button size="sm" variant="outline" onClick={() => copy(v.value)}>نسخ القيمة</Button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h3 className="font-semibold">2) فحص Supabase خارجي</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Project URL</Label><Input dir="ltr" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /><p className="text-xs text-muted-foreground">من: Project Settings ← API ← Project URL</p></div>
          <div className="space-y-1"><Label>Publishable / anon key</Label><Input dir="ltr" placeholder="sb_publishable_... أو eyJ..." value={key} onChange={(e) => setKey(e.target.value)} /><p className="text-xs text-muted-foreground">من: Project Settings ← API Keys (المفتاح العام فقط، لا تضع secret أبداً)</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={test} disabled={state === "busy"}><Plug className="h-4 w-4" /> {state === "busy" ? "جارٍ الفحص…" : "فحص الاتصال"}</Button>
          {url && key && <Button variant="outline" onClick={() => copy([`VITE_SUPABASE_URL=${url.trim()}`, `VITE_SUPABASE_PUBLISHABLE_KEY=${key.trim()}`, `SUPABASE_URL=${url.trim()}`, `SUPABASE_PUBLISHABLE_KEY=${key.trim()}`].join("\n"))}><Copy className="h-4 w-4" /> نسخ متغيرات هذا الخادم</Button>}
          {msg && <span className={state === "ok" ? "text-sm font-medium text-primary" : "text-sm font-medium text-destructive"}>{state === "ok" ? "🟢 " : "🔴 "}{msg}</span>}
        </div>
        <p className="text-xs text-muted-foreground">لتشغيل الموقع على هذا الخادم: الصق متغيراته في Cloudflare ثم اضغط Retry deployment — لا حاجة لتعديل أي ملف.</p>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5 text-sm leading-7">
        <h3 className="font-semibold">3) الخطوات بالتفصيل</h3>
        <ol className="list-decimal space-y-2 pr-5">
          <li><b>GitHub:</b> أنشئ حساباً على github.com ← في لافابول افتح Settings ← Git ← Connect to GitHub ← أنشئ مستودعاً خاصاً (Private).</li>
          <li><b>Supabase:</b> أنشئ حساباً على supabase.com ← New Project ← اختر اسماً وكلمة مرور قوية ومنطقة Frankfurt ← انتظر جاهزية المشروع.</li>
          <li><b>هيكل قاعدة البيانات:</b> في Supabase افتح SQL Editor ← الصق ملف الهيكل (Schema) ← Run.</li>
          <li><b>البيانات:</b> بعد إنشاء حساب المدير على الموقع الجديد، استرجع كل شركة من ملف النسخة الاحتياطية (JSON) من تبويب «النسخ الاحتياطي».</li>
          <li><b>الدخول بالإيميل:</b> في Supabase ← Authentication ← Sign In / Providers ← فعّل Email. ثم Authentication ← URL Configuration ← ضع رابط موقعك في Site URL و Redirect URLs.</li>
          <li><b>Cloudflare:</b> أنشئ حساباً على dash.cloudflare.com ← Workers & Pages ← Create ← Import a repository ← اختر مستودع GitHub.</li>
          <li><b>البناء:</b> Build command: <bdi dir="ltr">npm run build</bdi> — ثم أضف المتغيرات من القسم 1 (أو قيم Supabase الخارجي من القسم 2) ← Deploy.</li>
          <li><b>الدومين:</b> في Cloudflare ← مشروعك ← Custom domains ← أضف دومينك، وستُفعّل شهادة SSL تلقائياً.</li>
          <li><b>البوت والسنغرو:</b> بعد النقل افتح مركز المحطات ← إعدادات الربط واحفظ رموز البوت وبيانات Sungrow من جديد ليُسجَّل البوت على الرابط الجديد.</li>
        </ol>
        <p className="text-xs text-muted-foreground">ملاحظة: ميزات الذكاء الاصطناعي ومهام التحديث الدوري تحتاج مفاتيحها الخاصة على الخادم الجديد (تُضاف كمتغيرات سرية في Cloudflare).</p>
      </section>
    </div>
  );
}
