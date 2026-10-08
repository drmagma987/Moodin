const VERSION = "brgym-v7";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const RUN_PUSH_STATE_CACHE = "brgym-run-push-state";
const RUN_PUSH_STATE_URL = "/brgym/__run-push-state__";
const REMINDER_PUSH_STATE_URL = "/brgym/__reminder-push-state__";
const APP_ROUTES = [
  "/brgym/",
  "/brgym/workout",
  "/brgym/plan",
  "/brgym/history",
  "/brgym/progress",
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
            .filter((key) => key.startsWith("brgym-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE && key !== RUN_PUSH_STATE_CACHE)
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
  if (event.data?.type === "BRGYM_SET_RUN_PUSH_TOKEN") {
    event.waitUntil(
      caches.open(RUN_PUSH_STATE_CACHE).then((cache) => cache.put(
        RUN_PUSH_STATE_URL,
        new Response(JSON.stringify({ token: event.data.token ?? null })),
      )),
    );
  }
  if (event.data?.type === "BRGYM_SET_REMINDER_PUSH_TOKEN") {
    event.waitUntil(
      caches.open(RUN_PUSH_STATE_CACHE).then((cache) => cache.put(
        REMINDER_PUSH_STATE_URL,
        new Response(JSON.stringify({ token: event.data.token ?? null })),
      )),
    );
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload;
    try {
      payload = event.data?.json();
    } catch {
      return;
    }
    if (!payload?.scheduleToken || !payload?.title || !payload?.body) return;

    const stateResponse = await caches.match(payload.channel === "reminder" ? REMINDER_PUSH_STATE_URL : RUN_PUSH_STATE_URL);
    const state = stateResponse ? await stateResponse.json() : null;
    if (state?.token !== payload.scheduleToken) return;

    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/brgym/icon-192.png",
      badge: "/brgym/icon-192.png",
      tag: payload.channel === "reminder" ? "brgym-accountability" : `brgym-run-cue-${payload.scheduleToken}`,
      renotify: true,
      data: { targetUrl: payload.targetUrl },
    });
  })());
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
  const targetUrl = event.notification.data?.targetUrl || "/brgym/plan";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.includes("/brgym/"));
      if (existing) {
        return existing.navigate(targetUrl).then(() => existing.focus());
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
