-- =============================================================================
-- Aura — Termos públicos (todos os utilizadores autenticados) + admin pode
-- listar e atualizar perfis (mães) além do próprio registo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Texto legal editável no admin, leitura por qualquer sessão autenticada
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_public_legal (
  slug text NOT NULL PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.app_public_legal IS
  'Documentos legais públicos na app (ex.: termos). Uma linha por slug.';

INSERT INTO public.app_public_legal (slug, title, body)
VALUES (
  'terms',
  'Termos e condições de uso',
  'Este texto pode ser alterado no painel admin (aba Cadastros).'
)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.app_public_legal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_public_legal_select_auth" ON public.app_public_legal;
CREATE POLICY "app_public_legal_select_auth"
  ON public.app_public_legal FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "app_public_legal_admin_write" ON public.app_public_legal;
CREATE POLICY "app_public_legal_admin_write"
  ON public.app_public_legal FOR INSERT
  TO authenticated
  WITH CHECK (public.is_aura_admin());

DROP POLICY IF EXISTS "app_public_legal_admin_update" ON public.app_public_legal;
CREATE POLICY "app_public_legal_admin_update"
  ON public.app_public_legal FOR UPDATE
  TO authenticated
  USING (public.is_aura_admin())
  WITH CHECK (public.is_aura_admin());

DROP POLICY IF EXISTS "app_public_legal_admin_delete" ON public.app_public_legal;
CREATE POLICY "app_public_legal_admin_delete"
  ON public.app_public_legal FOR DELETE
  TO authenticated
  USING (public.is_aura_admin());

GRANT SELECT ON public.app_public_legal TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_public_legal TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) Admin: ver e editar qualquer perfil (mãe / utilizadora)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_aura_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_aura_admin())
  WITH CHECK (public.is_aura_admin());
