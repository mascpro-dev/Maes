(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    var swUrl = new URL("service-worker.js", window.location.href).href;
    navigator.serviceWorker.register(swUrl).catch(function (err) {
      console.warn("[PWA] Falha ao registrar service worker:", err);
    });
  });
})();

/** Créditos / suporte — mesmo diretório do script pwa.js (inclui subpastas com ../pwa.js). */
(function loadSiteAttribution() {
  try {
    if (document.getElementById("site-attribution-mount")) return;
    var scripts = document.getElementsByTagName("script");
    var href = "";
    for (var i = 0; i < scripts.length; i++) {
      var raw = scripts[i].src || "";
      if (!raw || !/pwa\.js\b/i.test(raw)) continue;
      href = raw.replace(/\bpwa\.js\b(?=[?#]|$)/i, "site-attribution.js");
      break;
    }
    if (!href) href = new URL("site-attribution.js", window.location.href).href;
    var s = document.createElement("script");
    s.src = href;
    s.async = true;
    document.head.appendChild(s);
  } catch (e) {
    /* ignore */
  }
})();
