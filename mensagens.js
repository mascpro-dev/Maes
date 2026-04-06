import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const el = {
  users: document.getElementById("dm-users-list"),
  title: document.getElementById("dm-chat-title"),
  messages: document.getElementById("dm-messages"),
  input: document.getElementById("dm-input"),
  send: document.getElementById("dm-send"),
  status: document.getElementById("dm-status"),
};

let supabase;
let userId;
let activeUser = null;
let activeConversation = null;
let realtimeChannel = null;

function setStatus(msg) {
  if (el.status) el.status.textContent = msg || "";
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadFollowingUsers() {
  const { data: followRows, error: followErr } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (followErr) {
    setStatus("Ative a migration de seguidores para usar DMs.");
    return [];
  }
  const ids = (followRows || []).map((r) => r.following_id).filter(Boolean);
  if (!ids.length) return [];

  const { data: profileRows, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  if (profErr) {
    setStatus(
      "Não foi possível carregar os nomes. Execute no Supabase o ficheiro supabase/COLE_PROFILES_NOMES_SEGUIDOS.sql"
    );
    return ids.map((id) => ({ id, name: "Perfil sem nome" }));
  }

  const nameById = {};
  (profileRows || []).forEach((p) => {
    const n = (p.full_name || "").trim();
    nameById[p.id] = n || "Sem nome no perfil";
  });

  return ids.map((id) => ({
    id,
    name: nameById[id] || "Sem nome no perfil",
  }));
}

function renderUsers(list) {
  if (!el.users) return;
  if (!list.length) {
    el.users.innerHTML = '<p>Você ainda não segue ninguém.</p>';
    return;
  }
  el.users.innerHTML = list
    .map((u) => `<button class="dm-user" data-user="${u.id}">${esc(u.name)}</button>`)
    .join("");
  el.users.querySelectorAll(".dm-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = btn.getAttribute("data-user");
      if (!target) return;
      activeUser = list.find((u) => u.id === target) || null;
      el.users.querySelectorAll(".dm-user").forEach((b) => b.classList.remove("dm-user--active"));
      btn.classList.add("dm-user--active");
      await openConversation(target);
    });
  });
}

async function openConversation(targetUserId) {
  const { data: convId, error } = await supabase.rpc("find_or_create_dm_conversation", {
    other_user_id: targetUserId,
  });
  if (error || !convId) {
    setStatus("Não foi possível abrir a conversa.");
    return;
  }
  activeConversation = convId;
  if (el.title) el.title.textContent = activeUser ? `Conversa com ${activeUser.name}` : "Conversa";
  await loadMessages();
  subscribeRealtime();
}

async function loadMessages() {
  if (!activeConversation) return;
  const { data, error } = await supabase
    .from("dm_messages")
    .select("id, sender_id, content, created_at")
    .eq("conversation_id", activeConversation)
    .order("created_at", { ascending: true });
  if (error) {
    setStatus("Falha ao carregar mensagens.");
    return;
  }
  const rows = data || [];
  if (!rows.length) {
    el.messages.innerHTML = '<div class="dm-msg">Sem mensagens ainda.</div>';
    return;
  }
  el.messages.innerHTML = rows
    .map((m) => {
      const mine = m.sender_id === userId;
      return `<div class="dm-msg ${mine ? "dm-msg--me" : ""}">${esc(m.content)}</div>`;
    })
    .join("");
  el.messages.scrollTop = el.messages.scrollHeight;
}

function subscribeRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (!activeConversation) return;
  realtimeChannel = supabase
    .channel(`dm-${activeConversation}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
        filter: `conversation_id=eq.${activeConversation}`,
      },
      loadMessages
    )
    .subscribe();
}

async function sendMessage() {
  const content = (el.input?.value || "").trim();
  if (!content || !activeConversation) return;
  el.send.disabled = true;
  const { error } = await supabase.from("dm_messages").insert({
    conversation_id: activeConversation,
    sender_id: userId,
    content,
  });
  el.send.disabled = false;
  if (error) {
    setStatus("Não foi possível enviar.");
    return;
  }
  if (el.input) el.input.value = "";
}

async function init() {
  const ok = await window.__auraAuthReady;
  if (!ok) return;

  supabase =
    window.__auraSupabaseClient ||
    createClient(window.AURA_SUPABASE_URL, window.AURA_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

  const { data } = await supabase.auth.getUser();
  userId = data?.user?.id;
  if (!userId) {
    setStatus("Sessão não encontrada.");
    return;
  }

  const following = await loadFollowingUsers();
  renderUsers(following);

  const openUserId = new URLSearchParams(window.location.search).get("user");
  if (openUserId && following.some((x) => x.id === openUserId)) {
    const u = following.find((x) => x.id === openUserId);
    if (u) {
      activeUser = u;
      const btn = el.users?.querySelector(`[data-user="${openUserId}"]`);
      if (btn) {
        el.users.querySelectorAll(".dm-user").forEach((b) => b.classList.remove("dm-user--active"));
        btn.classList.add("dm-user--active");
      }
      await openConversation(openUserId);
    }
  }

  el.send?.addEventListener("click", sendMessage);
  el.input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
}

init();

