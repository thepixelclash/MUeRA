/* MUeRA service worker. Deliberately tiny and safe:
 * - caches only same-origin static files under /assets/ and /icons/ (hashed build files and icons);
 * - never touches /api/, Supabase, Google or any cross-origin request, so auth tokens, API answers
 *   and user data are never stored by the worker;
 * - page navigations always go to the network; if the device is offline a small offline page is shown. */
const CACHE = "muera-static-v1";
const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MUeRA - offline</title><body style="font-family:system-ui,sans-serif;background:#27124b;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center"><div><h1>MUeRA</h1><p>You are offline. Reconnect to open your study space.</p></div></body>';

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        const type = res.headers.get("content-type") || "";
        if (res.ok && res.type === "basic" && !type.includes("text/html")) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});
