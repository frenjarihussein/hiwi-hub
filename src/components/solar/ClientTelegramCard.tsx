import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";
import { appDatabase as supabase } from "@/lib/app-database-client";
import { createClientTelegramLink } from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";

/** Project-scoped client bot links: create, view who joined, stop or remove access. */
export function ClientTelegramCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createClientTelegramLink);
  const key = ["telegram-client-links", projectId];
  const links = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("telegram_client_links").select("id,display_name,chat_id,active,alerts_enabled,linked_at,created_at").eq("project_id", projectId).order("created_at", { ascending: false })).data || [],
  });
  async function make() {
    const password = window.prompt("اكتب كلمة سر لهذا الزبون (4 أحرف على الأقل). سيطلبها البوت منه عند الدخول:")?.trim();
    if (!password) return;
    try {
      const { url } = await create({ data: { projectId, password } });
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success("تم نسخ رابط بوت الزبون — أرسله له مع كلمة السر", { description: url, duration: 15000 });
      void qc.invalidateQueries({ queryKey: key });
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر إنشاء الرابط"); }
  }
  async function patch(id: string, v: { active?: boolean; alerts_enabled?: boolean }) {
    const { error } = await supabase.from("telegram_client_links").update(v).eq("id", id);
    if (error) toast.error(error.message); else void qc.invalidateQueries({ queryKey: key });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("telegram_client_links").delete().eq("id", id);
    if (error) toast.error(error.message); else void qc.invalidateQueries({ queryKey: key });
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">بوت الزبون (تلغرام)</h4>
        <Button size="sm" variant="outline" onClick={() => void make()}><Send className="size-4" />رابط جديد للزبون</Button>
      </div>
      <p className="text-xs text-muted-foreground">الزبون يرى منظومته فقط: الحالة، الإنتاج، الإنذارات، ويسأل الذكاء الاصطناعي.</p>
      {(links.data || []).map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1">{l.chat_id ? `👤 ${l.display_name || "زبون"}` : "⏳ لم يُستخدم بعد"}</span>
          {l.chat_id && <Button size="sm" variant="ghost" onClick={() => void patch(l.id, { alerts_enabled: !l.alerts_enabled })}>{l.alerts_enabled ? "إيقاف التنبيهات" : "تفعيل التنبيهات"}</Button>}
          <Button size="sm" variant="ghost" onClick={() => void patch(l.id, { active: !l.active })}>{l.active ? "إيقاف" : "تفعيل"}</Button>
          <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => void remove(l.id)}><Trash2 className="size-4" /></Button>
        </div>
      ))}
    </div>
  );
}
