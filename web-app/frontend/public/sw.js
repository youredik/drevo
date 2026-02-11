const CACHE_NAME = "drevo-v5";
const API_CACHE_NAME = "drevo-api-v5";
const MEDIA_CACHE_NAME = "drevo-media-v3";
const MEDIA_CACHE_MAX = 200;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  const keepCaches = [CACHE_NAME, API_CACHE_NAME, MEDIA_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => !keepCaches.includes(n))
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Trim cache to max entries (LRU-style: delete oldest)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    for (let i = 0; i < keys.length - maxItems; i++) {
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // RSC flight data (.txt) — let Next.js handle directly, no SW caching
  if (url.pathname.endsWith(".txt")) return;

  // Media requests: cache-first, auth via ?token= in original URL
  // (Authorization header injection doesn't work — <img> uses no-cors mode
  //  which silently strips non-simple headers)
  if (url.pathname.startsWith("/api/media/")) {
    // Cache key: clean URL without token (deduplication across token changes)
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.delete("token");
    const cacheKey = cacheUrl.toString();

    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then((cache) =>
        cache.match(cacheKey).then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(cacheKey, response.clone());
                trimCache(MEDIA_CACHE_NAME, MEDIA_CACHE_MAX);
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // API requests: network-first with offline fallback (skip auth & admin)
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/admin/")) return;

    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cache.match(request))
      )
    );
    return;
  }

  // Static assets (HTML, JS, CSS): network-first with offline fallback
  // Network-first prevents stale cache from breaking Next.js client-side navigation
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === "navigate") return caches.match("/");
          return undefined;
        })
      )
  );
});
