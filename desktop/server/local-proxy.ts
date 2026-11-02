// The only LAN listener. Database/Auth/REST remain loopback-only.
import { networkInterfaces } from "node:os";
import { requiresMainPc } from "./proxy-access";

export function startLocalProxy(anon: string, appPort: number, gatewayPort: number) {
  const hosts = new Set(["127.0.0.1", "localhost", ...Object.values(networkInterfaces()).flatMap(list => (list || []).filter(n => n.family === "IPv4").map(n => n.address))]);
  Bun.serve({
    hostname: "0.0.0.0", port: 3001,
    async fetch(request, server) {
      const url = new URL(request.url);
      const ip = server.requestIP(request)?.address?.replace(/^::ffff:/, "") || "";
      const loopback = ip === "127.0.0.1" || ip === "::1";
      const privateIp = loopback || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
      if (!privateIp || !hosts.has(url.hostname)) return new Response("Forbidden host", { status: 403 });
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return new Response("Forbidden origin", { status: 403 });
      // The first owner must be created physically on the main PC, not raced from LAN.
      if (!loopback && url.pathname.startsWith("/_serverFn/")) {
        const owner = await fetch(`http://127.0.0.1:${gatewayPort}/__owner-ready`);
        if (!owner.ok || !(await owner.json()).ready) return new Response("Create the owner on the main PC first", { status: 403 });
      }
      const backend = url.pathname.startsWith("/__backend/");
      const path = backend ? url.pathname.slice("/__backend".length) : url.pathname;
      if (backend && path === "/__config") return new Response("Not found", { status: 404 });
      if (!loopback && backend && requiresMainPc(path, request.method)) return new Response("Activate on the main PC", { status: 403 });
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.delete("x-forwarded-for");
      if (origin) headers.set("origin", `http://127.0.0.1:${appPort}`);
      const target = `http://127.0.0.1:${backend ? gatewayPort : appPort}${path}${url.search}`;
      try {
        const result = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(), redirect: "manual" });
        const out = new Headers(result.headers);
        out.delete("access-control-allow-origin");
        out.delete("content-length");
        out.delete("content-encoding");
        // Runtime anon key is install-specific, never a signing or service-role secret.
        if (!backend && out.get("content-type")?.includes("text/html")) {
          const html = (await result.text()).replace("<head>", `<head><script>window.__YOUSEF_ANON__=${JSON.stringify(anon)};</script>`);
          return new Response(html, { status: result.status, headers: out });
        }
        return new Response(result.body, { status: result.status, headers: out });
      } catch { return new Response("الخادم المحلي غير جاهز. أعد تشغيل برنامج ويندوز.", { status: 503 }); }
    },
  });
}