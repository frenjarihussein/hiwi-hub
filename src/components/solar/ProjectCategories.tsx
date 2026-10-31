import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderTree, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ProjectCategory = { id: string; name: string; parent_id: string | null };

export function useProjectCategories(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["projects", "categories", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await db.from("projects").select("id,name,parent_id").eq("tenant_id", tenantId!).eq("is_group", true).order("name");
      if (error) throw error;
      return (data ?? []) as ProjectCategory[];
    },
  });
}

/** Category label with its ancestors, e.g. "مشاريع حلب / طاقة شمسية". */
export function categoryPath(cats: ProjectCategory[], id: string | null): string {
  const out: string[] = [];
  let cur = cats.find((c) => c.id === id);
  while (cur && out.length < 10) { out.unshift(cur.name); const pid = cur.parent_id; cur = cats.find((c) => c.id === pid); }
  return out.join(" / ");
}

/** The category plus every sub-category below it. */
export function categoryDescendants(cats: ProjectCategory[], id: string): Set<string> {
  const set = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const c of cats) if (c.parent_id && set.has(c.parent_id) && !set.has(c.id)) { set.add(c.id); grew = true; } }
  return set;
}

export function CategorySelect({ cats, value, onChange, placeholder = "بدون تصنيف" }: { cats: ProjectCategory[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
      <option value="">{placeholder}</option>
      {cats.map((c) => ({ c, p: categoryPath(cats, c.id) })).sort((a, b) => a.p.localeCompare(b.p, "ar")).map(({ c, p }) => <option key={c.id} value={c.id}>{p}</option>)}
    </select>
  );
}

export function ProjectCategoriesDialog({ open, onClose, tenantId }: { open: boolean; onClose: () => void; tenantId: string }) {
  const qc = useQueryClient();
  const cats = useProjectCategories(tenantId).data ?? [];
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["projects"] });

  async function add() {
    if (!name.trim()) { toast.error("اكتب اسم التصنيف"); return; }
    setBusy(true);
    const { error } = await db.from("projects").insert({ tenant_id: tenantId, name: name.trim(), is_group: true, is_active: true, parent_id: parent || null, status: "active" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تمت إضافة التصنيف");
    setName("");
    void refresh();
  }
  async function remove(id: string) {
    if (!confirm("حذف هذا التصنيف؟")) return;
    const { error } = await db.from("projects").delete().eq("id", id);
    if (error) { toast.error(/foreign|parent/.test(error.message) ? "انقل المشاريع والتصنيفات الفرعية أولاً" : error.message); return; }
    void refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FolderTree className="size-5 text-primary" />تصنيفات المشاريع</DialogTitle></DialogHeader>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="مثال: مشاريع حلب" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} />
          <CategorySelect cats={cats} value={parent} onChange={setParent} placeholder="تصنيف رئيسي" />
          <Button onClick={() => void add()} disabled={busy}>إضافة</Button>
        </div>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {cats.length === 0 && <li className="p-3 text-sm text-muted-foreground">لا توجد تصنيفات بعد.</li>}
          {cats.map((c) => ({ c, p: categoryPath(cats, c.id) })).sort((a, b) => a.p.localeCompare(b.p, "ar")).map(({ c, p }) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <span>{p}</span>
              <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => void remove(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
