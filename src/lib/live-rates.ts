/** Converts sp-today SYP-per-unit prices into "units per 1 base" rates. */
export function convertLiveRates(raw: Record<string, number>, base: string, codes: string[], newLira: boolean) {
  const syp: Record<string, number> = { ...raw, SYP: 1 };
  if (newLira) Object.keys(syp).forEach((k) => { if (k !== "SYP") syp[k] = syp[k]! / 100; });
  const b = syp[base];
  const rates: Record<string, number> = {};
  const missing: string[] = [];
  if (!b) return { rates, missing: codes, baseMissing: true };
  codes.forEach((c) => {
    const x = syp[c];
    if (x) rates[c] = Math.round((b / x) * 1e6) / 1e6;
    else missing.push(c);
  });
  return { rates, missing, baseMissing: false };
}

const KEY = (t: string) => `fx-auto-fetch:${t}`;
export type AutoFetchPref = { on: boolean; newLira: boolean };
export function readAutoFetch(tenantId: string): AutoFetchPref {
  try { return { on: false, newLira: true, ...JSON.parse(localStorage.getItem(KEY(tenantId)) || "{}") }; } catch { return { on: false, newLira: true }; }
}
export function writeAutoFetch(tenantId: string, p: AutoFetchPref) { localStorage.setItem(KEY(tenantId), JSON.stringify(p)); }
