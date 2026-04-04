-- Próximo compromisso no dashboard (cartão + countdown + rotas)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS next_appointment_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS next_appointment_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS next_appointment_location text;

COMMENT ON COLUMN public.profiles.next_appointment_at IS 'Data/hora do próximo compromisso (UTC).';
COMMENT ON COLUMN public.profiles.next_appointment_title IS 'Título no cartão (ex.: Terapia ABA).';
COMMENT ON COLUMN public.profiles.next_appointment_location IS 'Local para exibição e pesquisa no Google Maps.';
