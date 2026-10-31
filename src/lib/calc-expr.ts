/** Safely evaluates arithmetic like "9.75*24", "(10+5)/3", "100-10%". Returns null if invalid. */
export function evalExpr(src: string): number | null {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/٫/g, ".").replace(/\s+/g, "");
  if (!s) return null;
  let i = 0;
  const peek = () => s[i];
  function num(): number {
    if (peek() === "(") { i++; const v = expr(); if (peek() !== ")") throw 0; i++; return pct(v); }
    if (peek() === "-") { i++; return -num(); }
    if (peek() === "+") { i++; return num(); }
    const m = /^\d*\.?\d+(e[+-]?\d+)?|^\d+\./i.exec(s.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    return pct(parseFloat(m[0]));
  }
  function pct(v: number) { if (peek() === "%") { i++; return v / 100; } return v; }
  function term(): number {
    let v = num();
    while (peek() === "*" || peek() === "/") { const op = s[i++]; const r = num(); v = op === "*" ? v * r : v / r; }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = s[i++]; const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  try {
    const v = expr();
    if (i !== s.length || !isFinite(v)) return null;
    return Math.round(v * 1e6) / 1e6;
  } catch { return null; }
}

const hasOp = (v: string) => /[*/×÷()%]|\d\s*[+-]/.test(v);

/**
 * Lets every numeric input in the app accept expressions (9.75*24): number inputs become text
 * inputs with a decimal keyboard; while an expression is typed React doesn't see it, and on
 * Enter/blur the result replaces it and is passed to React as a normal change.
 */
export function installCalcInputs() {
  if (typeof document === "undefined") return () => {};
  const convert = (root: ParentNode) => {
    root.querySelectorAll?.('input[type="number"]').forEach((el) => {
      const inp = el as HTMLInputElement;
      inp.type = "text";
      inp.inputMode = "decimal";
      inp.dataset["calc"] = "1";
      inp.autocomplete = "off";
    });
  };
  convert(document);
  const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n instanceof HTMLInputElement && n.type === "number") convert(n.parentNode ?? document);
    else if (n instanceof Element) convert(n);
  })));
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["type"] });

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  const commit = (inp: HTMLInputElement) => {
    if (!hasOp(inp.value)) return;
    const r = evalExpr(inp.value);
    if (r === null) return;
    setter.call(inp, String(r));
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const isCalc = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.dataset["calc"] === "1";
  const onInput = (e: Event) => { if (isCalc(e.target) && hasOp(e.target.value)) e.stopImmediatePropagation(); };
  const onKey = (e: KeyboardEvent) => { if (isCalc(e.target) && (e.key === "Enter" || e.key === "=")) { if (hasOp(e.target.value)) { if (e.key === "=") e.preventDefault(); commit(e.target); } } };
  const onBlur = (e: FocusEvent) => { if (isCalc(e.target)) commit(e.target); };
  document.addEventListener("input", onInput, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("blur", onBlur, true);
  return () => {
    mo.disconnect();
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("blur", onBlur, true);
  };
}
