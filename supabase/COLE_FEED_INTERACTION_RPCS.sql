-- Colar no Supabase *se as tabelas feed_post_likes e feed_post_comments já existem*.
-- Se aparecer erro 42P01 (relation "feed_post_likes" does not exist), cola o ficheiro
-- completo: supabase/migrations/20260422130000_feed_interaction_grants_and_rpc_dml_bypass.sql
-- (cria tabelas + RLS + list_feed_posts + Realtime + GRANTs + estas RPCs).
-- Opcional: bloco de GRANTs no fim deste ficheiro, se ainda não aplicou.

create or replace function public.toggle_feed_post_like(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  vis boolean;
begin
  if uid is null then
    raise exception 'Não autenticada.';
  end if;

  vis := exists (
    select 1
    from public.feed_posts fp
    where fp.id = p_post_id
      and (
        fp.author_id = uid
        or exists (
          select 1
          from public.follows f
          where f.follower_id = uid
            and f.following_id = fp.author_id
        )
      )
  );
  if not vis then
    raise exception 'Post não disponível.';
  end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Perfil em falta.';
  end if;

  perform set_config('row_security', 'off', true);

  if exists (
    select 1
    from public.feed_post_likes
    where post_id = p_post_id
      and user_id = uid
  ) then
    delete from public.feed_post_likes
    where post_id = p_post_id
      and user_id = uid;
    return false;
  else
    insert into public.feed_post_likes (post_id, user_id)
    values (p_post_id, uid);
    return true;
  end if;
end;
$$;

revoke all on function public.toggle_feed_post_like(uuid) from public;
grant execute on function public.toggle_feed_post_like(uuid) to authenticated;

create or replace function public.add_feed_post_comment(p_post_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text;
  new_id uuid;
  vis boolean;
begin
  if uid is null then
    raise exception 'Não autenticada.';
  end if;

  t := trim(p_content);
  if char_length(t) < 1 or char_length(t) > 2000 then
    raise exception 'Comentário inválido.';
  end if;

  vis := exists (
    select 1
    from public.feed_posts fp
    where fp.id = p_post_id
      and (
        fp.author_id = uid
        or exists (
          select 1
          from public.follows f
          where f.follower_id = uid
            and f.following_id = fp.author_id
        )
      )
  );
  if not vis then
    raise exception 'Post não disponível.';
  end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Perfil em falta.';
  end if;

  perform set_config('row_security', 'off', true);

  insert into public.feed_post_comments (post_id, author_id, content)
  values (p_post_id, uid, t)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.add_feed_post_comment(uuid, text) from public;
grant execute on function public.add_feed_post_comment(uuid, text) to authenticated;

-- Garante permissão na API (necessário se a tabela foi criada sem privilégios padrão):
grant select, insert, delete on public.feed_post_likes to authenticated, service_role;
grant select, insert, delete on public.feed_post_comments to authenticated, service_role;
