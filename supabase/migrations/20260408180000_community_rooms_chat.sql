-- =============================================================================
-- CONTA MÃE / Aura — Salas da comunidade + chat em tempo real
-- =============================================================================

-- Salas públicas (voz continua fora do DB; chat é texto ao vivo)
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

comment on table public.community_rooms is 'Salas de conversa (lista na UI); chat em community_room_messages.';

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

-- Quem está a “ouvir” a sala (heartbeat no cliente)
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

-- Seed (idempotente)
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

-- Realtime: ver migração 20260408220000_community_messages_realtime.sql (publicação supabase_realtime).
--
-- Nomes no chat em lote: migrar também 20260408190000_resolve_chat_profiles.sql (ou COLE_SALAS_COMUNIDADE.sql).
