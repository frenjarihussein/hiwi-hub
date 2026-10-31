ALTER TABLE public.pos_stations
  ADD COLUMN IF NOT EXISTS partner_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS partner_group_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lock_partner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_account_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lock_price_level boolean NOT NULL DEFAULT true;