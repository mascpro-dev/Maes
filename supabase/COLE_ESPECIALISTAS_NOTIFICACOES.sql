-- =============================================================================
-- Aura — Contactos privados do médico + aviso por e-mail/SMS ao novo agendamento
-- Cola no SQL Editor (ou migração) DEPOIS de specialists / consultation_bookings existirem.
-- O app público NÃO lê esta tabela — só a service role na Edge Function / webhook.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.specialist_private_routes (
  specialist_id uuid NOT NULL,
  notify_email text,
  notify_phone text,
  CONSTRAINT specialist_private_routes_pkey PRIMARY KEY (specialist_id),
  CONSTRAINT specialist_private_routes_specialist_fkey
    FOREIGN KEY (specialist_id) REFERENCES public.specialists (id) ON DELETE CASCADE
);

ALTER TABLE public.specialist_private_routes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.specialist_private_routes FROM PUBLIC;
GRANT ALL ON public.specialist_private_routes TO service_role;
-- authenticated / anon sem políticas = sem acesso

COMMENT ON TABLE public.specialist_private_routes IS
  'E-mail/SMS do profissional para notificações de agenda (só backend).';

-- Exemplo: associar contactos (substituir UUID e dados reais)
-- INSERT INTO public.specialist_private_routes (specialist_id, notify_email, notify_phone)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',
--   'medico@clinica.exemplo',
--   '+5511999999999'
-- )
-- ON CONFLICT (specialist_id) DO UPDATE SET
--   notify_email = EXCLUDED.notify_email,
--   notify_phone = EXCLUDED.notify_phone;

/*
  Próximo passo (fora deste ficheiro):

  1) Supabase Dashboard → Database → Webhooks: em INSERT em consultation_bookings,
     chamar uma Edge Function com service role.

  2) Na função (Deno):
     - Ler specialist_id e starts_at do payload.
     - SELECT notify_email, notify_phone FROM specialist_private_routes WHERE specialist_id = …
     - Enviar e-mail (Resend, SendGrid, etc.) e SMS (Twilio, Zenvia, etc.) com data/hora e sala Jitsi.

  3) Opcional: marcar consultation_bookings com colunas notified_at / notified_sms_at para idempotência.
*/
