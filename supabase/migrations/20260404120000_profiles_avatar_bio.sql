-- Perfis: foto e bio (perfil / dashboard dinâmicos)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;

COMMENT ON COLUMN public.profiles.avatar_url IS 'URL da foto de perfil (ex.: OAuth Google ou upload futuro).';
COMMENT ON COLUMN public.profiles.bio IS 'Texto curto sobre a mãe (opcional).';
