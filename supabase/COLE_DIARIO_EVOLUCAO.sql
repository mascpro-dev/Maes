-- =============================================================================
-- Aura — Cola isto no Supabase → SQL Editor (se não usares supabase db push)
-- Cria: tabela public.diary_entries + bucket storage "diary-audio" (privado)
-- =============================================================================

-- (Conteúdo igual a supabase/migrations/20260406140000_diary_entries_and_storage.sql)

CREATE TABLE IF NOT EXISTS public.diary_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date date NOT NULL,
  kind text NOT NULL,
  mode text NOT NULL,
  text_content text,
  audio_storage_path text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT diary_entries_pkey PRIMARY KEY (id),
  CONSTRAINT diary_entries_kind_check CHECK (kind = ANY (ARRAY['marco'::text, 'crise'::text])),
  CONSTRAINT diary_entries_mode_check CHECK (mode = ANY (ARRAY['text'::text, 'audio'::text])),
  CONSTRAINT diary_entries_payload_check CHECK (
    (mode = 'text' AND coalesce(trim(text_content), '') <> '')
    OR (mode = 'audio' AND coalesce(trim(audio_storage_path), '') <> '')
  )
);

DO $$
BEGIN
  ALTER TABLE ONLY public.diary_entries
    ADD CONSTRAINT diary_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

CREATE INDEX IF NOT EXISTS diary_entries_user_date_idx ON public.diary_entries (user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS diary_entries_user_created_idx ON public.diary_entries (user_id, created_at DESC);

ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diary_entries_select_own" ON public.diary_entries;
CREATE POLICY "diary_entries_select_own"
  ON public.diary_entries FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "diary_entries_insert_own" ON public.diary_entries;
CREATE POLICY "diary_entries_insert_own"
  ON public.diary_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "diary_entries_delete_own" ON public.diary_entries;
CREATE POLICY "diary_entries_delete_own"
  ON public.diary_entries FOR DELETE
  USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('diary-audio', 'diary-audio', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "diary_audio_select_own" ON storage.objects;
CREATE POLICY "diary_audio_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'diary-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "diary_audio_insert_own" ON storage.objects;
CREATE POLICY "diary_audio_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'diary-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "diary_audio_update_own" ON storage.objects;
CREATE POLICY "diary_audio_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'diary-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'diary-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "diary_audio_delete_own" ON storage.objects;
CREATE POLICY "diary_audio_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'diary-audio'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- ----- Atualização: medicação (corre também se já tens a tabela antiga) -----
ALTER TABLE public.diary_entries
  ADD COLUMN IF NOT EXISTS medication_name text,
  ADD COLUMN IF NOT EXISTS medication_given_at time;

ALTER TABLE public.diary_entries DROP CONSTRAINT IF EXISTS diary_entries_kind_check;
ALTER TABLE public.diary_entries
  ADD CONSTRAINT diary_entries_kind_check CHECK (
    kind = ANY (ARRAY['marco'::text, 'crise'::text, 'medicacao'::text])
  );

ALTER TABLE public.diary_entries DROP CONSTRAINT IF EXISTS diary_entries_payload_check;
ALTER TABLE public.diary_entries
  ADD CONSTRAINT diary_entries_payload_check CHECK (
    (kind IN ('marco', 'crise') AND mode = 'text' AND coalesce(trim(text_content), '') <> '')
    OR (kind IN ('marco', 'crise') AND mode = 'audio' AND coalesce(trim(audio_storage_path), '') <> '')
    OR (
      kind = 'medicacao'
      AND mode = 'text'
      AND coalesce(trim(medication_name), '') <> ''
      AND medication_given_at IS NOT NULL
    )
    OR (kind = 'medicacao' AND mode = 'audio' AND coalesce(trim(audio_storage_path), '') <> '')
  );
