import { useQuery } from "@tanstack/react-query";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";

export const DEFAULT_UNITS = ["قطعة", "كغ", "غرام", "طن", "لتر", "متر", "متر مربع", "متر مكعب", "علبة", "كيس", "رزمة", "دزينة", "ساعة"];

export const DEFAULT_SERVICE_UNITS = ["خدمة", "ساعة", "يوم", "زيارة", "شهر", "سنة", "جلسة", "مشروع"];

export type UnitKind = "stock" | "service";
export type CustomUnit = { id: string; name: string; base_unit: string | null; factor: number; kind?: UnitKind };

export function useUnits(kind: UnitKind = "stock") {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["units", me?.tenantId, kind],
    enabled: !!me?.tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => ((await scope((db.from("units" as any) as any).select("id,name,base_unit,factor,kind"), me?.tenantId).eq("kind", kind).order("name")).data ?? []) as CustomUnit[],
  });
}

export function defaultUnits(kind: UnitKind = "stock") {
  return kind === "service" ? DEFAULT_SERVICE_UNITS : DEFAULT_UNITS;
}

export function unitOptions(custom: CustomUnit[] = [], kind: UnitKind = "stock") {
  const base = defaultUnits(kind);
  const opts = base.map((u) => ({ value: u, label: u }));
  custom.forEach((c) => {
    if (!base.includes(c.name))
      opts.push({ value: c.name, label: c.base_unit ? `${c.name} (${c.factor} ${c.base_unit})` : c.name });
  });
  return opts;
}
