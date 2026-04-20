-- Medicação no diário: kind medicacao + campos opcionais de nome e hora
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

COMMENT ON COLUMN public.diary_entries.medication_name IS 'Nome do medicamento (registos kind=medicacao).';
COMMENT ON COLUMN public.diary_entries.medication_given_at IS 'Hora em que foi ministrado (registos medicacao em texto).';
