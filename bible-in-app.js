/**
 * Lê a Bíblia NVI-PT dentro da Aura (painel + iframe), sem sair para o browser.
 * Aba extra: temas / estudo focado em mulheres (Bible Gateway, mesma tradução).
 */
(function () {
  const sheet = document.getElementById("aura-bible-sheet");
  const frame = document.getElementById("aura-bible-frame");
  const closeBtn = document.getElementById("aura-bible-close");
  const backdrop = document.getElementById("aura-bible-backdrop");
  const titleEl = document.getElementById("aura-bible-title");
  const tabPassage = document.querySelector('[data-bible-tab="passage"]');
  const tabWomen = document.querySelector('[data-bible-tab="women"]');
  const verseLink = document.getElementById("daily-verse-link");

  /** Pesquisa NVI-PT (estudos, devocionais, passagens com “mulher”, etc.) */
  const WOMEN_STUDY_URL =
    "https://www.biblegateway.com/quicksearch/?quicksearch=mulher&version=NVI-PT&searchtype=all";

  function setTabActive(which) {
    [tabPassage, tabWomen].forEach(function (t) {
      if (!t) return;
      const on = t.getAttribute("data-bible-tab") === which;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.classList.toggle("aura-bible-sheet__tab--active", on);
    });
  }

  function getPassageUrl() {
    const u = verseLink && verseLink.dataset && verseLink.dataset.bibleUrl;
    return (u && String(u).trim()) || "";
  }

  function openSheet(mode) {
    if (!sheet || !frame) return;
    const passageUrl = getPassageUrl();
    if (mode === "women") {
      frame.removeAttribute("srcdoc");
      frame.src = WOMEN_STUDY_URL;
      if (titleEl) titleEl.textContent = "Bíblia NVI — para mulheres";
      setTabActive("women");
    } else {
      if (!passageUrl) return;
      frame.removeAttribute("srcdoc");
      frame.src = passageUrl;
      if (titleEl) titleEl.textContent = "Bíblia NVI — passagem do dia";
      setTabActive("passage");
    }
    sheet.hidden = false;
    sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (verseLink) verseLink.setAttribute("aria-expanded", "true");
    closeBtn && closeBtn.focus();
  }

  function closeSheet() {
    if (!sheet || !frame) return;
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    frame.src = "about:blank";
    document.body.style.overflow = "";
    if (verseLink) verseLink.setAttribute("aria-expanded", "false");
  }

  verseLink &&
    verseLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (!getPassageUrl()) return;
      openSheet("passage");
    });

  tabPassage &&
    tabPassage.addEventListener("click", function () {
      if (!getPassageUrl()) return;
      openSheet("passage");
    });

  tabWomen &&
    tabWomen.addEventListener("click", function () {
      openSheet("women");
    });

  closeBtn && closeBtn.addEventListener("click", closeSheet);
  backdrop && backdrop.addEventListener("click", closeSheet);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sheet && !sheet.hidden) {
      e.preventDefault();
      closeSheet();
    }
  });
})();
