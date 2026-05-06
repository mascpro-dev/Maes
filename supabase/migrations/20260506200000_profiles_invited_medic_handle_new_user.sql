-- Convites Auth enviados pelo admin trazem user_metadata.invite_role = medic.
-- Sem isto o perfil fica account_type mother e computeMotherSignupRedirect manda-o para cadastro da mãe.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  v_type := CASE
    WHEN COALESCE(NULLIF(TRIM(new.raw_user_meta_data ->> 'invite_role'), ''), '') = 'medic' THEN 'medic'
    ELSE 'mother'
  END;

  INSERT INTO public.profiles (id, email, full_name, account_type)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nome_completo'),
    v_type
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        account_type = CASE
          WHEN EXCLUDED.account_type = 'medic' THEN 'medic'
          ELSE public.profiles.account_type
        END;
  RETURN new;
END;
$$;
