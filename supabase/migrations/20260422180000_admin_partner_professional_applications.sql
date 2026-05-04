-- =============================================================================
-- Aura — Admin: listar e alterar estado das candidaturas «Profissional parceiro»
-- (partner_professional_applications). INSERT público mantém-se; triagem no painel.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_partner_professional_applications(p_limit integer DEFAULT 200)
RETURNS SETOF public.partner_professional_applications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.*
  FROM public.partner_professional_applications a
  WHERE public.is_aura_admin()
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;

COMMENT ON FUNCTION public.admin_list_partner_professional_applications(integer) IS
  'Painel admin — lista candidaturas parceiro (só aura_admins).';

REVOKE ALL ON FUNCTION public.admin_list_partner_professional_applications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_partner_professional_applications(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_partner_application_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n int;
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_status IS NULL OR p_status NOT IN ('pending', 'reviewing', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.partner_professional_applications
  SET status = p_status
  WHERE id = p_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_partner_application_status(uuid, text) IS
  'Painel admin — define status da candidatura (pending/reviewing/approved/rejected).';

REVOKE ALL ON FUNCTION public.admin_set_partner_application_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_application_status(uuid, text) TO authenticated;
