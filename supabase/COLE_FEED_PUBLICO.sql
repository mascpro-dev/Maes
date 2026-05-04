-- =============================================================================
-- FEED PÚBLICO — todos os posts visíveis para qualquer utilizadora autenticada
-- =============================================================================
-- Problema anterior: list_feed_posts só devolvia posts próprios + de pessoas seguidas.
-- Como quase ninguém se segue, cada uma só via os seus próprios posts.
--
-- Esta migration:
--   1. Recria list_feed_posts sem filtro de follows (feed público / comunitário)
--   2. Actualiza list_feed_post_comments (sem restrição de visibilidade)
--   3. Recria toggle_feed_post_like e add_feed_post_comment sem verificação de follows
--   4. Corrige RLS policies de feed_post_likes e feed_post_comments para acesso público
--
-- Como aplicar: abre o SQL Editor no Supabase → cola este ficheiro → Run.
-- =============================================================================

-- ── 1. list_feed_posts: devolve TODOS os posts de todas as utilizadoras ───────

drop function if exists public.list_feed_posts();

create function public.list_feed_posts()
returns table (
  id uuid,
  content text,
  image_url text,
  created_at timestamptz,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.content,
    p.image_url,
    p.created_at,
    p.author_id,
    coalesce(pr.full_name, 'Participante') as author_name,
    pr.avatar_url as author_avatar_url,
    (select count(*)::bigint from public.feed_post_likes l where l.post_id = p.id) as like_count,
    (select count(*)::bigint from public.feed_post_comments c where c.post_id = p.id) as comment_count,
    exists (
      select 1
      from public.feed_post_likes l2
      where l2.post_id = p.id
        and l2.user_id = auth.uid()
    ) as liked_by_me
  from public.feed_posts p
  join public.profiles pr on pr.id = p.author_id
  order by p.created_at desc;
$$;

revoke all on function public.list_feed_posts() from public;
grant execute on function public.list_feed_posts() to authenticated;


-- ── 2. list_feed_post_comments: qualquer utilizadora pode ver comentários ──────

create or replace function public.list_feed_post_comments(p_post_id uuid)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  content text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.author_id,
    coalesce(pr.full_name, 'Participante') as author_name,
    c.content,
    c.created_at
  from public.feed_post_comments c
  join public.profiles pr on pr.id = c.author_id
  where c.post_id = p_post_id
  order by c.created_at asc;
$$;

revoke all on function public.list_feed_post_comments(uuid) from public;
grant execute on function public.list_feed_post_comments(uuid) to authenticated;


-- ── 3. toggle_feed_post_like: qualquer post pode ser curtido ─────────────────

create or replace function public.toggle_feed_post_like(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Não autenticada.';
  end if;

  if not exists (select 1 from public.feed_posts where id = p_post_id) then
    raise exception 'Post não encontrado.';
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


-- ── 4. add_feed_post_comment: qualquer post pode ser comentado ───────────────

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
begin
  if uid is null then
    raise exception 'Não autenticada.';
  end if;

  t := trim(p_content);
  if char_length(t) < 1 or char_length(t) > 2000 then
    raise exception 'Comentário inválido.';
  end if;

  if not exists (select 1 from public.feed_posts where id = p_post_id) then
    raise exception 'Post não encontrado.';
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


-- ── 5. RLS policies: acesso público a curtidas e comentários ─────────────────

-- Curtidas: qualquer utilizadora autenticada pode ver/inserir/apagar as suas
drop policy if exists "feed_post_likes_select_visible_post" on public.feed_post_likes;
create policy "feed_post_likes_select_all"
  on public.feed_post_likes for select
  to authenticated
  using (true);

drop policy if exists "feed_post_likes_insert_self_visible" on public.feed_post_likes;
create policy "feed_post_likes_insert_self"
  on public.feed_post_likes for insert
  to authenticated
  with check (user_id = auth.uid());

-- Comentários: qualquer utilizadora autenticada pode ver/inserir
drop policy if exists "feed_post_comments_select_visible_post" on public.feed_post_comments;
create policy "feed_post_comments_select_all"
  on public.feed_post_comments for select
  to authenticated
  using (true);

drop policy if exists "feed_post_comments_insert_self_visible" on public.feed_post_comments;
create policy "feed_post_comments_insert_self"
  on public.feed_post_comments for insert
  to authenticated
  with check (author_id = auth.uid());


-- ── 6. GRANTs (caso ainda não aplicados) ─────────────────────────────────────

grant select, insert, delete on public.feed_post_likes    to authenticated, service_role;
grant select, insert, delete on public.feed_post_comments to authenticated, service_role;

-- RLS na tabela feed_posts (posts em si) — SELECT público para utilizadoras autenticadas
do $$
begin
  -- Garante RLS ativa
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'feed_posts'
  ) then return; end if;

  -- Policy de leitura pública (idempotente)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feed_posts'
      and policyname = 'feed_posts_select_all_authenticated'
  ) then
    execute $p$
      create policy "feed_posts_select_all_authenticated"
        on public.feed_posts for select
        to authenticated
        using (true);
    $p$;
  end if;
end $$;
