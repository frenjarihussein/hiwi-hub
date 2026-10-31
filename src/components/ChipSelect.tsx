import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Multi-select: pick from a searchable list, chosen items appear below as removable chips. */
export function ChipSelect({ options, value, onChange, placeholder = "اختر للإضافة...", emptyText = "لم يتم اختيار شيء — الكل مسموح" }: {
  options: [string, string][]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; emptyText?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const label = new Map(options);
  const rest = options.filter(([id, l]) => !value.includes(id) && (!q.trim() || l.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="space-y-2">
      <div className="relative">
        <Input value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
        {open && (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {rest.length === 0 && <div className="p-2 text-xs text-muted-foreground">لا توجد نتائج</div>}
            {rest.length > 1 && <button type="button" className="w-full rounded px-2 py-1 text-start text-xs font-semibold text-primary hover:bg-accent" onMouseDown={(e) => { e.preventDefault(); onChange([...value, ...rest.map(([id]) => id)]); setQ(""); }}>إضافة كل الظاهر ({rest.length})</button>}
            {rest.slice(0, 200).map(([id, l]) => (
              <button key={id} type="button" className="w-full rounded px-2 py-1 text-start text-sm hover:bg-accent" onMouseDown={(e) => { e.preventDefault(); onChange([...value, id]); setQ(""); }}>{l}</button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {value.length === 0 && <span className="text-xs text-muted-foreground">{emptyText}</span>}
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            {label.get(id) ?? id.slice(0, 8)}
            <button type="button" aria-label="إزالة" className="hover:text-destructive" onClick={() => onChange(value.filter((x) => x !== id))}><X className="size-3" /></button>
          </span>
        ))}
        {value.length > 1 && <button type="button" className="text-xs text-destructive underline" onClick={() => onChange([])}>إزالة الكل</button>}
      </div>
    </div>
  );
}
