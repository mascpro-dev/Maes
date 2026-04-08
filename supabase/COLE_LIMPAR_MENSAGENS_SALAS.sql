-- Apaga todo o histórico de chat das salas (as salas em community_rooms mantêm-se).
-- Útil para remover mensagens de teste. Corre no SQL Editor do Supabase com permissões de admin.

truncate table public.community_room_messages;

-- Alternativa: apagar só mensagens antigas
-- delete from public.community_room_messages
-- where created_at < (now() - interval '30 days');
