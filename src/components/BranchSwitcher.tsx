import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, GitBranch } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";

export type Branch = { id: string; code: string; name: string; address: string | null; phone: string | null; is_active: boolean };

export function useBranches(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["branches", tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      ((await db.from("branches").select("*").eq("tenant_id", tenantId).order("code")).data ?? []) as Branch[],
  });
}

/** Header selector: all-branch users pick the branch they work in; branch users see their fixed branch. */
export function BranchSwitcher() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const branches = useBranches(me?.hasBranches ? me.tenantId : null);
  if (!me?.hasBranches || !branches.data?.length) return null;
  const list = branches.data;

  if (me.branchId) {
    const b = list.find((x) => x.id === me.branchId);
    return (
      <span className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground">
        <GitBranch className="size-3.5" />
        <span className="max-w-32 truncate">{b?.name ?? "فرع"}</span>
      </span>
    );
  }

  async function pick(v: string) {
    const { error } = await db.rpc("set_active_branch", { _b: v || null });
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries();
    toast.success(v ? "تم اختيار الفرع" : "عرض كل الفروع");
  }

  return (
    <label className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs" title="الفرع الحالي">
      <GitBranch className="size-3.5 text-muted-foreground" />
      <select
        className="max-w-36 bg-transparent text-xs outline-none"
        value={me.activeBranchId ?? ""}
        onChange={(e) => pick(e.target.value)}
      >
        <option value="">كل الفروع</option>
        {list.filter((b) => b.is_active).map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}

type DataFile = { id: string; name: string; fiscal_label: string | null; is_current: boolean };

/** Shows the current company data file and lets the user jump to other files they belong to. */
export function DataFileSwitcher() {
  const { data: me } = useMe();
  const files = useQuery({
    queryKey: ["data_files", me?.userId],
    enabled: !!me,
    queryFn: async () => ((await db.rpc("my_data_files")).data ?? []) as DataFile[],
  });
  const list = files.data ?? [];
  const label = (f: DataFile) => (f.fiscal_label ? `${f.name} — ${f.fiscal_label}` : f.name);

  if (list.length < 2) {
    return (
      <span className="hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
        <Building2 className="size-3.5" /><span className="max-w-40 truncate">{me?.tenantName}</span>
      </span>
    );
  }

  async function pick(id: string) {
    const { error } = await db.rpc("switch_tenant", { _t: id });
    if (error) { toast.error(error.message); return; }
    window.location.assign("/home");
  }

  return (
    <label className="hidden items-center gap-1 rounded-lg border px-2 py-1 text-xs lg:flex" title="ملف البيانات">
      <Building2 className="size-3.5 text-muted-foreground" />
      <select
        className="max-w-48 bg-transparent text-xs outline-none"
        value={list.find((f) => f.is_current)?.id ?? ""}
        onChange={(e) => pick(e.target.value)}
      >
        {list.map((f) => (
          <option key={f.id} value={f.id}>{label(f)}</option>
        ))}
      </select>
    </label>
  );
}
