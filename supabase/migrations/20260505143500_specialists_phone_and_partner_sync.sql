-- =============================================================================
-- Especialistas: telefone/WhatsApp próprio + sync automático na aprovação parceiro
-- =============================================================================

ALTER TABLE public.specialists
  ADD COLUMN IF NOT EXISTS phone text;

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

  IF p_status = 'approved' THEN
    INSERT INTO public.specialists (
      display_name,
      specialty,
      phone,
      bio,
      photo_url,
      active,
      sort_order,
      consultation_duration_minutes,
      origin_partner_application_id
    )
    SELECT
      COALESCE(NULLIF(btrim(a.full_name), ''), 'Profissional parceiro'),
      COALESCE(NULLIF(btrim(a.area_atuacao), ''), 'Especialidade a definir'),
      NULLIF(btrim(a.whatsapp), ''),
      NULLIF(btrim(a.mini_curriculo), ''),
      NULLIF(btrim(a.photo_url), ''),
      false,
      COALESCE((SELECT MAX(s2.sort_order) FROM public.specialists s2), 0) + 1,
      30,
      a.id
    FROM public.partner_professional_applications a
    WHERE a.id = p_id
    ON CONFLICT ON CONSTRAINT specialists_origin_partner_application_key
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      specialty = EXCLUDED.specialty,
      phone = COALESCE(EXCLUDED.phone, public.specialists.phone),
      bio = COALESCE(EXCLUDED.bio, public.specialists.bio),
      photo_url = COALESCE(EXCLUDED.photo_url, public.specialists.photo_url);
  END IF;
END;
$$;
