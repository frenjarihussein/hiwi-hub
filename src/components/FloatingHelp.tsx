import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bot, LifeBuoy, MessagesSquare, X, BookOpen, Keyboard, Calculator, NotebookPen, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Opt = { label: string; desc: string; icon: typeof Bot; to?: string; event?: string; manual?: boolean };
const OPTIONS: Opt[] = [
  { event: "open-calc", label: "الآلة الحاسبة", desc: "F9", icon: Calculator },
  { event: "open-notes", label: "الملاحظات والمهام", desc: "F8", icon: NotebookPen },
  { to: "/support", label: "الدعم الفني", desc: "تواصل مع فريق الدعم", icon: LifeBuoy },
  { to: "/assistant", label: "المساعد الذكي", desc: "اسأل الذكاء الاصطناعي", icon: Bot },
  { to: "/chat", label: "الزملاء في الشركة", desc: "محادثات فريق العمل", icon: MessagesSquare },
  { to: "/shortcuts", label: "اختصارات لوحة المفاتيح", desc: "", icon: Keyboard, manual: true },
  { to: "/manual", label: "دليل المستخدم", desc: "", icon: BookOpen, manual: true },
];

/** One small, low-profile button that expands all floating tools on demand. */
export function FloatingHelp({ showManual = true }: { showManual?: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="no-print fixed bottom-3 end-3 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border bg-card p-1.5 shadow-xl">
          {OPTIONS.filter((o) => showManual || !o.manual).map((o) => (
            <button
              key={o.label}
              onClick={() => {
                setOpen(false);
                if (o.event) window.dispatchEvent(new Event(o.event));
                else if (o.to) navigate({ to: o.to });
              }}
              className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-start transition hover:bg-accent"
            >
              <o.icon className="size-4 text-primary" />
              <span className="text-sm">{t(o.label)}</span>
              {o.desc && <span className="ms-auto ps-3 text-xs text-muted-foreground">{t(o.desc)}</span>}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("التواصل والمساعدة")}
        title={t("الأدوات والمساعدة")}
        className="grid size-8 place-items-center rounded-full border bg-card/80 text-muted-foreground opacity-60 shadow transition hover:opacity-100"
      >
        {open ? <X className="size-4" /> : <MoreHorizontal className="size-4" />}
      </button>
    </div>
  );
}
