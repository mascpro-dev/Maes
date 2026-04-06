-- =============================================================================
-- AURA — COLE NO SUPABASE (Feed + Seguidores + DMs + Estado no Perfil)
-- Execute no SQL Editor do Supabase.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Estado no perfil (para diferenciar cidades homonimas)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists estado text;
comment on column public.profiles.estado is 'UF/Estado da usuaria (ex.: SP, RJ).';

-- ---------------------------------------------------------------------------
-- 1) Storage bucket para imagens do feed
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feed-images',
  'feed-images',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "feed_images_public_read" on storage.objects;
create policy "feed_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'feed-images');

drop policy if exists "feed_images_insert_own" on storage.objects;
create policy "feed_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feed-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "feed_images_update_own" on storage.objects;
create policy "feed_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'feed-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'feed-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "feed_images_delete_own" on storage.objects;
create policy "feed_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'feed-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- 2) Seguidores (follow)
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint follows_pkey primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

drop policy if exists "follows_select_involved" on public.follows;
create policy "follows_select_involved"
  on public.follows for select
  to authenticated
  using (auth.uid() = follower_id or auth.uid() = following_id);

drop policy if exists "follows_insert_self" on public.follows;
create policy "follows_insert_self"
  on public.follows for insert
  to authenticated
  with check (auth.uid() = follower_id);

drop policy if exists "follows_delete_self" on public.follows;
create policy "follows_delete_self"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);

-- ---------------------------------------------------------------------------
-- 3) Feed de postagens
-- ---------------------------------------------------------------------------
create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  image_url text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint feed_posts_content_len check (char_length(trim(content)) between 1 and 2000)
);

create index if not exists feed_posts_author_created_idx
  on public.feed_posts (author_id, created_at desc);

create index if not exists feed_posts_created_idx
  on public.feed_posts (created_at desc);

alter table public.feed_posts enable row level security;

drop policy if exists "feed_posts_select_own_or_following" on public.feed_posts;
create policy "feed_posts_select_own_or_following"
  on public.feed_posts for select
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = author_id
    )
  );

drop policy if exists "feed_posts_insert_own" on public.feed_posts;
create policy "feed_posts_insert_own"
  on public.feed_posts for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "feed_posts_update_own" on public.feed_posts;
create policy "feed_posts_update_own"
  on public.feed_posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "feed_posts_delete_own" on public.feed_posts;
create policy "feed_posts_delete_own"
  on public.feed_posts for delete
  to authenticated
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4) Mensagens diretas (DM)
-- ---------------------------------------------------------------------------
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.dm_participants (
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint dm_participants_pkey primary key (conversation_id, user_id)
);

create index if not exists dm_participants_user_idx on public.dm_participants (user_id);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint dm_messages_content_len check (char_length(trim(content)) between 1 and 2000)
);

create index if not exists dm_messages_conv_created_idx
  on public.dm_messages (conversation_id, created_at asc);

alter table public.dm_conversations enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "dm_conversations_select_participant" on public.dm_conversations;
create policy "dm_conversations_select_participant"
  on public.dm_conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants p
      where p.conversation_id = id and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_conversations_insert_authenticated" on public.dm_conversations;
create policy "dm_conversations_insert_authenticated"
  on public.dm_conversations for insert
  to authenticated
  with check (true);

drop policy if exists "dm_participants_select_self_conversations" on public.dm_participants;
create policy "dm_participants_select_self_conversations"
  on public.dm_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.dm_participants p
      where p.conversation_id = dm_participants.conversation_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_participants_insert_if_member" on public.dm_participants;
create policy "dm_participants_insert_if_member"
  on public.dm_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.dm_participants p
      where p.conversation_id = dm_participants.conversation_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_messages_select_if_participant" on public.dm_messages;
create policy "dm_messages_select_if_participant"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_participants p
      where p.conversation_id = dm_messages.conversation_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "dm_messages_insert_if_sender_participant" on public.dm_messages;
create policy "dm_messages_insert_if_sender_participant"
  on public.dm_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.dm_participants p
      where p.conversation_id = dm_messages.conversation_id
        and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Funcoes utilitarias
-- ---------------------------------------------------------------------------
create or replace function public.find_or_create_dm_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  conv_id uuid;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if other_user_id is null or other_user_id = current_user_id then
    raise exception 'invalid target';
  end if;

  select p1.conversation_id
    into conv_id
  from public.dm_participants p1
  join public.dm_participants p2 on p1.conversation_id = p2.conversation_id
  where p1.user_id = current_user_id
    and p2.user_id = other_user_id
  limit 1;

  if conv_id is not null then
    return conv_id;
  end if;

  insert into public.dm_conversations default values
  returning id into conv_id;

  insert into public.dm_participants (conversation_id, user_id)
  values (conv_id, current_user_id), (conv_id, other_user_id);

  return conv_id;
end;
$$;

revoke all on function public.find_or_create_dm_conversation(uuid) from public;
grant execute on function public.find_or_create_dm_conversation(uuid) to authenticated;

-- Envio de DM (recomendado no cliente em vez de insert direto em dm_messages)
create or replace function public.send_dm_message(p_conversation_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text;
begin
  if uid is null then
    raise exception 'Sessão não autenticada.';
  end if;

  t := trim(p_content);
  if char_length(t) < 1 or char_length(t) > 2000 then
    raise exception 'Mensagem inválida (1 a 2000 caracteres).';
  end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Complete o perfil antes de enviar mensagens.';
  end if;

  if not exists (
    select 1
    from public.dm_participants p
    where p.conversation_id = p_conversation_id
      and p.user_id = uid
  ) then
    raise exception 'Conversa não encontrada ou sem permissão.';
  end if;

  insert into public.dm_messages (conversation_id, sender_id, content)
  values (p_conversation_id, uid, t);
end;
$$;

revoke all on function public.send_dm_message(uuid, text) from public;
grant execute on function public.send_dm_message(uuid, text) to authenticated;

-- Listar mensagens de uma conversa (evita 500 no GET REST / dm_messages)
create or replace function public.list_dm_messages(p_conversation_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.sender_id, m.content, m.created_at
  from public.dm_messages m
  where m.conversation_id = p_conversation_id
    and exists (
      select 1
      from public.dm_participants p
      where p.conversation_id = p_conversation_id
        and p.user_id = auth.uid()
    )
  order by m.created_at asc;
$$;

revoke all on function public.list_dm_messages(uuid) from public;
grant execute on function public.list_dm_messages(uuid) to authenticated;

create or replace function public.list_feed_posts()
returns table (
  id uuid,
  content text,
  image_url text,
  created_at timestamptz,
  author_id uuid,
  author_name text,
  author_avatar_url text
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
    coalesce(pr.full_name, 'Usuaria Aura') as author_name,
    pr.avatar_url as author_avatar_url
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

drop function if exists public.list_profiles_for_discovery();

create function public.list_profiles_for_discovery()
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
  where p.id <> auth.uid()
    and auth.uid() is not null;
$$;

revoke all on function public.list_profiles_for_discovery() from public;
grant execute on function public.list_profiles_for_discovery() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feed_posts'
  ) then
    alter publication supabase_realtime add table public.feed_posts;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) Ver perfil (nome) de quem você segue — lista de DMs
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 8) Perfil público (página perfil-usuario.html)
-- ---------------------------------------------------------------------------
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

