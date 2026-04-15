-- Curtidas e comentários no feed (RLS alinhado à visibilidade do post).

create table if not exists public.feed_post_likes (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint feed_post_likes_pkey primary key (post_id, user_id)
);

create index if not exists feed_post_likes_user_idx on public.feed_post_likes (user_id);

create table if not exists public.feed_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint feed_post_comments_len check (char_length(trim(content)) between 1 and 2000)
);

create index if not exists feed_post_comments_post_created_idx
  on public.feed_post_comments (post_id, created_at asc);

alter table public.feed_post_likes enable row level security;
alter table public.feed_post_comments enable row level security;

drop policy if exists "feed_post_likes_select_visible_post" on public.feed_post_likes;
create policy "feed_post_likes_select_visible_post"
  on public.feed_post_likes for select
  to authenticated
  using (
    exists (
      select 1
      from public.feed_posts fp
      where fp.id = feed_post_likes.post_id
        and (
          fp.author_id = auth.uid()
          or exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = fp.author_id
          )
        )
    )
  );

drop policy if exists "feed_post_likes_insert_self_visible" on public.feed_post_likes;
create policy "feed_post_likes_insert_self_visible"
  on public.feed_post_likes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.feed_posts fp
      where fp.id = feed_post_likes.post_id
        and (
          fp.author_id = auth.uid()
          or exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = fp.author_id
          )
        )
    )
  );

drop policy if exists "feed_post_likes_delete_own" on public.feed_post_likes;
create policy "feed_post_likes_delete_own"
  on public.feed_post_likes for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "feed_post_comments_select_visible_post" on public.feed_post_comments;
create policy "feed_post_comments_select_visible_post"
  on public.feed_post_comments for select
  to authenticated
  using (
    exists (
      select 1
      from public.feed_posts fp
      where fp.id = feed_post_comments.post_id
        and (
          fp.author_id = auth.uid()
          or exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = fp.author_id
          )
        )
    )
  );

drop policy if exists "feed_post_comments_insert_self_visible" on public.feed_post_comments;
create policy "feed_post_comments_insert_self_visible"
  on public.feed_post_comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.feed_posts fp
      where fp.id = feed_post_comments.post_id
        and (
          fp.author_id = auth.uid()
          or exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = fp.author_id
          )
        )
    )
  );

drop policy if exists "feed_post_comments_delete_own" on public.feed_post_comments;
create policy "feed_post_comments_delete_own"
  on public.feed_post_comments for delete
  to authenticated
  using (author_id = auth.uid());

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
    and exists (
      select 1
      from public.feed_posts fp
      where fp.id = p_post_id
        and (
          fp.author_id = auth.uid()
          or exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = fp.author_id
          )
        )
    )
  order by c.created_at asc;
$$;

revoke all on function public.list_feed_post_comments(uuid) from public;
grant execute on function public.list_feed_post_comments(uuid) to authenticated;

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
  where p.author_id = auth.uid()
     or exists (
       select 1
       from public.follows f
       where f.follower_id = auth.uid()
         and f.following_id = p.author_id
     )
  order by p.created_at desc;
$$;

revoke all on function public.list_feed_posts() from public;
grant execute on function public.list_feed_posts() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_post_likes'
  ) then
    alter publication supabase_realtime add table public.feed_post_likes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_post_comments'
  ) then
    alter publication supabase_realtime add table public.feed_post_comments;
  end if;
end $$;
