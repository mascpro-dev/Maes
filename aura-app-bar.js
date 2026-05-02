/**
 * Barra superior unificada: pesquisar → notificações → menu ⋯
 * — Esconde no menu suspenso o destino da página atual.
 * — Pesquisar: comportamento por página (mural, comunidade, explorar…).
 */
(function () {
  function normPage() {
    let p = (location.pathname || "").split("/").pop() || "index.html";
    if (!p || p === "") p = "index.html";
    return p.toLowerCase();
  }

  function pathFromHref(href) {
    if (!href) return "";
    const raw = href.split("#")[0].split("?")[0].replace(/^\.\//, "");
    const seg = raw.split("/").pop() || "";
    return seg.toLowerCase();
  }

  function hideOverflowForCurrentRoute() {
    const page = normPage();
    document.querySelectorAll("#aura-overflow-menu a[href]").forEach(function (a) {
      const target = pathFromHref(a.getAttribute("href"));
      let hide = false;
      if (target && target === page) hide = true;
      if ((page === "index.html" || page === "") && (target === "index.html" || target === "")) {
        hide = true;
      }
      a.hidden = hide;
      if (hide) a.setAttribute("aria-hidden", "true");
      else a.removeAttribute("aria-hidden");
    });
  }

  function closeAllOverflowMenus(exceptWrap) {
    document.querySelectorAll(".aura-menu-wrap").forEach(function (wrap) {
      if (wrap === exceptWrap) return;
      const btn = wrap.querySelector("[aria-controls]");
      const menu = wrap.querySelector(".aura-overflow-menu, #aura-overflow-menu");
      if (!btn || !menu) return;
      menu.classList.add("hidden");
      menu.setAttribute("aria-hidden", "true");
      wrap.classList.remove("aura-menu-wrap--open", "comm-header__menu-wrap--open");
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function initOverflowMenus() {
    document.querySelectorAll(".aura-menu-wrap").forEach(function (wrap) {
      const btn = wrap.querySelector("#aura-btn-overflow");
      const menu = wrap.querySelector("#aura-overflow-menu");
      if (!btn || !menu) return;

      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        const open = btn.getAttribute("aria-expanded") === "true";
        closeAllOverflowMenus(open ? null : wrap);
        if (open) {
          menu.classList.add("hidden");
          menu.setAttribute("aria-hidden", "true");
          wrap.classList.remove("aura-menu-wrap--open", "comm-header__menu-wrap--open");
          btn.setAttribute("aria-expanded", "false");
        } else {
          menu.classList.remove("hidden");
          menu.setAttribute("aria-hidden", "false");
          wrap.classList.add("aura-menu-wrap--open", "comm-header__menu-wrap--open");
          btn.setAttribute("aria-expanded", "true");
        }
      });

      menu.addEventListener("click", function (ev) {
        ev.stopPropagation();
      });

      menu.querySelectorAll('a[role="menuitem"]').forEach(function (link) {
        link.addEventListener("click", function () {
          menu.classList.add("hidden");
          menu.setAttribute("aria-hidden", "true");
          wrap.classList.remove("aura-menu-wrap--open", "comm-header__menu-wrap--open");
          btn.setAttribute("aria-expanded", "false");
        });
      });
    });

    document.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest(".aura-menu-wrap")) return;
      closeAllOverflowMenus(null);
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeAllOverflowMenus(null);
    });

    /* Ao passar para desktop o ⋯ some do DOM visual — fechar estado para não ficar “aberto” ao voltar ao telemóvel */
    try {
      var mqDesk = window.matchMedia("(min-width: 768px)");
      function onViewportRail() {
        if (mqDesk.matches) closeAllOverflowMenus(null);
      }
      if (mqDesk.addEventListener) mqDesk.addEventListener("change", onViewportRail);
      else if (mqDesk.addListener) mqDesk.addListener(onViewportRail);
    } catch (e) {}
  }

  function routeSearchClick(ev) {
    const btn = ev.currentTarget;
    if (btn.getAttribute("aria-disabled") === "true") return;
    const page = normPage();

    if (page === "community.html") {
      if (typeof window.showToast === "function") window.showToast("Busca em breve");
      return;
    }

    if (page === "explorar.html") {
      const input = document.getElementById("explore-search-input");
      if (input) {
        input.focus();
        input.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }

    if (page === "mensagens.html") {
      const search = document.getElementById("dm-users-filter");
      if (search) {
        search.focus();
        search.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }
      const dm = document.getElementById("dm-input");
      if (dm) {
        dm.focus();
        dm.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      return;
    }

    if (page === "index.html" || page === "") {
      const mural = document.getElementById("mural-de-historias");
      const ta = document.getElementById("post-content");
      if (mural) mural.scrollIntoView({ behavior: "smooth", block: "start" });
      if (ta) {
        setTimeout(function () {
          ta.focus();
        }, 280);
      }
      return;
    }

    window.location.href = "index.html#mural-de-historias";
  }

  function initSearchButtons() {
    document.querySelectorAll("#aura-btn-search").forEach(function (btn) {
      btn.addEventListener("click", routeSearchClick);
    });
  }

  function init() {
    hideOverflowForCurrentRoute();
    initOverflowMenus();
    initSearchButtons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
