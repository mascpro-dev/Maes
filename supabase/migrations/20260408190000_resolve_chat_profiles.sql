-- Perfis para o chat das salas (nome + avatar) — um pedido em lote em vez de N × get_public_profile
create or replace function public.resolve_profiles_for_community_chat(p_user_ids uuid[])
returns table (
  id uuid,
  full_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.avatar_url
  from public.profiles p
  where (p_user_ids is not null and p.id = any(p_user_ids))
    and auth.uid() is not null;
$$;

revoke all on function public.resolve_profiles_for_community_chat(uuid[]) from public;
grant execute on function public.resolve_profiles_for_community_chat(uuid[]) to authenticated;
