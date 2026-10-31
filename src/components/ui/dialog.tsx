"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Minus, Maximize2, X, AppWindow, Copy, Square, GripVertical } from "lucide-react";
import { useBlocker } from "@tanstack/react-router";
import { openWindow, closeTopWindow, getNavMode } from "@/components/WindowManager";
import { Button } from "@/components/ui/button";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { hideOthers } from "aria-hidden";

import { cn } from "@/lib/utils";

const MinimizedContext = React.createContext({ minimized: false, modal: true, setMinimized: (_value: boolean) => {} });
function Dialog({ children, modal = true, onOpenChange, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [minimized, setMinimized] = React.useState(false);
  React.useEffect(() => { if (props.open === false) setMinimized(false); }, [props.open]);
  return <MinimizedContext.Provider value={{ minimized, modal, setMinimized }}>
    <DialogPrimitive.Root {...props} modal={false} onOpenChange={(open) => { if (!open) setMinimized(false); onOpenChange?.(open); }}>{children}</DialogPrimitive.Root>
  </MinimizedContext.Provider>;
}

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

let lastRedirect = { href: "", at: 0 };
/** Last user-initiated navigation intent (menu click or shortcut) made outside any dialog. */
let navIntent = 0;
const closers: (() => void)[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("a[href]") && !t.closest("[role=dialog]")) navIntent = Date.now();
  }, true);
  window.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && (e.code === "KeyW" || e.key.toLowerCase() === "w")) {
      const top = closers[closers.length - 1];
      e.preventDefault();
      if (top) { e.stopImmediatePropagation(); top(); }
      else closeTopWindow();
      return;
    }
    if (e.altKey || e.ctrlKey) navIntent = Date.now();
  }, true);
}
/** Keeps open dialogs alive: menu/shortcut navigation opens the target in an in-app window instead of closing the dialog. */
function useKeepAliveWhileMinimized(active: boolean, open: boolean, onOpenBlocked: () => void) {
  useBlocker({
    disabled: !active && !open,
    withResolver: false,
    shouldBlockFn: ({ current, next }) => {
      if (current.pathname === next.pathname) return false;
      // Phones always use single-page navigation: never block or prompt.
      if (typeof window !== "undefined" && window.innerWidth < 768) return false;
      // Only the windows system turns menu navigation into in-app windows; single/hybrid navigate in place.
      if (getNavMode() !== "windows") return false;
      if (!active && Date.now() - navIntent > 1500) return false;
      const qs = new URLSearchParams(Object.entries((next.search ?? {}) as Record<string, unknown>).filter(([, v]) => v != null).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])).toString();
      const href = next.pathname + (qs ? `?${qs}` : "");
      const now = Date.now();
      if (lastRedirect.href !== href || now - lastRedirect.at > 800) {
        lastRedirect = { href, at: now };
        if (!active) onOpenBlocked();
        openWindow(href, href);
      }
      return true;
    },
  });
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, ...props }, ref) => {
  const { minimized, modal, setMinimized } = React.useContext(MinimizedContext);
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const [compact, setCompact] = React.useState(false);
  const [title, setTitle] = React.useState("نافذة");
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);
  const drag = React.useRef<{ pointerId: number; sx: number; sy: number; x: number; y: number } | null>(null);
  const lastFocused = React.useRef<HTMLElement | null>(null);
  const fields = React.useRef<HTMLDivElement>(null);
  const restoreButton = React.useRef<HTMLButtonElement>(null);
  const closeButton = React.useRef<HTMLButtonElement>(null);
  useKeepAliveWhileMinimized(minimized, true, () => minimize());
  React.useEffect(() => {
    const fn = () => closeButton.current?.click();
    closers.push(fn);
    return () => { const i = closers.indexOf(fn); if (i >= 0) closers.splice(i, 1); };
  }, []);
  React.useEffect(() => {
    if (!element || minimized || !modal || compact) return;
    return hideOthers(element);
  }, [element, minimized, modal, compact]);
  React.useEffect(() => {
    if (!element) return;
    const frame = requestAnimationFrame(() => {
      if (minimized) restoreButton.current?.focus();
      else if (lastFocused.current?.isConnected && fields.current?.contains(lastFocused.current)) lastFocused.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [element, minimized]);
  React.useEffect(() => {
    if (!minimized || !element) return;
    const constrain = () => setPosition((p) => p ? {
      x: Math.max(0, Math.min(p.x, window.innerWidth - element.offsetWidth)),
      y: Math.max(0, Math.min(p.y, window.innerHeight - element.offsetHeight)),
    } : p);
    window.addEventListener("resize", constrain);
    return () => window.removeEventListener("resize", constrain);
  }, [minimized, element]);
  const contentRef = React.useCallback((node: HTMLDivElement | null) => {
    setElement(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  function minimize() {
    if (document.activeElement instanceof HTMLElement && fields.current?.contains(document.activeElement)) lastFocused.current = document.activeElement;
    const text = element?.querySelector("h2")?.textContent?.trim();
    setTitle(text || "نافذة");
    setMinimized(true);
  }
  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!element || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, sx: event.clientX, sy: event.clientY, x: rect.left, y: rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || !element || event.pointerId !== current.pointerId) return;
    setPosition({
      x: Math.max(0, Math.min(current.x + event.clientX - current.sx, window.innerWidth - element.offsetWidth)),
      y: Math.max(0, Math.min(current.y + event.clientY - current.sy, window.innerHeight - element.offsetHeight)),
    });
  }
  const [shift, setShift] = React.useState({ x: 0, y: 0 });
  const winDrag = React.useRef<{ id: number; sx: number; sy: number; x: number; y: number } | null>(null);
  function startWinDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    winDrag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: shift.x, y: shift.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveWinDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const d = winDrag.current;
    if (!d || e.pointerId !== d.id) return;
    const lx = window.innerWidth / 2 - 40, ly = window.innerHeight / 2 - 40;
    setShift({ x: Math.max(-lx, Math.min(lx, d.x + e.clientX - d.sx)), y: Math.max(-ly, Math.min(ly, d.y + e.clientY - d.sy)) });
  }
  const moved = !minimized && (shift.x !== 0 || shift.y !== 0);
  const trapped = modal && !minimized && !compact;
  return (
  <DialogPortal>
    {!minimized && !compact && modal && <div aria-hidden="true" className="fixed inset-0 z-40 bg-foreground/80" />}
    <DialogPrimitive.Content
      ref={contentRef}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid max-h-[92vh] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border bg-background p-6 pt-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className,
        !minimized && !compact && "max-sm:!inset-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!overflow-y-auto max-sm:!rounded-none max-sm:!p-4 max-sm:!pt-0",
        compact && !minimized && "!max-h-[60vh] !w-[min(36rem,95vw)] !max-w-[95vw] overflow-auto",
        minimized && "!h-auto !max-h-none !w-auto !max-w-[calc(100vw-1rem)] !translate-x-0 !translate-y-0 !overflow-visible !p-2 !animate-none !transition-none",
        minimized && !position && "!bottom-14 !left-auto !right-3 !top-auto",
        minimized && position && "!bottom-auto !right-auto",
      )}
      {...props}
      style={minimized && position ? { ...style, left: position.x, top: position.y } : moved ? { ...style, translate: `calc(-50% + ${shift.x}px) calc(-50% + ${shift.y}px)` } : style}
      onInteractOutside={(event) => { if (minimized || modal || compact) event.preventDefault(); else props.onInteractOutside?.(event); }}
      onEscapeKeyDown={(event) => { if (minimized) event.preventDefault(); else props.onEscapeKeyDown?.(event); }}
    >
      {minimized && (
        <div dir="rtl" className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" title="تحريك النافذة المصغرة" aria-label="تحريك النافذة المصغرة" className="shrink-0 cursor-grab touch-none active:cursor-grabbing" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}><GripVertical className="size-4" /></Button>
          <AppWindow className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="text-[10px] text-muted-foreground">نافذة مصغّرة</p>
          </div>
          <Button ref={restoreButton} type="button" variant="outline" size="sm" onClick={() => setMinimized(false)}><Maximize2 className="size-4" />استعادة</Button>
          <DialogPrimitive.Close asChild><Button type="button" variant="ghost" size="icon" title="إغلاق النافذة"><X className="size-4" /></Button></DialogPrimitive.Close>
        </div>
      )}
        <FocusScope asChild trapped={trapped} loop={trapped} onUnmountAutoFocus={(event) => event.preventDefault()}>
        <div ref={fields} className={minimized ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col gap-4"}>
          <div dir="ltr" className="sticky top-0 z-30 -mx-2 flex shrink-0 items-center justify-end gap-1 border-b bg-background/95 px-1 py-1 backdrop-blur">
            <Button type="button" variant="ghost" size="icon" className="hidden size-8 cursor-grab touch-none active:cursor-grabbing sm:inline-flex" tabIndex={-1} title="اسحب لتحريك النافذة (نقرتان للتوسيط)" aria-label="تحريك النافذة" onPointerDown={startWinDrag} onPointerMove={moveWinDrag} onPointerUp={() => { winDrag.current = null; }} onPointerCancel={() => { winDrag.current = null; }} onDoubleClick={() => setShift({ x: 0, y: 0 })}><GripVertical className="size-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="hidden size-8 sm:inline-flex" tabIndex={-1} title={compact ? "الحجم الكامل" : "تصغير حجم النافذة"} aria-label="تغيير حجم النافذة" onClick={() => setCompact((v) => !v)}>{compact ? <Square className="size-3.5" /> : <Copy className="size-3.5" />}</Button>
            <Button type="button" variant="ghost" size="icon" className="hidden size-8 sm:inline-flex" tabIndex={-1} title="تصغير النافذة" aria-label="تصغير النافذة" onClick={minimize}><Minus className="size-4" /></Button>
            <DialogPrimitive.Close asChild>
              <Button ref={closeButton} tabIndex={-1} type="button" variant="ghost" size="icon" className="size-8" title="إغلاق (Alt+W)" aria-label="إغلاق"><X className="size-4" /></Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </div>
        </FocusScope>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
