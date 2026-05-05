-- =============================================================================
-- Admin helper: validar se UUID existe em auth.users
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_check_auth_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.email
  INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'exists', v_email IS NOT NULL,
    'email', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_check_auth_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_check_auth_user(uuid) TO authenticated;
