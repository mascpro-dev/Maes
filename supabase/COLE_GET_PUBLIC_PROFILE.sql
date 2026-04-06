-- =============================================================================
-- AURA — Ver perfil de outra pessoa (perfil-usuario.html)
-- Cole no Supabase se abrir perfil falhar ou der erro de função inexistente.
-- =============================================================================

create or replace function public.get_public_profile(p_target_id uuid)
returns table (
  id uuid,
  full_name text,
  diagnostico text,
  cidade text,
  estado text,
  avatar_url text,
  bio text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.diagnostico, p.cidade, p.estado, p.avatar_url, p.bio
  from public.profiles p
  where p.id = p_target_id
    and p.id is distinct from auth.uid()
    and auth.uid() is not null;
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to authenticated;
