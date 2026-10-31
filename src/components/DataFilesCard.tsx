import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const COPY_OPTIONS = [
  { key: "accounts", label: "شجرة الحسابات والحسابات الختامية وربط الحسابات" },
  { key: "products", label: "المواد والتصنيفات" },
  { key: "units", label: "الوحدات" },
  { key: "currencies", label: "العملات" },
  { key: "partners", label: "الزبائن والموردين" },
  { key: "warehouses", label: "المستودعات" },
  { key: "branches", label: "الفروع" },
  { key: "cost_centers", label: "مراكز الكلفة" },
  { key: "users", label: "المستخدمين (نفس الحسابات يدخلون الملف الجديد)" },
  { key: "opening_balances", label: "الأرصدة الافتتاحية للحسابات (قيد افتتاحي)", needs: "accounts" },
  { key: "opening_stock", label: "كميات المخزون الافتتاحية", needs: "products" },
] as const;

const y = new Date().getFullYear() + 1;

export function DataFilesCard({ tenantName }: { tenantName: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"year" | "file">("file");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: tenantName, label: String(y), fiscal_start: `${y}-01-01`, fiscal_end: `${y}-12-31` });
  const [opts, setOpts] = useState<Record<string, boolean>>(
    Object.fromEntries(COPY_OPTIONS.map((o) => [o.key, true])),
  );

  async function run() {
    setBusy(true);
    try {
      if (mode === "year") {
        const { error } = await db.rpc("close_fiscal_year");
        if (error) throw error;
        toast.success("تم إقفال السنة وفتح سنة جديدة بقيد افتتاحي داخل نفس الشركة");
        setOpen(false);
        window.location.reload();
        return;
      }
      const payload = { ...opts, warehouses: opts["warehouses"] || opts["opening_stock"], fiscal_start: f.fiscal_start, fiscal_end: f.fiscal_end };
      const { data: id, error } = await db.rpc("clone_tenant", { _name: f.name.trim(), _label: f.label.trim() || null, _opts: payload });
      if (error) throw error;
      toast.success("تم إنشاء ملف البيانات الجديد");
      if (confirm("هل تريد الانتقال إلى الملف الجديد الآن؟")) {
        const { error: e2 } = await db.rpc("switch_tenant", { _t: id });
        if (e2) throw e2;
        window.location.assign("/home");
      } else {
        window.location.reload();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="mb-1 font-bold">ملفات البيانات</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        افتح ملف بيانات جديداً للسنة القادمة أو لشركة أخرى، مع الاستفادة من شجرة الحسابات والمواد والبيانات الثابتة. تتنقل بين الملفات من أعلى الشاشة.
      </p>
      <Button onClick={() => setOpen(true)}>فتح ملف بيانات جديد</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>فتح ملف بيانات جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <input type="radio" checked={mode === "file"} onChange={() => setMode("file")} className="mt-1" />
                <span><b>ملف منفصل</b> (سنة جديدة أو شركة أخرى) — ملف مستقل تتنقل بينه وبين الملف الحالي، والملف القديم يبقى كما هو.</span>
              </label>
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <input type="radio" checked={mode === "year"} onChange={() => setMode("year")} className="mt-1" />
                <span><b>سنة جديدة داخل نفس الشركة</b> — إقفال السنة الحالية وتدوير الأرصدة بقيد افتتاحي، وتبقى السنوات السابقة قابلة للعرض بالتاريخ.</span>
              </label>
            </div>
            {mode === "file" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>اسم الملف / الشركة</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                  <div className="space-y-1"><Label>وصف (مثلاً السنة)</Label><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
                  <div className="space-y-1"><Label>بداية السنة المالية</Label><Input type="date" value={f.fiscal_start} onChange={(e) => setF({ ...f, fiscal_start: e.target.value })} /></div>
                  <div className="space-y-1"><Label>نهاية السنة المالية</Label><Input type="date" value={f.fiscal_end} onChange={(e) => setF({ ...f, fiscal_end: e.target.value })} /></div>
                </div>
                <div className="space-y-2 rounded-md border p-3">
                  <Label>ماذا تريد أن تنسخ من الملف الحالي؟</Label>
                  {COPY_OPTIONS.map((o) => {
                    const blocked = "needs" in o && !opts[o.needs];
                    return (
                      <label key={o.key} className={`flex items-center gap-2 text-sm ${blocked ? "opacity-50" : ""}`}>
                        <Checkbox checked={!!opts[o.key] && !blocked} disabled={blocked} onCheckedChange={(v) => setOpts({ ...opts, [o.key]: !!v })} />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            {mode === "year" && (
              <p className="rounded-md bg-muted p-3 text-sm">يتطلب تحديد السنة المالية وحساب الأرباح المحتجزة. لا يمكن التعديل على السنة المقفلة بعد ذلك.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={run} disabled={busy || (mode === "file" && !f.name.trim())}>{busy ? "جارٍ التنفيذ..." : "تنفيذ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
