-- =============================================================================
-- COLE NO SUPABASE (SQL Editor) — Reembolsos + Storage receipts + rede indicação
-- (cópia de supabase/migrations/20260409140000_refunds_receipts_referrals.sql)
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by uuid;

DO $$
BEGIN
  ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referred_by_fkey
    FOREIGN KEY (referred_by) REFERENCES public.profiles (id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles (referred_by);

COMMENT ON COLUMN public.profiles.referred_by IS
  'ID da utilizadora que indicou este cadastro (rede de indicações).';

DROP POLICY IF EXISTS "profiles_select_my_referrals" ON public.profiles;
CREATE POLICY "profiles_select_my_referrals"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (referred_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  receipt_path text NOT NULL,
  amount_cents bigint,
  service_date date,
  provider_name text,
  service_type text,
  recipient_label text NOT NULL DEFAULT 'Operadora do teu plano de saúde (canal Conta Mãe)',
  ocr_confidence integer,
  raw_ocr_snippet text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT refunds_pkey PRIMARY KEY (id),
  CONSTRAINT refunds_status_check CHECK (
    status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'cancelado'::text])
  ),
  CONSTRAINT refunds_amount_nonneg CHECK (amount_cents IS NULL OR amount_cents >= 0),
  CONSTRAINT refunds_ocr_confidence_range CHECK (
    ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 100)
  )
);

-- Se refunds já existia com outro esquema, CREATE IF NOT EXISTS não acrescenta colunas.
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS receipt_path text;

-- Legado comum: coluna profile_id em vez de user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'refunds'
      AND column_name = 'profile_id'
  ) THEN
    EXECUTE $u$
      UPDATE public.refunds
      SET user_id = profile_id
      WHERE user_id IS NULL AND profile_id IS NOT NULL
    $u$;
  END IF;
END
$$;

UPDATE public.refunds SET status = 'pendente' WHERE status IS NULL OR trim(status) = '';

DO $$
BEGIN
  ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

CREATE INDEX IF NOT EXISTS refunds_user_created_idx ON public.refunds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refunds_user_status_idx ON public.refunds (user_id, status);

CREATE OR REPLACE FUNCTION public.set_refunds_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refunds_set_updated_at ON public.refunds;
CREATE TRIGGER refunds_set_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.set_refunds_updated_at();

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refunds_select_own" ON public.refunds;
CREATE POLICY "refunds_select_own"
  ON public.refunds FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "refunds_insert_own" ON public.refunds;
CREATE POLICY "refunds_insert_own"
  ON public.refunds FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "refunds_update_own" ON public.refunds;
CREATE POLICY "refunds_update_own"
  ON public.refunds FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "refunds_delete_own" ON public.refunds;
CREATE POLICY "refunds_delete_own"
  ON public.refunds FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.refunds IS
  'Pedidos de reembolso: recibo no Storage + metadados extraídos ou preenchidos manualmente.';

ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS amount_cents bigint;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS service_date date;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS provider_name text;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS recipient_label text;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS ocr_confidence integer;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS raw_ocr_snippet text;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.refunds
SET recipient_label = 'Operadora do teu plano de saúde (canal Conta Mãe)'
WHERE recipient_label IS NULL OR trim(recipient_label) = '';

UPDATE public.refunds
SET created_at = timezone('utc'::text, now())
WHERE created_at IS NULL;

UPDATE public.refunds
SET updated_at = timezone('utc'::text, now())
WHERE updated_at IS NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "receipts_select_own" ON storage.objects;
CREATE POLICY "receipts_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "receipts_insert_own" ON storage.objects;
CREATE POLICY "receipts_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "receipts_update_own" ON storage.objects;
CREATE POLICY "receipts_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "receipts_delete_own" ON storage.objects;
CREATE POLICY "receipts_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.my_referral_network_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  direct_n bigint;
  total_n bigint;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('direct_count', 0, 'network_total', 0);
  END IF;

  SELECT count(*)::bigint INTO direct_n FROM public.profiles WHERE referred_by = uid;

  WITH RECURSIVE tree AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.referred_by = uid
    UNION ALL
    SELECT c.id
    FROM public.profiles c
    INNER JOIN tree t ON c.referred_by = t.id
  )
  SELECT count(*)::bigint INTO total_n FROM tree;

  RETURN jsonb_build_object(
    'direct_count', COALESCE(direct_n, 0),
    'network_total', COALESCE(total_n, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_referral_network_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_referral_network_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_referrals()
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.referred_by = auth.uid()
  ORDER BY p.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_my_referrals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_referrals() TO authenticated;
