/** Server-only resolution of provider credentials: company settings first, then platform secrets. */
export type IntegrationConfig = { appkey?: string; secret?: string; user?: string; pass?: string; base?: string; bot_token?: string; username?: string; client_id?: string; auth?: string };
export type SungrowEnv = { appkey: string; secret: string; user: string; pass: string; base: string };
export type IntegrationProvider = 'sungrow' | 'telegram' | 'sma';
const DEFAULT_SUNGROW_BASE = 'https://gateway.isolarcloud.com.hk';
export const DEFAULT_SMA_BASE = 'https://monitoring.smaapis.de';
export const DEFAULT_SMA_AUTH = 'https://auth.smaapis.de/oauth2/token';

async function admin() {
  const { appDatabaseAdmin } = await import('@/lib/app-database.server');
  // tenant_integrations is newer than the generated app-database types.
  return appDatabaseAdmin as unknown as import('@supabase/supabase-js').SupabaseClient;
}

export async function readIntegration(tenantId: string | null, provider: IntegrationProvider) {
  const db = await admin();
  let q = db.from('tenant_integrations').select('config').eq('provider', provider);
  q = tenantId ? q.eq('tenant_id', tenantId) : q.is('tenant_id', null);
  const { data } = await q.maybeSingle();
  return (data?.config ?? {}) as IntegrationConfig;
}

export async function writeIntegration(tenantId: string | null, provider: IntegrationProvider, config: IntegrationConfig) {
  const db = await admin();
  let q = db.from('tenant_integrations').select('id').eq('provider', provider);
  q = tenantId ? q.eq('tenant_id', tenantId) : q.is('tenant_id', null);
  const existing = (await q.maybeSingle()).data;
  const res = existing
    ? await db.from('tenant_integrations').update({ config, updated_at: new Date().toISOString() }).eq('id', existing.id)
    : await db.from('tenant_integrations').insert({ tenant_id: tenantId, provider, config });
  if (res.error) throw new Error('تعذر حفظ إعدادات الربط');
}

/** The company's own SMA credentials when complete, otherwise the platform SMA secrets. */
export async function smaEnvFor(tenantId: string | null): Promise<{ id: string; secret: string; base: string; auth: string; own: boolean }> {
  if (tenantId) {
    const c = await readIntegration(tenantId, 'sma');
    if (c.client_id && c.secret) return { id: c.client_id, secret: c.secret, base: c.base || DEFAULT_SMA_BASE, auth: c.auth || DEFAULT_SMA_AUTH, own: true };
  }
  const id = process.env['SMA_CLIENT_ID'], secret = process.env['SMA_CLIENT_SECRET'];
  if (!id || !secret) throw new Error('SMA connection settings are incomplete.');
  return { id, secret, base: process.env['SMA_BASE_URL'] || DEFAULT_SMA_BASE, auth: process.env['SMA_AUTH_URL'] || DEFAULT_SMA_AUTH, own: false };
}

/** Returns the company's own Sungrow credentials when complete, otherwise the platform credentials. */
export async function sungrowEnvFor(tenantId: string | null): Promise<SungrowEnv & { own: boolean }> {
  if (tenantId) {
    const c = await readIntegration(tenantId, 'sungrow');
    if (c.appkey && c.secret && c.user && c.pass) return { appkey: c.appkey, secret: c.secret, user: c.user, pass: c.pass, base: c.base || DEFAULT_SUNGROW_BASE, own: true };
  }
  const appkey = process.env['SUNGROW_APP_KEY'];
  const secret = process.env['SUNGROW_APP_SECRET'] || process.env['SUNGROW_SECRET_KEY'];
  const user = process.env['SUNGROW_USER'] || process.env['SUNGROW_USERNAME'];
  const pass = process.env['SUNGROW_PASSWORD'];
  if (!appkey || !secret || !user || !pass) throw new Error('Sungrow connection settings are incomplete.');
  return { appkey, secret, user, pass, base: process.env['SUNGROW_BASE_URL'] || DEFAULT_SUNGROW_BASE, own: false };
}

/** The platform Telegram bot token: saved setting first, then the platform secret. */
import { AsyncLocalStorage } from 'node:async_hooks';
/** Company whose own bot handles the current request/delivery; empty = platform bot. */
const botScope = new AsyncLocalStorage<string | null>();
export function withTenantBot<T>(tenantId: string | null | undefined, fn: () => Promise<T>) { return botScope.run(tenantId || null, fn); }
async function scopedBot() {
  const tenant = botScope.getStore();
  if (tenant) { const own = await readIntegration(tenant, 'telegram').catch(() => ({} as IntegrationConfig)); if (own.bot_token) return own; }
  return readIntegration(null, 'telegram').catch(() => ({} as IntegrationConfig));
}
/** Username of the bot serving a company: its own bot first, then the platform bot. */
export async function botUsernameFor(tenantId: string | null) {
  return withTenantBot(tenantId, async () => (await scopedBot()).username || 'KFP_solar_bot');
}
export async function telegramBotToken() {
  const c = await scopedBot();
  const t = c.bot_token || process.env['TELEGRAM_BOT_TOKEN'];
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return t;
}
