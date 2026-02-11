const CACHE_NAME = "drevo-v4";
const API_CACHE_NAME = "drevo-api-v4";
const MEDIA_CACHE_NAME = "drevo-media-v2";
const STATIC_ASSETS = ["/", "/search", "/events", "/tree", "/favorites", "/stats"];
const MEDIA_CACHE_MAX = 200;

// Auth token received from the app via postMessage
let authToken = null;

self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_TOKEN") {
    authToken = event.data.token;
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

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

// Build an authenticated request: strip ?token= from URL, add Authorization header
function buildAuthRequest(request) {
  const url = new URL(request.url);
  url.searchParams.delete("token");

  const headers = new Headers(request.headers);
  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", "Bearer " + authToken);
  }

  return new Request(url.toString(), {
    headers,
    mode: request.mode,
    credentials: request.credentials,
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Media requests: inject auth header, cache-first with background update
  if (url.pathname.startsWith("/api/media/")) {
    const authRequest = buildAuthRequest(request);
    // Use clean URL (without token) as cache key
    const cacheKey = authRequest;

    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then((cache) =>
        cache.match(cacheKey).then((cached) => {
          const fetchPromise = fetch(authRequest)
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
  // SWR on the client already handles staleness/revalidation,
  // so the SW only caches for offline support — no background refetch needed.
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
        .catch(() => {
          // Offline fallback: return cached version or offline page
          if (cached) return cached;
          // For navigation requests, try returning the cached index
          if (request.mode === "navigate") {
            return caches.match("/");
          }
          return cached;
        });
      return cached || fetchPromise;
    })
  );
});
