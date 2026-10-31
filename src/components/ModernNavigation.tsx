import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppWindow, BookOpen, ChevronDown, PanelLeftClose, PanelLeftOpen, RefreshCw, Settings, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useBranding, useSystemBrand } from "@/lib/branding";
import { openWindow } from "@/components/WindowManager";
import defaultMark from "@/assets/yousef-soft-mark.png.asset.json";

type Item = { to: string; label: string; icon: LucideIcon };
type Group = { id: string; label: string; icon: LucideIcon; list: Item[] };
type SubLink = { label: string; to: string; search?: Record<string, string> };
type Section = { label: string; icon: LucideIcon; items: SubLink[] };
type Mode = "windows" | "single" | "hybrid";

const hrefOf = (to: string, search?: Record<string, string>) => {
  const qs = new URLSearchParams(search ?? {}).toString();
  return to + (qs ? `?${qs}` : "");
};

export function ModernNavigation({ navMode = "single", settingsSections = [], subActions = {}, groups, home, onRefresh, pathname, company, superAdmin }: { navMode?: Mode; settingsSections?: Section[]; subActions?: Record<string, { label: string; to: string; search?: Record<string, string> }[]>; groups: Group[]; home?: Item | undefined; onRefresh?: () => void; pathname: string; company: string; superAdmin: boolean }) {
  const { t, lang } = useI18n();
  const bd = useBranding().data;
  const logo = bd?.white_label === false ? null : bd?.logo_url;
  const sys = useSystemBrand().data;
  const sysName = (lang === "en" ? sys?.system_name_en || t("يوسف سوفت") : sys?.system_name) || t("يوسف سوفت");
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const active = (to: string) => pathname === to || pathname.startsWith(to + "/");
  const winBtn = (href: string, label: string) => navMode === "hybrid" && !compact && (
    <button type="button" title={t("فتح بنافذة جديدة")} aria-label={`${t("فتح بنافذة جديدة")}: ${t(label)}`} onClick={() => openWindow(href, t(label))}
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-60 transition hover:bg-accent hover:text-foreground hover:opacity-100">
      <AppWindow className="size-3.5" />
    </button>
  );
  const onLink = (href: string, label: string) => (e: React.MouseEvent) => {
    if (navMode === "windows" && window.innerWidth >= 768) { e.preventDefault(); openWindow(href, t(label)); }
  };
  const link = (item: Item) => (
    <div key={item.to} className="group/nav flex items-center gap-1">
      <Button asChild variant="ghost" className={cn("modern-nav-link h-auto min-h-10 min-w-0 flex-1 justify-start gap-3 whitespace-normal px-3 py-2 text-start", active(item.to) && "modern-nav-active")}>
        <Link to={item.to} aria-current={active(item.to) ? "page" : undefined} title={compact ? t(item.label) : undefined} onClick={onLink(item.to, item.label)}>
          <item.icon className="size-4 shrink-0" />{!compact && <span className="min-w-0">{t(item.label)}</span>}
        </Link>
      </Button>
      {winBtn(item.to, item.label)}
    </div>
  );
  const subBranch = (item: Item) => {
    const k = "sub:" + item.to;
    const open = !!expanded[k];
    return <div key={item.to}>
      <div className="flex items-center gap-1">
        <Button variant="ghost" aria-expanded={open} onClick={() => setExpanded((s) => ({ ...s, [k]: !open }))}
          className={cn("modern-nav-link h-auto min-h-10 min-w-0 flex-1 justify-start gap-3 whitespace-normal px-3 py-2 text-start", active(item.to) && "modern-nav-active")}>
          <item.icon className="size-4 shrink-0" /><span className="min-w-0 flex-1">{t(item.label)}</span><ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {open && <div className="ms-3 mt-1 space-y-0.5 border-s ps-2">
        {[{ label: item.label, to: item.to, search: undefined as Record<string, string> | undefined }, ...(subActions[item.to] ?? [])].map((s, idx) => {
          const href = hrefOf(s.to, s.search);
          return <div key={s.label + idx} className="flex items-center gap-1">
            <Link to={s.to} search={s.search as never} onClick={onLink(href, s.label)} className={cn("min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-foreground", idx === 0 ? "font-medium" : "text-muted-foreground")}>{t(s.label)}</Link>
            {winBtn(href, s.label)}
          </div>;
        })}
      </div>}
    </div>;
  };
  const settingsBranch = (item: Item, direct = false) => {
    const k = "settings";
    const open = expanded[k] ?? active(item.to);
    return <div key={item.to}>
      {!direct && <div className="flex items-center gap-1">
        <Button variant="ghost" aria-expanded={open} onClick={() => { if (compact) setCompact(false); setExpanded((s) => ({ ...s, [k]: !open })); }}
          className={cn("modern-nav-link h-auto min-h-10 min-w-0 flex-1 justify-start gap-3 whitespace-normal px-3 py-2 text-start", active(item.to) && "modern-nav-active")}>
          <item.icon className="size-4 shrink-0" />{!compact && <><span className="min-w-0 flex-1">{t(item.label)}</span><ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} /></>}
        </Button>
      </div>}
      {(direct || open) && !compact && <div className={cn("space-y-1", !direct && "ms-3 mt-1 border-s ps-2")}>
        {settingsSections.map((sec) => {
          const sk = "set:" + sec.label;
          const so = !!expanded[sk];
          return <div key={sec.label}>
            <button type="button" aria-expanded={so} onClick={() => setExpanded((s) => ({ ...s, [sk]: !so }))}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm font-semibold hover:bg-accent">
              <sec.icon className="size-3.5 opacity-70" /><span className="flex-1">{t(sec.label)}</span><ChevronDown className={cn("size-3 transition-transform", so && "rotate-180")} />
            </button>
            {so && <div className="ms-3 space-y-0.5 border-s ps-2">{sec.items.map((s) => {
              const href = hrefOf(s.to, s.search);
              return <div key={s.label} className="flex items-center gap-1">
                <Link to={s.to} search={s.search as never} onClick={onLink(href, s.label)} className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">{t(s.label)}</Link>
                {winBtn(href, s.label)}
              </div>;
            })}</div>}
          </div>;
        })}
      </div>}
    </div>;
  };
  return (
    <aside className={cn("modern-sidebar no-print sticky top-0 hidden h-screen shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground md:flex", compact ? "w-20" : "w-64")} aria-label={t("القائمة")}>
      <div className="flex min-h-20 items-center gap-3 border-b border-sidebar-border px-4">
        <img src={logo || sys?.mark_url || sys?.logo_url || defaultMark.url} alt={sysName} className="size-11 shrink-0 object-contain" />
        {!compact && <div className="min-w-0">{logo ? <span className="block truncate font-semibold" title={company}>{company}</span> : <><span className="block font-semibold">{sysName}</span><span className="block truncate text-xs text-muted-foreground" title={company}>{company}</span></>}</div>}
      </div>
      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {home && <div className="flex items-center gap-1">
          <Button asChild variant="ghost" className={cn("modern-nav-link h-auto min-h-10 min-w-0 flex-1 justify-start gap-3 whitespace-normal px-3 py-2 text-start", active(home.to) && "modern-nav-active")}>
            <Link to={home.to} aria-current={active(home.to) ? "page" : undefined} title={compact ? t(home.label) : undefined} onClick={onLink(home.to, home.label)}>
              <home.icon className="size-4 shrink-0" />{!compact && <span className="min-w-0">{t(home.label)}</span>}
            </Link>
          </Button>
          {winBtn(home.to, home.label)}
          {onRefresh && <button type="button" title={t("تحديث البيانات")} aria-label={t("تحديث البيانات")} onClick={onRefresh}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-70 transition hover:bg-accent hover:text-foreground hover:opacity-100">
            <RefreshCw className="size-3.5" />
          </button>}
        </div>}
        {groups.map((g) => {
          const isOpen = expanded[g.id] ?? g.list.some((i) => active(i.to));
          return <div key={g.id}>
            <Button variant="ghost" className="h-auto min-h-10 w-full justify-start gap-3 whitespace-normal bg-primary/10 px-3 py-2 text-start text-[15px] font-bold text-primary hover:bg-primary/15" title={compact ? t(g.label) : undefined} aria-expanded={compact || isOpen} onClick={() => { if (compact) setCompact(false); setExpanded((s) => ({ ...s, [g.id]: !isOpen })); }}>
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><g.icon className="size-4" /></span>{!compact && <><span className="min-w-0 flex-1">{t(g.label)}</span><ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} /></>}
            </Button>
            {(compact || isOpen) && <div className={cn("mt-1 space-y-1", !compact && "ms-4 border-s-2 border-primary/30 ps-2")}>{g.list.map((i) => i.to === "/settings" && settingsSections.length ? settingsBranch(i, g.id === "admin") : subActions[i.to] && !compact ? subBranch(i) : link(i))}</div>}
          </div>;
        })}
      </nav>
      <div className="space-y-1 border-t border-sidebar-border p-3">
        {!superAdmin && <>{link({ to: "/shortcuts", label: "اختصارات لوحة المفاتيح", icon: Settings })}{link({ to: "/manual", label: "دليل المستخدم", icon: BookOpen })}</>}
        <Button variant="ghost" size="icon" className="w-full" title={compact ? t("توسيع القائمة") : t("تصغير القائمة")} aria-label={compact ? t("توسيع القائمة") : t("تصغير القائمة")} onClick={() => setCompact(!compact)}>{compact ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
      </div>
    </aside>
  );
}
