-- =============================================================================
-- Aura — Administradores (aura_admins) + RLS para painel admin
-- Primeiro admin: INSERT manual em SQL Editor (ver COLE_PRIMEIRO_ADMIN.sql).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.aura_admins (
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT aura_admins_pkey PRIMARY KEY (user_id),
  CONSTRAINT aura_admins_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.aura_admins IS
  'Utilizadores com acesso ao painel admin (apenas inserção via SQL / service role).';

ALTER TABLE public.aura_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_admins_select_self" ON public.aura_admins;
CREATE POLICY "aura_admins_select_self"
  ON public.aura_admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.aura_admins TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.aura_admins FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.aura_admins FROM anon;

-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_aura_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.aura_admins a WHERE a.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_aura_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_aura_admin() TO authenticated;

COMMENT ON FUNCTION public.is_aura_admin IS
  'true se o utilizador autenticado está em aura_admins.';

-- -----------------------------------------------------------------------------
-- Especialistas: leitura pública (ativos) OU admin vê tudo; escrita só admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "specialists_select_active" ON public.specialists;

CREATE POLICY "specialists_select_visible"
  ON public.specialists FOR SELECT
  TO authenticated
  USING (active = true OR public.is_aura_admin());

CREATE POLICY "specialists_insert_admin"
  ON public.specialists FOR INSERT
  TO authenticated
  WITH CHECK (public.is_aura_admin());

CREATE POLICY "specialists_update_admin"
  ON public.specialists FOR UPDATE
  TO authenticated
  USING (public.is_aura_admin())
  WITH CHECK (public.is_aura_admin());

-- -----------------------------------------------------------------------------
-- Reservas e intenções: admin vê tudo
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "consultation_bookings_select_own" ON public.consultation_bookings;

CREATE POLICY "consultation_bookings_select_own"
  ON public.consultation_bookings FOR SELECT
  TO authenticated
  USING (mother_id = auth.uid());

CREATE POLICY "consultation_bookings_select_admin"
  ON public.consultation_bookings FOR SELECT
  TO authenticated
  USING (public.is_aura_admin());

CREATE POLICY "consultation_bookings_update_admin"
  ON public.consultation_bookings FOR UPDATE
  TO authenticated
  USING (public.is_aura_admin())
  WITH CHECK (public.is_aura_admin());

DROP POLICY IF EXISTS "checkout_intents_select_own" ON public.consultation_checkout_intents;

CREATE POLICY "checkout_intents_select_own"
  ON public.consultation_checkout_intents FOR SELECT
  TO authenticated
  USING (mother_id = auth.uid());

CREATE POLICY "checkout_intents_select_admin"
  ON public.consultation_checkout_intents FOR SELECT
  TO authenticated
  USING (public.is_aura_admin());
