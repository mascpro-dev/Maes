-- =============================================================================
-- Aura — RPCs estáveis para admin (reservas / checkouts), conta de médico,
-- bloqueios de agenda (horários fechados manualmente) + leitura de reservas
-- pelo médico ligado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Liga um utilizador Auth (mesmo login que mães) a um registo specialists
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.specialist_accounts (
  user_id uuid NOT NULL,
  specialist_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT specialist_accounts_pkey PRIMARY KEY (user_id),
  CONSTRAINT specialist_accounts_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT specialist_accounts_specialist_fkey FOREIGN KEY (specialist_id) REFERENCES public.specialists (id) ON DELETE CASCADE,
  CONSTRAINT specialist_accounts_specialist_unique UNIQUE (specialist_id)
);

COMMENT ON TABLE public.specialist_accounts IS
  'Um utilizador Auth = um perfil de médico credenciado (para agenda e leitura de reservas).';

ALTER TABLE public.specialist_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "specialist_accounts_admin_all" ON public.specialist_accounts;

-- Sem GRANT a authenticated: inserções via admin_link_specialist_account (SECURITY DEFINER);
-- leitura do vínculo via my_specialist_id (SECURITY DEFINER).
REVOKE ALL ON TABLE public.specialist_accounts FROM PUBLIC;
GRANT ALL ON TABLE public.specialist_accounts TO postgres;
GRANT ALL ON TABLE public.specialist_accounts TO service_role;
REVOKE ALL ON TABLE public.specialist_accounts FROM anon;
REVOKE ALL ON TABLE public.specialist_accounts FROM authenticated;

CREATE OR REPLACE FUNCTION public.my_specialist_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sa.specialist_id
  FROM public.specialist_accounts sa
  WHERE sa.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_specialist_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_specialist_id() TO authenticated;

COMMENT ON FUNCTION public.my_specialist_id IS
  'UUID do specialists ligado ao auth.uid(), ou NULL.';

CREATE OR REPLACE FUNCTION public.auth_is_linked_specialist(p_specialist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.specialist_accounts sa
    WHERE sa.user_id = auth.uid()
      AND sa.specialist_id = p_specialist_id
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_linked_specialist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_linked_specialist(uuid) TO authenticated;

COMMENT ON FUNCTION public.auth_is_linked_specialist(uuid) IS
  'true se auth.uid() está ligado a este specialist_id (para RLS sem GRANT na tabela de vínculos).';

CREATE OR REPLACE FUNCTION public.admin_link_specialist_account(
  p_specialist_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_specialist_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.specialist_accounts (user_id, specialist_id)
  VALUES (p_user_id, p_specialist_id)
  ON CONFLICT (user_id) DO UPDATE
    SET specialist_id = EXCLUDED.specialist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_link_specialist_account(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_link_specialist_account(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) Bloqueios manuais de slots (30 min) — mães vêem como “ocupado”
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.specialist_calendar_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  specialist_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT specialist_calendar_blocks_pkey PRIMARY KEY (id),
  CONSTRAINT specialist_calendar_blocks_specialist_fkey
    FOREIGN KEY (specialist_id) REFERENCES public.specialists (id) ON DELETE CASCADE,
  CONSTRAINT specialist_calendar_blocks_slot_unique UNIQUE (specialist_id, starts_at)
);

CREATE INDEX IF NOT EXISTS specialist_calendar_blocks_specialist_range_idx
  ON public.specialist_calendar_blocks (specialist_id, starts_at);

COMMENT ON TABLE public.specialist_calendar_blocks IS
  'Horários fechados pelo médico (fora de reservas pagas).';

ALTER TABLE public.specialist_calendar_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "specialist_blocks_select_own" ON public.specialist_calendar_blocks;
CREATE POLICY "specialist_blocks_select_own"
  ON public.specialist_calendar_blocks FOR SELECT
  TO authenticated
  USING (public.auth_is_linked_specialist(specialist_calendar_blocks.specialist_id));

DROP POLICY IF EXISTS "specialist_blocks_insert_own" ON public.specialist_calendar_blocks;
CREATE POLICY "specialist_blocks_insert_own"
  ON public.specialist_calendar_blocks FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_is_linked_specialist(specialist_calendar_blocks.specialist_id));

DROP POLICY IF EXISTS "specialist_blocks_delete_own" ON public.specialist_calendar_blocks;
CREATE POLICY "specialist_blocks_delete_own"
  ON public.specialist_calendar_blocks FOR DELETE
  TO authenticated
  USING (public.auth_is_linked_specialist(specialist_calendar_blocks.specialist_id));

GRANT SELECT, INSERT, DELETE ON public.specialist_calendar_blocks TO authenticated;
REVOKE UPDATE ON public.specialist_calendar_blocks FROM authenticated;

CREATE OR REPLACE FUNCTION public.specialist_calendar_block_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.consultation_bookings b
    WHERE b.specialist_id = NEW.specialist_id
      AND b.starts_at = NEW.starts_at
      AND b.status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text])
  ) THEN
    RAISE EXCEPTION 'slot_has_booking' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS specialist_calendar_block_guard_trg ON public.specialist_calendar_blocks;
CREATE TRIGGER specialist_calendar_block_guard_trg
  BEFORE INSERT ON public.specialist_calendar_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.specialist_calendar_block_guard();

-- -----------------------------------------------------------------------------
-- 3) Médico ligado: ver reservas do seu specialists_id
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "consultation_bookings_select_linked_specialist" ON public.consultation_bookings;
CREATE POLICY "consultation_bookings_select_linked_specialist"
  ON public.consultation_bookings FOR SELECT
  TO authenticated
  USING (public.auth_is_linked_specialist(consultation_bookings.specialist_id));

-- -----------------------------------------------------------------------------
-- 4) list_specialist_booked_starts inclui bloqueios manuais
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_specialist_booked_starts(
  p_specialist_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (starts_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.starts_at
  FROM public.consultation_bookings b
  WHERE b.specialist_id = p_specialist_id
    AND b.status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text])
    AND b.starts_at >= p_from
    AND b.starts_at < p_to
  UNION
  SELECT bl.starts_at
  FROM public.specialist_calendar_blocks bl
  WHERE bl.specialist_id = p_specialist_id
    AND bl.starts_at >= p_from
    AND bl.starts_at < p_to;
$$;

REVOKE ALL ON FUNCTION public.list_specialist_booked_starts(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_specialist_booked_starts(uuid, timestamptz, timestamptz) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) Admin: listar reservas e intenções MP (evita falhas de RLS / schema)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_consultation_bookings(p_limit integer DEFAULT 300)
RETURNS SETOF public.consultation_bookings
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lim int := LEAST(COALESCE(NULLIF(p_limit, 0), 300), 500);
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT b.*
    FROM public.consultation_bookings b
    ORDER BY b.starts_at DESC
    LIMIT lim;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_consultation_bookings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_consultation_bookings(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_checkout_intents(p_limit integer DEFAULT 300)
RETURNS SETOF public.consultation_checkout_intents
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lim int := LEAST(COALESCE(NULLIF(p_limit, 0), 300), 500);
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT i.*
    FROM public.consultation_checkout_intents i
    ORDER BY i.created_at DESC
    LIMIT lim;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_checkout_intents(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_checkout_intents(integer) TO authenticated;

-- Garantir leitura na API (caso grants locais tenham sido revogados)
GRANT SELECT ON public.consultation_bookings TO authenticated;
GRANT SELECT ON public.consultation_checkout_intents TO authenticated;
GRANT UPDATE ON public.consultation_bookings TO authenticated;
