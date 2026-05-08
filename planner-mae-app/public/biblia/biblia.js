(function () {
  "use strict";

  var BOOKS = [
    { name: "Gênesis", slug: "genesis", caps: 50, t: "old" },
    { name: "Êxodo", slug: "exodus", caps: 40, t: "old" },
    { name: "Levítico", slug: "leviticus", caps: 27, t: "old" },
    { name: "Números", slug: "numbers", caps: 36, t: "old" },
    { name: "Deuteronômio", slug: "deuteronomy", caps: 34, t: "old" },
    { name: "Josué", slug: "joshua", caps: 24, t: "old" },
    { name: "Juízes", slug: "judges", caps: 21, t: "old" },
    { name: "Rute", slug: "ruth", caps: 4, t: "old" },
    { name: "1 Samuel", slug: "1 samuel", caps: 31, t: "old" },
    { name: "2 Samuel", slug: "2 samuel", caps: 24, t: "old" },
    { name: "1 Reis", slug: "1 kings", caps: 22, t: "old" },
    { name: "2 Reis", slug: "2 kings", caps: 25, t: "old" },
    { name: "1 Crônicas", slug: "1 chronicles", caps: 29, t: "old" },
    { name: "2 Crônicas", slug: "2 chronicles", caps: 36, t: "old" },
    { name: "Esdras", slug: "ezra", caps: 10, t: "old" },
    { name: "Neemias", slug: "nehemiah", caps: 13, t: "old" },
    { name: "Ester", slug: "esther", caps: 10, t: "old" },
    { name: "Jó", slug: "job", caps: 42, t: "old" },
    { name: "Salmos", slug: "psalms", caps: 150, t: "old" },
    { name: "Provérbios", slug: "proverbs", caps: 31, t: "old" },
    { name: "Eclesiastes", slug: "ecclesiastes", caps: 12, t: "old" },
    { name: "Cantares", slug: "song of solomon", caps: 8, t: "old" },
    { name: "Isaías", slug: "isaiah", caps: 66, t: "old" },
    { name: "Jeremias", slug: "jeremiah", caps: 52, t: "old" },
    { name: "Lamentações", slug: "lamentations", caps: 5, t: "old" },
    { name: "Ezequiel", slug: "ezekiel", caps: 48, t: "old" },
    { name: "Daniel", slug: "daniel", caps: 12, t: "old" },
    { name: "Oséias", slug: "hosea", caps: 14, t: "old" },
    { name: "Joel", slug: "joel", caps: 3, t: "old" },
    { name: "Amós", slug: "amos", caps: 9, t: "old" },
    { name: "Obadias", slug: "obadiah", caps: 1, t: "old" },
    { name: "Jonas", slug: "jonah", caps: 4, t: "old" },
    { name: "Miquéias", slug: "micah", caps: 7, t: "old" },
    { name: "Naum", slug: "nahum", caps: 3, t: "old" },
    { name: "Habacuque", slug: "habakkuk", caps: 3, t: "old" },
    { name: "Sofonias", slug: "zephaniah", caps: 3, t: "old" },
    { name: "Ageu", slug: "haggai", caps: 2, t: "old" },
    { name: "Zacarias", slug: "zechariah", caps: 14, t: "old" },
    { name: "Malaquias", slug: "malachi", caps: 4, t: "old" },
    { name: "Mateus", slug: "matthew", caps: 28, t: "new" },
    { name: "Marcos", slug: "mark", caps: 16, t: "new" },
    { name: "Lucas", slug: "luke", caps: 24, t: "new" },
    { name: "João", slug: "john", caps: 21, t: "new" },
    { name: "Atos", slug: "acts", caps: 28, t: "new" },
    { name: "Romanos", slug: "romans", caps: 16, t: "new" },
    { name: "1 Coríntios", slug: "1 corinthians", caps: 16, t: "new" },
    { name: "2 Coríntios", slug: "2 corinthians", caps: 13, t: "new" },
    { name: "Gálatas", slug: "galatians", caps: 6, t: "new" },
    { name: "Efésios", slug: "ephesians", caps: 6, t: "new" },
    { name: "Filipenses", slug: "philippians", caps: 4, t: "new" },
    { name: "Colossenses", slug: "colossians", caps: 4, t: "new" },
    { name: "1 Tessalonicenses", slug: "1 thessalonians", caps: 5, t: "new" },
    { name: "2 Tessalonicenses", slug: "2 thessalonians", caps: 3, t: "new" },
    { name: "1 Timóteo", slug: "1 timothy", caps: 6, t: "new" },
    { name: "2 Timóteo", slug: "2 timothy", caps: 4, t: "new" },
    { name: "Tito", slug: "titus", caps: 3, t: "new" },
    { name: "Filemom", slug: "philemon", caps: 1, t: "new" },
    { name: "Hebreus", slug: "hebrews", caps: 13, t: "new" },
    { name: "Tiago", slug: "james", caps: 5, t: "new" },
    { name: "1 Pedro", slug: "1 peter", caps: 5, t: "new" },
    { name: "2 Pedro", slug: "2 peter", caps: 3, t: "new" },
    { name: "1 João", slug: "1 john", caps: 5, t: "new" },
    { name: "2 João", slug: "2 john", caps: 1, t: "new" },
    { name: "3 João", slug: "3 john", caps: 1, t: "new" },
    { name: "Judas", slug: "jude", caps: 1, t: "new" },
    { name: "Apocalipse", slug: "revelation", caps: 22, t: "new" },
  ];

  var STATE = {
    openBookSlug: null,
    activeBook: null,
    activeChapter: null,
    fontSize: 1,
  };

  var CACHE_KEY_PREFIX = "bbl-cache:v1:";
  var STATE_KEY = "bbl-state:v1";
  var THEME_KEY = "bbl-theme:v1";

  function bookNumber(book) {
    return BOOKS.indexOf(book) + 1;
  }

  function arrowSvg() {
    return (
      '<svg class="bbl-book-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="5 8 10 13 15 8"></polyline></svg>'
    );
  }

  function renderBookList(testament, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    BOOKS.forEach(function (b) {
      if (b.t !== testament) return;
      var article = document.createElement("article");
      article.className = "bbl-book";
      article.dataset.slug = b.slug;

      var header = document.createElement("button");
      header.className = "bbl-book-header";
      header.type = "button";
      header.setAttribute("aria-expanded", "false");
      header.innerHTML =
        '<span class="bbl-book-name">' +
        '<span class="bbl-book-num">' +
        bookNumber(b) +
        "</span>" +
        '<span class="bbl-book-label">' +
        b.name +
        "</span>" +
        "</span>" +
        arrowSvg();
      header.addEventListener("click", function () {
        toggleBook(b);
      });

      var body = document.createElement("div");
      body.className = "bbl-book-body";
      body.innerHTML =
        '<p class="bbl-chapters-label">Capítulos</p>' +
        '<div class="bbl-chapters" data-role="chapters"></div>' +
        '<div class="bbl-verses-wrap" data-role="verses-wrap" hidden></div>';

      article.appendChild(header);
      article.appendChild(body);
      container.appendChild(article);
    });
  }

  function toggleBook(book) {
    if (STATE.openBookSlug === book.slug) {
      collapseAllBooks();
      STATE.openBookSlug = null;
      STATE.activeBook = null;
      STATE.activeChapter = null;
      saveState();
      return;
    }
    collapseAllBooks();
    var article = document.querySelector('.bbl-book[data-slug="' + cssEscape(book.slug) + '"]');
    if (!article) return;
    article.classList.add("is-open");
    var btn = article.querySelector(".bbl-book-header");
    if (btn) btn.setAttribute("aria-expanded", "true");
    STATE.openBookSlug = book.slug;
    STATE.activeBook = book;
    renderChapters(article, book);
    saveState();

    var headerH = document.querySelector(".bbl-header");
    var offset = headerH ? headerH.offsetHeight + 8 : 0;
    setTimeout(function () {
      var top = article.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: "smooth" });
    }, 80);
  }

  function collapseAllBooks() {
    var open = document.querySelectorAll(".bbl-book.is-open");
    open.forEach(function (el) {
      el.classList.remove("is-open");
      var btn = el.querySelector(".bbl-book-header");
      if (btn) btn.setAttribute("aria-expanded", "false");
      var versesWrap = el.querySelector('[data-role="verses-wrap"]');
      if (versesWrap) {
        versesWrap.hidden = true;
        versesWrap.innerHTML = "";
      }
      var chapters = el.querySelectorAll(".bbl-chapter.is-active");
      chapters.forEach(function (c) {
        c.classList.remove("is-active");
      });
    });
  }

  function renderChapters(article, book) {
    var grid = article.querySelector('[data-role="chapters"]');
    if (!grid) return;
    grid.innerHTML = "";
    for (var i = 1; i <= book.caps; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bbl-chapter";
      btn.textContent = String(i);
      btn.dataset.chapter = String(i);
      (function (cap) {
        btn.addEventListener("click", function () {
          openChapter(article, book, cap);
        });
      })(i);
      grid.appendChild(btn);
    }
  }

  function openChapter(article, book, chapter) {
    var chapters = article.querySelectorAll(".bbl-chapter");
    chapters.forEach(function (c) {
      c.classList.toggle("is-active", Number(c.dataset.chapter) === chapter);
    });

    var wrap = article.querySelector('[data-role="verses-wrap"]');
    if (!wrap) return;
    wrap.hidden = false;

    STATE.activeChapter = chapter;
    saveState();

    renderVersesHeader(wrap, book, chapter);

    var cached = readCache(book.slug, chapter);
    if (cached) {
      renderVerses(wrap, book, chapter, cached);
    } else {
      renderLoading(wrap);
      fetchChapter(book, chapter)
        .then(function (verses) {
          writeCache(book.slug, chapter, verses);
          renderVerses(wrap, book, chapter, verses);
        })
        .catch(function (err) {
          renderError(wrap, err);
        });
    }

    setTimeout(function () {
      var headerH = document.querySelector(".bbl-header");
      var offset = headerH ? headerH.offsetHeight + 8 : 0;
      var top = wrap.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: "smooth" });
    }, 60);
  }

  function renderVersesHeader(wrap, book, chapter) {
    var prevDisabled = chapter <= 1 ? "disabled" : "";
    var nextDisabled = chapter >= book.caps ? "disabled" : "";
    wrap.innerHTML =
      '<div class="bbl-verses-title">' +
      "<span>" +
      book.name +
      " " +
      chapter +
      "</span>" +
      '<div class="bbl-verses-nav">' +
      '<button class="bbl-mini-btn" data-role="prev" ' +
      prevDisabled +
      ">‹ Anterior</button>" +
      '<button class="bbl-mini-btn" data-role="next" ' +
      nextDisabled +
      ">Próximo ›</button>" +
      "</div>" +
      "</div>" +
      '<div class="bbl-verses" data-role="verses"></div>';

    var prev = wrap.querySelector('[data-role="prev"]');
    var next = wrap.querySelector('[data-role="next"]');
    if (prev)
      prev.addEventListener("click", function () {
        if (chapter > 1) {
          var article = wrap.closest(".bbl-book");
          openChapter(article, book, chapter - 1);
        }
      });
    if (next)
      next.addEventListener("click", function () {
        if (chapter < book.caps) {
          var article = wrap.closest(".bbl-book");
          openChapter(article, book, chapter + 1);
        }
      });
  }

  function renderLoading(wrap) {
    var cont = wrap.querySelector('[data-role="verses"]');
    if (!cont) return;
    cont.innerHTML =
      '<p class="bbl-loading"><span class="bbl-spinner"></span>Carregando texto…</p>';
  }

  function renderError(wrap, err) {
    var cont = wrap.querySelector('[data-role="verses"]');
    if (!cont) return;
    cont.innerHTML =
      '<p class="bbl-error">Não foi possível carregar este capítulo.<br/><small>' +
      escapeHtml(String(err && err.message ? err.message : err)) +
      "</small></p>";
  }

  function renderVerses(wrap, book, chapter, verses) {
    var cont = wrap.querySelector('[data-role="verses"]');
    if (!cont) return;
    if (!verses || verses.length === 0) {
      cont.innerHTML = '<p class="bbl-error">Capítulo vazio.</p>';
      return;
    }
    var html = "";
    for (var i = 0; i < verses.length; i++) {
      var v = verses[i];
      html +=
        '<span class="bbl-verse">' +
        '<span class="bbl-verse-num">' +
        v.verse +
        "</span>" +
        escapeHtml(v.text) +
        " </span>";
    }
    cont.innerHTML = html;
  }

  function fetchChapter(book, chapter) {
    var url =
      "https://bible-api.com/" +
      encodeURIComponent(book.slug + " " + chapter) +
      "?translation=almeida";
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.verses))
          throw new Error("Resposta inválida");
        return data.verses.map(function (v) {
          return { verse: v.verse, text: (v.text || "").trim() };
        });
      });
  }

  /* ============ Cache ============ */
  function cacheKey(slug, chapter) {
    return CACHE_KEY_PREFIX + slug + ":" + chapter;
  }
  function readCache(slug, chapter) {
    try {
      var raw = localStorage.getItem(cacheKey(slug, chapter));
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.v)) return null;
      return obj.v;
    } catch (e) {
      return null;
    }
  }
  function writeCache(slug, chapter, verses) {
    try {
      localStorage.setItem(
        cacheKey(slug, chapter),
        JSON.stringify({ v: verses, at: Date.now() })
      );
    } catch (e) {
      /* quota exceeded — ignore */
    }
  }

  /* ============ Persistência leve ============ */
  function saveState() {
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          openBookSlug: STATE.openBookSlug,
          activeChapter: STATE.activeChapter,
          fontSize: STATE.fontSize,
        })
      );
    } catch (e) {}
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /* ============ Tema ============ */
  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  }

  /* ============ Helpers ============ */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function cssEscape(s) {
    return String(s).replace(/(["\\])/g, "\\$1");
  }

  /* ============ Boot ============ */
  document.addEventListener("DOMContentLoaded", function () {
    renderBookList("old", "oldTestament");
    renderBookList("new", "newTestament");

    var saved = loadState() || {};
    if (typeof saved.fontSize === "number") {
      STATE.fontSize = saved.fontSize;
      document.documentElement.style.setProperty(
        "--bbl-text-size",
        STATE.fontSize.toFixed(2) + "rem"
      );
    }

    var theme = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(theme);

    if (saved.openBookSlug) {
      var book = BOOKS.find(function (b) {
        return b.slug === saved.openBookSlug;
      });
      if (book) {
        toggleBook(book);
        if (saved.activeChapter) {
          var article = document.querySelector(
            '.bbl-book[data-slug="' + cssEscape(book.slug) + '"]'
          );
          if (article) openChapter(article, book, saved.activeChapter);
        }
      }
    }

    var btnUp = document.getElementById("btnSizeUp");
    var btnDown = document.getElementById("btnSizeDown");
    var btnTheme = document.getElementById("btnTheme");
    if (btnUp)
      btnUp.addEventListener("click", function () {
        STATE.fontSize = Math.min(1.6, STATE.fontSize + 0.1);
        document.documentElement.style.setProperty(
          "--bbl-text-size",
          STATE.fontSize.toFixed(2) + "rem"
        );
        saveState();
      });
    if (btnDown)
      btnDown.addEventListener("click", function () {
        STATE.fontSize = Math.max(0.8, STATE.fontSize - 0.1);
        document.documentElement.style.setProperty(
          "--bbl-text-size",
          STATE.fontSize.toFixed(2) + "rem"
        );
        saveState();
      });
    if (btnTheme)
      btnTheme.addEventListener("click", function () {
        var current = document.body.classList.contains("dark")
          ? "dark"
          : "light";
        var next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch (e) {}
      });
  });
})();
