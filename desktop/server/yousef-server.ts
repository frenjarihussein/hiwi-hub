// Local stack launcher for the desktop build. Compiled with:
//   bun build --compile --target=bun-windows-x64 desktop/server/yousef-server.ts \
//     --outfile desktop/src-tauri/binaries/yousef-server-x86_64-pc-windows-msvc.exe
// Starts Postgres -> (first run: roles + schema) -> GoTrue -> PostgREST -> local gateway + app.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, createHmac } from "node:crypto";
import net from "node:net";

const args = process.argv.slice(2);
const dataDir = args[args.indexOf("--data-dir") + 1] || join(process.cwd(), "data");
const stack = process.env.YOUSEF_STACK || join(dirname(process.execPath), "stack");
const exe = (p: string) => join(stack, process.platform === "win32" ? `${p}.exe` : p);

const PG_PORT = 54322, REST_PORT = 54330, AUTH_PORT = 54331, GATEWAY_PORT = 54321, APP_PORT = 3000;
const children: ChildProcess[] = [];
const log = (m: string) => console.log(`[yousef-server] ${m}`);

function b64url(b: Buffer | string) {
  return Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function jwt(secret: string, role: string) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ role, iss: "yousef-local", iat: 1700000000, exp: 4102444800 }));
  return `${h}.${p}.${b64url(createHmac("sha256", secret).update(`${h}.${p}`).digest())}`;
}

// Secrets persist per install so sessions survive restarts.
mkdirSync(dataDir, { recursive: true });
const secretsFile = join(dataDir, "secrets.json");
if (!existsSync(secretsFile)) {
  writeFileSync(secretsFile, JSON.stringify({ jwt: randomBytes(32).toString("hex"), db: randomBytes(16).toString("hex") }));
}
const secrets = JSON.parse(readFileSync(secretsFile, "utf8"));
const ANON = jwt(secrets.jwt, "anon");
const SERVICE = jwt(secrets.jwt, "service_role");
const DB_URL = (user: string) => `postgres://${user}:${secrets.db}@127.0.0.1:${PG_PORT}/postgres`;

function run(name: string, cmd: string, a: string[], env: Record<string, string> = {}) {
  const c = spawn(cmd, a, { env: { ...process.env, ...env }, stdio: "inherit", windowsHide: true });
  c.on("exit", (code) => log(`${name} exited (${code})`));
  children.push(c);
  return c;
}
function waitPort(port: number, tries = 120) {
  return new Promise<void>((ok, fail) => {
    const attempt = (n: number) => {
      const s = net.connect(port, "127.0.0.1", () => { s.end(); ok(); });
      s.on("error", () => (n <= 0 ? fail(new Error(`port ${port} not ready`)) : setTimeout(() => attempt(n - 1), 500)));
    };
    attempt(tries);
  });
}
function psql(sqlFile: string) {
  const r = spawnSync(join(stack, "pgsql", "bin", process.platform === "win32" ? "psql.exe" : "psql"),
    ["-v", "ON_ERROR_STOP=1", "-q", "-f", sqlFile, DB_URL("postgres")], { stdio: "inherit", windowsHide: true });
  if (r.status !== 0) throw new Error(`failed applying ${sqlFile}`);
}

async function main() {
  const pgBin = join(stack, "pgsql", "bin");
  const pgData = join(dataDir, "pgdata");
  const firstRun = !existsSync(join(pgData, "PG_VERSION"));

  if (firstRun) {
    log("initialising database");
    const pw = join(dataDir, ".pw"); writeFileSync(pw, secrets.db);
    const r = spawnSync(join(pgBin, "initdb"), ["-D", pgData, "-U", "postgres", "--pwfile", pw, "-E", "UTF8", "-A", "scram-sha-256"], { stdio: "inherit", windowsHide: true });
    if (r.status !== 0) throw new Error("initdb failed");
  }
  run("postgres", join(pgBin, "postgres"), ["-D", pgData, "-p", String(PG_PORT), "-h", "127.0.0.1"]);
  await waitPort(PG_PORT);

  if (firstRun) {
    log("creating roles and auth schema");
    const boot = join(dataDir, "bootstrap.sql");
    writeFileSync(boot, bootstrapSql(secrets.db));
    psql(boot);
  }

  // GoTrue creates/migrates its own auth.* tables.
  run("gotrue", exe("gotrue"), [], {
    GOTRUE_API_HOST: "127.0.0.1", PORT: String(AUTH_PORT), API_EXTERNAL_URL: `http://127.0.0.1:${GATEWAY_PORT}/auth/v1`,
    GOTRUE_DB_DRIVER: "postgres", DATABASE_URL: DB_URL("supabase_auth_admin") + "?search_path=auth",
    GOTRUE_SITE_URL: `http://127.0.0.1:${APP_PORT}`, GOTRUE_JWT_SECRET: secrets.jwt, GOTRUE_JWT_EXP: "604800",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated", GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_DISABLE_SIGNUP: "false", GOTRUE_EXTERNAL_EMAIL_ENABLED: "true", GOTRUE_MAILER_AUTOCONFIRM: "true",
  });
  await waitPort(AUTH_PORT);

  if (firstRun) {
    const schema = join(stack, "hiwi-hub-schema-v2.sql");
    if (existsSync(schema)) { log("applying application schema"); psql(schema); }
    else log("WARNING: schema file missing in stack/");
  }

  run("postgrest", exe("postgrest"), [], {
    PGRST_DB_URI: DB_URL("authenticator"), PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: secrets.jwt, PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: String(REST_PORT),
  });
  await waitPort(REST_PORT);

  startGateway();

  // App server: command set in stack/app-cmd.json, e.g. {"cmd":"node","args":["app/server.js"]}
  const appCfg = join(stack, "app-cmd.json");
  if (existsSync(appCfg)) {
    const { cmd, args: a = [] } = JSON.parse(readFileSync(appCfg, "utf8"));
    run("app", cmd, a, {
      PORT: String(APP_PORT), HOST: "127.0.0.1",
      SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`, SUPABASE_PUBLISHABLE_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    });
  } else log("WARNING: stack/app-cmd.json missing — app server not started");
  log(`ready. anon key written to ${join(dataDir, "anon.key")}`);
  writeFileSync(join(dataDir, "anon.key"), ANON);
}

// Single URL like Supabase: /rest/v1 -> PostgREST, /auth/v1 -> GoTrue.
function startGateway() {
  Bun.serve({
    hostname: "127.0.0.1", port: GATEWAY_PORT,
    async fetch(req) {
      const u = new URL(req.url);
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
      if (req.method === "OPTIONS") return new Response(null, { headers: cors });
      let target: string | null = null;
      if (u.pathname.startsWith("/rest/v1")) target = `http://127.0.0.1:${REST_PORT}${u.pathname.slice(8) || "/"}`;
      else if (u.pathname.startsWith("/auth/v1")) target = `http://127.0.0.1:${AUTH_PORT}${u.pathname.slice(8) || "/"}`;
      if (!target) return new Response("not found", { status: 404, headers: cors });
      const h = new Headers(req.headers); h.delete("host");
      if (!h.get("authorization")) h.set("authorization", `Bearer ${ANON}`);
      const r = await fetch(target + u.search, { method: req.method, headers: h, body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(), redirect: "manual" });
      const out = new Headers(r.headers); for (const [k, v] of Object.entries(cors)) out.set(k, v);
      return new Response(r.body, { status: r.status, headers: out });
    },
  });
}

function bootstrapSql(pw: string) {
  return `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${pw}'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin LOGIN CREATEROLE PASSWORD '${pw}'; END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA public, auth, extensions, storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER ROLE postgres SET search_path = public, extensions;
`;
}

function shutdown() { for (const c of children.reverse()) try { c.kill(); } catch {} process.exit(0); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
main().catch((e) => { log(String(e)); shutdown(); });
