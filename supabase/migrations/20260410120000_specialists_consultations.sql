-- =============================================================================
-- Aura — Especialistas credenciados + consultas sociais (agenda sem sobreposição)
-- Valor: R$ 49,90 (4990 centavos) · médico R$ 40,00 (4000) · 3% indicação · resto plataforma
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Médicos credenciados (dados para notificação ficam só no servidor / painel admin)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.specialists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  specialty text NOT NULL,
  bio text,
  photo_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT specialists_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS specialists_active_sort_idx
  ON public.specialists (active, sort_order, display_name);

COMMENT ON TABLE public.specialists IS
  'Profissionais credenciados para consulta social na app (capa + especialidade). Contactos do médico ficam fora desta tabela pública (Edge Function + secrets).';

-- -----------------------------------------------------------------------------
-- 2) Reservas de consulta — índice único parcial impede dois agendamentos no mesmo instante
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultation_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  specialist_id uuid NOT NULL,
  mother_id uuid NOT NULL,
  referrer_id uuid,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'confirmed',
  price_cents integer NOT NULL DEFAULT 4990,
  doctor_cents integer NOT NULL DEFAULT 4000,
  referrer_cents integer NOT NULL DEFAULT 0,
  platform_cents integer NOT NULL DEFAULT 0,
  jitsi_room_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT consultation_bookings_pkey PRIMARY KEY (id),
  CONSTRAINT consultation_bookings_specialist_fkey
    FOREIGN KEY (specialist_id) REFERENCES public.specialists (id) ON DELETE RESTRICT,
  CONSTRAINT consultation_bookings_mother_fkey
    FOREIGN KEY (mother_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT consultation_bookings_referrer_fkey
    FOREIGN KEY (referrer_id) REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT consultation_bookings_status_check CHECK (
    status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text, 'cancelled'::text])
  ),
  CONSTRAINT consultation_bookings_duration_check CHECK (
    duration_minutes > 0 AND duration_minutes <= 120
  ),
  CONSTRAINT consultation_bookings_price_nonneg CHECK (price_cents >= 0),
  CONSTRAINT consultation_bookings_shares_sum CHECK (
    doctor_cents >= 0 AND referrer_cents >= 0 AND platform_cents >= 0
      AND doctor_cents + referrer_cents + platform_cents = price_cents
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS consultation_bookings_slot_unique
  ON public.consultation_bookings (specialist_id, starts_at)
  WHERE (status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text]));

CREATE INDEX IF NOT EXISTS consultation_bookings_mother_idx
  ON public.consultation_bookings (mother_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS consultation_bookings_specialist_idx
  ON public.consultation_bookings (specialist_id, starts_at DESC);

-- -----------------------------------------------------------------------------
-- 3) RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.specialists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "specialists_select_active" ON public.specialists;
CREATE POLICY "specialists_select_active"
  ON public.specialists FOR SELECT
  TO authenticated
  USING (active = true);

ALTER TABLE public.consultation_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultation_bookings_select_own" ON public.consultation_bookings;
CREATE POLICY "consultation_bookings_select_own"
  ON public.consultation_bookings FOR SELECT
  TO authenticated
  USING (mother_id = auth.uid());

-- Inserções apenas via função SECURITY DEFINER (evita manipular valores da divisão)
REVOKE INSERT ON public.consultation_bookings FROM authenticated;
REVOKE INSERT ON public.consultation_bookings FROM anon;

-- -----------------------------------------------------------------------------
-- 4) RPC: criar reserva com divisão correta e slug da sala de vídeo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_consultation_booking(
  p_specialist_id uuid,
  p_starts_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ref uuid;
  v_id uuid;
  v_slug text;
  v_price int := 4990;
  v_doctor int := 4000;
  v_ref_cents int;
  v_plat int;
  v_min int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.specialists s
    WHERE s.id = p_specialist_id AND s.active = true
  ) THEN
    RAISE EXCEPTION 'invalid_specialist' USING ERRCODE = 'P0001';
  END IF;

  IF p_starts_at IS NULL OR p_starts_at <= (timezone('utc'::text, now()) + interval '10 minutes') THEN
    RAISE EXCEPTION 'slot_too_soon' USING ERRCODE = 'P0001';
  END IF;

  v_min := EXTRACT(minute FROM p_starts_at AT TIME ZONE 'UTC')::int;
  IF v_min NOT IN (0, 30) OR EXTRACT(second FROM p_starts_at)::int <> 0 THEN
    RAISE EXCEPTION 'slot_must_align_30min' USING ERRCODE = 'P0001';
  END IF;

  SELECT referred_by INTO v_ref FROM public.profiles WHERE id = v_uid;
  v_ref_cents := CASE WHEN v_ref IS NOT NULL THEN round(v_price * 0.03)::int ELSE 0 END;
  v_plat := v_price - v_doctor - v_ref_cents;
  IF v_plat < 0 THEN
    v_ref_cents := 0;
    v_plat := v_price - v_doctor;
  END IF;

  v_id := gen_random_uuid();
  v_slug := 'AuraMae' || replace(v_id::text, '-', '');

  INSERT INTO public.consultation_bookings (
    id,
    specialist_id,
    mother_id,
    referrer_id,
    starts_at,
    duration_minutes,
    status,
    price_cents,
    doctor_cents,
    referrer_cents,
    platform_cents,
    jitsi_room_slug
  ) VALUES (
    v_id,
    p_specialist_id,
    v_uid,
    v_ref,
    p_starts_at,
    30,
    'confirmed',
    v_price,
    v_doctor,
    v_ref_cents,
    v_plat,
    v_slug
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'jitsi_room_slug', v_slug,
    'starts_at', p_starts_at,
    'price_cents', v_price,
    'doctor_cents', v_doctor,
    'referrer_cents', v_ref_cents,
    'platform_cents', v_plat
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.create_consultation_booking(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consultation_booking(uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.create_consultation_booking IS
  'Cria consulta confirmada (pagamento real deve ser integrado depois; bloqueia slot duplicado).';

-- Leitura de horários já ocupados (para a mãe montar a grade)
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
    AND b.starts_at < p_to;
$$;

REVOKE ALL ON FUNCTION public.list_specialist_booked_starts(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_specialist_booked_starts(uuid, timestamptz, timestamptz) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) Dados de demonstração (substituir fotos/URLs em produção)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT COUNT(*)::int FROM public.specialists) = 0 THEN
    INSERT INTO public.specialists (display_name, specialty, bio, photo_url, sort_order)
    VALUES
      (
        'Dra. Helena Martins',
        'Pediatria desenvolvimental',
        'Acompanhamento de neurodivergência e orientação para famílias.',
        'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&h=600&fit=crop&q=80',
        1
      ),
      (
        'Dr. Ricardo Almeida',
        'Psiquiatria infanto-juvenil',
        'Escuta clínica e planejamento terapêutico integrado à rotina da família.',
        'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=600&fit=crop&q=80',
        2
      ),
      (
        'Dra. Camila Duarte',
        'Neurologia pediátrica',
        'Avaliação e encaminhamento com foco em TEA, TDAH e epilepsias leves.',
        'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400&h=600&fit=crop&q=80',
        3
      );
  END IF;
END $$;
