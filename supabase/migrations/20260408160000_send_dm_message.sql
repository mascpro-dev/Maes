-- Envio de DM via RPC: valida participação, perfil e conteúdo; insert com privilégios do definer
-- (evita falhas subtis de RLS/FK no insert direto a partir do cliente).

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
