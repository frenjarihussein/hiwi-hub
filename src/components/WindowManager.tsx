import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Minus, Square, Copy, X, AppWindow } from "lucide-react";

type Win = { id: number; url: string; title: string; x: number; y: number; w: number; h: number; min: boolean; max: boolean; z: number };

let wins: Win[] = [];
let seq = 1;
let topZ = 50;
const subs = new Set<() => void>();
const emit = () => { wins = [...wins]; subs.forEach((f) => f()); };
const update = (id: number, p: Partial<Win>) => { wins = wins.map((w) => (w.id === id ? { ...w, ...p } : w)); subs.forEach((f) => f()); };

export type NavMode = "windows" | "single" | "hybrid";
let navMode: NavMode = "single";
/** Current user's page-opening system; phones always behave as single-page. */
export function setNavMode(m: NavMode) { navMode = m; }
export function getNavMode(): NavMode {
  return typeof window !== "undefined" && window.innerWidth < 768 ? "single" : navMode;
}

export function isEmbedded() {
  try { return typeof window !== "undefined" && window.self !== window.top; } catch { return true; }
}

/** Opens a page inside an in-app window that can be moved, minimized and maximized. */
export function openWindow(url: string, title: string) {
  // No in-app windows on phones: open the page in place instead.
  if (window.innerWidth < 768) { window.location.assign(url); return; }
  const n = wins.length;
  wins.push({ id: seq++, url, title, x: 60 + n * 30, y: 70 + n * 30, w: Math.min(1000, window.innerWidth - 80), h: Math.min(650, window.innerHeight - 120), min: false, max: false, z: ++topZ });
  emit();
}

/** Closes the top-most visible in-app window (Alt+W). */
export function closeTopWindow() {
  const top = wins.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0];
  if (top) { wins = wins.filter((x) => x.id !== top.id); emit(); }
}

const focus = (id: number) => update(id, { z: ++topZ, min: false });

export function WindowManager() {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => wins, () => wins);
  const minimized = list.filter((w) => w.min);
  return (
    <>
      {list.map((w) => <WindowFrame key={w.id} w={w} />)}
      {minimized.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[9999] flex gap-1 overflow-x-auto border-t bg-card/95 p-1.5 shadow-pop backdrop-blur">
          {minimized.map((w) => (
            <button key={w.id} onClick={() => focus(w.id)} className="flex max-w-52 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-accent">
              <AppWindow className="size-3.5" /><span className="truncate">{w.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function WindowFrame({ w }: { w: Win }) {
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; mode: "move" | "size" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(w.title);
  const ifr = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const t = setInterval(() => { try { const d = ifr.current?.contentDocument?.title; if (d) setTitle(d); } catch { /* cross-origin */ } }, 1500);
    return () => clearInterval(t);
  }, []);

  function start(e: React.PointerEvent, mode: "move" | "size") {
    if (w.max) return;
    e.preventDefault();
    drag.current = { sx: e.clientX, sy: e.clientY, x: mode === "move" ? w.x : w.w, y: mode === "move" ? w.y : w.h, mode };
    setBusy(true);
    const mv = (ev: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
      if (d.mode === "move") update(w.id, { x: Math.max(-w.w + 120, Math.min(window.innerWidth - 120, d.x + dx)), y: Math.max(0, Math.min(window.innerHeight - 40, d.y + dy)) });
      else update(w.id, { w: Math.max(320, d.x + dx), h: Math.max(200, d.y + dy) });
    };
    const up = () => { drag.current = null; setBusy(false); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  const style = w.max ? { inset: 0, zIndex: w.z } : { left: w.x, top: w.y, width: w.w, height: w.h, zIndex: w.z };
  return (
    <div dir="rtl" style={style} onPointerDown={() => focus(w.id)}
      className={`fixed flex flex-col overflow-hidden border bg-card shadow-pop ${w.max ? "" : "rounded-lg"} ${w.min ? "hidden" : ""}`}>
      <div onPointerDown={(e) => start(e, "move")} onDoubleClick={() => update(w.id, { max: !w.max })}
        className="flex h-9 shrink-0 cursor-move select-none items-center gap-2 border-b bg-muted px-2">
        <AppWindow className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <div className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
          <button title="تصغير" onClick={() => update(w.id, { min: true })} className="grid size-7 place-items-center rounded hover:bg-accent"><Minus className="size-3.5" /></button>
          <button title={w.max ? "استعادة" : "تكبير"} onClick={() => update(w.id, { max: !w.max })} className="grid size-7 place-items-center rounded hover:bg-accent">
            {w.max ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
          </button>
          <button title="إغلاق" onClick={() => { wins = wins.filter((x) => x.id !== w.id); emit(); }} className="grid size-7 place-items-center rounded hover:bg-destructive hover:text-destructive-foreground"><X className="size-4" /></button>
        </div>
      </div>
      <iframe ref={ifr} src={w.url} title={title} className={`min-h-0 w-full flex-1 bg-background ${busy ? "pointer-events-none" : ""}`} />
      {!w.max && <div onPointerDown={(e) => start(e, "size")} className="absolute bottom-0 right-0 size-4 cursor-nwse-resize" style={{ cursor: "se-resize" }} />}
    </div>
  );
}
