export function refuseServiceWorker(prod: boolean, hostname: string, embedded: boolean, search: string) {
  return !prod || embedded || new URLSearchParams(search).get("sw") === "off" ||
    hostname.startsWith("id-preview--") || hostname.startsWith("preview--") ||
    ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}
/** Sole app-shell registrar. Messaging workers are never touched. */
export async function startOfflineApp() {
  if (!("serviceWorker" in navigator)) return;
  if (refuseServiceWorker(import.meta.env.PROD, location.hostname, window.self !== window.top, location.search)) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(r => [r.active, r.waiting, r.installing].some(w => w && new URL(w.scriptURL).pathname === "/sw.js")).map(r => r.unregister()));
    return;
  }
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}