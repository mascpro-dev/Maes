-- =============================================================================
-- CONTA MÃE — Candidaturas «Profissional parceiro» (formulário público)
-- Cole no Supabase → SQL Editor → Run (podes correr mais de uma vez)
-- =============================================================================
-- Table Editor → partner_professional_applications (ou painel admin.html → aba Parceiros, após migração RPC).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.partner_professional_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  full_name text NOT NULL,
  cpf_or_rg text,
  whatsapp text NOT NULL,
  email text NOT NULL,
  cidade_estado_atuacao text NOT NULL,
  links_redes_site text,
  area_atuacao text NOT NULL,
  tempo_experiencia text NOT NULL,
  foco_especializacao text,
  registro_profissional text,
  motivacao_parceria text NOT NULL,
  periodos text[] NOT NULL DEFAULT '{}'::text[],
  dias_semana text[] NOT NULL DEFAULT '{}'::text[],
  aceita_precificacao boolean NOT NULL DEFAULT false,
  mini_curriculo text NOT NULL,
  consentimento_triagem boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  CONSTRAINT partner_apps_accept_price CHECK (aceita_precificacao = true),
  CONSTRAINT partner_apps_consent CHECK (consentimento_triagem = true),
  CONSTRAINT partner_apps_status_check CHECK (
    status = ANY (ARRAY['pending', 'reviewing', 'approved', 'rejected']::text[])
  )
);

CREATE INDEX IF NOT EXISTS partner_professional_applications_created_at_idx
  ON public.partner_professional_applications (created_at DESC);

CREATE INDEX IF NOT EXISTS partner_professional_applications_email_idx
  ON public.partner_professional_applications (email);

COMMENT ON TABLE public.partner_professional_applications IS
  'Pedidos de parceria (formulário público); após triagem manual, criar/ativar entrada em specialists.';

ALTER TABLE public.partner_professional_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_prof_apps_insert_any" ON public.partner_professional_applications;
CREATE POLICY "partner_prof_apps_insert_any"
  ON public.partner_professional_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "partner_prof_apps_select_own" ON public.partner_professional_applications;

REVOKE ALL ON public.partner_professional_applications FROM PUBLIC;
GRANT INSERT ON public.partner_professional_applications TO anon, authenticated;
