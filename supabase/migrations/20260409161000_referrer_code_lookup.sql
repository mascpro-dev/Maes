-- Resolve código de afiliado (partner_program_accounts.referral_code) → user_id para profiles.referred_by
CREATE OR REPLACE FUNCTION public.referrer_user_id_from_referral_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ppa.user_id
  FROM public.partner_program_accounts ppa
  WHERE upper(trim(ppa.referral_code)) = upper(trim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.referrer_user_id_from_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referrer_user_id_from_referral_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.referrer_user_id_from_referral_code(text) TO authenticated;

COMMENT ON FUNCTION public.referrer_user_id_from_referral_code(text) IS
  'Devolve o user_id da conta de programa de indicação para um código (uso no cadastro).';
