(function () {
  "use strict";

  const PHOTOS = {
    ana: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=128&h=128&fit=crop&crop=face",
    bia: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=128&h=128&fit=crop&crop=face",
    carla: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop&crop=face",
    you: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=128&h=128&fit=crop&crop=face",
  };

  const main = document.getElementById("comm-main");
  const roomList = document.getElementById("room-list");
  const roomPanel = document.getElementById("room-panel");
  const btnLeave = document.getElementById("btn-leave");
  const roomPanelTitle = document.getElementById("room-panel-title");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const btnSend = document.getElementById("btn-send");
  const fabHeart = document.getElementById("fab-heart");
  const fabWord = document.getElementById("fab-word");
  const stageGrid = document.getElementById("stage-grid");

  const speakers = stageGrid
    ? Array.from(stageGrid.querySelectorAll(".speaker"))
    : [];
  let speakerIndex = 0;
  let speakerTimer = null;
  let chatSimTimer = null;

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
      roomList.querySelectorAll(".room-card").forEach(function (card) {
        const tag = card.getAttribute("data-tag") || "";
        const show = f === "all" || tag === f;
        card.classList.toggle("hidden", !show);
      });
    });
  });

  function openRoom(card) {
    if (!card || !roomPanel) return;
    const titleEl = card.querySelector(".room-card__title");
    const title = titleEl ? titleEl.textContent.trim() : "Sala";
    roomPanelTitle.textContent = title.replace(/^Sala:\s*/i, "") || title;
    const badge = card.querySelector(".listener-badge");
    const numEl = document.getElementById("listener-count-num");
    if (badge && numEl) {
      const m = badge.textContent.match(/\d+/);
      if (m) numEl.textContent = m[0];
    }
    roomPanel.classList.remove("hidden");
    roomPanel.setAttribute("aria-hidden", "false");
    if (main) main.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "hidden";
    startSpeakerRotation();
    startChatSimulation();
  }

  function closeRoom() {
    roomPanel.classList.add("hidden");
    roomPanel.setAttribute("aria-hidden", "true");
    if (main) main.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "";
    stopSpeakerRotation();
    stopChatSimulation();
  }

  roomList.addEventListener("click", function (e) {
    const enter = e.target.closest(".btn-enter");
    if (!enter) return;
    const card = enter.closest(".room-card");
    openRoom(card);
  });

  btnLeave.addEventListener("click", closeRoom);

  function applySpeaking(index) {
    speakers.forEach(function (sp, i) {
      sp.classList.toggle("speaking", i === index);
      const mic = sp.querySelector(".speaker__mic");
      if (!mic) return;
      if (i === index && !sp.classList.contains("speaker--you")) {
        mic.classList.remove("speaker__mic--muted");
        mic.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      } else if (!sp.classList.contains("speaker--you")) {
        mic.classList.add("speaker__mic--muted");
        mic.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
      }
    });
  }

  function startSpeakerRotation() {
    const nonYou = speakers.filter(function (s) {
      return !s.classList.contains("speaker--you");
    });
    if (!nonYou.length) return;
    speakerIndex = 0;
    applySpeaking(speakers.indexOf(nonYou[0]));
    stopSpeakerRotation();
    speakerTimer = setInterval(function () {
      speakerIndex = (speakerIndex + 1) % nonYou.length;
      applySpeaking(speakers.indexOf(nonYou[speakerIndex]));
    }, 7000);
  }

  function stopSpeakerRotation() {
    if (speakerTimer) clearInterval(speakerTimer);
    speakerTimer = null;
  }

  const SIM_LINES = [
    { name: "Helena", initials: "HL", grad: "linear-gradient(135deg,#ba8fc4,#9b6ba6)", text: "Concordo demais com a Ana 💛" },
    { name: "Flávia", initials: "FL", grad: "linear-gradient(135deg,#d4906e,#c47a5b)", text: "Aqui a escola também demorou, mas valeu insistir." },
    { name: "Bia Rosa", initials: "BR", grad: "linear-gradient(135deg,#c47a5b,#a8603e)", text: "Salvou meu dia esse papo. Obrigada, meninas." },
  ];
  let simIdx = 0;

  function appendChatMessage(name, text, grad) {
    const row = document.createElement("div");
    row.className = "chat-msg";
    const av = document.createElement("span");
    av.className = "chat-msg__avatar";
    av.style.background =
      grad || "linear-gradient(135deg,#7a9e7e,#5d8262)";
    av.textContent = name
      .split(" ")
      .map(function (p) {
        return p[0];
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const body = document.createElement("div");
    body.className = "chat-msg__body";
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

  function startChatSimulation() {
    stopChatSimulation();
    chatSimTimer = setInterval(function () {
      const line = SIM_LINES[simIdx % SIM_LINES.length];
      simIdx++;
      appendChatMessage(line.name, line.text, line.grad);
    }, 12000);
  }

  function stopChatSimulation() {
    if (chatSimTimer) clearInterval(chatSimTimer);
    chatSimTimer = null;
  }

  function appendUserMessage(text) {
    const row = document.createElement("div");
    row.className = "chat-msg";
    const av = document.createElement("span");
    av.className = "chat-msg__avatar";
    av.style.background = "linear-gradient(135deg,#7a9e7e,#c47a5b)";
    av.textContent = "JM";
    const body = document.createElement("div");
    body.className = "chat-msg__body";
    const nm = document.createElement("span");
    nm.className = "chat-msg__name";
    nm.textContent = "Você";
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

  function sendChat() {
    const t = (chatInput.value || "").trim();
    if (!t) return;
    appendUserMessage(t);
    chatInput.value = "";
  }

  btnSend.addEventListener("click", sendChat);
  chatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChat();
    }
  });

  fabHeart.addEventListener("click", function () {
    const row = document.createElement("div");
    row.className = "chat-msg chat-msg--hearts";
    row.innerHTML =
      '<span class="chat-msg__hearts">💛💛</span><span class="chat-msg__hearts-text">Você enviou carinho para a sala</span>';
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    showToast("Coração enviado com carinho");
  });

  fabWord.addEventListener("click", function () {
    const row = document.createElement("div");
    row.className = "chat-msg chat-msg--system";
    row.innerHTML =
      '<div class="chat-msg__body" style="flex:1;text-align:center"><span class="chat-msg__text">Você pediu a palavra. As moderadoras foram avisadas.</span></div>';
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    showToast("Pedido de palavra registrado");
  });

  document.getElementById("btn-search")?.addEventListener("click", function () {
    showToast("Busca em breve");
  });

  /* Fotos no palco (fallback em gradiente se imagem falhar) */
  function fillStagePhotos() {
    const map = [
      { id: "sp-ana", url: PHOTOS.ana, initials: "AL" },
      { id: "sp-bia", url: PHOTOS.bia, initials: "BR" },
      { id: "sp-carla", url: PHOTOS.carla, initials: "CM" },
      { id: "sp-you", url: PHOTOS.you, initials: "JM" },
    ];
    map.forEach(function (m) {
      const el = document.getElementById(m.id);
      if (!el) return;
      const holder = el.querySelector(".speaker__avatar");
      if (!holder) return;
      const img = document.createElement("img");
      img.src = m.url;
      img.alt = "";
      img.width = 128;
      img.height = 128;
      img.onload = function () {
        holder.textContent = "";
        holder.appendChild(img);
      };
      img.onerror = function () {
        holder.textContent = m.initials;
      };
    });
  }

  fillStagePhotos();
})();
