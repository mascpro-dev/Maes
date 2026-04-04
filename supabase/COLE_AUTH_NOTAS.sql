-- =============================================================================
-- AURA — Auth: notas (OAuth não se configura por SQL)
-- =============================================================================
--
-- O QUE NÃO DÁ PARA FAZER COM SQL NO SUPABASE
-- --------------------------------------------
-- • Ligar/desligar Google OAuth
-- • Colar Client ID / Secret do Google
-- • Redirect URLs (login.html, etc.)
--
-- Usa o painel: Authentication → Providers / URL Configuration
--
-- Login Aura: apenas e-mail + senha (sem CAPTCHA no front).
-- Força de senha no registo: ver cadastro.html (mín. 10 caracteres, letra + número).
-- Podes reforçar regras em Authentication → Providers → Email no Supabase.
--
-- =============================================================================

SELECT 1 AS lido_instrucoes_auth;
