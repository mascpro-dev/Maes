(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    var swUrl = new URL("service-worker.js", window.location.href).href;
    var scope = new URL("./", window.location.href).href;
    navigator.serviceWorker.register(swUrl, { scope: scope }).catch(function (err) {
      console.warn("[PWA] Falha ao registrar service worker:", err);
    });
  });
})();

