-- =============================================================================
-- Admin: validações claras ao vincular especialista <-> utilizador Auth
-- Evita erro cru de FK specialist_accounts_user_fkey
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_link_specialist_account(
  p_specialist_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_specialist_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.specialists s WHERE s.id = p_specialist_id) THEN
    RAISE EXCEPTION 'specialist_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'auth_user_not_found' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.specialist_accounts (user_id, specialist_id)
  VALUES (p_user_id, p_specialist_id)
  ON CONFLICT (user_id) DO UPDATE
    SET specialist_id = EXCLUDED.specialist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_link_specialist_account(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_link_specialist_account(uuid, uuid) TO authenticated;
