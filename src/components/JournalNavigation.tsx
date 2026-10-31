import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function JournalNavigation({ id, onSelect, onNew }: { id: string; onSelect: (entry: { id: string; entry_no: number }) => void; onNew?: () => void }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [number, setNumber] = useState("");
  const q = useQuery({
    queryKey: ["journal-navigation", me?.tenantId, me?.activeBranchId, me?.isAuditor],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      let query = db.from("journal_entries").select("id,entry_no").eq("tenant_id", me?.tenantId).order("entry_no");
      if (me?.isAuditor) query = query.eq("audited", true);
      const all: { id: string; entry_no: number }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await query.range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      return all;
    },
  });
  const entries = q.data ?? [];
  const index = entries.findIndex((e) => e.id === id);
  const go = (i: number) => { const e = entries[i]; if (e) onSelect(e); };
  function jump() {
    const e = entries.find((x) => x.entry_no === Number(number));
    if (e) onSelect(e); else toast.error("رقم القيد غير موجود");
  }
  return <nav aria-label="التقليب بين القيود" className="no-print flex flex-wrap items-center gap-2">
    <Button size="icon" variant="outline" title="أول قيد" aria-label="أول قيد" disabled={index <= 0} onClick={() => go(0)}><ChevronLast className="size-4" /></Button>
    <Button size="icon" variant="outline" title="القيد السابق" aria-label="القيد السابق" disabled={index <= 0} onClick={() => go(index - 1)}><ChevronRight className="size-4" /></Button>
    <Input aria-label="انتقال إلى رقم القيد" placeholder="رقم القيد" className="w-28" type="number" value={number} onChange={(e) => setNumber(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") jump(); }} />
    <Button size="icon" variant="outline" title="فتح رقم القيد" aria-label="فتح رقم القيد" disabled={!number || !entries.length} onClick={jump}><Search className="size-4" /></Button>
    <Button size="icon" variant="outline" title="القيد التالي" aria-label="القيد التالي" disabled={index < 0 || index >= entries.length - 1} onClick={() => go(index + 1)}><ChevronLeft className="size-4" /></Button>
    <Button size="icon" variant="outline" title="آخر قيد" aria-label="آخر قيد" disabled={index < 0 || index >= entries.length - 1} onClick={() => go(entries.length - 1)}><ChevronFirst className="size-4" /></Button>
    <Button size="sm" title="قيد جديد" onClick={() => { if (onNew) onNew(); else void navigate({ to: "/journal", search: { new: "entry" } }); }}><Plus className="size-4" />قيد جديد</Button>
  </nav>;
}