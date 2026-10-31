import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { appDatabase as supabase } from "@/lib/app-database-client";
import { createTelegramLink, unlinkTelegram } from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";

export function TelegramLinkCard() {
  const qc = useQueryClient();
  const create = useServerFn(createTelegramLink);
  const unlink = useServerFn(unlinkTelegram);
  const { data } = useQuery({
    queryKey: ["telegram-link"],
    queryFn: async () => (await supabase.from("telegram_links").select("chat_id, linked_at").maybeSingle()).data,
  });
  const linked = Boolean(data?.chat_id);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-sm">
        <Send className="h-4 w-4 text-primary" />
        <span>بوت تلغرام: {linked ? "مرتبط ✅ — أرسل /status أو /today أو /alarms" : "غير مرتبط"}</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={async () => {
          try { const r = await create(); window.open(r.url, "_blank"); toast.success("اضغط Start في تلغرام لإتمام الربط"); setTimeout(() => qc.invalidateQueries({ queryKey: ["telegram-link"] }), 15000); }
          catch { toast.error("تعذر إنشاء رابط الربط"); }
        }}>{linked ? "إعادة الربط" : "ربط تلغرام"}</Button>
        {linked && <Button size="sm" variant="outline" onClick={async () => { await unlink(); qc.invalidateQueries({ queryKey: ["telegram-link"] }); }}>إلغاء الربط</Button>}
      </div>
    </div>
  );
}
