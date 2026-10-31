import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { summarizeClosing, type PreviewRow } from "@/lib/year-end";

type Settings = { fiscal_start?: string | null; fiscal_end?: string | null; retained_earnings_account_id?: string | null; closed_until?: string | null };

/** Three-step year-end wizard: check settings, preview the closing/opening entries, then close and lock the year. */
export function YearEndWizard({ settings, disabled, onRun, running }: { settings: Settings | null | undefined; disabled: boolean; onRun: () => Promise<unknown>; running: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const preview = useQuery({
    queryKey: ["fiscal_close_preview", settings?.fiscal_end],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.rpc("fiscal_close_preview");
      if (error) throw error;
      return (data ?? []) as PreviewRow[];
    },
  });
  const sum = summarizeClosing(preview.data ?? []);
  const checks = [
    { ok: !!settings?.fiscal_start && !!settings?.fiscal_end, label: "تحديد بداية ونهاية السنة المالية" },
    { ok: !!settings?.retained_earnings_account_id, label: "تحديد حساب الأرباح المدورة" },
    { ok: !(settings?.closed_until && settings?.fiscal_end && settings.closed_until >= settings.fiscal_end), label: "السنة غير مقفلة مسبقاً" },
  ];
  const ready = checks.every((c) => c.ok);
  const run = useMutation({
    mutationFn: onRun,
    onSuccess: () => { setStep(3); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => { setStep(1); setOpen(true); }}>معالج إقفال السنة المالية</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>معالج إقفال السنة المالية</DialogTitle></DialogHeader>
          <div className="flex gap-2 text-xs">
            {["التحقق", "المعاينة", "الإقفال"].map((s, i) => (
              <span key={s} className={`rounded-full border px-3 py-1 ${step === i + 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{i + 1}. {s}</span>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3 text-sm">
              <p>السنة المالية: {fmtDate(settings?.fiscal_start)} ← {fmtDate(settings?.fiscal_end)}</p>
              <ul className="space-y-1">
                {checks.map((c) => <li key={c.label} className={c.ok ? "text-foreground" : "text-destructive"}>{c.ok ? "✓" : "✗"} {c.label}</li>)}
              </ul>
              <div className="flex justify-end"><Button disabled={!ready} onClick={() => setStep(2)}>التالي</Button></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 text-sm">
              {preview.isLoading ? <p>جارٍ الحساب…</p> : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">الإيرادات</div><b>{fmtNum(sum.revenue)}</b></div>
                    <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">المصاريف</div><b>{fmtNum(sum.expense)}</b></div>
                    <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{sum.net >= 0 ? "صافي الربح" : "صافي الخسارة"}</div><b>{fmtNum(Math.abs(sum.net))}</b></div>
                  </div>
                  <p>قيد الإقفال: يصفّر {sum.plCount} حساب أرباح وخسائر ويرحّل الصافي إلى الأرباح المدورة بتاريخ {fmtDate(settings?.fiscal_end)}.</p>
                  <p>القيد الافتتاحي: يدوّر أرصدة {sum.bsCount} حساب ميزانية إلى السنة الجديدة.</p>
                  <div className="max-h-56 overflow-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted"><th className="p-1 text-start">الحساب</th><th className="p-1">النوع</th><th className="p-1 text-end">الرصيد</th></tr></thead>
                      <tbody>{(preview.data ?? []).map((r) => (
                        <tr key={r.account_id} className="border-t"><td className="p-1">{r.code} - {r.name}</td><td className="p-1 text-center">{r.kind === "pl" ? "أرباح وخسائر" : "ميزانية"}</td><td className="p-1 text-end">{fmtNum(r.balance)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <p className="text-destructive">بعد الإقفال تتجمد السنة حتى {fmtDate(settings?.fiscal_end)}: لا يمكن إضافة أو تعديل أي قيد أو فاتورة قبل هذا التاريخ.</p>
                </>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>السابق</Button>
                <Button disabled={preview.isLoading || run.isPending || running} onClick={() => run.mutate()}>إقفال السنة الآن</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm">
              <p>تم إقفال السنة بنجاح: أُنشئ قيد الإقفال والقيد الافتتاحي، وجُمّدت الفترة السابقة.</p>
              <div className="flex justify-end"><Button onClick={() => setOpen(false)}>إغلاق</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
