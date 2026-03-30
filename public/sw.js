const CACHE_NAME = "fire-v1";
const PRECACHE = ["/fire"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Cache map tiles/fonts aggressively (CARTO, elevation, protomaps)
  if (
    url.hostname.includes("cartocdn.com") ||
    url.hostname.includes("s3.amazonaws.com") ||
    url.hostname.includes("protomaps.com")
  ) {
    e.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(e.request).then((cached) => {
          if (cached) return cached;
          return fetch(e.request).then((resp) => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
        })
      ).catch(() => new Response("", { status: 408 }))
    );
    return;
  }

  // App pages/assets: network first, fallback to cache
  if (e.request.mode === "navigate" || url.pathname.startsWith("/_next/")) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return resp;
        })
        .catch(() =>
          caches.match(e.request).then((r) => r || new Response("Offline", { status: 503 }))
        )
    );
    return;
  }

  // API data: network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return resp;
        })
        .catch(() =>
          caches.match(e.request).then((r) => r || new Response("[]", { status: 503, headers: { "Content-Type": "application/json" } }))
        )
    );
    return;
  }

  // GeoJSON borders: cache first
  if (url.pathname.startsWith("/geo/")) {
    e.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(e.request).then((cached) => {
          if (cached) return cached;
          return fetch(e.request).then((resp) => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
        })
      ).catch(() => new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } }))
    );
    return;
  }
});
