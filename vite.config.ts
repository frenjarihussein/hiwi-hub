// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [VitePWA({
    strategies: "generateSW", filename: "sw.js", registerType: "autoUpdate", injectRegister: null,
    outDir: "dist/client",
    devOptions: { enabled: false },
    manifest: {
      name: "يوسف سوفت", short_name: "يوسف سوفت", lang: "ar", dir: "rtl",
      start_url: "/", scope: "/", display: "standalone", theme_color: "#ffffff", background_color: "#ffffff",
      icons: [192, 512].map(size => ({ src: `/app-icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
    },
    workbox: {
      globPatterns: ["**/*.{js,css,png,ico,woff2}"], navigateFallback: null,
      runtimeCaching: [
        { urlPattern: ({ request, url }) => request.mode === "navigate" && !["/~oauth", "/api/", "/auth", "/share/", "/_serverFn/"].some(path => url.pathname.startsWith(path)), handler: "NetworkFirst", options: { cacheName: "yousef-pages-v1", networkTimeoutSeconds: 5, expiration: { maxEntries: 100, maxAgeSeconds: 604800 } } },
        { urlPattern: ({ request, url }) => url.origin === self.location.origin && /\/assets\/[^/]+-[\w-]+\.(js|css|woff2|png)$/.test(url.pathname) && request.method === "GET", handler: "CacheFirst", options: { cacheName: "yousef-assets-v1", expiration: { maxEntries: 200, maxAgeSeconds: 2592000 } } },
      ],
    },
  })],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
