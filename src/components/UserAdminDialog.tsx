import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getUserAdmin, setUserPerm, setUserNavMode, impersonateUser, setUserAccountKind } from "@/lib/user-admin.functions";
import { describeAudit } from "@/lib/audit-describe";
import { MODULE_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCog, LogIn } from "lucide-react";

const FIELDS = [["can_view", "عرض"], ["can_create", "إضافة"], ["can_edit", "تعديل"], ["can_delete", "حذف"]] as const;
const KINDS = [["standard", "مستخدم عام (كل القوائم حسب الصلاحيات)"], ["projects_only", "مستخدم مشاريع فقط"], ["sales_cashier", "كاشير بيع"], ["purchase_cashier", "كاشير شراء"], ["warehouse_keeper", "أمين مستودع"]] as const;
const NAV = [["single", "صفحة واحدة"], ["windows", "نوافذ"], ["hybrid", "هجين"]] as const;

/** System-owner panel per user: activity log, permissions, page-opening mode and sign-in as the user. */
export function UserAdminDialog({ user, canImpersonate }: { user: { id: string; full_name?: string | null; email?: string | null }; canImpersonate: boolean }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const getFn = useServerFn(getUserAdmin);
  const permFn = useServerFn(setUserPerm);
  const navFn = useServerFn(setUserNavMode);
  const loginFn = useServerFn(impersonateUser);
  const kindFn = useServerFn(setUserAccountKind);
  const key = ["user-admin", user.id];
  const q = useQuery({ queryKey: key, enabled: open, queryFn: () => getFn({ data: { userId: user.id } }) });
  const val = (m: string, f: string) => !!q.data?.perms.find((p) => p.module === m)?.[f];

  async function loginAs() {
    if (!confirm(`الدخول إلى حساب ${user.full_name || user.email}؟ ستخرج من حسابك الحالي، وكلمة سر المستخدم لن تتغير. للعودة سجّل الدخول بحسابك مجدداً.`)) return;
    try {
      const r = await loginFn({ data: { userId: user.id } });
      const { error } = await supabase.auth.verifyOtp({ token_hash: r.tokenHash, type: "magiclink" });
      if (error) throw error;
      toast.success(`أنت الآن داخل حساب ${r.email}`);
      window.location.assign("/home");
    } catch (e) { toast.error((e as Error).message); }
  }

  return <>
    <Button variant="outline" size="sm" title="إدارة المستخدم" onClick={() => setOpen(true)}><UserCog className="size-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إدارة {user.full_name || user.email}</DialogTitle>
          <DialogDescription dir="ltr" className="text-right">{user.email}</DialogDescription>
        </DialogHeader>
        {canImpersonate && <Button variant="secondary" onClick={loginAs}><LogIn className="size-4" />الدخول إلى حسابه برابط مؤقت</Button>}
        <Tabs defaultValue="log">
          <TabsList><TabsTrigger value="log">سجل الحركات</TabsTrigger><TabsTrigger value="perms">الصلاحيات</TabsTrigger><TabsTrigger value="nav">نظام الفتح</TabsTrigger><TabsTrigger value="kind">نوع الحساب</TabsTrigger></TabsList>
          <TabsContent value="log">
            {q.isLoading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : !q.data?.log.length ? <p className="text-sm text-muted-foreground">لا توجد حركات مسجلة</p> :
              <ul className="divide-y text-sm">{q.data.log.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{describeAudit(r)}</span><span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("ar")}</span></li>)}</ul>}
          </TabsContent>
          <TabsContent value="perms">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-right">الواجهة</th>{FIELDS.map(([, l]) => <th key={l} className="p-2">{l}</th>)}</tr></thead>
              <tbody>{Object.entries(MODULE_LABEL).map(([m, label]) => <tr key={m} className="border-t"><td className="p-2">{label}</td>{FIELDS.map(([f]) => <td key={f} className="p-2 text-center">
                <Switch checked={val(m, f)} disabled={!q.data} onCheckedChange={(v) => permFn({ data: { userId: user.id, module: m, field: f, value: v } }).then(() => qc.invalidateQueries({ queryKey: key }), (e: Error) => toast.error(e.message))} />
              </td>)}</tr>)}</tbody></table></div>
          </TabsContent>
          <TabsContent value="nav">
            <div className="flex flex-wrap gap-2">{NAV.map(([v, l]) => <Button key={v} variant={q.data?.navMode === v ? "default" : "outline"} disabled={!q.data} onClick={() => navFn({ data: { userId: user.id, mode: v } }).then(() => { toast.success("تم الحفظ؛ يطبّق عند فتح المستخدم للبرنامج"); void qc.invalidateQueries({ queryKey: key }); }, (e: Error) => toast.error(e.message))}>{l}</Button>)}</div>
          </TabsContent>
          <TabsContent value="kind">
            <p className="mb-2 text-sm text-muted-foreground">يحدد الواجهة التي يراها المستخدم. مستخدم المشاريع لا يرى أي شيء من المحاسبة.</p>
            <div className="flex flex-col gap-2">{KINDS.map(([v, l]) => <Button key={v} className="justify-start" variant={q.data?.accountKind === v ? "default" : "outline"} disabled={!q.data} onClick={() => kindFn({ data: { userId: user.id, kind: v } }).then(() => { toast.success("تم تغيير نوع الحساب؛ يطبّق عند فتح المستخدم للبرنامج"); void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries(); }, (e: Error) => toast.error(e.message))}>{l}</Button>)}</div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  </>;
}
