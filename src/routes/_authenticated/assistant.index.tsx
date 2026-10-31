import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { db } from "@/lib/db";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_authenticated/assistant/")({
  head: () => pageHead("المساعد المالي الذكي", "اسأل عن أداء شركتك وتقاريرها المالية ومواعيد استحقاق الشيكات."),
  component: AssistantIndex,
});

function AssistantIndex() {
  const navigate = useNavigate();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const latest = (await db.from("ai_threads").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle()).data;
      const id = latest?.id ?? (await db.from("ai_threads").insert({}).select("id").single()).data?.id;
      if (id) navigate({ to: "/assistant/$threadId", params: { threadId: id }, replace: true });
    })();
  }, [navigate]);
  return <p className="text-muted-foreground">جارٍ فتح المساعد...</p>;
}
