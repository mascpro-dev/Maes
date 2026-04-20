-- =============================================================================
-- Aura — Admin: gravar perfil (tipo mãe/médico) sem depender do OR de RLS no
-- PostgREST. SECURITY DEFINER + is_aura_admin().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_save_cadastro_profile(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_cidade text,
  p_estado text,
  p_bio text,
  p_account_type text,
  p_clear_terms boolean DEFAULT false,
  p_consultation_duration_minutes integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_estado text;
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_full_name IS NULL OR btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = 'P0001';
  END IF;

  IF p_account_type IS NULL OR p_account_type NOT IN ('mother', 'medic') THEN
    RAISE EXCEPTION 'invalid_account_type' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_user_id) THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_estado := nullif(upper(left(btrim(coalesce(p_estado, '')), 2)), '');

  UPDATE public.profiles
  SET
    full_name = btrim(p_full_name),
    email = nullif(btrim(coalesce(p_email, '')), ''),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    cidade = nullif(btrim(coalesce(p_cidade, '')), ''),
    estado = v_estado,
    bio = nullif(btrim(coalesce(p_bio, '')), ''),
    account_type = p_account_type,
    terms_accepted_at = CASE WHEN coalesce(p_clear_terms, false) THEN NULL ELSE terms_accepted_at END
  WHERE id = p_user_id;

  IF p_account_type = 'mother' THEN
    DELETE FROM public.specialist_accounts sa WHERE sa.user_id = p_user_id;
  ELSIF p_account_type = 'medic'
    AND p_consultation_duration_minutes IS NOT NULL
    AND p_consultation_duration_minutes IN (30, 60) THEN
    UPDATE public.specialists s
    SET consultation_duration_minutes = p_consultation_duration_minutes
    FROM public.specialist_accounts sa
    WHERE sa.user_id = p_user_id
      AND sa.specialist_id = s.id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.admin_save_cadastro_profile(uuid, text, text, text, text, text, text, text, boolean, integer) IS
  'Painel Cadastros: atualiza profiles (incl. account_type) e, se médico, duração do specialists ligado.';

REVOKE ALL ON FUNCTION public.admin_save_cadastro_profile(
  uuid, text, text, text, text, text, text, text, boolean, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_save_cadastro_profile(
  uuid, text, text, text, text, text, text, text, boolean, integer
) TO authenticated;
