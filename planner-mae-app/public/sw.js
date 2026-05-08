// Service Worker de auto-destruição.
// Versões antigas do Planner Mãe registravam um SW próprio em /planner-mae/sw.js.
// Esta versão limpa todos os caches e desregistra o próprio SW para que o app instalável
// passe a ser apenas o Conta Mãe completo (PWA da raiz /).

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      try {
        const keys = await self.caches.keys();
        await Promise.all(keys.map(function (k) { return self.caches.delete(k); }));
      } catch (e) { /* noop */ }

      try {
        await self.registration.unregister();
      } catch (e) { /* noop */ }

      try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach(function (client) {
          if (client && typeof client.navigate === "function") {
            try { client.navigate(client.url); } catch (e) { /* noop */ }
          }
        });
      } catch (e) { /* noop */ }
    })()
  );
});

self.addEventListener("fetch", function () {
  // Não interceptamos nada; deixa o navegador fazer fetch direto.
});
