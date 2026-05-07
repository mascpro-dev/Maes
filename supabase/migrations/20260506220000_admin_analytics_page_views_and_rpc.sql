-- =============================================================================
-- Analytics admin: vistas de página (utilizadores autenticados) + RPC de resumo
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_page_views (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT app_page_views_pkey PRIMARY KEY (id),
  CONSTRAINT app_page_views_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS app_page_views_created_at_idx
  ON public.app_page_views (created_at DESC);

CREATE INDEX IF NOT EXISTS app_page_views_path_created_idx
  ON public.app_page_views (page_path, created_at DESC);

COMMENT ON TABLE public.app_page_views IS
  'Eventos de navegação (path do HTML) por utilizador autenticado; agregações só via admin.';

ALTER TABLE public.app_page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_page_views_insert_own" ON public.app_page_views;
CREATE POLICY "app_page_views_insert_own"
  ON public.app_page_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.app_page_views FROM PUBLIC;
GRANT INSERT ON public.app_page_views TO authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pais text;
COMMENT ON COLUMN public.profiles.pais IS
  'País (opcional); preenchimento futuro no perfil.';

CREATE OR REPLACE FUNCTION public.admin_analytics_dashboard(
  p_presence_minutes integer DEFAULT 10,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := timezone('utc'::text, now());
  v_to timestamptz;
  v_from timestamptz;
  v_day_start timestamptz;
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_to := COALESCE(p_to, v_now);
  v_from := COALESCE(p_from, v_to - interval '15 days');
  IF v_from > v_to THEN
    v_from := v_to - interval '15 days';
  END IF;

  v_day_start := date_trunc('day', v_now);

  RETURN jsonb_build_object(
    'online_now',
      (SELECT COUNT(*)::int FROM public.user_presence up
       WHERE up.last_seen_at >= v_now - (GREATEST(1, LEAST(COALESCE(p_presence_minutes, 10), 120)) * interval '1 minute')),
    'online_today',
      (SELECT COUNT(DISTINCT up.user_id)::int FROM public.user_presence up
       WHERE up.last_seen_at >= v_day_start),
    'distinct_active_in_range',
      (SELECT COUNT(DISTINCT up.user_id)::int FROM public.user_presence up
       WHERE up.last_seen_at >= v_from AND up.last_seen_at <= v_to),
    'total_profiles',
      (SELECT COUNT(*)::int FROM public.profiles),
    'by_estado',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('estado', sub.estado, 'count', sub.c))
         FROM (
           SELECT COALESCE(NULLIF(btrim(p.estado), ''), '—') AS estado, COUNT(*)::int AS c
           FROM public.profiles p
           GROUP BY 1
           ORDER BY c DESC
           LIMIT 40
         ) sub),
        '[]'::jsonb
      ),
    'by_cidade',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('cidade', sub.cidade, 'estado', sub.uf, 'count', sub.c))
         FROM (
           SELECT
             COALESCE(NULLIF(btrim(p.cidade), ''), '—') AS cidade,
             COALESCE(NULLIF(btrim(p.estado), ''), '—') AS uf,
             COUNT(*)::int AS c
           FROM public.profiles p
           GROUP BY 1, 2
           ORDER BY c DESC
           LIMIT 40
         ) sub),
        '[]'::jsonb
      ),
    'by_pais',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('pais', sub.pais, 'count', sub.c))
         FROM (
           SELECT COALESCE(NULLIF(btrim(p.pais), ''), 'Não informado') AS pais, COUNT(*)::int AS c
           FROM public.profiles p
           GROUP BY 1
           ORDER BY c DESC
           LIMIT 20
         ) sub),
        '[]'::jsonb
      ),
    'top_pages',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('page_path', s.page_path, 'count', s.c))
         FROM (
           SELECT v.page_path, COUNT(*)::int AS c
           FROM public.app_page_views v
           WHERE v.created_at >= v_from AND v.created_at <= v_to
           GROUP BY v.page_path
           ORDER BY c DESC
           LIMIT 25
         ) s),
        '[]'::jsonb
      )
  );
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_dashboard(integer, timestamptz, timestamptz) IS
  'Painel admin: presença (user_presence), distribuição geo (profiles), páginas mais vistas.';

REVOKE ALL ON FUNCTION public.admin_analytics_dashboard(integer, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_dashboard(integer, timestamptz, timestamptz) TO authenticated;
