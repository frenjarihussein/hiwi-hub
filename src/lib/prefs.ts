import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import type { Me } from "@/lib/session";

export const NOTIF_KINDS = [
  { key: "announcement", label: "إعلانات مدير النظام" },
  { key: "invoice_created", label: "فواتير بيع وشراء جديدة" },
  { key: "document_posted", label: "ترحيل وإلغاء ترحيل المستندات" },
  { key: "entry_audited", label: "تدقيق القيود" },
  { key: "cheque_added", label: "شيكات جديدة" },
  { key: "low_stock", label: "نقص المخزون" },
  { key: "payroll_posted", label: "ترحيل الرواتب" },
] as const;

/** Default subscriptions by role, used until the user saves their own choice. */
export function defaultNotif(me: Me | null | undefined): Record<string, boolean> {
  const all = Object.fromEntries(NOTIF_KINDS.map((k) => [k.key, true]));
  if (!me || me.isTenantAdmin || me.isSuperAdmin) return all;
  const on = (keys: string[]) => Object.fromEntries(NOTIF_KINDS.map((k) => [k.key, keys.includes(k.key)]));
  if (me.isAuditor) return on(["announcement", "invoice_created", "document_posted", "entry_audited"]);
  if (me.accountKind === "warehouse_keeper") return on(["announcement", "low_stock"]);
  if (me.accountKind !== "standard") return on(["announcement", "low_stock"]);
  return on(["announcement", "invoice_created", "document_posted", "low_stock"]);
}

export type Prefs = { notif: Record<string, boolean>; dashboard: string[] | null };

export function usePrefs(me: Me | null | undefined) {
  return useQuery({
    queryKey: ["user_prefs", me?.userId],
    enabled: !!me,
    queryFn: async (): Promise<Prefs> => {
      const { data } = await db.from("user_prefs").select("notif,dashboard").eq("user_id", me!.userId).maybeSingle();
      return { notif: { ...defaultNotif(me), ...(data?.notif ?? {}) }, dashboard: data?.dashboard ?? null };
    },
  });
}

export function useSavePrefs(me: Me | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Prefs>) => {
      const { error } = await db.from("user_prefs").upsert({ user_id: me!.userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_prefs"] }),
  });
}

// ---- Extra per-user settings (charts, page usage, cashier shift) stored in user_prefs.extra ----
export type ChartType = "line" | "bar" | "area";
export type ChartPrefs = { keys: string[]; type: ChartType; days: 7 | 14 | 30 | 90 };
export type Extra = {
  offlineAutoSync?: boolean;
  appearance?: "classic" | "modern";
  navMode?: "windows" | "single" | "hybrid";
  charts?: ChartPrefs;
  usage?: Record<string, number>;
  mainCashAccount?: string;
  shiftStart?: string;
  shortcuts?: { enabled?: boolean; map?: Record<string, string> };
};
export const DEFAULT_CHARTS: ChartPrefs = { keys: ["revenue", "expense", "net"], type: "area", days: 14 };

export function useExtra(me: Me | null | undefined) {
  return useQuery({
    queryKey: ["user_prefs_extra", me?.userId],
    enabled: !!me,
    queryFn: async (): Promise<Extra> => {
      const { data } = await db.from("user_prefs").select("extra").eq("user_id", me!.userId).maybeSingle();
      return (data?.extra ?? {}) as Extra;
    },
  });
}

async function writeExtra(userId: string, extra: Extra) {
  const { error } = await db.from("user_prefs").upsert({ user_id: userId, extra, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export function useSaveExtra(me: Me | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Extra>) => {
      if (!me) throw new Error("سجّل الدخول أولاً");
      const key = ["user_prefs_extra", me?.userId];
      const next = { ...((qc.getQueryData(key) as Extra) ?? {}), ...patch };
      await writeExtra(me.userId, next);
      qc.setQueryData(key, next);
    },
  });
}

/** Counts each visit to a top-level page so the most-used pages can be offered as shortcuts. */
export function useTrackUsage(me: Me | null | undefined, pathname: string) {
  const qc = useQueryClient();
  const extra = useExtra(me);
  const ready = extra.isSuccess;
  useEffect(() => {
    if (!me || !ready) return;
    const root = "/" + (pathname.split("/")[1] ?? "");
    if (root === "/" || root === "/dashboard" || root === "/home") return;
    const key = ["user_prefs_extra", me.userId];
    const cur = (qc.getQueryData(key) as Extra) ?? {};
    const usage = { ...(cur.usage ?? {}), [root]: (cur.usage?.[root] ?? 0) + 1 };
    const next = { ...cur, usage };
    qc.setQueryData(key, next);
    void writeExtra(me.userId, next).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, me?.userId, ready]);
}

export function topUsed(extra: Extra | undefined, n = 5): string[] {
  return Object.entries(extra?.usage ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
