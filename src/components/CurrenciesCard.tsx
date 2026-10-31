import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/session";
import { FxLog } from "@/components/FxLog";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useCurrencies, useBaseCurrency, WORLD_CURRENCIES } from "@/lib/currencies";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CurrenciesCard({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const list = useCurrencies();
  const [f, setF] = useState({ code: "", name: "", symbol: "" });
  const [busy, setBusy] = useState(false);
  const base = useBaseCurrency();
  const { data: me } = useMe();
  const accs = useQuery({
    queryKey: ["leaf-accounts", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => (await db.from("accounts").select("id,code,name").eq("tenant_id", me!.tenantId).eq("is_group", false).order("code")).data ?? [],
  });

  async function patch(c: { code: string; name: string; symbol: string | null }, vals: Record<string, unknown>) {
    const { error } = await db.from("currencies").upsert({ tenant_id: me!.tenantId, code: c.code, name: c.name, symbol: c.symbol, ...vals }, { onConflict: "tenant_id,code" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["currencies"] });
  }

  async function add() {
    if (!f.code.trim() || !f.name.trim()) { toast.error("أدخل رمز العملة واسمها"); return; }
    setBusy(true);
    const { error } = await db.rpc("add_currency", { _code: f.code, _name: f.name, _symbol: f.symbol });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تمت إضافة العملة");
    setF({ code: "", name: "", symbol: "" });
    qc.invalidateQueries({ queryKey: ["currencies"] });
  }

  async function remove(code: string) {
    const { error } = await db.from("currencies").delete().eq("code", code);
    if (error) { toast.error(error.message.includes("مستخدمة") ? error.message : error.message); return; }
    toast.success("تم حذف العملة");
    qc.invalidateQueries({ queryKey: ["currencies"] });
  }

  const accSel = (c: { code: string; name: string; symbol: string | null }, key: "gain_account_id" | "loss_account_id", v?: string | null) => (
    <select disabled={!editable} className="h-8 w-full max-w-[180px] rounded-md border bg-background px-1 text-xs" value={v ?? ""} onChange={(e) => patch(c, { [key]: e.target.value || null })}>
      <option value="">— الافتراضي من الإعدادات —</option>
      {(accs.data ?? []).map((a: { id: string; code: string; name: string }) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
    </select>
  );

  return (
    <div className="mb-8">
      <PageHeader title="العملات" subtitle="العملات المتاحة في المستندات والقيود. التقارير تُعرض بالعملة الأساسية، وسعر الصرف في كل مستند = عدد وحدات العملة مقابل 1 من العملة الأساسية. فروق الصرف تُثبت تلقائياً عند تسديد فاتورة بسعر مختلف في «حساب فروق أسعار الصرف»" />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Label>العملة الأساسية للشركة</Label>
          <span className="rounded-md border bg-muted px-3 py-1.5 text-sm font-semibold">
            {(list.data ?? []).find((c) => c.code === base)?.name ?? base} ({base})
          </span>
          <span className="text-xs text-muted-foreground">تُحدد في معالج الإعداد الأول ولا يمكن تغييرها</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-2 text-right">الرمز</th>
              <th className="py-2 text-right">الاسم</th>
              <th className="py-2 text-right">الإشارة</th>
              <th className="py-2 text-right">حساب أرباح الصرف</th>
              <th className="py-2 text-right">حساب خسائر الصرف</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((c) => (
              <tr key={c.code} className="border-b">
                <td className="num py-2">{c.code}</td>
                <td className="py-2">{c.name}{c.code === base ? " — أساسية" : ""}</td>
                <td className="py-2">{c.symbol ?? "—"}{c.is_active === false ? " · موقوفة" : ""}</td>
                <td className="py-2">{c.code !== base && accSel(c, "gain_account_id", c.gain_account_id)}</td>
                <td className="py-2">{c.code !== base && accSel(c, "loss_account_id", c.loss_account_id)}</td>
                <td className="py-2 text-left whitespace-nowrap">
                  {editable && c.code !== base && (
                    <Button size="sm" variant="ghost" onClick={() => patch(c, { is_active: c.is_active === false })}>{c.is_active === false ? "تفعيل" : "إيقاف"}</Button>
                  )}
                  {editable && c.code !== "USD" && c.code !== "SYP" && c.code !== base && (
                    <Button size="sm" variant="ghost" onClick={() => remove(c.code)}>حذف</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="grid gap-2 sm:grid-cols-[2fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label>اختر العملة لإضافتها</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.code} onChange={(e) => { const w = WORLD_CURRENCIES.find((x) => x.code === e.target.value); setF(w ? { code: w.code, name: w.name, symbol: w.symbol ?? "" } : { code: "", name: "", symbol: "" }); }}>
                <option value="">— اختر —</option>
                {WORLD_CURRENCIES.filter((w) => !(list.data ?? []).some((c) => c.code === w.code)).map((w) => <option key={w.code} value={w.code}>{w.name} ({w.code} {w.symbol})</option>)}
              </select>
            </div>
            <Button onClick={add} disabled={busy}>إضافة</Button>
          </div>
        )}
      </div>
      <FxLog />
    </div>
  );
}
