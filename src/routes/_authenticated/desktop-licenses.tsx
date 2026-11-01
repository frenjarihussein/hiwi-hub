import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, KeyRound, Monitor, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { issueDesktopLicense } from "@/lib/desktop-license.functions";
import { PLAN_LABEL } from "@/lib/desktop-license";

export const Route = createFileRoute("/_authenticated/desktop-licenses")({
  head: () => ({
    meta: [
      { title: "تراخيص نسخ الديسكتوب | يوسف سوفت" },
      { name: "description", content: "توليد مفاتيح تفعيل النسخ الأوفلاين ومتابعة أجهزة الديسكتوب." },
      { property: "og:title", content: "تراخيص نسخ الديسكتوب | يوسف سوفت" },
      { property: "og:description", content: "مولد التراخيص وأسطول الأجهزة الأوفلاين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DesktopLicenses,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
/* eslint-disable @typescript-eslint/no-explicit-any */
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString("ar") : "—");

function DesktopLicenses() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ device: "", customer: "", plan: "year", days: "", notes: "" });
  const [issued, setIssued] = useState("");
  const licenses = useQuery({ queryKey: ["desktop_licenses"], queryFn: async () => (await db.from("desktop_licenses").select("*").order("created_at", { ascending: false })).data ?? [] });
  const devices = useQuery({ queryKey: ["desktop_devices"], queryFn: async () => (await db.from("desktop_devices").select("*").order("last_seen", { ascending: false })).data ?? [] });

  const issue = useMutation({
    mutationFn: () => issueDesktopLicense({ data: { ...form, days: Number(form.days) || 0 } }),
    onSuccess: (r) => { setIssued(r.license_key); toast.success("تم توليد المفتاح"); void qc.invalidateQueries({ queryKey: ["desktop_licenses"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = async (id: string, revoked: boolean) => {
    const { error } = await db.from("desktop_licenses").update({ revoked }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(revoked ? "سيُوقف الجهاز عند اتصاله القادم" : "أعيد التفعيل"); void qc.invalidateQueries({ queryKey: ["desktop_licenses"] }); }
  };
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("تم النسخ"); };
  const online = (s: string) => Date.now() - new Date(s).getTime() < 7 * 3600_000;

  return (
    <div dir="rtl" className="space-y-4 p-4">
      <PageHeader title="تراخيص نسخ الديسكتوب" />
      <Tabs defaultValue="issue">
        <TabsList>
          <TabsTrigger value="issue"><KeyRound className="ml-1 h-4 w-4" />مولد التراخيص</TabsTrigger>
          <TabsTrigger value="list">التراخيص ({licenses.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="fleet"><Monitor className="ml-1 h-4 w-4" />أسطول الأجهزة ({devices.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="issue" className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
          <div><Label>رمز جهاز الزبون</Label><Input dir="ltr" placeholder="YS-XXXX-XXXX-XXXX-XXXX" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} /></div>
          <div><Label>اسم الزبون</Label><Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>المدة</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                {Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><Label>أيام مخصصة (اختياري)</Label><Input type="number" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} disabled={form.plan === "lifetime"} /></div>
          </div>
          <div><Label>ملاحظات</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <Button onClick={() => issue.mutate()} disabled={issue.isPending}>توليد مفتاح التفعيل</Button>
          {issued && (
            <div className="space-y-2">
              <Label>أرسل هذا المفتاح للزبون</Label>
              <Textarea dir="ltr" readOnly rows={4} className="font-mono text-xs" value={issued} />
              <Button variant="outline" size="sm" onClick={() => copy(issued)}><Copy className="ml-1 h-4 w-4" />نسخ</Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground"><tr><th className="p-2 text-right">الزبون</th><th className="p-2 text-right">الجهاز</th><th className="p-2">المدة</th><th className="p-2">ينتهي</th><th className="p-2">الحالة</th><th /></tr></thead>
            <tbody>
              {(licenses.data ?? []).map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.customer}</td>
                  <td className="p-2 font-mono text-xs" dir="ltr">{l.device_id}</td>
                  <td className="p-2 text-center">{PLAN_LABEL[l.plan] ?? l.plan}</td>
                  <td className="p-2 text-center">{l.expires_at ? new Date(l.expires_at).toLocaleDateString("ar") : "دائم"}</td>
                  <td className="p-2 text-center">{l.revoked ? <Badge variant="destructive">موقوف</Badge> : <Badge>فعّال</Badge>}</td>
                  <td className="space-x-1 p-2 text-left">
                    <Button size="sm" variant="ghost" onClick={() => copy(l.license_key)}><Copy className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(l.id, !l.revoked)}>{l.revoked ? "إعادة تفعيل" : "إيقاف"}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="fleet" className="overflow-x-auto rounded-lg border bg-card">
          <p className="p-3 text-sm text-muted-foreground"><WifiOff className="ml-1 inline h-4 w-4" />نسخ أوفلاين تُبلّغ عن نفسها عند اتصالها بالإنترنت.</p>
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground"><tr><th className="p-2 text-right">الجهاز</th><th className="p-2 text-right">الزبون</th><th className="p-2">الإصدار</th><th className="p-2">النظام</th><th className="p-2">أول ظهور</th><th className="p-2">آخر ظهور</th></tr></thead>
            <tbody>
              {(devices.data ?? []).map((d: any) => (
                <tr key={d.device_id} className="border-t">
                  <td className="p-2 font-mono text-xs" dir="ltr"><Badge variant="secondary" className="ml-2">أوفلاين</Badge>{d.device_id}</td>
                  <td className="p-2">{d.customer}</td>
                  <td className="p-2 text-center">{d.app_version}</td>
                  <td className="p-2 text-center">{d.platform}</td>
                  <td className="p-2 text-center">{fmt(d.first_seen)}</td>
                  <td className="p-2 text-center">{online(d.last_seen) ? <Badge>متصل مؤخراً</Badge> : fmt(d.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
