import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";

const source = await readFile(new URL("../apps/web/public/sw.js", import.meta.url), "utf8");

function basicResponse(body) {
  return {
    ok: true,
    type: "basic",
    async text() { return body; },
    clone() { return basicResponse(body); }
  };
}

function bootWorker({ fetchImpl, initialEntries = {}, failCacheWrite = false }) {
  const entries = new Map(Object.entries(initialEntries).map(([url, body]) => [url, basicResponse(body)]));
  const cache = {
    async addAll(urls) {
      for (const url of urls) {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error("precache failed");
        entries.set(url, response.clone());
      }
    },
    async put(request, response) {
      if (failCacheWrite) throw new Error("storage unavailable");
      entries.set(typeof request === "string" ? request : request.url, response.clone());
    }
  };
  const caches = {
    async open() { return cache; },
    async match(key) {
      const url = typeof key === "string" ? key : key.url;
      return entries.get(url)?.clone();
    },
    async keys() { return ["barkoul-static-v2"]; },
    async delete() { return true; }
  };
  const listeners = new Map();
  const self = {
    registration: { scope: "https://barkoul.test/app/" },
    location: { origin: "https://barkoul.test" },
    clients: { claim: async () => {} },
    addEventListener(type, listener) { listeners.set(type, listener); },
    skipWaiting: async () => {}
  };
  runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Response, console });
  return { listeners, entries, caches };
}

async function dispatchFetch(worker, request) {
  let responsePromise;
  worker.listeners.get("fetch")({ request, respondWith(value) { responsePromise = value; } });
  return responsePromise;
}

describe("Barkoul service worker cache behavior", () => {
  it("refreshes stable asset URLs from the network instead of serving stale cache", async () => {
    const url = "https://barkoul.test/app/assets/app.js";
    const worker = bootWorker({
      fetchImpl: async () => basicResponse("fresh bundle"),
      initialEntries: { [url]: "stale bundle" }
    });
    const response = await dispatchFetch(worker, { method: "GET", url, mode: "cors" });
    assert.equal(await response.text(), "fresh bundle");
    assert.equal(await (await worker.caches.match(url)).text(), "fresh bundle");
  });

  it("falls back to the last cached asset when the network is offline", async () => {
    const url = "https://barkoul.test/app/assets/app.js";
    const worker = bootWorker({
      fetchImpl: async () => { throw new TypeError("offline"); },
      initialEntries: { [url]: "last known bundle" }
    });
    const response = await dispatchFetch(worker, { method: "GET", url, mode: "cors" });
    assert.equal(await response.text(), "last known bundle");
  });

  it("returns a successful network asset even when browser cache storage fails", async () => {
    const url = "https://barkoul.test/app/assets/app.js";
    const worker = bootWorker({
      fetchImpl: async () => basicResponse("network response"),
      failCacheWrite: true
    });
    const response = await dispatchFetch(worker, { method: "GET", url, mode: "cors" });
    assert.equal(await response.text(), "network response");
  });

  it("uses the cached app shell for offline navigation without caching auth callback URLs", async () => {
    const shell = "https://barkoul.test/app/";
    const callback = "https://barkoul.test/app/auth/callback?code=one-time-code";
    const worker = bootWorker({
      fetchImpl: async () => { throw new TypeError("offline"); },
      initialEntries: { [shell]: "cached app shell" }
    });
    const response = await dispatchFetch(worker, { method: "GET", url: callback, mode: "navigate" });
    assert.equal(await response.text(), "cached app shell");
    assert.equal(worker.entries.has(callback), false);
  });

  it("does not intercept cross-origin Supabase API requests", async () => {
    let fetchCalls = 0;
    const worker = bootWorker({ fetchImpl: async () => { fetchCalls += 1; return basicResponse("unexpected"); } });
    const response = await dispatchFetch(worker, {
      method: "GET",
      url: "https://project.supabase.co/rest/v1/cargos",
      mode: "cors"
    });
    assert.equal(response, undefined);
    assert.equal(fetchCalls, 0);
  });
});
