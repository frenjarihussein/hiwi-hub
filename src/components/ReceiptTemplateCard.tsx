import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { thermalReceiptHtml, type ReceiptTemplate } from "@/lib/receipt";

/** Company thermal receipt template (tenant_settings.receipt_template). */
export function useReceiptTemplate(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["receipt_template", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await db.from("tenant_settings").select("receipt_template").eq("tenant_id", tenantId!).maybeSingle();
      return ((data as { receipt_template?: unknown } | null)?.receipt_template ?? {}) as ReceiptTemplate;
    },
  });
}

export function ReceiptTemplateCard({ tenantId, editable, company, logoUrl }: { tenantId: string; editable: boolean; company: string; logoUrl?: string | null }) {
  const qc = useQueryClient();
  const q = useReceiptTemplate(tenantId);
  const [t, setT] = useState<ReceiptTemplate>({ width: "80", showLogo: true });
  useEffect(() => { if (q.data) setT({ width: "80", showLogo: true, ...q.data }); }, [q.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("tenant_settings").update({ receipt_template: t } as never).eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حفظ قالب الإيصال"); qc.invalidateQueries({ queryKey: ["receipt_template"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const preview = thermalReceiptHtml({ company, logoUrl: logoUrl ?? null, title: "فاتورة مبيع", docNo: 123, cashier: "الكاشير", lines: [{ name: "مادة تجريبية", qty: 2, price: 1500 }, { name: "مادة ثانية", qty: 1, price: 750 }], paid: true, template: t }, t.width ?? "80");
  return (
    <div className="mb-8 grid max-w-5xl gap-4 rounded-lg border bg-card p-5 lg:grid-cols-2">
      <div className="space-y-3">
        <h2 className="font-semibold">الإيصال الحراري لنقطة البيع</h2>
        <div className="space-y-1"><Label>عرض الورق</Label>
          <select disabled={!editable} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={t.width ?? "80"} onChange={(e) => setT({ ...t, width: e.target.value as "80" | "58" })}>
            <option value="80">80 مم</option><option value="58">58 مم</option>
          </select></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={t.showLogo !== false} onChange={(e) => setT({ ...t, showLogo: e.target.checked })} />إظهار شعار الشركة</label>
        <div className="space-y-1"><Label>الترويسة (العنوان، الهاتف...)</Label><Textarea disabled={!editable} rows={3} value={t.header ?? ""} onChange={(e) => setT({ ...t, header: e.target.value })} /></div>
        <div className="space-y-1"><Label>الشروط</Label><Textarea disabled={!editable} rows={2} value={t.terms ?? ""} onChange={(e) => setT({ ...t, terms: e.target.value })} placeholder="البضاعة المباعة لا ترد بعد 7 أيام" /></div>
        <div className="space-y-1"><Label>التذييل</Label><Textarea disabled={!editable} rows={2} value={t.footer ?? ""} onChange={(e) => setT({ ...t, footer: e.target.value })} placeholder="شكراً لزيارتكم" /></div>
        <div className="space-y-1"><Label>رابط صورة الختم (اختياري)</Label><Input disabled={!editable} dir="ltr" value={t.stampUrl ?? ""} onChange={(e) => setT({ ...t, stampUrl: e.target.value })} /></div>
        {editable && <Button disabled={save.isPending} onClick={() => save.mutate()}>حفظ</Button>}
      </div>
      <div className="flex justify-center rounded-md bg-muted p-3">
        <iframe title="معاينة الإيصال" srcDoc={preview} className="h-[520px] rounded bg-background shadow" style={{ width: t.width === "58" ? 240 : 320 }} />
      </div>
    </div>
  );
}
