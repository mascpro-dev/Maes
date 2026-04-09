-- CONTA MÃE — Salas da comunidade + chat (cole no SQL Editor do Supabase)
-- Após correr: Dashboard → Database → Replication → public.community_room_messages → supabase_realtime

create table if not exists public.community_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  tag text not null default 'general',
  is_featured boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint community_rooms_tag_check check (
    tag = any (array['autism'::text, 'adhd'::text, 'general'::text])
  )
);

create table if not exists public.community_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  message_kind text not null default 'text',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint community_room_messages_kind_check check (
    message_kind = any (array['text'::text, 'heart'::text])
  ),
  constraint community_room_messages_content_len check (
    char_length(trim(content)) >= 1 and char_length(content) <= 2000
  )
);

create index if not exists community_room_messages_room_created_idx
  on public.community_room_messages (room_id, created_at desc);

create table if not exists public.community_room_presence (
  room_id uuid not null references public.community_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  constraint community_room_presence_pkey primary key (room_id, user_id)
);

create index if not exists community_room_presence_seen_idx
  on public.community_room_presence (last_seen_at desc);

alter table public.community_rooms enable row level security;
alter table public.community_room_messages enable row level security;
alter table public.community_room_presence enable row level security;

drop policy if exists "community_rooms_select_auth" on public.community_rooms;
create policy "community_rooms_select_auth"
  on public.community_rooms for select
  to authenticated
  using (true);

drop policy if exists "community_room_messages_select_auth" on public.community_room_messages;
create policy "community_room_messages_select_auth"
  on public.community_room_messages for select
  to authenticated
  using (true);

drop policy if exists "community_room_messages_insert_own" on public.community_room_messages;
create policy "community_room_messages_insert_own"
  on public.community_room_messages for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "community_room_presence_select_auth" on public.community_room_presence;
create policy "community_room_presence_select_auth"
  on public.community_room_presence for select
  to authenticated
  using (true);

drop policy if exists "community_room_presence_upsert_own" on public.community_room_presence;
create policy "community_room_presence_upsert_own"
  on public.community_room_presence for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "community_room_presence_update_own" on public.community_room_presence;
create policy "community_room_presence_update_own"
  on public.community_room_presence for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "community_room_presence_delete_own" on public.community_room_presence;
create policy "community_room_presence_delete_own"
  on public.community_room_presence for delete
  to authenticated
  using (auth.uid() = user_id);

insert into public.community_rooms (slug, title, description, tag, is_featured, sort_order)
values
  ('desafios-escola', 'Desafios da Escola', 'Como lidar com professores que não entendem as necessidades especiais', 'autism', true, 1),
  ('medicacao-medos', 'Medicação e Medos', 'Medos sobre remédios e como tomar decisões com segurança', 'adhd', true, 2),
  ('autocuidado-culpa', 'Autocuidado sem Culpa', 'Cuidar de si sem culpa — você também importa', 'general', true, 3),
  ('crises-sensoriais', 'Crises Sensoriais', 'Estratégias práticas para sobrecarga sensorial', 'general', true, 4),
  ('sono-rotina', 'Sono e rotina', 'Horários impossíveis e pequenas vitórias', 'general', false, 5),
  ('irmaos-ciumes', 'Irmãos e ciúmes', 'Quando o irmão sente que a terapia rouba atenção', 'autism', false, 6)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  tag = excluded.tag,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order;

alter table public.community_room_messages
  add column if not exists recipient_user_id uuid references public.profiles (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'community_room_messages'
  ) then
    alter publication supabase_realtime add table public.community_room_messages;
  end if;
end $$;

-- Perfis (nomes no chat) em lote — opcional mas recomendado
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
