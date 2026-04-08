/* Aura PWA — só trata pedidos do mesmo site; não mete em cache o Supabase nem outros domínios. */
const CACHE_NAME = "aura-pwa-v11";

const PRECACHE_PATHS = [
  "index.html",
  "offline.html",
  "login.html",
  "style.css",
  "app.js",
  "pwa.js",
  "manifest.webmanifest",
  "assets/branding/favicon.svg",
  "assets/branding/logohorizontal.svg",
  "assets/branding/icon-512.svg",
];

function scopeUrl(path) {
  const base =
    self.registration && self.registration.scope
      ? self.registration.scope
      : new URL("./", self.location).href;
  return new URL(path, base).href;
}

function isCacheableAsset(url) {
  return /\.(css|js|svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE_PATHS.map((p) =>
          cache.add(scopeUrl(p)).catch(function () {
            /* ficheiro opcional em dev */
          })
        )
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigate =
    event.request.mode === "navigate" ||
    event.request.destination === "document";

  event.respondWith(
    (async () => {
      if (isNavigate) {
        try {
          const res = await fetch(event.request);
          return res;
        } catch {
          const offline = await caches.match(scopeUrl("offline.html"));
          if (offline) return offline;
          const home = await caches.match(scopeUrl("index.html"));
          if (home) return home;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      }

      /* CSS/JS: rede primeiro — evita ficar preso a community.css / community.js antigos após deploy */
      if (isCacheableAsset(url)) {
        try {
          const response = await fetch(event.request);
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(function (c) {
              return c.put(event.request, copy);
            });
          }
          return response;
        } catch (e) {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          throw e;
        }
      }

      const cached = await caches.match(event.request);
      if (cached) return cached;
      return fetch(event.request);
    })()
  );
});
