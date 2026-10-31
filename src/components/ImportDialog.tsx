import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { downloadTemplate, mapRows, parseCsv, type ImportColumn } from "@/lib/import";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Upload } from "lucide-react";

/** Turns a text value into a foreign-key id by looking it up in another table. */
export type Lookup = {
  /** Column in the CSV that carries the human value. */
  key: string;
  /** Column in the app table that receives the resolved id. */
  target: string;
  table: string;
  /** Columns searched for a match, in order. */
  matchOn: string[];
};

type Props = {
  table: string;
  title: string;
  columns: ImportColumn[];
  lookups?: Lookup[] | undefined;
};

export function ImportDialog({ table, title, columns, lookups = [] }: Props) {
  const { t, dir } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [mode, setMode] = useState<"update" | "add">("update");

  async function handleFile(file: File) {
    setBusy(true);
    setErrors([]);
    try {
      let matrix: string[][];
      if (/\.xlsx?$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sh = wb.Sheets[wb.SheetNames[0]!]!;
        matrix = (XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: "" }) as unknown[][])
          .map((r) => r.map((c) => String(c ?? "")))
          .filter((r) => r.some((v) => v.trim() !== ""));
      } else matrix = parseCsv(await file.text());
      const parsed = mapRows(matrix, columns);
      const rowErrors = parsed.errors.map((e) => `${t("صف")} ${e.line}: ${e.message}`);

      if (parsed.errors.length && !skipInvalid) {
        setErrors(rowErrors);
        return;
      }
      if (parsed.rows.length === 0) {
        setErrors(rowErrors.length ? rowErrors : [t("الملف فارغ أو غير صالح")]);
        return;
      }

      // Resolve reference columns against data belonging to the active company.
      const resolved: Record<string, Record<string, string>> = {};
      const loadLookups = async () => {
        for (const lk of lookups) {
          const { data } = await scope(db.from(lk.table).select(["id", ...lk.matchOn].join(",")), me?.tenantId);
          const map: Record<string, string> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data ?? []).forEach((r: any) => {
            lk.matchOn.forEach((c) => {
              if (r[c]) map[String(r[c]).trim()] = r.id;
            });
          });
          resolved[lk.key] = map;
        }
      };

      // Rows may reference other rows in the same file (e.g. parent account),
      // so insert in passes: each pass inserts the rows whose references now resolve.
      let pending = parsed.rows.map((row, i) => ({ row, line: i + 2 }));
      let inserted = 0;
      let unresolved: string[] = [];
      for (let pass = 0; pass < 20 && pending.length; pass++) {
        await loadLookups();
        const ready: Record<string, unknown>[] = [];
        const next: typeof pending = [];
        unresolved = [];
        for (const p of pending) {
          const record: Record<string, unknown> = { ...p.row, tenant_id: me?.tenantId };
          let ok = true;
          for (const lk of lookups) {
            const raw = p.row[lk.key];
            delete record[lk.key];
            if (raw === null || raw === undefined || raw === "") continue;
            const id = resolved[lk.key]?.[String(raw).trim()];
            if (!id) { ok = false; unresolved.push(`${t("صف")} ${p.line}: «${String(raw)}» غير موجود`); break; }
            record[lk.target] = id;
          }
          if (ok) ready.push(record); else next.push(p);
        }
        if (!ready.length) break;
        if (unresolved.length && !skipInvalid && pass === 0 && !lookups.some((l) => l.table === table)) break;
        // Update existing rows instead of rejecting them when the file repeats a
        // code/sku/name that is already in the company (unique key per table).
        const conflict =
          table === "products" ? "tenant_id,sku"
          : table === "units" ? "tenant_id,name"
          : parsed.rows.some((r) => "code" in r) ? "tenant_id,code"
          : null;
        const { error } = conflict
          ? await db.from(table).upsert(ready, { onConflict: conflict, ignoreDuplicates: mode === "add" })
          : await db.from(table).insert(ready);
        if (error) throw new Error(error.message);
        inserted += ready.length;
        pending = next;
      }
      if (!inserted) {
        setErrors([...rowErrors, ...unresolved]);
        return;
      }

      toast.success(`${t("تم استيراد")} ${inserted} ${t("سجل")}`);
      qc.invalidateQueries({ queryKey: [table] });
      const remaining = [...rowErrors, ...unresolved];
      if (remaining.length) setErrors(remaining);
      else setOpen(false);
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" />
        {t("استيراد من إكسل")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={dir} className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("استيراد بيانات")} — {title}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {t("اختر ملف CSV أو Excel (محفوظ بصيغة CSV) بنفس أعمدة القالب")}
          </p>

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <div className="mb-1 font-semibold">{t("الأعمدة المطلوبة")}</div>
            <div className="flex flex-wrap gap-1">
              {columns.map((c) => (
                <span key={c.key} className="rounded bg-background px-2 py-0.5">
                  {c.label}
                  {c.required ? " *" : ""}
                </span>
              ))}
            </div>
          </div>

          <Button variant="outline" onClick={() => downloadTemplate(title, columns)}>
            <Download className="size-4" />
            {t("تحميل القالب")}
          </Button>

          <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-semibold">{t("عند وجود سجل بنفس الرمز")}</div>
            <label className="flex items-center gap-2">
              <input type="radio" name="import-mode" className="size-4" checked={mode === "update"} onChange={() => setMode("update")} />
              {t("استبدال القديم بالمستورد (تحديث السجل الموجود)")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="import-mode" className="size-4" checked={mode === "add"} onChange={() => setMode("add")} />
              {t("إضافة الجديد فقط وتجاهل المكرر")}
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={skipInvalid}
              onChange={(e) => setSkipInvalid(e.target.checked)}
            />
            {t("تجاهل الصفوف غير الصالحة والمتابعة")}
          </label>

          <input
            type="file"
            accept=".csv,text/csv,.xlsx,.xls"
            disabled={busy}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-2 file:text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />

          {errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {errors.map((er, i) => (
                <div key={i}>{er}</div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("إلغاء")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
