import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/lib/session";
import { useExtra, useSaveExtra } from "@/lib/prefs";
import { SHORTCUT_ACTIONS, effectiveCombos, eventCombo, shortcutsEnabled } from "@/lib/shortcuts";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/shortcuts")({
  component: ShortcutsPage,
  head: () => ({
    meta: [
      { title: "اختصارات لوحة المفاتيح | يوسف سوفت" },
      { name: "description", content: "عرض وتخصيص اختصارات لوحة المفاتيح لفتح العمليات والأدلة والكشوف مباشرة" },
      { property: "og:title", content: "اختصارات لوحة المفاتيح | يوسف سوفت" },
      { property: "og:description", content: "تخصيص اختصارات لوحة المفاتيح" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ShortcutsPage() {
  const { t, lang } = useI18n();
  const { data: me } = useMe();
  const extra = useExtra(me);
  const save = useSaveExtra(me);
  const combos = effectiveCombos(extra.data);
  const enabled = shortcutsEnabled(extra.data);
  const [recording, setRecording] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(null);
      const c = eventCombo(e);
      if (!c) return;
      const clash = SHORTCUT_ACTIONS.find((a) => a.id !== recording && combos[a.id] === c);
      if (clash) { toast.error(lang === "en" ? `Shortcut ${c} is already assigned to “${t(clash.label)}”.` : `الاختصار ${c} مستخدم في «${clash.label}»`); return; }
      const map = { ...(extra.data?.shortcuts?.map ?? {}), [recording]: c };
      save.mutate({ shortcuts: { ...extra.data?.shortcuts, map } });
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, combos, extra.data, save, lang, t]);

  const setCombo = (id: string, c: string) => {
    const map = { ...(extra.data?.shortcuts?.map ?? {}), [id]: c };
    save.mutate({ shortcuts: { ...extra.data?.shortcuts, map } });
  };
  const groups = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))];

  return (
    <div>
      <PageHeader title={t("اختصارات لوحة المفاتيح")} />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <Switch checked={enabled} onCheckedChange={(v) => save.mutate({ shortcuts: { ...extra.data?.shortcuts, enabled: v } })} />
        <span className="text-sm">{t("تفعيل الاختصارات")}</span>
        <Button variant="outline" size="sm" className="ms-auto" onClick={() => save.mutate({ shortcuts: { ...extra.data?.shortcuts, map: {} } })}>{t("استعادة الافتراضي")}</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g} className="rounded-lg border bg-card">
            <h3 className="border-b px-4 py-2 font-semibold">{t(g)}</h3>
            <table className="w-full text-sm">
              <tbody>
                {SHORTCUT_ACTIONS.filter((a) => a.group === g).map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{t(a.label)}</td>
                    <td className="w-36 px-2 py-2" dir="ltr">
                      {recording === a.id ? <span className="text-xs text-primary">{lang === "en" ? "Press keys… (Esc to cancel)" : "اضغط المفاتيح… (Esc للإلغاء)"}</span>
                        : combos[a.id] ? <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">{combos[a.id]}</kbd>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="w-40 px-2 py-2 text-left">
                      <Button size="sm" variant="ghost" onClick={() => setRecording(a.id)}>{t("تغيير")}</Button>
                      {combos[a.id] && <Button size="sm" variant="ghost" onClick={() => setCombo(a.id, "")}>{t("إزالة")}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
