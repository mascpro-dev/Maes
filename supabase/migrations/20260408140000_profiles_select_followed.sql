-- Permite ver nome (e demais colunas permitidas por RLS) de perfis que a usuária segue — necessário para DMs e lista "Conversar com".
drop policy if exists "profiles_select_if_followed" on public.profiles;
create policy "profiles_select_if_followed"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = profiles.id
    )
  );
