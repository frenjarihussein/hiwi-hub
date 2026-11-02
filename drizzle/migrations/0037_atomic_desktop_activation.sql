CREATE OR REPLACE FUNCTION public.redeem_desktop_activation(_code text, _device text, _id uuid, _key text, _expires timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.desktop_activation_codes%ROWTYPE; l public.desktop_licenses%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.desktop_activation_codes WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF c.revoked THEN RETURN jsonb_build_object('error', 'revoked'); END IF;
  IF c.used_device IS NOT NULL AND c.used_device <> _device THEN RETURN jsonb_build_object('error', 'used'); END IF;
  IF c.license_id IS NOT NULL THEN
    SELECT * INTO l FROM public.desktop_licenses WHERE id = c.license_id;
    IF NOT FOUND OR l.device_id <> _device THEN RETURN jsonb_build_object('error', 'unavailable'); END IF;
    IF l.revoked THEN RETURN jsonb_build_object('error', 'revoked'); END IF;
    RETURN jsonb_build_object('license_key', l.license_key, 'license_id', l.id);
  END IF;
  IF _device !~ '^YS-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' OR _key IS NULL OR length(_key) < 20 THEN
    RETURN jsonb_build_object('error', 'invalid');
  END IF;
  INSERT INTO public.desktop_licenses(id, device_id, customer, plan, expires_at, license_key, notes, created_by)
    VALUES (_id, _device, c.customer, c.plan, _expires, _key, 'كود ' || c.code, c.created_by);
  UPDATE public.desktop_activation_codes SET used_device = _device, used_at = COALESCE(used_at, now()), license_id = _id WHERE id = c.id;
  RETURN jsonb_build_object('license_key', _key, 'license_id', _id);
END; $$;
REVOKE ALL ON FUNCTION public.redeem_desktop_activation(text, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_desktop_activation(text, text, uuid, text, timestamptz) TO service_role;