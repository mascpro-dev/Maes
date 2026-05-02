/**
 * Menu lateral (desktop), menu ⋯ (telemóvel), estado activo nos links.
 */
(function () {
  function normPage() {
    let p = (location.pathname || "").split("/").pop() || "index.html";
    if (!p || p === "") p = "index.html";
    return p.toLowerCase();
  }

  function matchHref(href, page) {
    if (!href) return false;
    const h = href.split("/").pop().split("#")[0].split("?")[0].toLowerCase();
    if (h === page) return true;
    if ((page === "" || page === "index.html") && (h === "index.html" || h === "")) return true;
    return false;
  }

  function setActiveNav() {
    const page = normPage();
    document.querySelectorAll(".aura-rail__link[href]").forEach((a) => {
      const ok = matchHref(a.getAttribute("href"), page);
      a.classList.toggle("aura-rail__link--active", ok);
      if (ok) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    document.querySelectorAll(".bottom-nav .nav-btn[href]").forEach((a) => {
      const ok = matchHref(a.getAttribute("href"), page);
      a.classList.toggle("nav-btn--active", ok);
      if (ok) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    const homeBtn = document.getElementById("nav-home");
    if (homeBtn && homeBtn.tagName === "BUTTON") {
      const onHome = page === "index.html";
      homeBtn.classList.toggle("nav-btn--active", onHome);
      if (onHome) homeBtn.setAttribute("aria-current", "page");
      else homeBtn.removeAttribute("aria-current");
    }
  }

  function closeAllMoreMenus(exceptBtn) {
    document.querySelectorAll(".aura-nav-more-btn").forEach((b) => {
      if (b === exceptBtn) return;
      b.setAttribute("aria-expanded", "false");
      const p = b.nextElementSibling;
      if (p && p.classList.contains("aura-nav-more-panel")) p.hidden = true;
    });
  }

  function initMoreMenus() {
    document.querySelectorAll(".aura-nav-more-btn").forEach((btn) => {
      const panel = btn.nextElementSibling;
      if (!panel || !panel.classList.contains("aura-nav-more-panel")) return;

      btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-expanded") === "true";
        closeAllMoreMenus(open ? null : btn);
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        panel.hidden = open;
      });
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest(".aura-mobile-more-wrap")) return;
      closeAllMoreMenus(null);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllMoreMenus(null);
    });
  }

  function init() {
    if (document.querySelector(".aura-rail")) {
      document.body.classList.add("aura-has-rail");
    }
    setActiveNav();
    initMoreMenus();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
