const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
type Bucket = { count: number; r: number; g: number; b: number };
/** Keep distinct representative logo colours, including neutral colours. */
export function extractLogoPalette(pixels: ArrayLike<number>): string[] {
  const buckets = new Map<string, Bucket>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i] ?? 0, g = pixels[i + 1] ?? 0, b = pixels[i + 2] ?? 0, a = pixels[i + 3] ?? 0;
    if (a < 128) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count++; entry.r += r; entry.g += g; entry.b += b;
    buckets.set(key, entry);
  }
  const representatives: number[][] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.count - a.count)) {
    const rgb = [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count];
    if (representatives.some((other) => Math.hypot(...rgb.map((n, i) => n - (other[i] ?? 0))) < 55)) continue;
    representatives.push(rgb);
    if (representatives.length === 12) break;
  }
  // Prefer coloured ink over a white/background area for the primary role.
  return representatives.sort((a, b) => (Math.max(...b) - Math.min(...b)) - (Math.max(...a) - Math.min(...a)))
    .map(([r = 0, g = 0, b = 0]) => `#${hex(r)}${hex(g)}${hex(b)}`);
}

export function contrastRatio(a: string, b: string) {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const brandForeground = (color: string) => contrastRatio(color, "#ffffff") >= contrastRatio(color, "#111111") ? "#ffffff" : "#111111";

/** Semantic roles are derived centrally; danger/success/warning meanings stay unchanged. */
export function brandTheme(primary: string | null | undefined, palette: string[], dark = false): Record<string, string> {
  const valid = [...new Set([primary, ...palette].filter((color): color is string => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)))];
  const first = valid[0];
  if (!first) return {};
  const second = valid[1] ?? first, third = valid[2] ?? second;
  const base = dark ? "#181818" : "#ffffff";
  const text = dark ? "#f5f5f5" : "#202020";
  const tint = (color: string, amount: number) => `color-mix(in srgb, ${color} ${amount}%, ${base})`;
  const vars: Record<string, string> = {
    "--primary": first, "--primary-foreground": brandForeground(first), "--ring": first,
    "--sidebar-primary": first, "--sidebar-primary-foreground": brandForeground(first), "--sidebar-ring": first,
    "--secondary": tint(second, dark ? 24 : 14), "--secondary-foreground": text,
    "--accent": tint(third, dark ? 26 : 16), "--accent-foreground": text,
    "--highlight": second, "--highlight-foreground": brandForeground(second),
    "--sidebar-accent": tint(third, dark ? 26 : 14), "--sidebar-accent-foreground": text,
    "--background": tint(first, dark ? 8 : 3), "--sidebar": tint(second, dark ? 9 : 5),
    "--muted": tint(second, dark ? 12 : 7), "--border": tint(third, dark ? 28 : 18), "--input": tint(third, dark ? 32 : 20),
    "--workspace-stripe": tint(second, dark ? 6 : 3),
  };
  valid.forEach((color, i) => { vars[`--brand-palette-${i + 1}`] = color; });
  for (let i = 0; i < 5; i++) vars[`--chart-${i + 1}`] = valid[i % valid.length] ?? first;
  return vars;
}