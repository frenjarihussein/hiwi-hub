import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudDownload, Download, FileText, Lock, Upload } from "lucide-react";
import { backupCompany, restoreCompanyUsers } from "@/lib/admin.functions";
import { downloadBackupXlsx, readBackupXlsx, SHEET_AR } from "@/lib/backup";
import { decryptJson, encryptJson } from "@/lib/crypto-backup";
import { db } from "@/lib/db";
import { startWork } from "@/lib/work-progress";
import { restoreCompanyData } from "@/lib/company-restore";
import { buildCompanyReportHtml } from "@/lib/company-pdf";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DAY = 86_400_000;

export function BackupButtons({ tenantId, name }: { tenantId: string; name: string }) {
  const backupFn = useServerFn(backupCompany);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [freq, setFreq] = useState("off");
  const lastKey = `backup-last-${tenantId}`;
  const freqKey = `backup-freq-${tenantId}`;

  useEffect(() => {
    const f = localStorage.getItem(freqKey) ?? "off";
    setFreq(f);
    const last = Number(localStorage.getItem(lastKey) ?? 0);
    const every = f === "daily" ? DAY : f === "weekly" ? 7 * DAY : 0;
    if (every && Date.now() - last > every) toast.warning(`حان موعد النسخة الاحتياطية الدورية لشركة "${name}"`, { duration: 15000 });
  }, [freqKey, lastKey, name]);

  async function doBackup() {
    setBusy(true);
    const work = startWork("تجهيز النسخة الاحتياطية");
    try {
      const json = await backupFn({ data: { tenantId } });
      const parsed = JSON.parse(json);
      downloadBackupXlsx(parsed.data, `نسخة-احتياطية-${name}-${new Date().toISOString().slice(0, 10)}`);
      localStorage.setItem(lastKey, String(Date.now()));
      toast.success("تم تنزيل النسخة الاحتياطية (ملف Excel)");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      work.finish();
      setBusy(false);
    }
  }

  async function doPdf() {
    const w = window.open("", "_blank");
    if (!w) { toast.error("اسمح بفتح النوافذ المنبثقة لعرض التقرير"); return; }
    w.document.write('<p dir="rtl" style="font-family:Tahoma;padding:40px">جاري تجهيز التقرير...</p>');
    setBusy(true);
    const work = startWork("تجهيز النسخة الاحتياطية");
    try {
      const parsed = JSON.parse(await backupFn({ data: { tenantId } }));
      const st = parsed.data?.tenant_settings?.[0] ?? {};
      const html = buildCompanyReportHtml(parsed.data, { logo: st.logo_url, color: st.primary_color });
      w.document.open(); w.document.write(html); w.document.close();
    } catch (e) {
      w.close();
      toast.error((e as Error).message);
    } finally {
      work.finish();
      setBusy(false);
    }
  }

  async function doEncrypted() {
    const pw = window.prompt("أدخل كلمة سر لتشفير النسخة (8 أحرف على الأقل). احفظها، لا يمكن استرجاعها:");
    if (!pw) return;
    if (pw.length < 8) { toast.error("كلمة السر قصيرة"); return; }
    setBusy(true);
    const work = startWork("تجهيز النسخة الاحتياطية");
    try {
      const json = await backupFn({ data: { tenantId } });
      const blob = new Blob([await encryptJson(json, pw)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `نسخة-مشفرة-${name}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      localStorage.setItem(lastKey, String(Date.now()));
      toast.success("تم تنزيل النسخة المشفرة");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      work.finish();
      setBusy(false);
    }
  }

  async function doRestore(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const work = startWork("تجهيز النسخة الاحتياطية");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: Record<string, any[]>;
      if (file.name.toLowerCase().endsWith(".json")) {
        const text = (await file.text()).replace(/^\uFEFF/, "");
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { throw new Error("ملف JSON غير صالح أو تالف"); }
        if (parsed && parsed.iv && parsed.salt && typeof parsed.data === "string") {
          const pw = window.prompt("كلمة سر النسخة المشفرة:");
          if (!pw) return;
          parsed = JSON.parse(await decryptJson(text, pw));
        }
        data = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
      } else data = await readBackupXlsx(file);
      const summary = Object.entries(data)
        .filter(([t]) => SHEET_AR[t])
        .map(([t, rows]) => `${SHEET_AR[t]}: ${rows.length}`)
        .join("\n");
      if (!data["accounts"]) throw new Error("الملف لا يبدو نسخة احتياطية صالحة من البرنامج");
      const ok = window.confirm(
        `سيتم استبدال كل بيانات شركة "${name}" المحاسبية بمحتوى النسخة:\n\n${summary}\n\n(المستخدمون والاشتراك لا يتغيرون). متابعة؟`,
      );
      if (!ok) return;
      const tid = toast.loading("جارٍ الاسترجاع...");
      try {
        const r = await restoreCompanyData(tenantId, data, (m) => toast.loading(m, { id: tid }));
        toast.dismiss(tid);
        if (r.bad) toast.warning(`تم استرجاع ${r.ok} سجل، وتعذر ${r.bad} سجل`, { description: r.errors.slice(0, 3).join("\n"), duration: 15000 });
        else toast.success(`تم استرجاع النسخة الاحتياطية بنجاح (${r.ok} سجل)`);
      } catch (e) {
        toast.dismiss(tid);
        throw e;
      }
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      work.finish();
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={doBackup}>
        <Download className="size-4" />
        نسخة احتياطية
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={doPdf}>
        <FileText className="size-4" />
        تقرير PDF شامل
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={doEncrypted}>
        <Lock className="size-4" />
        نسخة مشفرة
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload className="size-4" />
        استرجاع نسخة
      </Button>
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm"
        title="تذكير النسخ الدوري"
        value={freq}
        onChange={(e) => { setFreq(e.target.value); localStorage.setItem(freqKey, e.target.value); }}
      >
        <option value="off">بدون تذكير دوري</option>
        <option value="daily">تذكير يومي</option>
        <option value="weekly">تذكير أسبوعي</option>
      </select>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.json"
        className="hidden"
        onChange={(e) => doRestore(e.target.files?.[0])}
      />
    </>
  );
}

/** System admin: one JSON file holding every company with all its data and settings, plus importing it back. */
type PickItem = { id: string; name: string; note?: string };
type PickState = { title: string; action: string; items: PickItem[]; selected: string[]; resolve: (ids: string[] | null) => void };

export function ExportAllButton({ tenants: allTenants, label }: { tenants: { id: string; name: string }[]; label?: string }) {
  const backupFn = useServerFn(backupCompany);
  const restoreUsersFn = useServerFn(restoreCompanyUsers);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<PickState | null>(null);

  function askPick(title: string, action: string, items: PickItem[]) {
    return new Promise<string[] | null>((resolve) =>
      setPick({ title, action, items, selected: items.map((i) => i.id), resolve }));
  }
  function closePick(ids: string[] | null) {
    pick?.resolve(ids && ids.length ? ids : null);
    setPick(null);
  }

  async function doAll() {
    if (!allTenants.length) { toast.error("لا توجد شركات"); return; }
    const chosen = await askPick("اختر الشركات المراد تصديرها", "تصدير", allTenants);
    if (!chosen) return;
    const tenants = allTenants.filter((t) => chosen.includes(t.id));
    setBusy(true);
    const work = startWork("تجهيز النسخة الاحتياطية");
    work.update("تصدير الشركات", 0, tenants.length);
    const companies: unknown[] = [];
    const failed: string[] = [];
    const tid = toast.loading("جارٍ التصدير...");
    try {
      for (const [i, t] of tenants.entries()) {
        work.update(`تصدير ${t.name}`, i, tenants.length);
        toast.loading(`تصدير ${t.name} (${i + 1}/${tenants.length})...`, { id: tid });
        try {
          companies.push(JSON.parse(await backupFn({ data: { tenantId: t.id } })));
        } catch (e) {
          failed.push(`${t.name}: ${(e as Error).message}`);
        }
        work.update(`تصدير ${t.name}`, i + 1, tenants.length);
      }
      const blob = new Blob([JSON.stringify({ app: "yousef-soft", kind: "all-companies", version: 3, created_at: new Date().toISOString(), companies })], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${tenants.length === 1 ? tenants[0]!.name : "الشركات"}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      toast.dismiss(tid);
      if (failed.length) toast.warning(`تم تصدير ${companies.length} من ${tenants.length} شركة`, { description: failed.join("\n"), duration: 15000 });
      else toast.success(`تم تصدير ${companies.length} شركة بكل بياناتها في ملف واحد`);
    } finally {
      toast.dismiss(tid);
      work.finish();
      setBusy(false);
    }
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const work = startWork("تجهيز النسخة الاحتياطية");
    const tid = toast.loading("جارٍ قراءة الملف...");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any;
      try { parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); } catch { throw new Error("ملف JSON غير صالح"); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = parsed?.kind === "all-companies" ? parsed.companies : parsed?.data ? [parsed] : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inFile = list.filter((c: any) => c?.data?.tenants?.[0]?.id);
      if (!inFile.length) throw new Error("الملف لا يحتوي على شركات");
      const ids = new Set(allTenants.map((t) => t.id));
      toast.dismiss(tid);
      work.finish();
      const chosen = await askPick(
        `الملف يحتوي ${inFile.length} شركة — اختر ما تريد استيراده (ستُستبدل بياناتها الحالية)`,
        "استيراد",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inFile.map((c: any) => {
          const t = c.data.tenants[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows = Object.values(c.data as Record<string, unknown>).reduce((n: number, v: any) => n + (Array.isArray(v) ? v.length : 0), 0);
          return { id: t.id, name: t.name, note: `${rows} سجل${ids.has(t.id) ? "" : " — شركة جديدة ستُنشأ"}` };
        }),
      );
      if (!chosen) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const valid = inFile.filter((c: any) => chosen.includes(c.data.tenants[0].id));
      const importing = startWork("استيراد الشركات", valid.length);
      try {
      const results: string[] = [];
      let okCount = 0;
      for (const [i, c] of valid.entries()) {
        const t0 = c.data.tenants[0];
        const id = t0.id as string;
        const step = (m: string) => { importing.update(`${t0.name}: ${m}`, i, valid.length); toast.loading(`${t0.name} (${i + 1}/${valid.length}): ${m}`, { id: tid }); };
        try {
          if (!ids.has(id)) {
            step("إنشاء الشركة...");
            const { error } = await db.from("tenants").insert(t0 as never);
            if (error) throw new Error(error.message);
          }
          if (Array.isArray(c.data.profiles) && c.data.profiles.length) {
            step("إنشاء المستخدمين...");
            await restoreUsersFn({ data: { tenantId: id, profiles: c.data.profiles } });
          }
          const r = await restoreCompanyData(id, c.data, step);
          okCount++;
          results.push(`✓ ${t0.name}: ${r.ok} سجل${r.bad ? ` — تعذر ${r.bad} (${r.errors[0] ?? ""})` : ""}`);
        } catch (e) {
          results.push(`✗ ${t0.name}: ${(e as Error).message}`);
        }
        importing.update(`استيراد ${t0.name}`, i + 1, valid.length);
      }
      toast.dismiss(tid);
      window.alert(`نتيجة الاستيراد (${okCount}/${valid.length}):\n\n${results.join("\n")}\n\nملاحظة: المستخدمون الجدد أُنشئوا بكلمات مرور مؤقتة، عيّن كلمة مرور لكل مستخدم من هذه الصفحة.`);
      qc.invalidateQueries();
      } finally { importing.finish(); }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      toast.dismiss(tid);
      work.finish();
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={busy || !allTenants.length} onClick={doAll}>
        <Download className="size-4" />
        {busy ? "جارٍ العمل..." : label ?? "تصدير كل الشركات (JSON)"}
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload className="size-4" />
        استيراد شركات
      </Button>
      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} />
      <Dialog open={!!pick} onOpenChange={(o) => { if (!o) closePick(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{pick?.title}</DialogTitle></DialogHeader>
          {pick && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
                <Checkbox
                  checked={pick.selected.length === pick.items.length}
                  onCheckedChange={(v) => setPick({ ...pick, selected: v ? pick.items.map((i) => i.id) : [] })}
                />
                تحديد الكل ({pick.selected.length}/{pick.items.length})
              </label>
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {pick.items.map((it) => (
                  <label key={it.id} className="flex items-center gap-2 rounded p-2 text-sm hover:bg-muted">
                    <Checkbox
                      checked={pick.selected.includes(it.id)}
                      onCheckedChange={(v) => setPick({ ...pick, selected: v ? [...pick.selected, it.id] : pick.selected.filter((x) => x !== it.id) })}
                    />
                    <span className="flex-1">{it.name}</span>
                    {it.note && <span className="text-xs text-muted-foreground">{it.note}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => closePick(null)}>إلغاء</Button>
            <Button disabled={!pick?.selected.length} onClick={() => closePick(pick?.selected ?? null)}>
              {pick?.action} ({pick?.selected.length ?? 0})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** النسخ الاحتياطي التلقائي على السحابة: التفعيل، الدورية، وقائمة النسخ المحفوظة. */
export function CloudBackupCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["backup_settings", tenantId],
    queryFn: async () =>
      (await db.from("tenant_settings").select("auto_backup, backup_every_days, last_backup_at").eq("tenant_id", tenantId).maybeSingle()).data,
  });
  const list = useQuery({
    queryKey: ["cloud_backups", tenantId],
    queryFn: async () =>
      (await db.from("backups").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  async function save(auto: boolean, days: number) {
    const { error } = await db.from("tenant_settings").update({ auto_backup: auto, backup_every_days: days }).eq("tenant_id", tenantId);
    if (error) { toast.error(error.message); return; }
    toast.success(auto ? `تم تفعيل النسخ التلقائي كل ${days} يوم` : "تم إيقاف النسخ التلقائي");
    qc.invalidateQueries({ queryKey: ["backup_settings", tenantId] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function download(b: any) {
    const { data, error } = await supabase.storage.from("backups").createSignedUrl(b.file_path, 300, { download: true });
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const auto = settings.data?.auto_backup ?? false;
  const days = settings.data?.backup_every_days ?? 7;
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="me-auto font-bold">النسخ الاحتياطي التلقائي على السحابة</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => save(e.target.checked, days)} />
          مفعّل
        </label>
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={days}
          disabled={!auto}
          onChange={(e) => save(true, Number(e.target.value))}
        >
          <option value={1}>كل يوم</option>
          <option value={3}>كل 3 أيام</option>
          <option value={7}>كل أسبوع</option>
          <option value={30}>كل شهر</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        تُحفظ نسخة JSON كاملة من بيانات الشركة تلقائياً على السحابة وفق الدورية المختارة.
        {settings.data?.last_backup_at ? ` آخر نسخة: ${fmtDate(settings.data.last_backup_at)}` : " لم تُنشأ نسخة تلقائية بعد."}
      </p>
      {!!list.data?.length && (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground"><tr className="border-b"><th className="p-1.5 text-right">التاريخ</th><th className="p-1.5 text-right">الحجم</th><th className="p-1.5" /></tr></thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {list.data.map((b: any) => (
              <tr key={b.id} className="border-b">
                <td className="p-1.5">{fmtDate(b.created_at)}</td>
                <td className="num p-1.5">{b.size_bytes ? `${(Number(b.size_bytes) / 1024).toFixed(0)} KB` : "—"}</td>
                <td className="p-1.5 text-left">
                  <Button size="icon" variant="ghost" title="تنزيل" onClick={() => download(b)}><CloudDownload className="size-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
