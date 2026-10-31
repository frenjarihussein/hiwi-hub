import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { brandTheme, extractLogoPalette } from "./brand-palette";

export function useBranding() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["branding", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      if (!me?.tenantId) return { logo_url: null, primary_color: null };
      const { data } = await db
        .from("tenant_settings")
        .select("logo_url, primary_color, theme_colors, white_label, tax_number, print_template, print_footer, tax_settings, letterhead")
        .eq("tenant_id", me.tenantId)
        .maybeSingle();
      return (data ?? { logo_url: null, primary_color: null }) as { logo_url: string | null; primary_color: string | null; theme_colors?: string[] | null; white_label?: boolean | null; tax_number?: string | null; print_template?: string | null; print_footer?: string | null; tax_settings?: any };
    },
  });
}

/** Derive the entire palette from the persisted logo; no extra storage or permission path. */
export function useApplyBrandColor(color: string | null | undefined, logo?: string | null, saved?: string[] | null) {
  useEffect(() => {
    const root = document.documentElement;
    let disposed = false;
    let palette: string[] = [];
    const applied = new Set<string>();
    const apply = () => {
      if (disposed) return;
      const theme = brandTheme(color, palette, root.classList.contains("dark"));
      for (const key of applied) root.style.removeProperty(key);
      applied.clear();
      for (const [key, value] of Object.entries(theme)) { root.style.setProperty(key, value); applied.add(key); }
    };
    const chosen = Array.isArray(saved) ? saved.filter((c) => typeof c === "string") : [];
    if (chosen.length >= 2) palette = chosen;
    apply();
    if (logo && chosen.length < 2) void readLogo(logo).then((result) => { palette = result.colors; apply(); }).catch(() => {});
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => { disposed = true; observer.disconnect(); for (const key of applied) root.style.removeProperty(key); };
  }, [color, logo, (saved ?? []).join(",")]);
}

/** Reads an image file, shrinks it, and returns a data URL plus suggested colours taken from it. */
export async function processLogo(file: File): Promise<{ dataUrl: string; colors: string[] }> {
  const src = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  return readLogo(src);
}

async function readLogo(src: string): Promise<{ dataUrl: string; colors: string[] }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const scale = Math.min(1, 256 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("تعذّر قراءة الصورة");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/png");
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const colors = extractLogoPalette(data);
  return { dataUrl, colors };
}

const BRAND_KEY = "ys_login_brand";
export type LoginBrand = { logo: string; name: string | null };

/** Remembers the company's own logo/name on this device so the sign-in screen shows it instead of Yousef Soft. */
export function useRememberBrand(logo: string | null | undefined, name: string | null | undefined) {
  useEffect(() => {
    if (logo === undefined) return;
    try {
      if (logo) localStorage.setItem(BRAND_KEY, JSON.stringify({ logo, name: name ?? null }));
      else localStorage.removeItem(BRAND_KEY);
    } catch { /* storage full or blocked */ }
  }, [logo, name]);
}

export function readLoginBrand(): LoginBrand | null {
  try {
    const v = JSON.parse(localStorage.getItem(BRAND_KEY) ?? "null");
    return v && typeof v.logo === "string" ? v : null;
  } catch { return null; }
}

export type SystemBrand = { system_name: string | null; system_name_en: string | null; logo_url: string | null; mark_url: string | null };

/** System-wide name/logo set by the system owner; replaces the default Yousef Soft identity everywhere. */
export function useSystemBrand() {
  return useQuery({
    queryKey: ["system_branding"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (db.from("system_branding" as never) as any).select("system_name,system_name_en,logo_url,mark_url").maybeSingle();
      return (data ?? null) as SystemBrand | null;
    },
  });
}

const DEFAULT_NAME = "يوسف سوفت";

/** Replaces the default product name in the browser tab title with the system owner's chosen name. */
export function useSystemTitle(name: string | null | undefined) {
  useEffect(() => {
    if (!name || name === DEFAULT_NAME || typeof document === "undefined") return;
    const apply = () => {
      if (document.title.includes(DEFAULT_NAME)) document.title = document.title.split(DEFAULT_NAME).join(name);
    };
    apply();
    const el = document.querySelector("title");
    if (!el) return;
    const obs = new MutationObserver(apply);
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    return () => obs.disconnect();
  }, [name]);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement("link"); el.rel = rel; document.head.appendChild(el); }
  el.href = href;
}

/** Shows the company's own logo/name as browser icon, tab title, install manifest and theme colour. */
export function useAppIdentity(tenantId: string | null | undefined, name: string | null | undefined, logo: string | null | undefined, color: string | null | undefined) {
  useEffect(() => {
    if (!tenantId || !logo) return;
    const prev = { icon: document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href, apple: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href, manifest: document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href };
    setLink("icon", logo);
    setLink("apple-touch-icon", `/api/public/brand/${tenantId}.png`);
    setLink("manifest", `/api/public/brand/${tenantId}.webmanifest`);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const oldColor = meta?.content;
    if (meta && color) meta.content = color;
    let appTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (!appTitle) { appTitle = document.createElement("meta"); appTitle.name = "apple-mobile-web-app-title"; document.head.appendChild(appTitle); }
    if (name) appTitle.content = name;
    const applyTitle = () => { if (name && document.title.includes(DEFAULT_NAME)) document.title = document.title.split(DEFAULT_NAME).join(name); };
    applyTitle();
    const t = document.querySelector("title");
    const obs = t ? new MutationObserver(applyTitle) : null;
    if (t) obs!.observe(t, { childList: true, characterData: true, subtree: true });
    return () => {
      obs?.disconnect();
      if (prev.icon) setLink("icon", prev.icon);
      if (prev.apple) setLink("apple-touch-icon", prev.apple);
      if (prev.manifest) setLink("manifest", prev.manifest);
      if (meta && oldColor) meta.content = oldColor;
    };
  }, [tenantId, name, logo, color]);
}
