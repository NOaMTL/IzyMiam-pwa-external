/* Service worker minimal : rend la PWA installable et met le shell en cache.
   Les données (commandes) restent network-only : on veut du temps réel, pas
   des commandes périmées servies depuis un cache. */
// Bump la version à chaque changement de stratégie : l'activation purge les
// anciens caches (évite de servir un shell d'un build précédent).
const CACHE = "prep-shell-v2";
const SHELL = ["/", "/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Jamais de cache pour l'API (temps réel) ni les requêtes non-GET.
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord, repli cache (ouverture hors-ligne du shell).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((r) => r || caches.match("/")),
      ),
    );
    return;
  }

  // Statique : cache d'abord, réseau en repli (icônes, css, js).
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          return res;
        }),
    ),
  );
});
