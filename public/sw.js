// Aetherfall service worker — fast relaunch and offline play.
//
// Models, textures, icons and fonts are served from the cache right away
// (instant second launch, playable on a flaky connection) and quietly refreshed
// in the background (stale-while-revalidate), so an updated model shows up on
// the following launch.
//
// App code is handled so a new release is never held back:
// - the page itself is network-first (always fresh when online; the last copy
//   is only used when offline),
// - /assets/* files have content hashes in their names, so a cached copy can
//   never be stale — they are cache-first.

/** Where the game is served from: "/" normally, "/aetherfall-play/" on GitHub Pages. */
const BASE = new URL(self.registration.scope).pathname;

const CACHE = "aetherfall-assets-v1";
const APP = "aetherfall-app-v1";
/** Old hashed bundles from previous releases are pruned beyond this many entries. */
const APP_MAX = 60;

const isAsset = (url) =>
  (url.origin === self.location.origin &&
    url.pathname.startsWith(BASE) &&
    (url.pathname.startsWith(`${BASE}models/`) ||
      /^(icon-[\w-]+|apple-touch-icon)\.png$/.test(url.pathname.slice(BASE.length)) ||
      url.pathname === `${BASE}favicon.ico`)) ||
  url.origin === "https://fonts.gstatic.com" ||
  url.origin === "https://fonts.googleapis.com";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("aetherfall-") && key !== CACHE && key !== APP) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function prune(cache) {
  // Oldest first; the saved page (BASE) is always kept.
  const keys = (await cache.keys()).filter((k) => new URL(k.url).pathname !== BASE);
  for (let i = 0; i < keys.length - APP_MAX; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(BASE, res.clone());
          return res;
        } catch {
          return (await cache.match(BASE)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          event.waitUntil(prune(cache));
        }
        return res;
      })(),
    );
    return;
  }

  if (!isAsset(url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok || res.type === "opaque") cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return (await refresh) ?? Response.error();
    })(),
  );
});
