-- =============================================================================
-- AURA — Cadastro em 3 passos: colunas em profiles + tabelas children e support_network
-- Cole no Supabase → SQL Editor → Run (podes correr mais de uma vez)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles: telefone + desafios do passo 3
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_challenges text[];

COMMENT ON COLUMN public.profiles.phone IS 'Telefone da mãe (passo 1).';
COMMENT ON COLUMN public.profiles.onboarding_challenges IS 'Slugs dos maiores desafios hoje (passo 3), ex: sono, alimentacao.';

-- -----------------------------------------------------------------------------
-- children: dados da criança (passo 2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.children (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  data_nascimento date,
  diagnosticos text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT children_pkey PRIMARY KEY (id)
);

ALTER TABLE public.children ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS data_nascimento date;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS diagnosticos text[];
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS children_user_id_idx ON public.children (user_id);

DO $$
BEGIN
  ALTER TABLE ONLY public.children
    ADD CONSTRAINT children_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- -----------------------------------------------------------------------------
-- support_network: foco dos desafios (espelha passo 3; uma linha por mãe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_network (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  challenge_areas text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT support_network_pkey PRIMARY KEY (id)
);

ALTER TABLE public.support_network ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.support_network ADD COLUMN IF NOT EXISTS challenge_areas text[];
ALTER TABLE public.support_network ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now());

CREATE UNIQUE INDEX IF NOT EXISTS support_network_user_id_key ON public.support_network (user_id);

DO $$
BEGIN
  ALTER TABLE ONLY public.support_network
    ADD CONSTRAINT support_network_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- -----------------------------------------------------------------------------
-- RLS children
-- -----------------------------------------------------------------------------
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "children_select_own" ON public.children;
CREATE POLICY "children_select_own"
  ON public.children FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "children_insert_own" ON public.children;
CREATE POLICY "children_insert_own"
  ON public.children FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "children_update_own" ON public.children;
CREATE POLICY "children_update_own"
  ON public.children FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "children_delete_own" ON public.children;
CREATE POLICY "children_delete_own"
  ON public.children FOR DELETE
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- RLS support_network
-- -----------------------------------------------------------------------------
ALTER TABLE public.support_network ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_network_select_own" ON public.support_network;
CREATE POLICY "support_network_select_own"
  ON public.support_network FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_network_insert_own" ON public.support_network;
CREATE POLICY "support_network_insert_own"
  ON public.support_network FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_network_update_own" ON public.support_network;
CREATE POLICY "support_network_update_own"
  ON public.support_network FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_network_delete_own" ON public.support_network;
CREATE POLICY "support_network_delete_own"
  ON public.support_network FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- IMPORTANTE (testes): Authentication → Providers → Email → desativa
-- "Confirm email" para o signUp devolver sessão logo e o passo 2 funcionar.
-- =============================================================================
