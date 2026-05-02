/**
 * Botões / links com classe .aura-back chamam history.back() quando há histórico.
 */
(function () {
  function goBack(fallbackHref) {
    const fb = fallbackHref || "index.html";
    try {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch (_) {
      /* ignore */
    }
    window.location.href = fb;
  }

  function init() {
    document.querySelectorAll(".aura-back").forEach((el) => {
      const fb = el.getAttribute("data-back-fallback") || "index.html";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        goBack(fb);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
