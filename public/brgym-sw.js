self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("brgym-v1").then((cache) =>
      cache.addAll(["/brgym", "/brgym/manifest.webmanifest", "/brgym/logo.jpg"]),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
  );
});
