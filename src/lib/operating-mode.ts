import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { collectDeviceInfo, type DeviceInfo } from "@/lib/device";

export type OperatingMode = "single_device" | "multi_device";

export const OPERATING_MODES: { v: OperatingMode; l: string; d: string }[] = [
  { v: "single_device", l: "نمط الجهاز الواحد", d: "يعمل دون إنترنت دائماً على جهاز واحد. يمكن لأكثر من مستخدم الدخول عليه بالتناوب وليس بنفس الوقت، ويُرفع كل شيء للسحابة تلقائياً عند توفر الإنترنت." },
  { v: "multi_device", l: "نمط الأجهزة المتعددة", d: "عدة أجهزة ومستخدمين بنفس الوقت، ويحتاج إنترنت دائماً لمنع تضارب الأرقام والأرصدة." },
];

/** Stable per-browser device id, shared with POS local numbering. */
export function thisDeviceId(): string {
  const key = "pos_device_id";
  let d = localStorage.getItem(key);
  if (!d) { d = crypto.randomUUID(); localStorage.setItem(key, d); }
  return d;
}

export function useOperatingMode(tenantId?: string | null) {
  return useQuery({
    queryKey: ["operating-mode", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await db.from("tenant_settings").select("operating_mode, bound_device_id, bound_device_info, bound_device_at").eq("tenant_id", tenantId!).maybeSingle();
      const row = data as { operating_mode?: string; bound_device_id?: string | null; bound_device_info?: DeviceInfo | null; bound_device_at?: string | null } | null;
      const mode = (row?.operating_mode === "single_device" ? "single_device" : "multi_device") as OperatingMode;
      const boundDevice = row?.bound_device_id ?? null;
      if (row) {
        // Local flag lets the offline layer act without the network; only the bound device works locally.
        const local = mode === "single_device" && (!boundDevice || boundDevice === thisDeviceId());
        if (local) localStorage.setItem(`op-mode:${tenantId}`, "single_device");
        else localStorage.removeItem(`op-mode:${tenantId}`);
      }
      if (row && mode === "single_device" && boundDevice === thisDeviceId() && !row.bound_device_info) void saveBoundDeviceInfo();
      return { mode, boundDevice, boundInfo: row?.bound_device_info ?? null, boundAt: row?.bound_device_at ?? null };
    },
  });
}

export async function setOperatingMode(mode: OperatingMode) {
  const { error } = await db.rpc("set_operating_mode" as never, { _mode: mode, _device: thisDeviceId() } as never);
  if (error) throw error;
  if (mode === "single_device") await saveBoundDeviceInfo();
}

/** Stores this device's details on the company when it is the bound device. */
export async function saveBoundDeviceInfo() {
  await db.rpc("set_bound_device_info" as never, { _device: thisDeviceId(), _info: collectDeviceInfo() } as never);
}

export async function claimDevice(): Promise<boolean> {
  const { data, error } = await db.rpc("claim_operating_device" as never, { _device: thisDeviceId() } as never);
  if (error) return true; // network/offline: keep working locally
  if (data !== false) void saveBoundDeviceInfo();
  return data !== false;
}
