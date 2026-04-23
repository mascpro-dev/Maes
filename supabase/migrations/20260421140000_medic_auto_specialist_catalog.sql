-- =============================================================================
-- Aura — Ao gravar perfil como «medic» sem specialist_accounts, cria registo em
-- specialists + vínculo, para aparecer na lista admin e na app (active=true).
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
  v_has_link boolean;
  v_sid uuid;
  v_dur int;
  v_created boolean := false;
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
  ELSIF p_account_type = 'medic' THEN
    SELECT EXISTS (SELECT 1 FROM public.specialist_accounts sa WHERE sa.user_id = p_user_id)
    INTO v_has_link;

    v_dur := CASE
      WHEN p_consultation_duration_minutes IN (30, 60) THEN p_consultation_duration_minutes
      ELSE 30
    END;

    IF NOT v_has_link THEN
      INSERT INTO public.specialists (
        display_name,
        specialty,
        bio,
        photo_url,
        active,
        sort_order,
        consultation_duration_minutes
      )
      SELECT
        COALESCE(nullif(btrim(pr.full_name), ''), 'Médico'),
        'Especialidade a definir',
        nullif(btrim(coalesce(pr.bio, '')), ''),
        nullif(btrim(coalesce(pr.avatar_url, '')), ''),
        true,
        COALESCE((SELECT MAX(s2.sort_order) FROM public.specialists s2), 0) + 1,
        v_dur
      FROM public.profiles pr
      WHERE pr.id = p_user_id
      RETURNING id INTO v_sid;

      INSERT INTO public.specialist_accounts (user_id, specialist_id)
      VALUES (p_user_id, v_sid);

      v_created := true;
    ELSE
      IF p_consultation_duration_minutes IS NOT NULL AND p_consultation_duration_minutes IN (30, 60) THEN
        UPDATE public.specialists s
        SET consultation_duration_minutes = p_consultation_duration_minutes
        FROM public.specialist_accounts sa
        WHERE sa.user_id = p_user_id
          AND sa.specialist_id = s.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'specialist_auto_created', v_created,
    'linked_specialist_id', (
      SELECT sa.specialist_id
      FROM public.specialist_accounts sa
      WHERE sa.user_id = p_user_id
      LIMIT 1
    )
  );
END;
$$;

COMMENT ON FUNCTION public.admin_save_cadastro_profile(uuid, text, text, text, text, text, text, text, boolean, integer) IS
  'Painel Cadastros: atualiza profiles; médico sem vínculo recebe specialists + specialist_accounts; duração 30/60.';
