import { useRef, useState } from "react";
import { Download, Image as ImageIcon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type StationCardData = {
  name: string;
  company?: string | null | undefined;
  provider: string;
  status: string;
  inverters: number;
  capacityKwp: number;
  powerKw: number;
  todayKwh: number;
  monthKwh: number;
  totalKwh: number;
  co2Ton: number;
  at: string;
  demo: boolean;
};

/** Shareable visual card built from the station's real readings (no invented numbers). */
export function StationCardButton({ data }: { data: StationCardData }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function download() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: null });
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${data.name || "station"}.png`;
      a.click();
    } catch {
      toast.error("تعذر إنشاء الصورة");
    } finally { setBusy(false); }
  }

  const items: [string, string][] = [
    ["عدد الإنفرترات", String(data.inverters)],
    ["الاستطاعة", `${data.capacityKwp} kWp`],
    ["القدرة اللحظية", `${data.powerKw.toFixed(2)} kW`],
    ["إنتاج اليوم", `${data.todayKwh.toFixed(1)} kWh`],
    ["إنتاج الشهر", `${(data.monthKwh / 1000).toFixed(2)} MWh`],
    ["الإنتاج التراكمي", `${(data.totalKwh / 1000).toFixed(1)} MWh`],
    ["CO₂ المتجنَّب", `${data.co2Ton.toFixed(1)} طن`],
    ["الحالة", data.status],
  ];

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><ImageIcon className="size-4" />بطاقة المحطة</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>بطاقة المحطة</DialogTitle></DialogHeader>
          <div ref={ref} dir="rtl" className="overflow-hidden rounded-xl border bg-card text-card-foreground">
            <div className="flex items-center justify-between gap-3 bg-primary p-4 text-primary-foreground">
              <div>
                <p className="text-lg font-bold">{data.name}</p>
                <p className="text-xs opacity-80">{data.company ? `${data.company} · ` : ""}{data.provider}</p>
              </div>
              <Sun className="size-10" />
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              {items.map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="text-base font-bold">{v}</p>
                </div>
              ))}
            </div>
            <p className="px-4 pb-3 text-xs text-muted-foreground">آخر قراءة: {new Date(data.at).toLocaleString("ar")}{data.demo ? " · بيانات تجريبية" : ""}</p>
          </div>
          <Button onClick={() => void download()} disabled={busy}><Download className="size-4" />تنزيل كصورة</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
