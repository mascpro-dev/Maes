-- =============================================================================
-- Admin: permitir excluir especialistas (com RLS)
-- =============================================================================

ALTER TABLE public.specialists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "specialists_delete_admin" ON public.specialists;
CREATE POLICY "specialists_delete_admin"
  ON public.specialists FOR DELETE
  TO authenticated
  USING (public.is_aura_admin());

-- Garantia de permissões de tabela (RLS continua a filtrar por admin)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.specialists TO authenticated;
