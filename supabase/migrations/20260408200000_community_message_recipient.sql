-- Mensagem endereçada a uma mãe específica (toda a sala continua a ver — transparência na comunidade)
alter table public.community_room_messages
  add column if not exists recipient_user_id uuid references public.profiles (id) on delete set null;

comment on column public.community_room_messages.recipient_user_id is
  'Opcional: destinatária principal; null = mensagem para todas. Todas as participantes da sala podem ler.';

create index if not exists community_room_messages_recipient_idx
  on public.community_room_messages (room_id, recipient_user_id)
  where recipient_user_id is not null;
