-- =============================================================================
-- Aura — Método de pagamento na reserva (Pix / cartão) + RPC com 3º parâmetro
-- =============================================================================

ALTER TABLE public.consultation_bookings
  ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
BEGIN
  ALTER TABLE public.consultation_bookings
    ADD CONSTRAINT consultation_bookings_payment_method_check CHECK (
      payment_method IS NULL
      OR payment_method = ANY (ARRAY['pix'::text, 'credit_card'::text, 'debit_card'::text])
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

COMMENT ON COLUMN public.consultation_bookings.payment_method IS
  'Meio escolhido na app: pix, credit_card, debit_card.';

DROP FUNCTION IF EXISTS public.create_consultation_booking(uuid, timestamptz);

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
    jitsi_room_slug,
    payment_method
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
    'payment_method', p_payment_method
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.create_consultation_booking(uuid, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consultation_booking(uuid, timestamptz, text) TO authenticated;

COMMENT ON FUNCTION public.create_consultation_booking(uuid, timestamptz, text) IS
  'Cria consulta confirmada com método de pagamento escolhido (integração gateway em fase seguinte).';
