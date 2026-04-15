/**
 * Aura — Explorar: descoberta de mães, presença, pedidos de conexão.
 * Requer: supabase/COLE_EXPLORAR_DESCoberta.sql aplicado + sessão auth.
 */
(function () {
  const DX_LABEL = {
    tea: "TEA",
    tdah: "TDAH",
    down: "Síndrome de Down",
    pc: "Paralisia cerebral",
    rara: "Condição rara",
    investigacao: "Em investigação",
    mae_solo: "Mãe solo (atípica)",
  };

  const ONLINE_MS = 3 * 60 * 1000;
  const AWAY_MS = 15 * 60 * 1000;

  const el = {
    loading: document.getElementById("explore-loading"),
    empty: document.getElementById("explore-empty"),
    sections: document.getElementById("explore-sections"),
    search: document.getElementById("explore-search-input"),
    hint: document.getElementById("explore-hint"),
    toast: document.getElementById("explore-toast"),
    setupBanner: document.getElementById("explore-setup-banner"),
    setupText: document.getElementById("explore-setup-text"),
    sqlHint: document.getElementById("explore-setup-sql-hint"),
    profileGate: document.getElementById("explore-profile-gate"),
    profileGateList: document.getElementById("explore-profile-gate-list"),
    shell: document.getElementById("explore-shell"),
  };

  let supabase = null;
  let userId = null;
  let meProfile = null;
  let allMothers = [];
  let followingIds = new Set();
  let filterMode = "all";
  let searchQ = "";
  let presenceInterval = null;
  let emptyCopy = null;
  let cardNavBound = false;
  let profileGateActive = false;

  function getExploreProfileGaps(p) {
    const gaps = [];
    const name = (p && p.full_name ? String(p.full_name) : "").trim();
    if (name.length < 3) gaps.push("Nome completo (mínimo 3 letras)");
    const phoneDigits = String(p && p.phone ? p.phone : "").replace(/\D/g, "");
    if (phoneDigits.length < 10) gaps.push("Telemóvel com DDD (10 ou 11 dígitos)");
    const cidade = (p && p.cidade ? String(p.cidade) : "").trim();
    if (cidade.length < 2) gaps.push("Cidade");
    const estado = (p && p.estado ? String(p.estado) : "").trim().toUpperCase();
    if (estado.length !== 2) gaps.push("Estado (UF com 2 letras, ex.: SP)");
    const dx = (p && p.diagnostico ? String(p.diagnostico) : "").trim();
    if (!dx) gaps.push("Diagnóstico (completa o passo 2 do cadastro ou edita os dados do filho)");
    const bio = (p && p.bio ? String(p.bio) : "").trim();
    if (bio.length < 20) gaps.push("Bio — pelo menos 20 caracteres sobre ti");
    const avatar = (p && p.avatar_url ? String(p.avatar_url) : "").trim();
    if (!avatar) gaps.push("Foto de perfil");
    return gaps;
  }

  function showProfileGate(gaps) {
    profileGateActive = true;
    if (el.shell) el.shell.classList.add("explore-shell--profile-blocked");
    if (el.profileGate) el.profileGate.hidden = false;
    if (el.profileGateList) {
      el.profileGateList.innerHTML = gaps
        .map(function (g) {
          return "<li>" + escapeHtml(g) + "</li>";
        })
        .join("");
    }
    hideSetupBanner();
  }

  function hideProfileGate() {
    profileGateActive = false;
    if (el.shell) el.shell.classList.remove("explore-shell--profile-blocked");
    if (el.profileGate) el.profileGate.hidden = true;
  }

  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add("explore-toast--show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.toast.classList.remove("explore-toast--show");
    }, 2800);
  }

  function dxLabel(slug) {
    if (!slug) return "—";
    return DX_LABEL[slug] || slug;
  }

  function initials(name) {
    if (!name || !String(name).trim()) return "…";
    const p = String(name).trim().split(/\s+/).filter(Boolean);
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
  }

  function presenceState(p) {
    if (!p) return { kind: "offline" };
    const t = p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0;
    const fresh = Date.now() - t;
    if (p.is_online || fresh < ONLINE_MS) return { kind: "online" };
    if (fresh < AWAY_MS) return { kind: "away" };
    return { kind: "offline" };
  }

  async function pulsePresence() {
    if (!supabase || !userId) return;
    const now = new Date().toISOString();
    await supabase.from("user_presence").upsert(
      {
        user_id: userId,
        is_online: true,
        last_seen_at: now,
      },
      { onConflict: "user_id" }
    );
  }

  async function loadData() {
    const { data: u } = await supabase.auth.getUser();
    userId = u?.user?.id;
    if (!userId) throw new Error("Sem utilizador");

    const [{ data: me, error: meErr }, { data: ch0 }] = await Promise.all([
      supabase
        .from("profiles")
        .select("diagnostico, cidade, estado, full_name, bio, avatar_url, phone")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("children")
        .select("diagnosticos")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);
    if (meErr) console.warn("[Explorar] perfil:", meErr.message);
    meProfile = me || {};
    const dxFromChild =
      ch0 &&
      Array.isArray(ch0.diagnosticos) &&
      ch0.diagnosticos.length &&
      String(ch0.diagnosticos[0]).trim();
    if (dxFromChild && !String(meProfile.diagnostico || "").trim()) {
      meProfile.diagnostico = String(dxFromChild).trim();
    }

    const gaps = getExploreProfileGaps(meProfile);
    if (gaps.length) {
      showProfileGate(gaps);
      allMothers = [];
      return;
    }
    hideProfileGate();

    const { data: rows, error: rpcErr } = await supabase.rpc(
      "list_profiles_for_discovery"
    );
    if (rpcErr) {
      const msg = rpcErr.message || "";
      if (
        msg.includes("function") ||
        msg.includes("schema cache") ||
        rpcErr.code === "PGRST202"
      ) {
        showSetupBanner(
          "A função list_profiles_for_discovery ainda não existe. Executa o SQL de Explorar no Supabase (ficheiro indicado abaixo)."
        );
      } else {
        showSetupBanner("Não foi possível carregar perfis: " + msg);
      }
      throw rpcErr;
    }

    const { data: presRows } = await supabase
      .from("user_presence")
      .select("user_id, is_online, last_seen_at");
    const presMap = {};
    (presRows || []).forEach(function (r) {
      presMap[r.user_id] = r;
    });

    const { data: followRows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId);
    followingIds = new Set((followRows || []).map(function (r) {
      return r.following_id;
    }));

    allMothers = (rows || []).map(function (r) {
      const pres = presMap[r.id];
      const st = presenceState(pres);
      const sameDx = meProfile.diagnostico && r.diagnostico === meProfile.diagnostico;
      const c1 = norm(meProfile.cidade);
      const c2 = norm(r.cidade);
      const e1 = norm(meProfile.estado);
      const e2 = norm(r.estado);
      const sameCity = c1 && c2 && e1 && e2 && c1 === c2 && e1 === e2;
      return {
        ...r,
        _presence: st,
        _sameDx: !!sameDx,
        _sameCity: !!sameCity,
        _following: followingIds.has(r.id),
      };
    });

    hideSetupBanner();
  }

  function showSetupBanner(text, opts) {
    opts = opts || {};
    if (el.setupBanner && el.setupText) {
      el.setupText.textContent = text;
      el.setupBanner.hidden = false;
      if (el.sqlHint) el.sqlHint.hidden = !!opts.hideSqlHint;
    }
  }

  function hideSetupBanner() {
    if (el.setupBanner) el.setupBanner.hidden = true;
    if (el.sqlHint) el.sqlHint.hidden = false;
  }

  function matchesSearch(m) {
    if (!searchQ) return true;
    const q = norm(searchQ);
    const hay = [
      norm(m.full_name),
      norm(dxLabel(m.diagnostico)),
      norm(m.diagnostico),
      norm(m.cidade),
      norm(m.estado),
      norm(m.bio),
    ].join(" ");
    return hay.includes(q);
  }

  function matchesFilter(m) {
    if (filterMode === "following") return m._following;
    if (filterMode === "dx") return m._sameDx;
    if (filterMode === "city") return m._sameCity;
    return true;
  }

  function filtered() {
    return allMothers.filter(function (m) {
      return matchesFilter(m) && matchesSearch(m);
    });
  }

  function partition(list) {
    const sameDx = [];
    const sameCity = [];
    const rest = [];
    list.forEach(function (m) {
      if (m._sameDx) sameDx.push(m);
      else if (m._sameCity) sameCity.push(m);
      else rest.push(m);
    });
    return { sameDx, sameCity, rest };
  }

  function statusClass(st) {
    if (st.kind === "online") return "mother-card__status mother-card__status--online";
    if (st.kind === "away") return "mother-card__status mother-card__status--away";
    return "mother-card__status";
  }

  function statusTitle(st) {
    if (st.kind === "online") return "Online agora";
    if (st.kind === "away") return "Por aqui há pouco";
    return "Offline";
  }

  function cardHtml(m, index) {
    const st = m._presence;
    const delay = Math.min(index * 0.045, 0.45);
    const url = safeUrl(m.avatar_url);
    const img = url
      ? `<img class="mother-card__avatar" src="${url}" alt="" width="52" height="52" loading="lazy" />`
      : `<span class="mother-card__avatar mother-card__avatar--initials" aria-hidden="true">${escapeHtml(initials(m.full_name))}</span>`;

    const pills = [];
    if (m._sameDx) {
      pills.push(
        '<span class="mother-card__pill mother-card__pill--match">Mesmo diagnóstico</span>'
      );
    }
    if (m._sameCity && m.cidade && m.estado) {
      pills.push(
        '<span class="mother-card__pill mother-card__pill--match">Mesma cidade/estado</span>'
      );
    }
    pills.push(
      `<span class="mother-card__pill">${escapeHtml(dxLabel(m.diagnostico))}</span>`
    );
    if (m.cidade || m.estado) {
      const local = [m.cidade, m.estado].filter(Boolean).join(" - ");
      pills.push(`<span>${escapeHtml(local)}</span>`);
    }

    const btn = m._following
      ? `<button type="button" class="mother-card__connect mother-card__connect--sent" data-follow-id="${m.id}" data-following="1">Seguindo</button>`
      : `<button type="button" class="mother-card__connect" data-follow-id="${m.id}" data-following="0">Seguir</button>`;

    const bio = m.bio
      ? `<p class="mother-card__bio">${escapeHtml(m.bio)}</p>`
      : "";

    return `<article class="mother-card mother-card--clickable" style="--delay:${delay}s" data-mother-id="${m.id}" role="link" tabindex="0" aria-label="Ver perfil de ${escapeAttr(m.full_name || "Mãe Aura")}">
      <div class="mother-card__avatar-wrap">
        <div class="mother-card__avatar-ring">${img}</div>
        <span class="${statusClass(st)}" title="${statusTitle(st)}" aria-label="${statusTitle(st)}"></span>
      </div>
      <div class="mother-card__body">
        <h2 class="mother-card__name">${escapeHtml(m.full_name || "Mãe Aura")}</h2>
        <div class="mother-card__meta">${pills.join("")}</div>
        ${bio}
      </div>
      <div class="mother-card__actions">${btn}</div>
    </article>`;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function safeUrl(u) {
    const s = String(u || "").trim();
    if (!/^https?:\/\//i.test(s)) return "";
    return s.replace(/"/g, "%22").replace(/</g, "").replace(/>/g, "");
  }

  function render() {
    if (profileGateActive) {
      if (el.loading) el.loading.hidden = true;
      if (el.empty) el.empty.hidden = true;
      if (el.sections) el.sections.innerHTML = "";
      return;
    }

    const list = filtered();
    if (el.loading) el.loading.hidden = true;

    if (!list.length) {
      if (el.empty && emptyCopy) {
        const titleEl = el.empty.querySelector(".explore-empty__title");
        const textEl = el.empty.querySelector(".explore-empty__text");
        const ctaEl = el.empty.querySelector(".explore-empty__cta");
        if (filterMode === "following") {
          if (titleEl)
            titleEl.textContent =
              followingIds.size === 0 ? "Ainda não segues ninguém" : "Nenhum resultado";
          if (textEl)
            textEl.textContent =
              followingIds.size === 0
                ? "Explora outras mães e toca em Seguir para as ver aqui."
                : "Tenta outra pesquisa ou muda o filtro.";
          if (ctaEl) {
            ctaEl.textContent = "Ver todas as mães";
            ctaEl.href = "explorar.html";
          }
        } else {
          if (titleEl) titleEl.textContent = emptyCopy.title;
          if (textEl) textEl.textContent = emptyCopy.text;
          if (ctaEl) {
            ctaEl.textContent = emptyCopy.cta;
            ctaEl.href = "perfil.html";
          }
        }
      }
      if (el.empty) el.empty.hidden = false;
      if (el.sections) el.sections.innerHTML = "";
      updateHint();
      return;
    }

    if (el.empty) el.empty.hidden = true;
    const parts = partition(list);
    let html = "";
    let idx = 0;
    function addSection(title, dot, arr) {
      if (!arr.length) return;
      const withIdx = arr.map(function (m) {
        return { m: m, i: idx++ };
      });
      let block = `<section class="explore-section">
        <h3 class="explore-section__label"><span class="explore-section__label-dot ${dot}" aria-hidden="true"></span>${escapeHtml(title)}</h3>
        <div class="explore-section__cards">`;
      withIdx.forEach(function (o) {
        block += cardHtml(o.m, o.i);
      });
      block += "</div></section>";
      html += block;
    }

    if (filterMode === "following") {
      addSection("Quem você segue", "explore-section__label-dot--terra", list);
    } else if (filterMode === "all" && !searchQ) {
      addSection("Diagnóstico parecido ao teu", "", parts.sameDx);
      addSection("Perto de ti", "explore-section__label-dot--terra", parts.sameCity);
      addSection("Outras mães na Aura", "explore-section__label-dot--lav", parts.rest);
    } else {
      addSection("Resultados", "", list);
    }

    if (el.sections) el.sections.innerHTML = html;
    bindConnectButtons();
    ensureCardNav();
    updateHint();
  }

  function updateHint() {
    if (!el.hint) return;
    const n = filtered().length;
    const city = meProfile.cidade ? ` · ${meProfile.cidade}` : "";
    const state = meProfile.estado ? `/${meProfile.estado}` : "";
    const dx = meProfile.diagnostico
      ? dxLabel(meProfile.diagnostico)
      : "completa o teu perfil";
    if (!allMothers.length) {
      el.hint.textContent = "";
      return;
    }
    if (filterMode === "following") {
      el.hint.textContent = `${n} pessoa${n === 1 ? "" : "s"} que segues`;
      return;
    }
    el.hint.textContent =
      filterMode === "all" && !searchQ
        ? `A mostrar ${n} mãe${n === 1 ? "" : "s"} · O teu contexto: ${dx}${city}${state}`
        : `${n} resultado${n === 1 ? "" : "s"}`;
  }

  async function onFollowToggle(targetId, isFollowing) {
    if (!supabase || !userId) return;
    if (isFollowing) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", userId)
        .eq("following_id", targetId);
      if (error) {
        showToast(error.message || "Não foi possível deixar de seguir.");
        return;
      }
      followingIds.delete(targetId);
      allMothers.forEach(function (m) {
        if (m.id === targetId) m._following = false;
      });
      showToast("Você deixou de seguir este perfil.");
    } else {
      const { error } = await supabase.from("follows").insert({
        follower_id: userId,
        following_id: targetId,
      });
      if (error) {
        showToast(
          error.code === "23505"
            ? "Você já segue este perfil."
            : (error.message || "Não foi possível seguir.")
        );
        return;
      }
      followingIds.add(targetId);
      allMothers.forEach(function (m) {
        if (m.id === targetId) m._following = true;
      });
      showToast("Agora você está seguindo este perfil 💛");
    }
    render();
  }

  function bindConnectButtons() {
    if (!el.sections) return;
    el.sections.querySelectorAll("[data-follow-id]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const id = btn.getAttribute("data-follow-id");
        const isFollowing = btn.getAttribute("data-following") === "1";
        if (id) onFollowToggle(id, isFollowing);
      });
    });
  }

  function ensureCardNav() {
    if (cardNavBound || !el.sections) return;
    cardNavBound = true;
    el.sections.addEventListener("click", function (e) {
      if (e.target.closest(".mother-card__connect")) return;
      const card = e.target.closest(".mother-card");
      if (!card) return;
      const id = card.getAttribute("data-mother-id");
      if (id) window.location.href = "perfil-usuario.html?id=" + encodeURIComponent(id);
    });
    el.sections.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target.closest(".mother-card__connect")) return;
      const card = e.target.closest(".mother-card");
      if (!card) return;
      e.preventDefault();
      const id = card.getAttribute("data-mother-id");
      if (id) window.location.href = "perfil-usuario.html?id=" + encodeURIComponent(id);
    });
  }

  function onFilterClick(mode, btn) {
    filterMode = mode;
    document.querySelectorAll("[data-explore-filter]").forEach(function (b) {
      const on = b === btn;
      b.classList.toggle("explore-chip--active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    render();
  }

  async function init() {
    const ok = await window.__auraAuthReady;
    if (!ok) return;

    supabase = window.__auraSupabaseClient;
    if (!supabase) return;

    try {
      await loadData();
      if (el.empty && !emptyCopy) {
        const t = el.empty.querySelector(".explore-empty__title");
        const tx = el.empty.querySelector(".explore-empty__text");
        const c = el.empty.querySelector(".explore-empty__cta");
        emptyCopy = {
          title: t ? t.textContent : "",
          text: tx ? tx.textContent : "",
          cta: c ? c.textContent : "",
        };
      }
    } catch (e) {
      if (el.loading) el.loading.hidden = true;
      if (el.empty) {
        el.empty.hidden = false;
        el.empty.querySelector(".explore-empty__title").textContent =
          "Algo falhou ao carregar";
        el.empty.querySelector(".explore-empty__text").textContent =
          (e && e.message) || "Verifica a sessão e o SQL no Supabase.";
      }
      return;
    }

    await pulsePresence();
    presenceInterval = setInterval(pulsePresence, 45000);

    window.addEventListener("pagehide", function () {
      if (presenceInterval) clearInterval(presenceInterval);
    });

    render();

    if (el.search) {
      el.search.addEventListener("input", function () {
        searchQ = el.search.value.trim();
        render();
      });
    }

    document.querySelectorAll("[data-explore-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const mode = btn.getAttribute("data-explore-filter");
        if (
          mode === "all" ||
          mode === "following" ||
          mode === "dx" ||
          mode === "city"
        ) {
          onFilterClick(
            mode === "dx"
              ? "dx"
              : mode === "city"
                ? "city"
                : mode === "following"
                  ? "following"
                  : "all",
            btn
          );
        }
      });
    });
  }

  init();
})();
