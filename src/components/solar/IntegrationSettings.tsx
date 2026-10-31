import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PlugZap, Save, Trash2 } from "lucide-react";
import { getIntegrationSettings, saveSungrowSettings, testSungrowSettings, saveTelegramToken } from "@/lib/solar-fleet.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientTelegramCard } from "./ClientTelegramCard";

/** Company-level Sungrow keys and (platform owner) bot token; secrets are write-only. */
export function IntegrationSettings() {
  const qc = useQueryClient();
  const get = useServerFn(getIntegrationSettings), save = useServerFn(saveSungrowSettings), test = useServerFn(testSungrowSettings), saveBot = useServerFn(saveTelegramToken);
  const q = useQuery({ queryKey: ["integration-settings"], queryFn: () => get() });
  const [f, setF] = useState({ appkey: "", secret: "", user: "", pass: "", base: "" });
  const [bot, setBot] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF((o) => ({ ...o, appkey: q.data.sungrow.appkey, user: q.data.sungrow.user, base: q.data.sungrow.base })); }, [q.data]);
  const s = q.data?.sungrow;
  async function act(fn: () => Promise<void>) { setBusy(true); try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر التنفيذ"); } finally { setBusy(false); } }
  const field = (k: keyof typeof f, label: string, type = "text", ph = "") => (
    <label className="space-y-1 text-sm"><span>{label}</span><Input type={type} autoComplete="off" value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <div className="max-w-3xl space-y-6">
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">ربط سن غرو (iSolarCloud) لهذه الشركة</h3>
        <div className="rounded-md bg-muted p-3 text-xs space-y-1">
          <div>الحالة الحالية: <b>{s?.own ? "مربوط بحساب سن غرو الخاص بالشركة" : "غير مربوط — يُستخدم حساب المنصة الافتراضي"}</b></div>
          {s?.appkey && <div>App Key: {s.appkey}</div>}
          {s?.user && <div>المستخدم: {s.user}</div>}
          <div>الخادم: {s?.base || "https://gateway.isolarcloud.com.hk"}</div>
          <div>Secret: {s?.hasSecret ? "محفوظ 🔒" : "غير محفوظ"} · كلمة المرور: {s?.hasPass ? "محفوظة 🔒" : "غير محفوظة"}</div>
        </div>
        <p className="text-xs text-muted-foreground">تُستخدم هذه المفاتيح لاستيراد المحطات والمراقبة والمزامنة. إن تُركت فارغة يُستخدم الحساب الافتراضي للمنصة.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("appkey", "App Key")}
          {field("secret", "Secret Key (x-access-key)", "password", s?.hasSecret ? "محفوظ — اتركه فارغاً للإبقاء عليه" : "")}
          {field("user", "اسم المستخدم / البريد")}
          {field("pass", "كلمة المرور", "password", s?.hasPass ? "محفوظة — اتركها فارغة للإبقاء عليها" : "")}
          {field("base", "عنوان الخادم (اختياري)", "url", "https://gateway.isolarcloud.com.hk")}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void act(async () => { await save({ data: { ...f, secret: f.secret || undefined, pass: f.pass || undefined } }); setF({ ...f, secret: "", pass: "" }); toast.success("تم حفظ إعدادات سن غرو"); void qc.invalidateQueries({ queryKey: ["integration-settings"] }); })}><Save className="size-4" />حفظ</Button>
          <Button variant="outline" disabled={busy} onClick={() => void act(async () => { const r = await test(); if (r.ok) toast.success(`الاتصال ناجح (${r.own ? "مفاتيح الشركة" : "حساب المنصة"}) — ${r.stations} محطة`); else toast.error(`فشل الاتصال: ${r.message}`); })}><PlugZap className="size-4" />فحص الاتصال</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void act(async () => { if (!window.confirm("حذف مفاتيح سن غرو الخاصة بالشركة؟")) return; await save({ data: { appkey: "", user: "", base: "", clear: true } }); setF({ appkey: "", secret: "", user: "", pass: "", base: "" }); void qc.invalidateQueries({ queryKey: ["integration-settings"] }); })}><Trash2 className="size-4" />مسح</Button>
        </div>
      </section>
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">بوت التلغرام</h3>
        {q.data && (<>
          <div className="rounded-md bg-muted p-3 text-xs">الحالة الحالية: <b>{q.data.telegram.hasToken ? `بوت الشركة الخاص @${q.data.telegram.username}` : `يُستخدم بوت المنصة @${q.data.telegram.platformUsername}`}</b></div>
          <p className="text-xs text-muted-foreground">ضع رمز بوت شركتك من BotFather ليصبح للشركة بوت مستقل لفريق العمل والزبائن. عند الحفظ يُفحص الرمز ويُسجَّل البوت تلقائياً.</p>
          <div className="flex gap-2"><Input type="password" autoComplete="off" placeholder="123456789:AA..." value={bot} onChange={(e) => setBot(e.target.value)} />
            <Button disabled={busy || !bot} onClick={() => void act(async () => { const r = await saveBot({ data: { token: bot, origin: window.location.origin } }); setBot(""); toast.success(`تم ربط البوت @${r.username}`); void qc.invalidateQueries(); })}><Save className="size-4" />حفظ وربط</Button>
            {q.data.telegram.hasToken && <Button variant="ghost" disabled={busy} onClick={() => void act(async () => { if (!window.confirm("فصل بوت الشركة والعودة لبوت المنصة؟")) return; await saveBot({ data: { token: "", origin: window.location.origin } }); void qc.invalidateQueries(); })}><Trash2 className="size-4" />فصل</Button>}
          </div>
        </>)}
      </section>
    </div>
  );
}

/** Pick any linked project and issue a password-protected client link scoped to that project only. */
export function ClientPortal({ projects }: { projects: { id: string; name: string }[] }) {
  const [pid, setPid] = useState("");
  const [search, setSearch] = useState("");
  const list = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-sm text-muted-foreground">اختر المحطة، ثم أنشئ رابطاً بكلمة سر وأرسله للزبون. الزبون يرى مشروعه فقط ولا يصل لأي مشروع آخر.</p>
      <Input placeholder="بحث عن محطة / مشروع" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select aria-label="المحطة" className="w-full rounded-md border bg-background p-2 text-sm" value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">— اختر المحطة —</option>
        {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {pid && <ClientTelegramCard key={pid} projectId={pid} />}
    </div>
  );
}
