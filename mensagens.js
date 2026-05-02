import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const el = {
  users: document.getElementById("dm-users-list"),
  usersScroll: document.getElementById("dm-users-scroll"),
  usersFilter: document.getElementById("dm-users-filter"),
  usersCount: document.getElementById("dm-users-count"),
  title: document.getElementById("dm-chat-title"),
  messages: document.getElementById("dm-messages"),
  input: document.getElementById("dm-input"),
  send: document.getElementById("dm-send"),
  status: document.getElementById("dm-status"),
};

const ROW_HEIGHT = 68;
const VIRTUAL_BUFFER = 8;

let supabase;
let userId;
let activeUser = null;
let activeConversation = null;
let realtimeChannel = null;

/** Lista completa (ordenada); filtrada para pesquisa + virtualização */
let allFollowingUsers = [];
let filteredFollowingUsers = [];
let selectedFollowingId = null;

let filterDebounceTimer = null;
let scrollRaf = null;
let resizeObserver = null;

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

function safeHttpsAvatarUrl(url) {
  const s = String(url || "").trim();
  if (/^https:\/\/[^\s"'<>]+$/.test(s)) return s;
  return null;
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0] || "";
  const b = parts[parts.length - 1][0] || "";
  return (a + b).toUpperCase() || "?";
}

/** PostgREST pode devolver um escalar UUID como string ou como objeto { nome_função: uuid }. */
function normalizeRpcUuid(data) {
  if (data == null) return null;
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
      const v = data[keys[i]];
      if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
        return v;
      }
    }
  }
  return null;
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
    .select("id, full_name, avatar_url")
    .in("id", ids);

  if (profErr) {
    setStatus(
      "Não foi possível carregar os nomes. Execute no Supabase o ficheiro supabase/COLE_PROFILES_NOMES_SEGUIDOS.sql"
    );
    return ids.map((id) => ({
      id,
      name: "Perfil sem nome",
      nameLower: "perfil sem nome",
      avatar_url: null,
    }));
  }

  const byId = {};
  (profileRows || []).forEach((p) => {
    const n = (p.full_name || "").trim();
    const name = n || "Sem nome no perfil";
    byId[p.id] = {
      id: p.id,
      name,
      nameLower: name.toLowerCase(),
      avatar_url: safeHttpsAvatarUrl(p.avatar_url),
    };
  });

  const rows = ids.map((id) => {
    const r = byId[id];
    if (r) return r;
    const name = "Sem nome no perfil";
    return { id, name, nameLower: name.toLowerCase(), avatar_url: null };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  return rows;
}

function updateCountHint() {
  if (!el.usersCount) return;
  const n = filteredFollowingUsers.length;
  const t = allFollowingUsers.length;
  if (!t) {
    el.usersCount.textContent = "";
    return;
  }
  if (n === t) el.usersCount.textContent = `${t} ${t === 1 ? "pessoa" : "pessoas"}`;
  else el.usersCount.textContent = `${n} de ${t}`;
}

function rowHtml(u) {
  const active = u.id === selectedFollowingId ? " dm-user-row--active" : "";
  const av = u.avatar_url
    ? `<img class="dm-user-avatar dm-user-avatar--img" src="${esc(u.avatar_url)}" alt="" width="44" height="44" loading="lazy" decoding="async" />`
    : `<span class="dm-user-avatar dm-user-avatar--ph" aria-hidden="true">${esc(getInitials(u.name))}</span>`;
  return `<button type="button" class="dm-user-row${active}" data-user="${u.id}" role="option">
    ${av}
    <span class="dm-user-row__text">
      <span class="dm-user-row__name">${esc(u.name)}</span>
      <span class="dm-user-row__hint">Toque para conversar</span>
    </span>
  </button>`;
}

function renderVirtualList() {
  if (!el.users || !el.usersScroll) return;

  if (!filteredFollowingUsers.length) {
    el.users.style.paddingTop = "0";
    el.users.style.paddingBottom = "0";
    if (!allFollowingUsers.length) {
      el.users.innerHTML =
        '<p class="dm-users-empty">Você ainda não segue ninguém. No Explorar ou no mural pode seguir outras mães e depois conversar aqui.</p>';
    } else {
      el.users.innerHTML = '<p class="dm-users-empty">Nenhum nome corresponde à pesquisa.</p>';
    }
    updateCountHint();
    return;
  }

  const n = filteredFollowingUsers.length;
  const sh = el.usersScroll.clientHeight || 360;
  const st = el.usersScroll.scrollTop;
  let start = Math.floor(st / ROW_HEIGHT) - VIRTUAL_BUFFER;
  let end = Math.ceil((st + sh) / ROW_HEIGHT) + VIRTUAL_BUFFER;
  if (start < 0) start = 0;
  if (end > n) end = n;

  el.users.style.paddingTop = `${start * ROW_HEIGHT}px`;
  el.users.style.paddingBottom = `${(n - end) * ROW_HEIGHT}px`;

  const slice = filteredFollowingUsers.slice(start, end);
  el.users.innerHTML = slice.map((u) => rowHtml(u)).join("");
  updateCountHint();
}

function scheduleRenderVirtual() {
  if (scrollRaf != null) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null;
    renderVirtualList();
  });
}

function applyFilter(q) {
  const needle = String(q || "")
    .trim()
    .toLowerCase();
  if (!needle) {
    filteredFollowingUsers = allFollowingUsers.slice();
  } else {
    filteredFollowingUsers = allFollowingUsers.filter((u) => u.nameLower.includes(needle));
  }
  if (el.usersScroll) el.usersScroll.scrollTop = 0;
  renderVirtualList();
}

function wireListUi() {
  if (!el.usersScroll) return;

  el.usersScroll.addEventListener("scroll", scheduleRenderVirtual, { passive: true });

  if (el.usersFilter) {
    el.usersFilter.addEventListener("input", () => {
      if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
      filterDebounceTimer = setTimeout(() => {
        filterDebounceTimer = null;
        applyFilter(el.usersFilter.value);
      }, 120);
    });
  }

  el.usersScroll.addEventListener("click", async (e) => {
    const btn = e.target.closest(".dm-user-row");
    if (!btn) return;
    const target = btn.getAttribute("data-user");
    if (!target) return;
    activeUser = filteredFollowingUsers.find((u) => u.id === target) || allFollowingUsers.find((u) => u.id === target) || null;
    selectedFollowingId = target;
    renderVirtualList();
    await openConversation(target);
  });

  if (typeof ResizeObserver !== "undefined") {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => scheduleRenderVirtual());
    resizeObserver.observe(el.usersScroll);
  }
}

async function openConversation(targetUserId) {
  const { data: convId, error } = await supabase.rpc("find_or_create_dm_conversation", {
    other_user_id: targetUserId,
  });
  if (error) {
    setStatus(error.message ? `Conversa: ${error.message}` : "Não foi possível abrir a conversa.");
    console.error("find_or_create_dm_conversation", error);
    return;
  }
  const normalized = normalizeRpcUuid(convId);
  if (!normalized) {
    setStatus("Resposta inválida ao abrir a conversa. Atualize a página.");
    console.error("find_or_create_dm_conversation raw:", convId);
    return;
  }
  activeConversation = normalized;
  if (el.title) el.title.textContent = activeUser ? `Conversa com ${activeUser.name}` : "Conversa";
  await loadMessages();
  subscribeRealtime();
}

function rpcFunctionMissing(err) {
  return (
    !!err &&
    ((err.message && err.message.includes("Could not find the function")) || err.code === "PGRST202")
  );
}

async function loadMessages() {
  if (!activeConversation) return;
  const { data: rpcRows, error: rpcErr } = await supabase.rpc("list_dm_messages", {
    p_conversation_id: activeConversation,
  });
  let data = rpcRows;
  let error = rpcErr;
  if (rpcErr && rpcFunctionMissing(rpcErr)) {
    const r = await supabase
      .from("dm_messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", activeConversation)
      .order("created_at", { ascending: true });
    data = r.data;
    error = r.error;
  } else if (rpcErr) {
    error = rpcErr;
    data = null;
  }
  if (error) {
    setStatus(error.message || "Falha ao carregar mensagens.");
    console.error("loadMessages", error);
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
  if (!userId) {
    setStatus("Sessão inválida. Faça login novamente.");
    return;
  }
  el.send.disabled = true;
  const { error: rpcErr } = await supabase.rpc("send_dm_message", {
    p_conversation_id: activeConversation,
    p_content: content,
  });
  if (!rpcErr) {
    if (el.input) el.input.value = "";
    setStatus("");
    await loadMessages();
    el.send.disabled = false;
    return;
  }

  if (rpcFunctionMissing(rpcErr)) {
    const { error: insErr } = await supabase.from("dm_messages").insert({
      conversation_id: activeConversation,
      sender_id: userId,
      content,
    });
    el.send.disabled = false;
    if (insErr) {
      setStatus(insErr.message || "Não foi possível enviar.");
      console.error("dm_messages insert", insErr);
      return;
    }
    if (el.input) el.input.value = "";
    setStatus("");
    await loadMessages();
    return;
  }

  el.send.disabled = false;
  setStatus(rpcErr.message || "Não foi possível enviar.");
  console.error("send_dm_message", rpcErr);
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

  allFollowingUsers = await loadFollowingUsers();
  filteredFollowingUsers = allFollowingUsers.slice();
  selectedFollowingId = null;
  wireListUi();
  renderVirtualList();

  const openUserId = new URLSearchParams(window.location.search).get("user");
  if (openUserId && allFollowingUsers.some((x) => x.id === openUserId)) {
    const u = allFollowingUsers.find((x) => x.id === openUserId);
    if (u) {
      activeUser = u;
      selectedFollowingId = openUserId;
      if (el.usersFilter) el.usersFilter.value = "";
      filteredFollowingUsers = allFollowingUsers.slice();
      const idx = filteredFollowingUsers.findIndex((x) => x.id === openUserId);
      if (idx >= 0 && el.usersScroll) {
        el.usersScroll.scrollTop = Math.max(0, idx * ROW_HEIGHT - el.usersScroll.clientHeight / 2);
      }
      renderVirtualList();
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
