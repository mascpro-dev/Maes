-- Lista mensagens de uma conversa (SECURITY DEFINER) para evitar 500/RLS no GET REST em dm_messages.

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
