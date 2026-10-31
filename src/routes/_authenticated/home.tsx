import { createFileRoute } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMe } from "@/lib/session";
import { DesktopHome } from "@/components/DesktopHome";

function Home() {
  const mobile = useIsMobile();
  const me = useMe().data;
  // Phones and project-only users keep the plain empty workspace.
  if (mobile || !me || me.accountKind === "projects_only") return <div className="min-h-[60vh]" aria-label="مساحة العمل" />;
  return <DesktopHome />;
}

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "مساحة العمل — يوسف سوفت" }, { name: "description", content: "ساعة وتقويم مهام ونبض اليوم وآخر العمليات" }, { property: "og:title", content: "مساحة العمل — يوسف سوفت" }, { property: "og:description", content: "ساعة وتقويم مهام ونبض اليوم وآخر العمليات" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Home,
});
