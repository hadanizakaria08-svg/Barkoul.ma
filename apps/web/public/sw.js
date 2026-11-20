const CACHE_NAME = "barkoul-static-v3";

const STATIC_ASSET_PATHS = new Set(
  ["assets/app.js", "assets/app.css", "icon.svg", "manifest.webmanifest"]
    .map((path) => new URL(path, self.registration.scope).pathname)
);

function isPublicStaticAsset(url) {
  return url.origin === self.location.origin && STATIC_ASSET_PATHS.has(url.pathname);
}

function isCacheablePublicResponse(response, url) {
  if (!response.ok || response.type !== "basic") return false;
  const cacheControl = response.headers?.get("Cache-Control")?.toLowerCase() || "";
  const vary = response.headers?.get("Vary")?.trim() || "";
  if (/\b(?:private|no-store|no-cache)\b/.test(cacheControl)) return false;
  if (vary === "*") return false;
  if (response.headers?.get("Set-Cookie")) return false;

  const contentType = response.headers?.get("Content-Type")?.toLowerCase() || "";
  if (url.pathname.endsWith(".js")) return /(?:java|ecma)script/.test(contentType);
  if (url.pathname.endsWith(".css")) return contentType.includes("text/css");
  if (url.pathname.endsWith(".svg")) return contentType.includes("image/svg+xml");
  if (url.pathname.endsWith(".webmanifest")) {
    return contentType.includes("json") || contentType.includes("manifest");
  }
  return false;
}

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

  // Only the app's known public build assets are eligible for offline caching.
  // Arbitrary same-origin .js/.css endpoints may contain personalized responses.
  if (!isPublicStaticAsset(url)) return;

  event.respondWith(
    fetch(request).then(async (response) => {
      if (isCacheablePublicResponse(response, url)) {
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
});
