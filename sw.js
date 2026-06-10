const CACHE_NAME = "tastory-oms-v3.0.2-auth-callback";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./auth-callback.js",
  "./supabase-client.js",
  "./app.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./offline.html");
          }
          return caches.match("./index.html");
        });
    }),
  );
});
