CREATE TABLE public.pos_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT public.my_tenant_id(),
  branch_id uuid,
  station_type text NOT NULL DEFAULT 'sale',
  name text NOT NULL,
  pattern_id uuid REFERENCES public.doc_patterns(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  lock_warehouse boolean NOT NULL DEFAULT true,
  cash_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  default_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  price_level text,
  allowed_user_ids uuid[] NOT NULL DEFAULT '{}',
  allow_expenses boolean NOT NULL DEFAULT false,
  expense_account_ids uuid[] NOT NULL DEFAULT '{}',
  max_expense numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_stations TO authenticated;
GRANT ALL ON public.pos_stations TO service_role;
ALTER TABLE public.pos_stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_stations_read ON public.pos_stations FOR SELECT TO authenticated
  USING (tenant_id = public.my_tenant_id() AND (public.is_tenant_admin() OR auth.uid() = ANY(allowed_user_ids) OR cardinality(allowed_user_ids) = 0));
CREATE POLICY pos_stations_admin ON public.pos_stations FOR ALL TO authenticated
  USING (tenant_id = public.my_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.my_tenant_id() AND public.is_tenant_admin());
CREATE INDEX pos_stations_tenant_idx ON public.pos_stations(tenant_id);