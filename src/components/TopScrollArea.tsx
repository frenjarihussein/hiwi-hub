import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TopScrollArea({ children, className, contentClassName }: { children: ReactNode; className?: string; contentClassName?: string }) {
  const top = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = top.current, c = content.current, s = track.current;
    if (!t || !c || !s) return;
    const size = () => { s.style.width = `${c.scrollWidth}px`; t.hidden = c.scrollWidth <= c.clientWidth; };
    const fromTop = () => { c.scrollLeft = t.scrollLeft; };
    const fromContent = () => { t.scrollLeft = c.scrollLeft; };
    const observer = new ResizeObserver(size);
    observer.observe(c);
    if (c.firstElementChild) observer.observe(c.firstElementChild);
    t.addEventListener("scroll", fromTop); c.addEventListener("scroll", fromContent); size();
    return () => { observer.disconnect(); t.removeEventListener("scroll", fromTop); c.removeEventListener("scroll", fromContent); };
  }, []);
  return <div className={cn("min-w-0", className)}>
    <div ref={top} role="region" aria-label="التمرير الأفقي أعلى الجدول" className="no-print shrink-0 overflow-x-auto"><div ref={track} className="h-3" /></div>
    <div ref={content} className={cn("overflow-x-auto [&::-webkit-scrollbar:horizontal]:hidden", contentClassName)}>{children}</div>
  </div>;
}