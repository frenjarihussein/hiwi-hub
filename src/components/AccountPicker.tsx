import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";

type Acc = { id: string; code: string; name: string; is_group?: boolean; currency?: string | null };

/** Account field searchable by account name or code; group accounts are not selectable. Optional currency filter. */
export function AccountPicker({ accounts, value, onChange, className, disabled = false, currency }: { accounts: Acc[]; value: string; onChange: (id: string) => void; className?: string; disabled?: boolean; currency?: string | undefined }) {
  const listId = useId();
  const label = (a: Acc) => `${a.code} - ${a.name}${a.currency ? ` [${a.currency}]` : ""}`;
  const current = accounts.find((a) => a.id === value);
  const [text, setText] = useState(current ? label(current) : "");
  useEffect(() => { setText(current ? label(current) : ""); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const leaves = accounts.filter((a) => !a.is_group && (!currency || !a.currency || a.currency === currency));
  return (
    <>
      <Input
        disabled={disabled}
        list={listId}
        className={className ?? "h-9 w-52"}
        placeholder="ابحث برقم أو اسم الحساب"
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const q = t.trim();
          const hit = leaves.find((a) => label(a) === q) ?? leaves.find((a) => a.code === q) ?? leaves.find((a) => a.name === q);
          onChange(hit?.id ?? "");
        }}
        onBlur={() => { if (!value) setText(""); else if (current) setText(label(current)); }}
      />
      <datalist id={listId}>
        {leaves.map((a) => <option key={a.id} value={label(a)} />)}
      </datalist>
    </>
  );
}
