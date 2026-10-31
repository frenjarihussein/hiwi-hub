import { useEffect, useRef, useState } from "react";
import { evalExpr } from "@/lib/calc-expr";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const hasOp = (v: string) => /[*/×÷()%]|\d\s*[+-]/.test(v);

/**
 * Number field that accepts a formula (9.75*24). The formula is kept and shown again when the
 * field is focused; the parent only receives the computed value.
 */
export function ExprInput({ value, onValue, className, placeholder }: { value: string; onValue: (v: string) => void; className?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const formula = useRef<string | null>(null);
  useEffect(() => {
    if (focused) return;
    // keep the formula only while it still produces the current value
    if (formula.current && String(evalExpr(formula.current)) !== String(Number(value))) formula.current = null;
    setText(value);
  }, [value, focused]);

  const commit = (t: string) => {
    if (hasOp(t)) {
      const r = evalExpr(t);
      if (r === null) return;
      formula.current = t;
      onValue(String(r));
      setText(String(r));
    } else {
      formula.current = null;
      onValue(t);
    }
  };
  const live = hasOp(text) ? evalExpr(text) : null;

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        placeholder={placeholder}
        className={cn("num", formula.current && !focused && "pe-5", className)}
        value={text}
        title={formula.current ? `المعادلة: ${formula.current}` : "يمكنك كتابة معادلة مثل 9.75*24"}
        onFocus={() => { setFocused(true); if (formula.current) setText(formula.current); }}
        onChange={(e) => { setText(e.target.value); if (!hasOp(e.target.value)) onValue(e.target.value); }}
        onKeyDown={(e) => { if (e.key === "Enter" && hasOp(text)) { e.preventDefault(); commit(text); } }}
        onBlur={() => { setFocused(false); commit(text); }}
      />
      {focused && live !== null && (
        <span className="num pointer-events-none absolute -bottom-4 end-1 text-[10px] text-primary">= {live}</span>
      )}
      {!focused && formula.current && <span className="pointer-events-none absolute end-1.5 top-1/2 -translate-y-1/2 text-[10px] text-primary">ƒ</span>}
    </div>
  );
}
