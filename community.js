/**
 * Comunidade — salas com chat e presença reais (Supabase).
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const STALE_PRESENCE_MS = 120000;
const PRESENCE_TICK_MS = 25000;
const LISTENER_POLL_MS = 45000;

const MIC_ON_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const MIC_OFF_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

/** Liga `window.__auraCommunityOpenRoom` e processa cliques em fila (onclick no HTML chama `window.__auraEnterRoomBtn`). */
function setCommunityEnterHandler(fn) {
  if (typeof fn !== "function") return;
  if (!window.__auraPendingCommunityRooms) window.__auraPendingCommunityRooms = [];
  window.__auraCommunityOpenRoom = fn;
  const q = window.__auraPendingCommunityRooms;
  if (!q.length) return;
  const pending = q.splice(0, q.length);
  for (let i = 0; i < pending.length; i++) {
    try {
      fn(pending[i]);
    } catch (e) {
      console.error("[Aura] enterRoom flush", e);
    }
  }
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

function gradForUser(id) {
  if (!id) return "linear-gradient(135deg,#7a9e7e,#5d8262)";
  const hue = hashHue(String(id));
  return `linear-gradient(135deg, hsl(${hue},42%,52%), hsl(${(hue + 44) % 360},38%,44%))`;
}

function initials(name) {
  if (typeof AuraAuth !== "undefined" && AuraAuth.initialsFromNome) {
    return AuraAuth.initialsFromNome(name);
  }
  if (!name || !String(name).trim()) return "AU";
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
  return String(name).trim().slice(0, 2).toUpperCase();
}

function showToast(text) {
  let t = document.getElementById("comm-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "comm-toast";
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add("toast--show");
  clearTimeout(showToast._h);
  showToast._h = setTimeout(function () {
    t.classList.remove("toast--show");
  }, 2600);
}

async function getSupabase() {
  if (window.__auraAuthReady) {
    const ok = await window.__auraAuthReady;
    if (!ok) return null;
  }
  if (window.__auraSupabaseClient) return window.__auraSupabaseClient;
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

async function resolveProfilesMap(supabase, userIds, myUserId) {
  const uniq = [...new Set((userIds || []).filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;

  const { data: rows, error } = await supabase.rpc(
    "resolve_profiles_for_community_chat",
    { p_user_ids: uniq }
  );

  if (!error && Array.isArray(rows)) {
    rows.forEach((r) => {
      if (r?.id) {
        const av = r.avatar_url && String(r.avatar_url).trim();
        map.set(r.id, {
          id: r.id,
          full_name: r.full_name,
          avatar_url: av || null,
        });
      }
    });
    if (map.size > 0) return map;
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .eq("id", myUserId)
    .maybeSingle();
  if (me?.id) {
    const av = me.avatar_url && String(me.avatar_url).trim();
    map.set(me.id, { ...me, avatar_url: av || null });
  }

  await Promise.all(
    uniq
      .filter((id) => id !== myUserId)
      .map(async (tid) => {
        const { data: r } = await supabase.rpc("get_public_profile", {
          p_target_id: tid,
        });
        const row = Array.isArray(r) ? r[0] : r;
        if (row?.id) {
          const av = row.avatar_url && String(row.avatar_url).trim();
          map.set(row.id, { ...row, avatar_url: av || null });
        }
      })
  );

  return map;
}

async function boot() {
  const supabase = await getSupabase();
  if (!supabase) {
    setCommunityEnterHandler(function () {
      showToast("Sessão indisponível. Abre o login.");
    });
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) {
    setCommunityEnterHandler(function () {
      showToast("Precisas de iniciar sessão.");
    });
    return;
  }

  let myProfile = { id: userId, full_name: "Você", avatar_url: null };
  void supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle()
    .then(function (res) {
      const row = res && res.data;
      if (row && row.id) myProfile = row;
    });

  const main = document.getElementById("comm-main");
  const roomPanel = document.getElementById("room-panel");
  const btnLeave = document.getElementById("btn-leave");
  const roomPanelTitleText = document.getElementById("room-panel-title-text");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const btnSend = document.getElementById("btn-send");
  const fabHeart = document.getElementById("fab-heart");
  const fabVoice = document.getElementById("fab-voice");
  const stageGrid = document.getElementById("stage-grid");

  if (!chatMessages) {
    console.warn("[Aura] community: #chat-messages em falta");
    setCommunityEnterHandler(function () {
      showToast("Erro ao carregar a página da comunidade.");
    });
    return;
  }

  let currentRoomId = null;
  let realtimeChannel = null;
  let presenceTimer = null;
  let pollTimer = null;
  let headerCountTimer = null;
  const renderedIds = new Set();
  let lastMessagesForStage = [];
  let roomsFetchErrorToasted = false;
  let subscriptionEpoch = 0;

  function isRoomPanelOpen() {
    return !!(roomPanel && !roomPanel.classList.contains("hidden"));
  }

  /** Garante pelo menos 1 ouvinte quando a própria utilizadora está na sala (presença ainda a propagar). */
  function effectiveListenerCount(raw, forRoomId) {
    const n = typeof raw === "number" ? raw : 0;
    if (forRoomId && String(forRoomId) === String(currentRoomId) && isRoomPanelOpen()) {
      return Math.max(n, 1);
    }
    return n;
  }

  function getSelectedRecipientId() {
    const sel = document.getElementById("chat-recipient");
    const v = sel && sel.value ? String(sel.value).trim() : "";
    return v || null;
  }

  async function rebuildRecipientList(rid) {
    const sel = document.getElementById("chat-recipient");
    if (!sel || !rid) return;
    const sinceIso = new Date(Date.now() - STALE_PRESENCE_MS).toISOString();
    const { data: pres } = await supabase
      .from("community_room_presence")
      .select("user_id")
      .eq("room_id", rid)
      .gte("last_seen_at", sinceIso);
    const ids = [
      ...new Set((pres || []).map((r) => r.user_id).filter(Boolean)),
    ].filter((id) => id !== userId);
    const keep = sel.value;
    sel.innerHTML =
      '<option value="">Todas na sala (mensagem aberta)</option>';
    if (ids.length) {
      const pmap = await resolveProfilesMap(supabase, ids, userId);
      ids.forEach(function (oid) {
        const pr = pmap.get(oid) || {};
        const full = (pr.full_name || "Mãe").trim() || "Mãe";
        const short = full.split(/\s+/)[0] || full;
        const opt = document.createElement("option");
        opt.value = oid;
        opt.textContent = "Reservado · " + short;
        sel.appendChild(opt);
      });
    }
    if (keep && [...sel.options].some(function (o) { return o.value === keep; })) {
      sel.value = keep;
    } else {
      sel.value = "";
    }
  }

  function setActiveChip(activeBtn) {
    document.querySelectorAll(".filter-chips .chip").forEach(function (b) {
      const on = b === activeBtn;
      b.classList.toggle("chip--active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  document.querySelectorAll(".filter-chips .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      setActiveChip(chip);
      const f = chip.getAttribute("data-filter");
      if (!main) return;
      main.querySelectorAll(".room-card").forEach(function (card) {
        const tag = card.getAttribute("data-tag") || "";
        const show = f === "all" || tag === f;
        card.classList.toggle("hidden", !show);
      });
    });
  });

  function micMutedHtml() {
    return '<div class="speaker__mic speaker__mic--muted">' + MIC_OFF_SVG + "</div>";
  }

  function micLiveHtml() {
    return '<div class="speaker__mic">' + MIC_ON_SVG + "</div>";
  }

  function renderStageFromMessages(msgs, profileMap) {
    if (!stageGrid) return;
    stageGrid.classList.remove("stage-grid--empty");
    stageGrid.setAttribute("aria-hidden", "false");
    const others = [];
    const seen = new Set();
    for (let i = msgs.length - 1; i >= 0 && others.length < 3; i--) {
      const uid = msgs[i].user_id;
      if (!uid || uid === userId || seen.has(uid)) continue;
      seen.add(uid);
      others.push(uid);
    }
    others.reverse();
    const slots = [];
    others.forEach(function (ouid) {
      const pr = profileMap.get(ouid) || {};
      slots.push({
        userId: ouid,
        name: (pr.full_name || "Mãe").split(/\s+/)[0] || "Mãe",
        avatar_url: pr.avatar_url || null,
        isYou: false,
      });
    });
    slots.push({
      userId: userId,
      name: "Você",
      avatar_url: myProfile?.avatar_url || null,
      isYou: true,
    });
    while (slots.length < 4) {
      slots.unshift({
        userId: null,
        name: "…",
        avatar_url: null,
        isYou: false,
        placeholder: true,
      });
    }
    const display = slots.slice(-4);

    stageGrid.innerHTML = display
      .map(function (s, idx) {
        const speaking = !s.placeholder && !s.isYou && idx === 0;
        const youCls = s.isYou ? " speaker--you" : "";
        const speakCls = speaking ? " speaking" : "";
        const aria = s.isYou
          ? "Você"
          : s.placeholder
            ? "Lugar vago no palco"
            : s.name + " — na sala";
        const grad = gradForUser(s.userId || "x" + idx);
        let innerAv =
          '<div class="speaker__avatar" style="background:' +
          grad +
          '">' +
          (s.placeholder ? "·" : initials(s.name)) +
          "</div>";
        if (s.avatar_url && !s.placeholder) {
          innerAv =
            '<div class="speaker__avatar" style="background:' +
            grad +
            '"><img src="' +
            String(s.avatar_url).replace(/"/g, "") +
            '" alt="" width="128" height="128" loading="lazy"/></div>';
        }
        const mic = s.placeholder ? micMutedHtml() : s.isYou ? micMutedHtml() : speaking ? micLiveHtml() : micMutedHtml();
        return (
          '<div class="speaker' +
          speakCls +
          youCls +
          '" data-user-slot="' +
          idx +
          '" aria-label="' +
          aria +
          '">' +
          '<div class="speaker__ring">' +
          innerAv +
          "</div>" +
          '<span class="speaker__name">' +
          (s.placeholder ? "…" : s.name) +
          "</span>" +
          mic +
          "</div>"
        );
      })
      .join("");
  }

  async function refreshListenerCounts(allPresenceRows) {
    const sinceIso = new Date(Date.now() - STALE_PRESENCE_MS).toISOString();
    const rows =
      allPresenceRows ||
      (await (async function () {
        const { data } = await supabase
          .from("community_room_presence")
          .select("room_id, last_seen_at");
        return data;
      })());
    if (!rows) return;
    const counts = {};
    rows.forEach(function (r) {
      if (!r.room_id || !r.last_seen_at) return;
      if (new Date(r.last_seen_at).getTime() < new Date(sinceIso).getTime()) return;
      counts[r.room_id] = (counts[r.room_id] || 0) + 1;
    });
    document.querySelectorAll(".room-card[data-room-id]").forEach(function (card) {
      const rid = card.getAttribute("data-room-id");
      const n = effectiveListenerCount(counts[rid] || 0, rid);
      const el = card.querySelector(".js-room-listeners");
      if (el) el.textContent = String(n);
    });
  }

  function stopHeaderCountLoop() {
    if (headerCountTimer) {
      clearInterval(headerCountTimer);
      headerCountTimer = null;
    }
  }

  async function updateHeaderListeners(rid) {
    if (!rid) return;
    const sinceIso = new Date(Date.now() - STALE_PRESENCE_MS).toISOString();
    const numEl = document.getElementById("listener-count-num");
    if (!numEl) return;

    let n = 0;
    const { data, error, count } = await supabase
      .from("community_room_presence")
      .select("user_id", { count: "exact" })
      .eq("room_id", rid)
      .gte("last_seen_at", sinceIso);

    if (!error) {
      if (typeof count === "number" && count >= 0) n = count;
      else if (Array.isArray(data)) n = data.length;
    } else {
      console.warn("[Aura] contagem de ouvintes:", error);
    }

    const out = effectiveListenerCount(n, rid);
    numEl.textContent = String(out);
  }

  function startHeaderCountLoop(rid) {
    stopHeaderCountLoop();
    headerCountTimer = setInterval(function () {
      if (
        String(currentRoomId) === String(rid) &&
        isRoomPanelOpen()
      ) {
        updateHeaderListeners(rid);
      }
    }, 8000);
  }

  async function syncRoomsFromDb() {
    const { data: rooms, error } = await supabase
      .from("community_rooms")
      .select("id, slug, title, description, tag, is_featured, sort_order")
      .order("sort_order", { ascending: true });

    if (error) {
      console.warn("[Aura] community_rooms:", error);
      if (!roomsFetchErrorToasted) {
        roomsFetchErrorToasted = true;
        showToast("Executa o SQL das salas no Supabase (COLE_SALAS_COMUNIDADE).");
      }
      return;
    }

    (rooms || []).forEach(function (room) {
      const card = document.querySelector('.room-card[data-room-slug="' + room.slug + '"]');
      if (!card) return;
      card.setAttribute("data-room-id", room.id);
      const titleEl = card.querySelector(".room-card__title");
      if (titleEl) titleEl.textContent = "Sala: " + room.title;
      const descEl = card.querySelector(".room-card__desc");
      if (descEl && room.description) descEl.textContent = room.description;
      if (room.tag) card.setAttribute("data-tag", room.tag);
      if (room.is_featured === false) {
        card.classList.add("room-card--community");
      }
    });

    const { data: presRows } = await supabase
      .from("community_room_presence")
      .select("room_id, last_seen_at");
    await refreshListenerCounts(presRows || []);
  }

  async function stopRealtime() {
    if (!realtimeChannel) return;
    const ch = realtimeChannel;
    realtimeChannel = null;
    try {
      const r = supabase.removeChannel(ch);
      if (r && typeof r.then === "function") await r;
    } catch (e) {
      console.warn("[Aura] removeChannel", e);
    }
  }

  function stopPresence() {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
  }

  async function leavePresence(roomId) {
    if (!roomId || !userId) return;
    await supabase
      .from("community_room_presence")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", userId);
  }

  async function heartbeatPresence(roomId) {
    if (!roomId || !userId) return;
    await supabase.from("community_room_presence").upsert(
      {
        room_id: roomId,
        user_id: userId,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "room_id,user_id" }
    );
    await updateHeaderListeners(roomId);
    rebuildRecipientList(roomId);
  }

  function appendHeartRow(recipientFirstName) {
    const row = document.createElement("div");
    row.className = "chat-msg chat-msg--hearts";
    const sub = recipientFirstName
      ? " para " + recipientFirstName + " · toda a sala vê"
      : " para todas na sala";
    row.innerHTML =
      '<span class="chat-msg__hearts">💛💛</span><span class="chat-msg__hearts-text">Você enviou carinho' +
      sub +
      "</span>";
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function fillChatAvatarEl(av, name, grad, avatarUrl) {
    const g = grad || gradForUser(name);
    av.textContent = "";
    av.innerHTML = "";
    const url = avatarUrl && String(avatarUrl).trim();
    if (url) {
      av.style.background = g;
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.width = 40;
      img.height = 40;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () {
        img.remove();
        av.style.background = g;
        av.textContent = initials(name);
      });
      av.appendChild(img);
    } else {
      av.style.background = g;
      av.textContent = initials(name);
    }
  }

  function appendChatRow(name, text, grad, avatarUrl, directLine) {
    const row = document.createElement("div");
    row.className = "chat-msg" + (directLine ? " chat-msg--direct" : "");
    const av = document.createElement("span");
    av.className = "chat-msg__avatar";
    fillChatAvatarEl(av, name, grad, avatarUrl);
    const body = document.createElement("div");
    body.className = "chat-msg__body";
    if (directLine) {
      const tag = document.createElement("span");
      tag.className = "chat-msg__direct-tag";
      tag.textContent = directLine;
      body.appendChild(tag);
    }
    const nm = document.createElement("span");
    nm.className = "chat-msg__name";
    nm.textContent = name;
    const tx = document.createElement("span");
    tx.className = "chat-msg__text";
    tx.textContent = text;
    body.appendChild(nm);
    body.appendChild(tx);
    row.appendChild(av);
    row.appendChild(body);
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendHeartFromPeer(senderFirst, recipientFirst) {
    const row = document.createElement("div");
    row.className = "chat-msg chat-msg--hearts";
    const extra = recipientFirst ? " (para " + recipientFirst + ")" : "";
    row.innerHTML =
      '<span class="chat-msg__hearts">💛</span><span class="chat-msg__hearts-text">' +
      senderFirst +
      " enviou carinho" +
      extra +
      " · toda a sala vê</span>";
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function firstName(full) {
    if (!full || !String(full).trim()) return "Mãe";
    return String(full).trim().split(/\s+/)[0] || "Mãe";
  }

  async function renderMessageRecord(msg, profileMap) {
    if (renderedIds.has(msg.id)) return;
    renderedIds.add(msg.id);

    const recId = msg.recipient_user_id || null;
    const recPr = recId ? profileMap.get(recId) : null;
    const recFirst = recPr ? firstName(recPr.full_name) : null;

    if (msg.message_kind === "heart") {
      const pr = profileMap.get(msg.user_id) || {};
      const nm = msg.user_id === userId ? "Você" : pr.full_name || "Mãe";
      if (msg.user_id === userId) appendHeartRow(recFirst);
      else appendHeartFromPeer(firstName(nm), recFirst);
      return;
    }

    const pr = profileMap.get(msg.user_id) || {};
    const nm = msg.user_id === userId ? "Você" : pr.full_name || "Mãe";
    const av =
      (pr.avatar_url && String(pr.avatar_url).trim()) || null;
    const directLine = recId
      ? "Reservado · para " +
        (recFirst || "mãe") +
        " — toda a sala pode ler"
      : null;
    appendChatRow(nm, msg.content, gradForUser(msg.user_id), av, directLine);
  }

  async function loadRoomMessages(rid) {
    renderedIds.clear();
    chatMessages.innerHTML = "";

    const { data: msgs, error } = await supabase
      .from("community_room_messages")
      .select(
        "id, room_id, user_id, content, message_kind, created_at, recipient_user_id"
      )
      .eq("room_id", rid)
      .order("created_at", { ascending: true })
      .limit(120);

    if (error) {
      showToast("Não foi possível carregar o chat. Verifica RLS e tabelas.");
      console.warn(error);
      return;
    }

    const ids = [];
    (msgs || []).forEach(function (m) {
      ids.push(m.user_id);
      if (m.recipient_user_id) ids.push(m.recipient_user_id);
    });
    const profileMap = await resolveProfilesMap(supabase, ids, userId);
    lastMessagesForStage = msgs || [];

    for (let i = 0; i < (msgs || []).length; i++) {
      await renderMessageRecord(msgs[i], profileMap);
    }
    renderStageFromMessages(msgs || [], profileMap);
  }

  async function subscribeRoom(rid) {
    await stopRealtime();
    subscriptionEpoch++;
    const myEpoch = subscriptionEpoch;
    const ch = supabase
      .channel("comm-room-" + rid + "-" + myEpoch + "-" + Date.now())
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_room_messages",
          filter: "room_id=eq." + rid,
        },
        async function (payload) {
          if (myEpoch !== subscriptionEpoch) return;
          const msg = payload.new;
          if (!msg || String(msg.room_id) !== String(currentRoomId)) return;
          if (renderedIds.has(msg.id)) return;
          lastMessagesForStage = lastMessagesForStage.concat(msg);
          if (lastMessagesForStage.length > 200) {
            lastMessagesForStage = lastMessagesForStage.slice(-200);
          }
          const uids = [];
          lastMessagesForStage.forEach(function (m) {
            uids.push(m.user_id);
            if (m.recipient_user_id) uids.push(m.recipient_user_id);
          });
          const profileMap = await resolveProfilesMap(supabase, uids, userId);
          await renderMessageRecord(msg, profileMap);
          renderStageFromMessages(lastMessagesForStage, profileMap);
        }
      )
      .subscribe();
    realtimeChannel = ch;
  }

  async function openRoom(card) {
    if (!card || !roomPanel) return;
    let rid = card.getAttribute("data-room-id");
    if (!rid) {
      const slug = card.getAttribute("data-room-slug");
      if (slug) {
        const { data: row, error } = await supabase
          .from("community_rooms")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!error && row?.id) {
          rid = row.id;
          card.setAttribute("data-room-id", rid);
        }
      }
    }
    if (!rid) {
      showToast("Salas ainda não ativas no Supabase — corre o SQL da comunidade.");
      return;
    }

    if (currentRoomId === rid && !roomPanel.classList.contains("hidden")) {
      return;
    }

    if (currentRoomId && currentRoomId !== rid) {
      await leavePresence(currentRoomId);
      subscriptionEpoch++;
      await stopRealtime();
      stopPresence();
      currentRoomId = null;
    }

    currentRoomId = rid;

    const titleEl = card.querySelector(".room-card__title");
    const title = titleEl ? titleEl.textContent.trim() : "Sala";
    const shortTitle = title.replace(/^Sala:\s*/i, "") || title;
    if (roomPanelTitleText) roomPanelTitleText.textContent = shortTitle;

    roomPanel.classList.remove("hidden");
    roomPanel.setAttribute("aria-hidden", "false");
    if (main) main.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "hidden";

    const numEl = document.getElementById("listener-count-num");
    if (numEl) numEl.textContent = "1";

    await heartbeatPresence(rid);
    await rebuildRecipientList(rid);
    presenceTimer = setInterval(function () {
      heartbeatPresence(rid);
    }, PRESENCE_TICK_MS);

    await loadRoomMessages(rid);
    await subscribeRoom(rid);
    startHeaderCountLoop(rid);
  }

  async function closeRoom() {
    abortActiveRecording();
    stopHeaderCountLoop();
    subscriptionEpoch++;
    if (currentRoomId) {
      await leavePresence(currentRoomId);
    }
    await stopRealtime();
    stopPresence();
    currentRoomId = null;

    if (roomPanel) {
      roomPanel.classList.add("hidden");
      roomPanel.setAttribute("aria-hidden", "true");
    }
    if (main) main.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "";
    if (stageGrid) {
      stageGrid.innerHTML = "";
      stageGrid.classList.add("stage-grid--empty");
      stageGrid.setAttribute("aria-hidden", "true");
    }

    const { data: presRows } = await supabase
      .from("community_room_presence")
      .select("room_id, last_seen_at");
    await refreshListenerCounts(presRows || []);
  }

  setCommunityEnterHandler(function (card) {
    void openRoom(card).catch(function (err) {
      console.error("[Aura] openRoom", err);
      showToast("Não foi possível abrir a sala. Recarrega a página.");
    });
  });

  document.getElementById("btn-propose-room")?.addEventListener("click", function () {
    showToast(
      "Em breve: escolha tema, horário e convide outras mães — com as mesmas regras de respeito da Aura."
    );
  });

  btnLeave?.addEventListener("click", function () {
    closeRoom();
  });

  async function sendChat() {
    if (!currentRoomId) return;
    const t = (chatInput.value || "").trim();
    if (!t) return;
    chatInput.value = "";
    const recipientId = getSelectedRecipientId();
    const insertPayload = {
      room_id: currentRoomId,
      user_id: userId,
      content: t,
      message_kind: "text",
    };
    if (recipientId) insertPayload.recipient_user_id = recipientId;

    const { data, error } = await supabase
      .from("community_room_messages")
      .insert(insertPayload)
      .select(
        "id, room_id, user_id, content, message_kind, created_at, recipient_user_id"
      )
      .single();

    if (error) {
      showToast(error.message || "Não foi possível enviar.");
      chatInput.value = t;
      return;
    }
    if (data && !renderedIds.has(data.id)) {
      const ids = [userId];
      if (data.recipient_user_id) ids.push(data.recipient_user_id);
      const profileMap = await resolveProfilesMap(supabase, ids, userId);
      await renderMessageRecord(data, profileMap);
      lastMessagesForStage = lastMessagesForStage.concat(data);
      renderStageFromMessages(lastMessagesForStage, profileMap);
    }
  }

  btnSend?.addEventListener("click", sendChat);
  chatInput?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChat();
    }
  });

  fabHeart?.addEventListener("click", async function () {
    if (!currentRoomId) return;
    const recipientId = getSelectedRecipientId();
    const ins = {
      room_id: currentRoomId,
      user_id: userId,
      content: "💛",
      message_kind: "heart",
    };
    if (recipientId) ins.recipient_user_id = recipientId;
    const { data, error } = await supabase
      .from("community_room_messages")
      .insert(ins)
      .select(
        "id, room_id, user_id, content, message_kind, created_at, recipient_user_id"
      )
      .single();

    if (error) {
      showToast(error.message || "Não foi possível enviar.");
      return;
    }
    if (data && !renderedIds.has(data.id)) {
      const ids = [userId];
      if (data.recipient_user_id) ids.push(data.recipient_user_id);
      const profileMap = await resolveProfilesMap(supabase, ids, userId);
      await renderMessageRecord(data, profileMap);
    }
    showToast("Coração enviado com carinho");
  });

  /* Gravador — envia linha de texto para todas verem (sem storage de áudio ainda) */
  let voiceRecording = false;
  let mediaRecorder = null;
  let mediaStream = null;
  let mediaChunks = [];
  let recordStartedAt = 0;

  function formatDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function appendVoiceMessage(blobUrl, durationSec, isDemo) {
    var row = document.createElement("div");
    row.className = "chat-msg chat-msg--voice";
    row.innerHTML =
      '<span class="chat-msg__avatar" style="background:linear-gradient(135deg,#7a9e7e,#c47a5b)">' +
      initials(myProfile?.full_name || "Você") +
      "</span>" +
      '<div class="chat-msg__body">' +
      '<span class="chat-msg__name">Você · áudio</span>' +
      '<div class="chat-msg__voice">' +
      '<button type="button" class="voice-play" aria-label="Ouvir mensagem de voz">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
      "</button>" +
      '<div class="voice-wave" aria-hidden="true">' +
      '<span></span><span></span><span></span><span></span><span></span><span></span>' +
      "</div>" +
      '<span class="voice-dur">' +
      formatDur(durationSec) +
      "</span>" +
      (blobUrl && !isDemo
        ? '<audio preload="metadata" src="' + blobUrl + '"></audio>'
        : "") +
      "</div>" +
      (isDemo
        ? '<span class="chat-msg__voice-note">Demonstração — ative o microfone no navegador para gravar de verdade.</span>'
        : "") +
      "</div>";
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    var audio = row.querySelector("audio");
    var btn = row.querySelector(".voice-play");
    if (isDemo && btn) {
      btn.disabled = true;
      btn.classList.add("voice-play--disabled");
      btn.setAttribute("aria-label", "Demonstração sem áudio");
    }
    if (audio && btn) {
      btn.addEventListener("click", function () {
        if (audio.paused) {
          audio.play();
          btn.setAttribute("aria-label", "Pausar");
          btn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        } else {
          audio.pause();
          btn.setAttribute("aria-label", "Ouvir mensagem de voz");
          btn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
      });
      audio.addEventListener("ended", function () {
        btn.setAttribute("aria-label", "Ouvir mensagem de voz");
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      });
    }
  }

  function setVoiceFabRecording(on) {
    if (!fabVoice) return;
    voiceRecording = on;
    fabVoice.classList.toggle("fab--recording", on);
    fabVoice.setAttribute("aria-pressed", on ? "true" : "false");
    var label = fabVoice.querySelector(".fab-voice__label");
    if (label) {
      label.textContent = on ? "Enviar" : "Gravar áudio";
    }
    fabVoice.setAttribute(
      "aria-label",
      on
        ? "Gravando. Toque para parar e enviar ao chat."
        : "Gravar mensagem de voz para o chat. Toque para começar e toque de novo para enviar."
    );
  }

  function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    var types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  async function persistVoiceNote(durationSec, isDemo) {
    if (!currentRoomId) return;
    const line = isDemo
      ? "🎤 Áudio (demonstração · " + formatDur(durationSec) + ")"
      : "🎤 Mensagem de voz · " + formatDur(durationSec);
    const recipientId = getSelectedRecipientId();
    const vins = {
      room_id: currentRoomId,
      user_id: userId,
      content: line,
      message_kind: "text",
    };
    if (recipientId) vins.recipient_user_id = recipientId;
    const { data, error } = await supabase
      .from("community_room_messages")
      .insert(vins)
      .select(
        "id, room_id, user_id, content, message_kind, created_at, recipient_user_id"
      )
      .single();
    if (error) {
      showToast("Chat não guardou o áudio como texto.");
      return;
    }
    if (data && !renderedIds.has(data.id)) {
      const ids = [userId];
      if (data.recipient_user_id) ids.push(data.recipient_user_id);
      const profileMap = await resolveProfilesMap(supabase, ids, userId);
      await renderMessageRecord(data, profileMap);
      lastMessagesForStage = lastMessagesForStage.concat(data);
      renderStageFromMessages(lastMessagesForStage, profileMap);
    }
  }

  async function startVoiceRecord() {
    if (typeof MediaRecorder === "undefined") {
      showToast("Gravação não suportada neste navegador.");
      await persistVoiceNote(5, true);
      appendVoiceMessage(null, 5, true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("Microfone não disponível — enviando demonstração.");
      setTimeout(async function () {
        var d = 4 + Math.floor(Math.random() * 5);
        await persistVoiceNote(d, true);
        appendVoiceMessage(null, d, true);
        showToast("Áudio de demonstração enviado ao chat");
      }, 600);
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream = stream;
      mediaChunks = [];
      var mime = pickMime();
      var rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorder = rec;
      rec.ondataavailable = function (e) {
        if (e.data && e.data.size) mediaChunks.push(e.data);
      };
      rec.onstop = async function () {
        if (mediaStream) {
          mediaStream.getTracks().forEach(function (t) {
            t.stop();
          });
          mediaStream = null;
        }
        var mimeType = rec.mimeType || "audio/webm";
        var chunks = mediaChunks.slice();
        mediaRecorder = null;
        mediaChunks = [];
        var elapsed = (Date.now() - recordStartedAt) / 1000;
        setVoiceFabRecording(false);
        if (elapsed < 0.5 || chunks.length === 0) {
          showToast("Gravação muito curta — tente de novo.");
          return;
        }
        var blob = new Blob(chunks, { type: mimeType });
        var url = URL.createObjectURL(blob);
        appendVoiceMessage(url, elapsed, false);
        await persistVoiceNote(elapsed, false);
        showToast("Áudio enviado ao chat");
      };
      recordStartedAt = Date.now();
      rec.start(250);
      setVoiceFabRecording(true);
    } catch (err) {
      showToast("Não foi possível acessar o microfone.");
      appendVoiceMessage(null, 5, true);
      await persistVoiceNote(5, true);
    }
  }

  function stopVoiceRecord() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      setVoiceFabRecording(false);
    }
  }

  function abortActiveRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      var rec = mediaRecorder;
      var stream = mediaStream;
      mediaRecorder = null;
      mediaChunks = [];
      rec.onstop = function () {
        if (stream) {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
        }
        mediaStream = null;
        setVoiceFabRecording(false);
      };
      rec.stop();
    } else {
      if (mediaStream) {
        mediaStream.getTracks().forEach(function (t) {
          t.stop();
        });
        mediaStream = null;
      }
      mediaRecorder = null;
      mediaChunks = [];
      setVoiceFabRecording(false);
    }
  }

  if (fabVoice) {
    fabVoice.addEventListener("click", function () {
      if (voiceRecording) {
        stopVoiceRecord();
      } else {
        startVoiceRecord();
      }
    });
  }

  document.getElementById("btn-search")?.addEventListener("click", function () {
    showToast("Busca em breve");
  });

  void syncRoomsFromDb().catch(function (err) {
    console.warn("[Aura] syncRoomsFromDb", err);
  });

  pollTimer = setInterval(function () {
    syncRoomsFromDb();
  }, LISTENER_POLL_MS);
}

void boot().catch(function (err) {
  console.error("[Aura] community boot", err);
  setCommunityEnterHandler(function () {
    showToast("Falha ao iniciar a comunidade. Recarrega a página.");
  });
});
