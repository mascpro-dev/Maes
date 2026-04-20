-- =============================================================================
-- Aura — Duração da consulta por especialista (30 ou 60 min) + RPCs alinhados
-- =============================================================================

ALTER TABLE public.specialists
  ADD COLUMN IF NOT EXISTS consultation_duration_minutes integer NOT NULL DEFAULT 30;

DO $$
BEGIN
  ALTER TABLE public.specialists
    ADD CONSTRAINT specialists_consultation_duration_check CHECK (
      consultation_duration_minutes = ANY (ARRAY[30, 60])
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

COMMENT ON COLUMN public.specialists.consultation_duration_minutes IS
  'Duração padrão da consulta (30 ou 60 min). Usado na marcação e no webhook MP.';

-- -----------------------------------------------------------------------------
-- Trigger: bloqueio de agenda não pode sobrepor reserva ativa (qualquer duração)
-- -----------------------------------------------------------------------------
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
      AND b.status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text])
      AND b.starts_at < NEW.starts_at + interval '30 minutes'
      AND (b.starts_at + (b.duration_minutes::text || ' minutes')::interval) > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'slot_has_booking' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- list_specialist_booked_starts — inclui 2º meio-hora se reserva for de 60 min
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
  SELECT b.starts_at + interval '30 minutes'
  FROM public.consultation_bookings b
  WHERE b.specialist_id = p_specialist_id
    AND b.status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text])
    AND b.duration_minutes >= 60
    AND b.starts_at + interval '30 minutes' >= p_from
    AND b.starts_at + interval '30 minutes' < p_to
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
-- finalize_consultation_checkout_intent — duração + sobreposição
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_consultation_checkout_intent(
  p_intent_id uuid,
  p_mp_payment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  i public.consultation_checkout_intents%ROWTYPE;
  v_ref uuid;
  v_id uuid;
  v_slug text;
  v_price int := 4990;
  v_doctor int := 4000;
  v_ref_cents int;
  v_plat int;
  v_min int;
  v_dur int;
  v_end timestamptz;
BEGIN
  IF p_intent_id IS NULL THEN
    RAISE EXCEPTION 'invalid_intent' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO i
  FROM public.consultation_checkout_intents
  WHERE id = p_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'intent_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF i.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  IF i.status <> 'pending' THEN
    RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.specialists s
    WHERE s.id = i.specialist_id AND s.active = true
  ) THEN
    UPDATE public.consultation_checkout_intents SET status = 'failed' WHERE id = p_intent_id;
    RAISE EXCEPTION 'invalid_specialist' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(s.consultation_duration_minutes, 30) INTO v_dur
  FROM public.specialists s
  WHERE s.id = i.specialist_id;

  IF v_dur NOT IN (30, 60) THEN
    v_dur := 30;
  END IF;

  v_end := i.starts_at + (v_dur::text || ' minutes')::interval;

  IF EXISTS (
    SELECT 1
    FROM public.consultation_bookings b
    WHERE b.specialist_id = i.specialist_id
      AND b.status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text])
      AND b.starts_at < v_end
      AND (b.starts_at + (b.duration_minutes::text || ' minutes')::interval) > i.starts_at
  ) THEN
    UPDATE public.consultation_checkout_intents SET status = 'failed' WHERE id = p_intent_id;
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
  END IF;

  v_min := EXTRACT(minute FROM i.starts_at AT TIME ZONE 'UTC')::int;
  IF v_dur = 60 THEN
    IF v_min <> 0 OR EXTRACT(second FROM i.starts_at)::int <> 0 THEN
      UPDATE public.consultation_checkout_intents SET status = 'failed' WHERE id = p_intent_id;
      RAISE EXCEPTION 'slot_must_align_hour' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_min NOT IN (0, 30) OR EXTRACT(second FROM i.starts_at)::int <> 0 THEN
      UPDATE public.consultation_checkout_intents SET status = 'failed' WHERE id = p_intent_id;
      RAISE EXCEPTION 'slot_must_align_30min' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT referred_by INTO v_ref FROM public.profiles WHERE id = i.mother_id;
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
    jitsi_room_slug,
    payment_method
  ) VALUES (
    v_id,
    i.specialist_id,
    i.mother_id,
    v_ref,
    i.starts_at,
    v_dur,
    'confirmed',
    v_price,
    v_doctor,
    v_ref_cents,
    v_plat,
    v_slug,
    CASE
      WHEN i.payment_method = 'credit_card' THEN 'credit_card'::text
      ELSE 'pix'::text
    END
  );

  UPDATE public.consultation_checkout_intents
  SET
    status = 'completed',
    mp_payment_id = COALESCE(NULLIF(trim(p_mp_payment_id), ''), mp_payment_id)
  WHERE id = p_intent_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_id,
    'jitsi_room_slug', v_slug,
    'starts_at', i.starts_at,
    'duration_minutes', v_dur
  );
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.consultation_checkout_intents SET status = 'failed' WHERE id = p_intent_id;
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
END;
$$;

-- -----------------------------------------------------------------------------
-- create_consultation_booking — duração + sobreposição
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_consultation_booking(
  p_specialist_id uuid,
  p_starts_at timestamptz,
  p_payment_method text
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
  v_dur int;
  v_end timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_payment_method IS NULL OR trim(p_payment_method) = ''
     OR p_payment_method NOT IN ('pix', 'credit_card', 'debit_card') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.specialists s
    WHERE s.id = p_specialist_id AND s.active = true
  ) THEN
    RAISE EXCEPTION 'invalid_specialist' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(s.consultation_duration_minutes, 30) INTO v_dur
  FROM public.specialists s
  WHERE s.id = p_specialist_id;

  IF v_dur NOT IN (30, 60) THEN
    v_dur := 30;
  END IF;

  v_end := p_starts_at + (v_dur::text || ' minutes')::interval;

  IF EXISTS (
    SELECT 1
    FROM public.consultation_bookings b
    WHERE b.specialist_id = p_specialist_id
      AND b.status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text])
      AND b.starts_at < v_end
      AND (b.starts_at + (b.duration_minutes::text || ' minutes')::interval) > p_starts_at
  ) THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
  END IF;

  IF p_starts_at IS NULL OR p_starts_at <= (timezone('utc'::text, now()) + interval '10 minutes') THEN
    RAISE EXCEPTION 'slot_too_soon' USING ERRCODE = 'P0001';
  END IF;

  v_min := EXTRACT(minute FROM p_starts_at AT TIME ZONE 'UTC')::int;
  IF v_dur = 60 THEN
    IF v_min <> 0 OR EXTRACT(second FROM p_starts_at)::int <> 0 THEN
      RAISE EXCEPTION 'slot_must_align_hour' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_min NOT IN (0, 30) OR EXTRACT(second FROM p_starts_at)::int <> 0 THEN
      RAISE EXCEPTION 'slot_must_align_30min' USING ERRCODE = 'P0001';
    END IF;
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
    jitsi_room_slug,
    payment_method
  ) VALUES (
    v_id,
    p_specialist_id,
    v_uid,
    v_ref,
    p_starts_at,
    v_dur,
    'confirmed',
    v_price,
    v_doctor,
    v_ref_cents,
    v_plat,
    v_slug,
    p_payment_method
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'jitsi_room_slug', v_slug,
    'starts_at', p_starts_at,
    'price_cents', v_price,
    'doctor_cents', v_doctor,
    'referrer_cents', v_ref_cents,
    'platform_cents', v_plat,
    'payment_method', p_payment_method,
    'duration_minutes', v_dur
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
END;
$$;

-- -----------------------------------------------------------------------------
-- Admin: resumo do especialista ligado (duração) — para o painel Cadastros
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_linked_specialist_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r jsonb;
BEGIN
  IF NOT public.is_aura_admin() THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object(
    'specialist_id', sa.specialist_id,
    'consultation_duration_minutes', COALESCE(s.consultation_duration_minutes, 30)
  )
  INTO r
  FROM public.specialist_accounts sa
  JOIN public.specialists s ON s.id = sa.specialist_id
  WHERE sa.user_id = p_user_id
  LIMIT 1;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_linked_specialist_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_linked_specialist_summary(uuid) TO authenticated;
