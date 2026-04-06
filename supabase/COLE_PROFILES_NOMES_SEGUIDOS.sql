-- =============================================================================
-- AURA — Ver nomes de quem você segue (DM / Mensagens)
-- Cole no SQL Editor se a lista de conversas mostra só "Usuária Aura".
-- Motivo: RLS de profiles só permitia SELECT do próprio id; o join não trazia nome.
-- =============================================================================

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
