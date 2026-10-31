import { useEffect, useState, useSyncExternalStore } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { getServerWork, getWork, installRequestProgress, subscribeWork, workPercent } from "@/lib/work-progress";
import { Progress } from "@/components/ui/progress";

export function GlobalWorkProgress() {
  const tasks = useSyncExternalStore(subscribeWork, getWork, getServerWork);
  const mutations = useIsMutating();
  const fetching = useIsFetching({ predicate: (query) => query.state.data === undefined });
  const busy = tasks.length > 0 || mutations > 0 || fetching > 0;
  const [visible, setVisible] = useState(false);
  useEffect(() => installRequestProgress(), []);
  useEffect(() => {
    if (!busy) { setVisible(false); return; }
    const timer = window.setTimeout(() => setVisible(true), 600);
    return () => window.clearTimeout(timer);
  }, [busy]);
  const task = [...tasks].reverse().find((item) => item.label !== "جاري العمل") ?? tasks[0];
  const percent = task ? workPercent(task) : undefined;
  if (!visible || !busy) return null;
  return (
    <div className="global-work-progress fixed bottom-5 start-1/2 z-[1000] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border bg-popover p-4 text-popover-foreground shadow-pop" dir="rtl">
      <div role="status" aria-live="polite" className="mb-3 flex min-w-0 items-center gap-3">
        <LoaderCircle className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">جاري العمل…</div>
          {task && task.label !== "جاري العمل" && <div className="break-words text-xs text-muted-foreground">{task.label}</div>}
        </div>
        {percent !== undefined && <span className="num shrink-0 text-sm">{percent}%</span>}
      </div>
      <Progress value={percent ?? null} aria-label="تقدم العملية" />
    </div>
  );
}