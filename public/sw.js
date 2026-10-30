const revision = "5";
const cacheName = `rvessflow-v${revision}`;
const imageCache = `rvessflow-images-v${revision}`;
const assetCache = `rvessflow-assets-v${revision}`;
const maxEntries = 80;
const precache = [
  { url: "/offline.html", revision },
  { url: "/icon-192.png", revision },
  { url: "/icon-512.png", revision },
  { url: "/icon-maskable-512.png", revision },
  { url: "/apple-touch-icon.png", revision },
  { url: "/", revision },
];

function trim(cache, limit) {
  return cache.keys().then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key))));
}

async function putFresh(cache, request, response) {
  if (!response || !response.ok || response.type !== "basic") return;
  await cache.put(request, response.clone());
  await trim(cache, maxEntries);
}

async function networkFirst(request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    await putFresh(cache, request, response);
    return response;
  } catch {
    return (await cache.match(request)) || caches.match("/offline.html");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(imageCache);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  await putFresh(cache, request, response);
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(assetCache);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then(async (response) => {
      await putFresh(cache, request, response);
      return response;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(cacheName).then(async (cache) => {
      const shell = precache.map((item) => ({ url: item.url, revision: item.revision }));
      await cache.addAll(shell.filter((item) => item.url !== "/").map((item) => item.url));
      try {
        await cache.add("/");
      } catch {
        // A signed-in redirect must not block the offline shell.
      }
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.endsWith(`v${revision}`)).map((key) => caches.delete(key)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request));
        } catch {
          return (await caches.match(request)) || caches.match("/offline.html");
        }
      })(),
    );
    return;
  }

  if (request.destination === "image") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.destination === "script" || request.destination === "style") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.destination === "font") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (precache.some((item) => item.url === url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
