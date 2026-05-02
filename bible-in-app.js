/**
 * Passagem bíblica dentro da Aura: texto via getBible Query API (Almeida Atualizada, CORS aberto).
 * Evita iframe do Bible Gateway (X-Frame-Options / CSP).
 */
(function () {
  const GETBIBLE_QUERY = "https://query.getbible.net/v2/almeida/";
  const WOMEN_STUDY_URL =
    "https://www.biblegateway.com/quicksearch/?quicksearch=mulher&version=NVI-PT&searchtype=all";

  /** Nomes em PT (referências do app) → nomes em inglês aceites pela API getBible. Ordenar por comprimento desc. */
  const PT_BOOK_PREFIXES = [
    ["2 Tessalonicenses", "2 Thessalonians"],
    ["1 Tessalonicenses", "1 Thessalonians"],
    ["2 Coríntios", "2 Corinthians"],
    ["1 Coríntios", "1 Corinthians"],
    ["2 Crônicas", "2 Chronicles"],
    ["1 Crônicas", "1 Chronicles"],
    ["Cantares de Salomão", "Song of Solomon"],
    ["2 Samuel", "2 Samuel"],
    ["1 Samuel", "1 Samuel"],
    ["2 Reis", "2 Kings"],
    ["1 Reis", "1 Kings"],
    ["2 Pedro", "2 Peter"],
    ["1 Pedro", "1 Peter"],
    ["3 João", "3 John"],
    ["2 João", "2 John"],
    ["1 João", "1 John"],
    ["2 Timóteo", "2 Timothy"],
    ["1 Timóteo", "1 Timothy"],
    ["Lamentações", "Lamentations"],
    ["Deuteronômio", "Deuteronomy"],
    ["Filipenses", "Philippians"],
    ["Colossenses", "Colossians"],
    ["Efésios", "Ephesians"],
    ["Gálatas", "Galatians"],
    ["Romanos", "Romans"],
    ["Hebreus", "Hebrews"],
    ["Apocalipse", "Revelation"],
    ["Eclesiastes", "Ecclesiastes"],
    ["Provérbios", "Proverbs"],
    ["Neemias", "Nehemiah"],
    ["Juízes", "Judges"],
    ["Levítico", "Leviticus"],
    ["Números", "Numbers"],
    ["Gênesis", "Genesis"],
    ["Êxodo", "Exodus"],
    ["Salmos", "Psalms"],
    ["Ester", "Esther"],
    ["Rute", "Ruth"],
    ["Josué", "Joshua"],
    ["Esdras", "Ezra"],
    ["Jonas", "Jonah"],
    ["Naum", "Nahum"],
    ["Ageu", "Haggai"],
    ["Joel", "Joel"],
    ["Judas", "Jude"],
    ["Lucas", "Luke"],
    ["Tiago", "James"],
    ["Marcos", "Mark"],
    ["Mateus", "Matthew"],
    ["Atos", "Acts"],
    ["Filemom", "Philemon"],
    ["Sofonias", "Zephaniah"],
    ["Zacarias", "Zechariah"],
    ["Malaquias", "Malachi"],
    ["Habacuque", "Habakkuk"],
    ["Miqueias", "Micah"],
    ["Oséias", "Hosea"],
    ["Daniel", "Daniel"],
    ["Ezequiel", "Ezekiel"],
    ["Jeremias", "Jeremiah"],
    ["Isaías", "Isaiah"],
    ["João", "John"],
    ["Cantares", "Song of Solomon"],
  ].sort(function (a, b) {
    return b[0].length - a[0].length;
  });

  const sheet = document.getElementById("aura-bible-sheet");
  const closeBtn = document.getElementById("aura-bible-close");
  const backdrop = document.getElementById("aura-bible-backdrop");
  const titleEl = document.getElementById("aura-bible-title");
  const tabPassage = document.querySelector('[data-bible-tab="passage"]');
  const tabWomen = document.querySelector('[data-bible-tab="women"]');
  const verseLink = document.getElementById("daily-verse-link");
  const panePassage = document.getElementById("aura-bible-pane-passage");
  const paneWomen = document.getElementById("aura-bible-pane-women");
  const reader = document.getElementById("aura-bible-reader");
  const statusEl = document.getElementById("aura-bible-status");
  const womenLink = document.getElementById("aura-bible-women-link");
  const nviFootLink = document.getElementById("aura-bible-nvi-link");

  let cacheEnQuery = "";

  if (womenLink) womenLink.href = WOMEN_STUDY_URL;

  function ptRefToEnglishQuery(ref) {
    const s = String(ref || "").trim();
    if (!s) return "";
    for (let i = 0; i < PT_BOOK_PREFIXES.length; i += 1) {
      const pt = PT_BOOK_PREFIXES[i][0];
      const en = PT_BOOK_PREFIXES[i][1];
      if (s.startsWith(pt + " ") || s.startsWith(pt + ":")) {
        return en + s.slice(pt.length);
      }
    }
    return s;
  }

  function getBibleRef() {
    const ds = verseLink && verseLink.dataset && verseLink.dataset.bibleRef;
    if (ds && String(ds).trim()) return String(ds).trim();
    const cite = document.getElementById("daily-verse-ref");
    return cite ? String(cite.textContent || "").trim() : "";
  }

  function getNviBrowserUrl() {
    const u = verseLink && verseLink.dataset && verseLink.dataset.bibleUrl;
    return (u && String(u).trim()) || "";
  }

  function setTabActive(which) {
    [tabPassage, tabWomen].forEach(function (t) {
      if (!t) return;
      const on = t.getAttribute("data-bible-tab") === which;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.classList.toggle("aura-bible-sheet__tab--active", on);
    });
    if (panePassage && paneWomen) {
      const passageOn = which === "passage";
      panePassage.hidden = !passageOn;
      paneWomen.hidden = passageOn;
    }
  }

  function verseBlocksFromResponse(data) {
    const blocks = data && typeof data === "object" ? Object.values(data) : [];
    const verses = [];
    for (let i = 0; i < blocks.length; i += 1) {
      const vlist = blocks[i] && blocks[i].verses;
      if (Array.isArray(vlist)) {
        for (let j = 0; j < vlist.length; j += 1) verses.push(vlist[j]);
      }
    }
    verses.sort(function (a, b) {
      const ca = (a && a.chapter) || 0;
      const cb = (b && b.chapter) || 0;
      if (ca !== cb) return ca - cb;
      return ((a && a.verse) || 0) - ((b && b.verse) || 0);
    });
    return verses;
  }

  function renderReader(verses, refLabel) {
    if (!reader) return;
    reader.textContent = "";
    const h = document.createElement("h3");
    h.className = "aura-bible-sheet__ref-heading";
    h.textContent = refLabel;
    reader.appendChild(h);
    for (let i = 0; i < verses.length; i += 1) {
      const row = verses[i];
      const p = document.createElement("p");
      p.className = "aura-bible-sheet__verse";
      const sup = document.createElement("sup");
      sup.textContent = String(row.verse != null ? row.verse : "");
      p.appendChild(sup);
      p.appendChild(document.createTextNode(" " + String(row.text || "").trim()));
      reader.appendChild(p);
    }
  }

  function showStatus(msg, isError) {
    if (!statusEl) return;
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("aura-bible-sheet__status--error");
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("aura-bible-sheet__status--error", !!isError);
  }

  async function loadPassageIfNeeded() {
    const refPt = getBibleRef();
    if (!refPt || !reader) return;

    const enQuery = ptRefToEnglishQuery(refPt);
    if (!enQuery) {
      showStatus("Referência inválida.", true);
      return;
    }

    if (cacheEnQuery === enQuery && reader.childNodes.length) {
      return;
    }

    showStatus("A carregar texto…", false);
    reader.textContent = "";

    try {
      const url = GETBIBLE_QUERY + encodeURIComponent(enQuery);
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const verses = verseBlocksFromResponse(data);
      if (!verses.length) throw new Error("empty");

      showStatus("", false);
      renderReader(verses, refPt);
      cacheEnQuery = enQuery;
    } catch (err) {
      console.warn("[Aura] getBible:", err);
      showStatus(
        "Não foi possível obter o texto agora. Verifique a ligação ou tente «Comparar na NVI» abaixo.",
        true
      );
      cacheEnQuery = "";
    }
  }

  function syncNviFootLink() {
    const nvi = getNviBrowserUrl();
    if (!nviFootLink) return;
    nviFootLink.href = nvi || "#";
    nviFootLink.setAttribute("aria-disabled", nvi ? "false" : "true");
    nviFootLink.style.pointerEvents = nvi ? "" : "none";
    nviFootLink.style.opacity = nvi ? "" : "0.45";
  }

  function openSheet(mode) {
    if (!sheet) return;
    const refPt = getBibleRef();

    if (mode === "women") {
      syncNviFootLink();
      setTabActive("women");
      if (titleEl) titleEl.textContent = "Temas — Bible Gateway";
      sheet.hidden = false;
      sheet.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (verseLink) verseLink.setAttribute("aria-expanded", "true");
      closeBtn && closeBtn.focus();
      return;
    }

    if (!refPt) return;
    setTabActive("passage");
    if (titleEl) titleEl.textContent = "Almeida Atualizada — passagem";
    sheet.hidden = false;
    sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (verseLink) verseLink.setAttribute("aria-expanded", "true");

    syncNviFootLink();

    loadPassageIfNeeded();
    closeBtn && closeBtn.focus();
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (verseLink) verseLink.setAttribute("aria-expanded", "false");
  }

  verseLink &&
    verseLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (!getBibleRef()) return;
      openSheet("passage");
    });

  tabPassage &&
    tabPassage.addEventListener("click", function () {
      if (!getBibleRef()) return;
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
