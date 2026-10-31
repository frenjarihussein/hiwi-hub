CREATE TABLE IF NOT EXISTS public.tenant_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('sungrow','telegram')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrations_tenant_provider ON public.tenant_integrations (tenant_id, provider) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrations_global_provider ON public.tenant_integrations (provider) WHERE tenant_id IS NULL;
GRANT ALL ON public.tenant_integrations TO service_role;
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.tenant_integrations IS 'Server-only provider credentials; no client grants.';
ALTER TABLE public.solar_provider_accounts DROP CONSTRAINT IF EXISTS solar_provider_accounts_provider_key;
DROP INDEX IF EXISTS public.solar_provider_accounts_provider_key;
CREATE UNIQUE INDEX IF NOT EXISTS solar_provider_accounts_tenant_provider ON public.solar_provider_accounts (tenant_id, provider);