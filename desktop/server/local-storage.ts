// Local-only Storage API. Metadata queries run with the caller's verified JWT and RLS.
import postgres from "postgres";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";

export function localStorageApi(dbUrl: string, directory: string, secret: string, authUrl: string) {
  const sql = postgres(dbUrl, { max: 4 });
  const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const validPath = (s: string) => s.length > 0 && s.length < 1024 && !s.split("/").some(p => !p || p === "." || p === "..");
  return async (request: Request): Promise<Response> => {
    const u = new URL(request.url);
    const parts = u.pathname.slice("/storage/v1/".length).split("/").map(decodeURIComponent);
    const [kind, action] = parts;
    if (kind !== "object") return Response.json({ message: "Not found" }, { status: 404 });
    // Signed downloads are scoped to one immutable object ID and expire locally.
    if (action === "sign" && request.method === "GET") {
      const token = u.searchParams.get("token") || "";
      const [id, expires, signature] = token.split(".");
      const expected = sign(`${id}.${expires}`);
      if (!id || !Number.isFinite(Number(expires)) || Number(expires) < Date.now() || !signature
        || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return new Response("Forbidden", { status: 403 });
      const [row] = await sql`select id, metadata from storage.objects where id=${id}::uuid and bucket_id=${parts[2]} and name=${parts.slice(3).join("/")}`;
      if (!row) return new Response("Not found", { status: 404 });
      try { return new Response(await readFile(join(directory, row.id)), { headers: { "content-type": row.metadata?.mimetype || "application/octet-stream", "cache-control": "private, no-store" } }); }
      catch { return new Response("Not found", { status: 404 }); }
    }
    const authorization = request.headers.get("authorization") || "";
    const auth = await fetch(`${authUrl}/user`, { headers: { authorization } });
    if (!auth.ok) return new Response("Unauthorized", { status: 401 });
    const user = await auth.json() as { id: string; role?: string };
    const operation = ["sign", "list"].includes(action || "") ? action : "file";
    const bucket = parts[operation === "file" ? 1 : 2];
    const name = parts.slice(operation === "file" ? 2 : 3).join("/");
    if (!["attachments", "backups"].includes(bucket || "")) return new Response("Forbidden", { status: 403 });
    try {
      return await sql.begin(async tx => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        if (operation === "sign" && request.method === "POST") {
          const body = await request.json() as { expiresIn?: number; paths?: string[] };
          const paths = body.paths || [name];
          if (!Array.isArray(paths) || paths.length > 1000) return new Response("Bad request", { status: 400 });
          const result = [];
          for (const path of paths) {
            const [row] = await tx`select id from storage.objects where bucket_id=${bucket} and name=${path}`;
            if (!row) { result.push({ path, error: "Not found", signedURL: null }); continue; }
            const expiry = Date.now() + Math.max(1, Math.min(86400, Number(body.expiresIn) || 300)) * 1000;
            const payload = `${row.id}.${expiry}`;
            result.push({ path, signedURL: `/object/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}?token=${payload}.${sign(payload)}` });
          }
          return Response.json(body.paths ? result : result[0]);
        }
        if (operation === "file" && request.method === "DELETE") {
          const body = await request.json() as { prefixes: string[] };
          if (!Array.isArray(body.prefixes) || body.prefixes.length > 1000) return new Response("Bad request", { status: 400 });
          const rows = await tx`delete from storage.objects where bucket_id=${bucket} and name in ${tx(body.prefixes)} returning id,name`;
          for (const row of rows) await unlink(join(directory, row.id)).catch(() => {});
          return Response.json(rows);
        }
        if (!validPath(name)) return new Response("Bad path", { status: 400 });
        if (operation === "file" && ["POST", "PUT"].includes(request.method)) {
          if (Number(request.headers.get("content-length") || 0) > 25 * 1024 * 1024) return new Response("File too large", { status: 413 });
          const form = request.headers.get("content-type")?.includes("multipart/form-data") ? await request.formData() : null;
          const file = form?.get("file");
          const data = file instanceof File ? await file.arrayBuffer() : await request.arrayBuffer();
          if (data.byteLength > 25 * 1024 * 1024) return new Response("File too large", { status: 413 });
          const metadata = { size: data.byteLength, mimetype: file instanceof File ? file.type : request.headers.get("content-type") };
          const [row] = await tx`insert into storage.objects (bucket_id,name,owner,metadata) values (${bucket},${name},${user.id}::uuid,${tx.json(metadata)}) returning id`;
          await mkdir(directory, { recursive: true });
          await writeFile(join(directory, row.id), new Uint8Array(data));
          return Response.json({ Id: row.id, Key: `${bucket}/${name}` });
        }
        if (operation === "file" && request.method === "GET") {
          const [row] = await tx`select id,metadata from storage.objects where bucket_id=${bucket} and name=${name}`;
          if (!row) return new Response("Not found", { status: 404 });
          return new Response(await readFile(join(directory, row.id)), { headers: { "content-type": row.metadata?.mimetype || "application/octet-stream" } });
        }
        return new Response("Unsupported operation", { status: 405 });
      });
    } catch { return Response.json({ message: "Storage operation denied or failed" }, { status: 403 }); }
  };
}