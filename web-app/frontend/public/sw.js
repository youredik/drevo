const CACHE_NAME = "drevo-v2";
const API_CACHE_NAME = "drevo-api-v1";
const STATIC_ASSETS = ["/", "/search", "/events", "/tree", "/favorites", "/stats"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== API_CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip media requests
  if (url.pathname.startsWith("/media/")) return;

  // API requests: stale-while-revalidate (skip auth & admin)
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/admin/")) return;

    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);

          // Return cached immediately, update in background
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Static assets: cache-first with background update
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
