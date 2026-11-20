const CACHE_NAME = "barkoul-static-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([
        new URL("./", self.registration.scope).toString(),
        new URL("manifest.webmanifest", self.registration.scope).toString(),
        new URL("icon.svg", self.registration.scope).toString()
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("barkoul-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Never persist navigation URLs: auth callbacks may contain one-time codes or tokens.
    event.respondWith(
      fetch(request).catch(async () => {
        return (await caches.match(new URL("./", self.registration.scope).toString()))
          || Response.error();
      })
    );
    return;
  }

  if (/\.(?:js|css|svg|png|ico|woff2)$/.test(url.pathname)) {
    // Bundle filenames are stable (app.js/app.css), so network-first prevents stale releases.
    // The last known good asset remains available when the network is unavailable.
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.ok && response.type === "basic") {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          } catch {
            // Storage failures must not discard a successful network response.
          }
        }
        return response;
      }).catch(async () => {
        return (await caches.match(request)) || Response.error();
      })
    );
  }
});
