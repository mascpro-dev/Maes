-- Aceita colagens «mailto:email@x.com» na RPC de lookup (igual ao admin.js).

CREATE OR REPLACE FUNCTION public.admin_lookup_auth_user_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows int;
  v_id uuid;
  v_email text;
  v_norm text;
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  v_norm := lower(btrim(p_email));
  IF v_norm ~ '^mailto:' THEN
    v_norm := lower(btrim(substring(v_norm from 8)));
  END IF;
  v_norm := split_part(split_part(v_norm, '?', 1), '#', 1);
  v_norm := btrim(v_norm);
  IF v_norm = '' THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::int
  INTO v_rows
  FROM auth.users u
  WHERE lower(btrim(u.email)) = v_norm;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('found', false, 'count', 0);
  END IF;

  IF v_rows > 1 THEN
    RETURN jsonb_build_object('found', false, 'ambiguous', true, 'count', v_rows);
  END IF;

  SELECT u.id, u.email
  INTO v_id, v_email
  FROM auth.users u
  WHERE lower(btrim(u.email)) = v_norm
  LIMIT 1;

  RETURN jsonb_build_object(
    'found', true,
    'id', v_id,
    'email', v_email,
    'count', 1
  );
END;
$$;
