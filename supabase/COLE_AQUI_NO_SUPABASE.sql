-- =============================================================================
-- AURA / MÃES ATÍPICAS — INSTRUÇÕES (leia antes de rodar)
-- =============================================================================
--
-- O QUE É ISTO?
--   Script completo para criar/atualizar as tabelas do app no Supabase:
--   • perfil do utilizador (cadastro + personalização: diagnóstico, nome da criança, termos)
--   • registo de humor (dashboard)
--   • regras de segurança (RLS) para cada pessoa só ver os próprios dados
--
-- ONDE RODAR (passo a passo):
--   1. Abre https://supabase.com e entra no teu projeto
--   2. Menu esquerdo → "SQL Editor"
--   3. "New query" (nova consulta)
--   4. Apaga o que estiver na caixa e COLA TUDO deste ficheiro (desde a linha
--      "-- AURA / MÃES ATÍPICAS" abaixo até ao fim)
--   5. Clica em "Run" (ou Ctrl+Enter)
--   6. Deves ver "Success" em verde. Se aparecer erro vermelho, copia a mensagem
--      e guarda — às vezes é preciso apagar dados órfãos (ex.: mood_logs sem user válido)
--
-- PODES RODAR MAIS DE UMA VEZ?
--   Sim, em geral é seguro: o script usa "IF NOT EXISTS" e "ADD COLUMN IF NOT EXISTS".
--
-- VALORES VÁLIDOS DO CAMPO diagnostico (igual ao formulário HTML):
--   tea | tdah | down | pc | rara | investigacao
--
-- NOTA: O ficheiro em supabase/migrations/ tem o mesmo conteúdo SQL (para quem usa
--       Supabase CLI). Para ti, basta este ficheiro no SQL Editor.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) profiles — uma linha por utilizador (id = auth.users.id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

-- Se já existia uma tabela "profiles" de outro guia, o CREATE acima não acrescenta
-- colunas. Garantimos TODAS as colunas que o Aura precisa (evita erro "email does not exist"):
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS diagnostico text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome_crianca text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- Liga cada perfil ao utilizador do Auth (ignora se a ligação já existir)
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
      ARRAY['tea', 'tdah', 'down', 'pc', 'rara', 'investigacao']::text[]
    )
  );

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

COMMENT ON COLUMN public.profiles.diagnostico IS 'Diagnóstico principal informado na personalização (slug do formulário).';
COMMENT ON COLUMN public.profiles.nome_crianca IS 'Nome opcional da criança (LGPD: dado sensível — restrinja acesso via RLS).';
COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Momento em que aceitou Termos + Política (etapa 1 do cadastro).';

-- -----------------------------------------------------------------------------
-- 2) mood_logs — humor no dashboard (usado em dashboard-supabase.js)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mood_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mood text NOT NULL,
  energy_score integer,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT mood_logs_pkey PRIMARY KEY (id)
);

-- Tabela mood_logs antiga pode não ter user_id → índice e RLS falhavam
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
-- 3) Atualiza automaticamente updated_at em profiles
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
-- 4) Ao criar utilizador no Auth, cria linha em profiles (opcional mas útil)
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
-- 5) RLS — cada utilizador só acede aos próprios dados
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

-- =============================================================================
-- FIM — Se correu bem, já tens as tabelas e políticas prontas.
-- =============================================================================
