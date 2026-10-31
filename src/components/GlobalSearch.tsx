import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Package, Search, Users } from "lucide-react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { NavItem } from "@/components/AppShell";

export function GlobalSearch({ nav, compact }: { nav: NavItem[]; compact?: boolean }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: me } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (compact) return; // only one instance owns Ctrl+K
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact]);

  const term = q.trim();
  const res = useQuery({
    queryKey: ["global-search", me?.tenantId, term],
    enabled: open && !!me?.tenantId && term.length >= 1,
    queryFn: async () => {
      const like = `%${term}%`;
      const num = Number(term);
      const [p, pa, d] = await Promise.all([
        scope(db.from("products").select("id,name,sku"), me?.tenantId).or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`).limit(6),
        scope(db.from("partners").select("id,name"), me?.tenantId).ilike("name", like).limit(6),
        Number.isFinite(num) && num > 0
          ? scope(db.from("documents").select("id,doc_no,doc_type"), me?.tenantId).eq("doc_no", num).limit(6)
          : scope(db.from("documents").select("id,doc_no,doc_type"), me?.tenantId).ilike("notes", like).limit(6),
      ]);
      return { products: p.data ?? [], partners: pa.data ?? [], docs: d.data ?? [] };
    },
  });

  function go(fn: () => void) {
    setOpen(false);
    setQ("");
    fn();
  }

  const pages = nav.filter((n) => !term || t(n.label).toLowerCase().includes(term.toLowerCase()) || n.label.includes(term) || n.to.includes(term.toLowerCase()));

  return (
    <>
      {compact ? (
        <Button type="button" onClick={() => setOpen(true)} aria-label={t("بحث")} title={t("بحث")}
          className="grid size-9 shrink-0 place-items-center rounded-md border bg-card transition hover:bg-accent md:hidden">
          <Search className="size-4" />
        </Button>
      ) : (
      <Button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground shadow-xs transition hover:border-foreground/20"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">{t("ابحث عن فاتورة، عميل، مادة...")}</span>
        <kbd className="ms-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline" dir="ltr">Ctrl K</kbd>
      </Button>
      )}
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput placeholder={t("اكتب للبحث...")} value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{t(!term ? "اكتب للبحث" : res.isFetching ? "جارٍ البحث..." : "لا توجد نتائج")}</CommandEmpty>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(res.data?.docs ?? []).length > 0 && (
            <CommandGroup heading={t("المستندات")}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(res.data?.docs ?? []).map((d: any) => (
                <CommandItem key={d.id} value={"d" + d.id} onSelect={() => go(() => navigate({ to: "/documents" }))}>
                  <FileText className="size-4" />{lang === "en" ? "Document no." : "مستند رقم"} <span className="num">{d.doc_no}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(res.data?.partners ?? []).length > 0 && (
            <CommandGroup heading={t("الزبائن والموردون")}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(res.data?.partners ?? []).map((p: any) => (
                <CommandItem key={p.id} value={"p" + p.id} onSelect={() => go(() => navigate({ to: "/statement/$partnerId", params: { partnerId: p.id } }))}>
                  <Users className="size-4" />{p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(res.data?.products ?? []).length > 0 && (
            <CommandGroup heading={t("المواد")}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(res.data?.products ?? []).map((p: any) => (
                <CommandItem key={p.id} value={"m" + p.id} onSelect={() => go(() => navigate({ to: "/products" }))}>
                  <Package className="size-4" />{p.name}<span className="ms-auto text-xs text-muted-foreground">{p.sku}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {pages.length > 0 && (
            <CommandGroup heading={t("الصفحات")}>
              {pages.slice(0, 8).map((n) => (
                <CommandItem key={n.to} value={n.to} onSelect={() => go(() => navigate({ to: n.to }))}>
                  <n.icon className="size-4" />{t(n.label)}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
