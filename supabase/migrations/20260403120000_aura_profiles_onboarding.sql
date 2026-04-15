-- =============================================================================
-- Aura / Mães Atípicas — migração (Supabase CLI: supabase db push)
--
-- Para copiar/colar no site sem usar CLI, usa o ficheiro na pasta acima:
--   supabase/COLE_AQUI_NO_SUPABASE.sql
-- (tem as mesmas instruções SQL + guia em português no topo)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) profiles — uma linha por usuário (id = auth.users.id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

-- Tabela profiles pré-existente sem email/full_name: CREATE IF NOT EXISTS não as cria
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS diagnostico text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome_crianca text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- FK para Auth (ignore o erro se já existir outro nome de constraint ou IDs órfãos)
DO $$
BEGIN
  ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_diagnostico_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_diagnostico_check CHECK (
    diagnostico IS NULL
    OR diagnostico = ANY (
      ARRAY['tea', 'tdah', 'down', 'pc', 'rara', 'investigacao', 'mae_solo']::text[]
    )
  );

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

COMMENT ON COLUMN public.profiles.diagnostico IS 'Diagnóstico principal informado na personalização (slug do formulário).';
COMMENT ON COLUMN public.profiles.nome_crianca IS 'Nome opcional da criança (LGPD: dado sensível — restrinja acesso via RLS).';
COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Momento em que aceitou Termos + Política (etapa 1 do cadastro).';

-- -----------------------------------------------------------------------------
-- 2) mood_logs — humor (dashboard-supabase.js grava energy_score 1–5 + mood; RLS = auth.uid())
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mood_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mood text NOT NULL,
  energy_score integer,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT mood_logs_pkey PRIMARY KEY (id)
);

ALTER TABLE public.mood_logs ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.mood_logs ADD COLUMN IF NOT EXISTS mood text;
ALTER TABLE public.mood_logs ADD COLUMN IF NOT EXISTS energy_score integer;
ALTER TABLE public.mood_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS mood_logs_user_created_idx ON public.mood_logs (user_id, created_at DESC);

DO $$
BEGIN
  ALTER TABLE ONLY public.mood_logs
    ADD CONSTRAINT mood_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- -----------------------------------------------------------------------------
-- 3) updated_at automático em profiles
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4) Opcional: criar linha em profiles ao registrar no Auth
--    (full_name pode vir de raw_user_meta_data no signUp)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nome_completo')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5) RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "mood_logs_select_own" ON public.mood_logs;
CREATE POLICY "mood_logs_select_own"
  ON public.mood_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "mood_logs_insert_own" ON public.mood_logs;
CREATE POLICY "mood_logs_insert_own"
  ON public.mood_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Opcional: permitir delete próprio (descomente se precisar)
-- DROP POLICY IF EXISTS "mood_logs_delete_own" ON public.mood_logs;
-- CREATE POLICY "mood_logs_delete_own" ON public.mood_logs FOR DELETE USING (auth.uid() = user_id);
