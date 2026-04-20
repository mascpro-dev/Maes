-- =============================================================================
-- Aura — Tipo de conta (mãe vs médico) no perfil + admin remove vínculo agenda
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'mother';

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('mother', 'medic'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

COMMENT ON COLUMN public.profiles.account_type IS
  'mother: fluxo utente/mãe; medic: fluxo profissional (agenda após specialist_accounts).';

CREATE OR REPLACE FUNCTION public.admin_clear_specialist_link(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.specialist_accounts WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_specialist_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_specialist_link(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_clear_specialist_link(uuid) IS
  'Remove specialist_accounts (só admin). Usado ao repor tipo de conta para mãe.';
