import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBranches, type Branch } from "@/components/BranchSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export function BranchesCard({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const branches = useBranches(tenantId);
  const [nb, setNb] = useState({ code: "", name: "", address: "" });
  const [busy, setBusy] = useState(false);

  async function toggle(on: boolean) {
    setBusy(true);
    const { error } = await db.rpc("enable_branches", { _on: on });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(on ? "تم تفعيل الفروع ونُسبت البيانات السابقة للفرع الرئيسي" : "تم إيقاف الفروع");
    qc.invalidateQueries();
  }

  async function add() {
    if (!nb.name.trim()) return;
    const code = nb.code.trim() || String((branches.data?.length ?? 0) + 1).padStart(2, "0");
    const { error } = await db.from("branches").insert({ tenant_id: tenantId, code, name: nb.name.trim(), address: nb.address.trim() || null });
    if (error) { toast.error(error.message); return; }
    setNb({ code: "", name: "", address: "" });
    qc.invalidateQueries({ queryKey: ["branches"] });
  }

  async function update(b: Branch, patch: Partial<Branch>) {
    const { error } = await db.from("branches").update(patch).eq("id", b.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["branches"] });
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="mb-1 font-bold">الفروع</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        عند التفعيل تتبع كل فاتورة وقيد ومستودع وصندوق فرعاً. محاسب الفرع يرى فرعه فقط، ومدير الشركة والمحاسب العام يختاران الفرع من أعلى الشاشة أو يعرضان كل الفروع.
      </p>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <Checkbox checked={!!me?.hasBranches} disabled={!isAdmin || busy} onCheckedChange={(v) => toggle(!!v)} />
        الشركة لها فروع
      </label>
      {me?.hasBranches && (
        <div className="space-y-2">
          {(branches.data ?? []).map((b) => (
            <div key={b.id} className="grid grid-cols-[5rem_1fr_1fr_auto] items-center gap-2">
              <Input defaultValue={b.code} disabled={!isAdmin} onBlur={(e) => e.target.value !== b.code && update(b, { code: e.target.value })} />
              <Input defaultValue={b.name} disabled={!isAdmin} onBlur={(e) => e.target.value !== b.name && update(b, { name: e.target.value })} />
              <Input defaultValue={b.address ?? ""} placeholder="العنوان" disabled={!isAdmin} onBlur={(e) => e.target.value !== (b.address ?? "") && update(b, { address: e.target.value || null })} />
              <label className="flex items-center gap-1 text-xs">
                <Checkbox checked={b.is_active} disabled={!isAdmin} onCheckedChange={(v) => update(b, { is_active: !!v })} />
                فعال
              </label>
            </div>
          ))}
          {isAdmin && (
            <div className="grid grid-cols-[5rem_1fr_1fr_auto] items-center gap-2 border-t pt-3">
              <Input placeholder="الرمز" value={nb.code} onChange={(e) => setNb({ ...nb, code: e.target.value })} />
              <Input placeholder="اسم الفرع" value={nb.name} onChange={(e) => setNb({ ...nb, name: e.target.value })} />
              <Input placeholder="العنوان" value={nb.address} onChange={(e) => setNb({ ...nb, address: e.target.value })} />
              <Button size="sm" onClick={add} disabled={!nb.name.trim()}>إضافة فرع</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
