const VERSION = "brgym-v4";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const APP_ROUTES = [
  "/brgym/",
  "/brgym/workout",
  "/brgym/plan",
  "/brgym/history",
  "/brgym/templates",
  "/brgym/equipment",
  "/brgym/settings",
  "/brgym/more",
];
const CORE_ASSETS = [
  "/brgym/manifest.webmanifest",
  "/brgym/logo.jpg",
  "/brgym/icon-192.png",
  "/brgym/icon-512.png",
  "/brgym/apple-touch-icon.png",
];

async function cacheDocumentAndAssets(cache, route) {
  const response = await fetch(route, { cache: "reload" });
  if (!response.ok) {
    return;
  }

  await cache.put(route, response.clone());
  const html = await response.text();
  const assetUrls = new Set();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;

  while ((match = attributePattern.exec(html)) !== null) {
    const assetUrl = new URL(match[1], self.location.origin);
    if (
      assetUrl.origin === self.location.origin &&
      (assetUrl.pathname.startsWith("/_next/static/") || assetUrl.pathname.startsWith("/brgym/"))
    ) {
      assetUrls.add(assetUrl.href);
    }
  }

  await Promise.allSettled(
    [...assetUrls].map(async (url) => {
      const assetResponse = await fetch(url, { cache: "reload" });
      if (assetResponse.ok) {
        await cache.put(url, assetResponse);
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.allSettled([
        ...APP_ROUTES.map((route) => cacheDocumentAndAssets(cache, route)),
        ...CORE_ASSETS.map((asset) => cache.add(asset)),
      ]);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("brgym-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached ?? caches.match("/brgym/");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await caches.match(request);
  const networkResponse = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    return cached;
  }
  return (await networkResponse) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate" || url.pathname.startsWith("/brgym")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.includes("/brgym/"));
      if (existing) {
        existing.focus();
        return existing;
      }
      return self.clients.openWindow("/brgym/plan");
    }),
  );
});
