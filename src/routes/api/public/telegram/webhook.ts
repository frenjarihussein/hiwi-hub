import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleTelegram } = await import("@/lib/telegram-bot.server");
    const { withTenantBot } = await import("@/lib/integrations.server");
    // ?t=<company> routes updates from a company's own bot; its secret derives from that bot's token.
    const t = new URL(request.url).searchParams.get("t");
    const tenant = t && /^[0-9a-f-]{36}$/i.test(t) ? t : null;
    return withTenantBot(tenant, () => handleTelegram(request));
  } } },
});
