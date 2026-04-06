-- =============================================================================
-- Aura — Descoberta: presença online, pedidos de conexão, cidade no perfil
-- Lista apenas campos seguros (sem email) via RPC SECURITY DEFINER.
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cidade text;

COMMENT ON COLUMN public.profiles.cidade IS 'Cidade para descoberta de mães próximas (opcional).';

-- -----------------------------------------------------------------------------
-- Presença (heartbeat no app)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid NOT NULL,
  is_online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT user_presence_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx ON public.user_presence (last_seen_at DESC);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_presence_select_authenticated" ON public.user_presence;
CREATE POLICY "user_presence_select_authenticated"
  ON public.user_presence FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "user_presence_upsert_own" ON public.user_presence;
CREATE POLICY "user_presence_upsert_own"
  ON public.user_presence FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_presence_update_own" ON public.user_presence;
CREATE POLICY "user_presence_update_own"
  ON public.user_presence FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_presence_set_updated_at ON public.user_presence;
CREATE TRIGGER user_presence_set_updated_at
  BEFORE UPDATE ON public.user_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Pedidos de conexão / amizade
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connection_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT connection_requests_pkey PRIMARY KEY (id),
  CONSTRAINT connection_requests_from_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT connection_requests_to_fkey FOREIGN KEY (to_user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT connection_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text])),
  CONSTRAINT connection_requests_no_self CHECK (from_user_id <> to_user_id),
  CONSTRAINT connection_requests_unique_pair UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS connection_requests_to_idx ON public.connection_requests (to_user_id, status);
CREATE INDEX IF NOT EXISTS connection_requests_from_idx ON public.connection_requests (from_user_id, status);

ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connection_requests_select_involved" ON public.connection_requests;
CREATE POLICY "connection_requests_select_involved"
  ON public.connection_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

DROP POLICY IF EXISTS "connection_requests_insert_from_self" ON public.connection_requests;
CREATE POLICY "connection_requests_insert_from_self"
  ON public.connection_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "connection_requests_update_involved" ON public.connection_requests;
CREATE POLICY "connection_requests_update_involved"
  ON public.connection_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- -----------------------------------------------------------------------------
-- RPC: listar perfis para Explorar (sem expor email / telefone / nome_crianca)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_profiles_for_discovery()
RETURNS TABLE (
  id uuid,
  full_name text,
  diagnostico text,
  cidade text,
  avatar_url text,
  bio text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.diagnostico, p.cidade, p.avatar_url, p.bio
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.list_profiles_for_discovery() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_profiles_for_discovery() TO authenticated;

COMMENT ON FUNCTION public.list_profiles_for_discovery IS 'Lista outras mães com campos seguros para a tela Explorar.';
