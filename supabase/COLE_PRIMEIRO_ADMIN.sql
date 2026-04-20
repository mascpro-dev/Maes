-- =============================================================================
-- Colar no SQL Editor do Supabase (Dashboard → SQL) — UMA VEZ
-- Depois de aplicares a migração 20260410200000_admin_aura_admins_rls.sql
-- =============================================================================
--
-- Opção A — recomendada: substitui só o email e executa este bloco inteiro
--
INSERT INTO public.aura_admins (user_id)
SELECT id
FROM auth.users
WHERE lower(email) = lower('COLOCA_AQUI_O_TEU_EMAIL@exemplo.com')
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;
--
-- Se "INSERT 0 0": o email não bate com nenhum utilizador (typo ou conta errada).
-- Se "INSERT 0 1" ou "INSERT 1": ficaste na tabela (ou já lá estavas).
--
-- =============================================================================
-- Opção B — manual: vê o UUID e depois insere
--
-- SELECT id, email FROM auth.users WHERE email = 'teuemail@gmail.com';
--
-- INSERT INTO public.aura_admins (user_id)
-- VALUES ('cola-aqui-o-uuid-sem-aspas-simples'::uuid)
-- ON CONFLICT (user_id) DO NOTHING;
--
-- =============================================================================
-- Abre o painel com sessão iniciada na mesma conta:
--   …/admin.html
-- =============================================================================
