import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleTelegram } = await import("@/lib/telegram-bot.server");
    return handleTelegram(request);
  } } },
});
