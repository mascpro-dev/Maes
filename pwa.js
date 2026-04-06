(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    var swUrl = new URL("service-worker.js", window.location.href).href;
    navigator.serviceWorker.register(swUrl).catch(function (err) {
      console.warn("[PWA] Falha ao registrar service worker:", err);
    });
  });
})();
