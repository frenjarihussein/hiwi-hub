import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, kindAllows } from "@/components/AppShell";
import { useMe, isProjectsOnlyTenant } from "@/lib/session";
import { isEmbedded } from "@/components/WindowManager";
import { ForcePasswordChange } from "@/components/ForcePasswordChange";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // The stored session (auto-refreshed in the background) decides access; a slow or failed
    // network check must never sign the user out. The server still re-checks every request (RLS).
    const { data: s } = await supabase.auth.getSession();
    if (s.session?.user) return { user: s.session.user };
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => isEmbedded() ? (
    <main className="min-w-0 p-3">
      <EmbeddedGuard />
    </main>
  ) : (
    <AppShell>
      <Outlet />
      <ForcePasswordChange />
    </AppShell>
  ),
});

/** Inner windows skip AppShell, so restricted account types are checked here too. */
function EmbeddedGuard() {
  const { data: me, isLoading } = useMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (isLoading) return null;
  const po = isProjectsOnlyTenant(me);
  if (me && !kindAllows(po ? "projects_only" : me.accountKind, String(pathname)) && !(po && me.isTenantAdmin && String(pathname).startsWith("/users"))) {
    return <p className="p-4 text-sm text-muted-foreground">هذه الشاشة غير متاحة لنوع حسابك.</p>;
  }
  return <Outlet />;
}
