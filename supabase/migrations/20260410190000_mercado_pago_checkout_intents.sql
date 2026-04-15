-- =============================================================================
-- Aura — Intenção de checkout Mercado Pago (Pix / crédito 1x) antes da reserva
-- A reserva em consultation_bookings só é criada após pagamento aprovado (webhook).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.consultation_checkout_intents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mother_id uuid NOT NULL,
  specialist_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  payment_method text NOT NULL,
  mp_preference_id text,
  mp_payment_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT consultation_checkout_intents_pkey PRIMARY KEY (id),
  CONSTRAINT consultation_checkout_intents_mother_fkey
    FOREIGN KEY (mother_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT consultation_checkout_intents_specialist_fkey
    FOREIGN KEY (specialist_id) REFERENCES public.specialists (id) ON DELETE CASCADE,
  CONSTRAINT consultation_checkout_intents_payment_check CHECK (
    payment_method = ANY (ARRAY['pix'::text, 'credit_card'::text])
  ),
  CONSTRAINT consultation_checkout_intents_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'expired'::text])
  )
);

CREATE INDEX IF NOT EXISTS consultation_checkout_intents_mother_idx
  ON public.consultation_checkout_intents (mother_id, created_at DESC);

CREATE INDEX IF NOT EXISTS consultation_checkout_intents_status_idx
  ON public.consultation_checkout_intents (status, created_at DESC);

COMMENT ON TABLE public.consultation_checkout_intents IS
  'Checkout Pro: referência external_reference = id; webhook finaliza reserva.';

ALTER TABLE public.consultation_checkout_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkout_intents_select_own" ON public.consultation_checkout_intents;
CREATE POLICY "checkout_intents_select_own"
  ON public.consultation_checkout_intents FOR SELECT
  TO authenticated
  USING (mother_id = auth.uid());

-- Finalização só pela service role (Edge Function), nunca pelo cliente anónimo
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

  IF EXISTS (
    SELECT 1 FROM public.consultation_bookings b
    WHERE b.specialist_id = i.specialist_id
      AND b.starts_at = i.starts_at
      AND b.status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text])
  ) THEN
    UPDATE public.consultation_checkout_intents SET status = 'failed' WHERE id = p_intent_id;
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
  END IF;

  v_min := EXTRACT(minute FROM i.starts_at AT TIME ZONE 'UTC')::int;
  IF v_min NOT IN (0, 30) OR EXTRACT(second FROM i.starts_at)::int <> 0 THEN
    UPDATE public.consultation_checkout_intents SET status = 'failed' WHERE id = p_intent_id;
    RAISE EXCEPTION 'slot_must_align_30min' USING ERRCODE = 'P0001';
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
    30,
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
    'starts_at', i.starts_at
  );
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.consultation_checkout_intents SET status = 'failed' WHERE id = p_intent_id;
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_consultation_checkout_intent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_consultation_checkout_intent(uuid, text) TO service_role;

COMMENT ON FUNCTION public.finalize_consultation_checkout_intent IS
  'Chamada pela Edge Function mercadopago-webhook após validar pagamento no MP.';

REVOKE INSERT ON public.consultation_checkout_intents FROM authenticated;
REVOKE INSERT ON public.consultation_checkout_intents FROM anon;
REVOKE UPDATE ON public.consultation_checkout_intents FROM authenticated;
REVOKE UPDATE ON public.consultation_checkout_intents FROM anon;
REVOKE DELETE ON public.consultation_checkout_intents FROM authenticated;
REVOKE DELETE ON public.consultation_checkout_intents FROM anon;
