import { createFileRoute } from "@tanstack/react-router";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public install identity (name, logo, colour only) so an installed app shows the company's own brand. */
async function load(id: string) {
  if (!UUID.test(id)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const [{ data: t }, { data: s }] = await Promise.all([
    db.from("tenants").select("name").eq("id", id).maybeSingle(),
    db.from("tenant_settings").select("logo_url,primary_color,white_label").eq("tenant_id", id).maybeSingle(),
  ]);
  if (!t) return null;
  if (s?.white_label === false) return { name: "", logo: null, color: null };
  return { name: String(t.name ?? ""), logo: (s?.logo_url as string | null) ?? null, color: (s?.primary_color as string | null) ?? null };
}

export const Route = createFileRoute("/api/public/brand/$tenantId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw = params.tenantId;
        const isIcon = raw.endsWith(".png");
        const id = raw.replace(/\.(png|webmanifest)$/, "");
        const b = await load(id);
        if (isIcon) {
          const m = b?.logo?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
          if (!m) return Response.redirect(new URL("/app-icon-512.png", request.url).toString(), 302);
          const bin = Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
          return new Response(bin, { headers: { "Content-Type": m[1]!, "Cache-Control": "public, max-age=300" } });
        }
        const name = b?.name || "يوسف سوفت";
        const icon = b?.logo ? `/api/public/brand/${id}.png` : null;
        const manifest = {
          id: "/", name, short_name: name.slice(0, 24), lang: "ar", dir: "rtl", start_url: "/", scope: "/", display: "standalone",
          theme_color: /^#[0-9a-f]{6}$/i.test(b?.color ?? "") ? b!.color : "#ffffff", background_color: "#ffffff",
          icons: icon
            ? [192, 512].map((size) => ({ src: icon, sizes: `${size}x${size}`, type: "image/png", purpose: "any" }))
            : [192, 512].map((size) => ({ src: `/app-icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
        };
        return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
      },
    },
  },
});
