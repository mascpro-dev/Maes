-- O URL base de indicação deve vir da app (mesmo domínio); evitar domínio fixo na BD.
ALTER TABLE public.partner_program_accounts
  ALTER COLUMN referral_base_url SET DEFAULT '';
