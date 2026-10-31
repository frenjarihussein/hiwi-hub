import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Checkbox } from "@/components/ui/checkbox";
import { PATTERN_DOC_TYPES, type DocPattern } from "@/lib/doc-patterns";

/**
 * Per-user pattern access from the users screen. Primary patterns follow the user's document permissions above;
 * secondary patterns are granted here (writes doc_patterns.allowed_user_ids, the same list the pattern screen edits).
 */
export function UserPatternAccess({ userId, tenantId, editable }: { userId: string; tenantId: string; editable: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["doc_patterns", tenantId],
    queryFn: async () => ((await db.from("doc_patterns").select("*").order("doc_type").order("name")).data ?? []) as DocPattern[],
  });
  const toggle = useMutation({
    mutationFn: async ({ p, on }: { p: DocPattern; on: boolean }) => {
      const cur = p.allowed_user_ids ?? [];
      const next = on ? [...new Set([...cur, userId])] : cur.filter((x) => x !== userId);
      const { error } = await db.from("doc_patterns").update({ allowed_user_ids: next }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc_patterns"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const settings = useQuery({
    queryKey: ["primary_pattern_denied", tenantId],
    queryFn: async () => (((await db.from("tenant_settings").select("primary_pattern_denied").eq("tenant_id", tenantId).maybeSingle()).data as { primary_pattern_denied?: Record<string, string[]> } | null)?.primary_pattern_denied ?? {}),
  });
  const togglePrimary = useMutation({
    mutationFn: async ({ t, on }: { t: string; on: boolean }) => {
      const cur = { ...(settings.data ?? {}) };
      const mine = new Set(cur[userId] ?? []);
      if (on) mine.delete(t); else mine.add(t);
      cur[userId] = [...mine];
      const { error } = await db.from("tenant_settings").update({ primary_pattern_denied: cur }).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["primary_pattern_denied"] }); qc.invalidateQueries({ queryKey: ["doc_refs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const denied = settings.data?.[userId] ?? [];
  const pats = list.data ?? [];
  return (
    <div className="mt-3 rounded border p-3 text-sm">
      <div className="font-semibold">الأنماط التي يراها المستخدم</div>
      <div className="mt-2 mb-1 text-xs font-semibold">الأنماط الرئيسية</div>
      <p className="mb-2 text-xs text-muted-foreground">أزل الصح ليُمنع المستخدم من المستند العام ويستخدم فقط الأنماط الثانوية المخصصة له (ويبقى شرط صلاحية نوع المستند أعلاه).</p>
      <div className="mb-3 grid gap-1 sm:grid-cols-3">
        {PATTERN_DOC_TYPES.map(([t, l]) => (
          <label key={t} className="flex items-center gap-2">
            <Checkbox checked={!denied.includes(t)} disabled={!editable || togglePrimary.isPending} onCheckedChange={(v) => togglePrimary.mutate({ t, on: !!v })} />
            <span>{l}</span>
          </label>
        ))}
      </div>
      <div className="mb-1 text-xs font-semibold">الأنماط الثانوية</div>
      <p className="mb-2 text-xs text-muted-foreground">النمط الثانوي غير المخصص لأحد متاح لكل من يملك صلاحية نوعه؛ عند تحديد مستخدمين يصبح محصوراً بهم.</p>
      {pats.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد أنماط ثانوية.</p> : (
        <div className="grid gap-1 sm:grid-cols-2">
          {pats.map((p) => {
            const list = p.allowed_user_ids ?? [];
            const on = list.includes(userId);
            return (
              <label key={p.id} className="flex items-center gap-2">
                <Checkbox checked={on} disabled={!editable || toggle.isPending} onCheckedChange={(v) => toggle.mutate({ p, on: !!v })} />
                <span>{p.name} <span className="text-xs text-muted-foreground">({PATTERN_DOC_TYPES.find(([v]) => v === p.doc_type)?.[1]}{list.length === 0 ? " · متاح للجميع" : ""})</span></span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
