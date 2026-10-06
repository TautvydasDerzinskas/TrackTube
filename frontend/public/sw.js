// Minimal service worker — it exists mainly so browsers treat TrackTube as an
// installable app. Only static files are cached (stale-while-revalidate);
// pages and /api/* (per-user data, audio streams with Range requests) always
// go straight to the network and are never stored, so nothing outlives a
// logout on a shared device and playback isn't routed through the cache.
const CACHE = 'tracktube-static-v1';
const STATIC_PREFIXES = ['/assets/', '/fonts/'];
const STATIC_FILES = ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isStatic = STATIC_FILES.includes(url.pathname) || STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
  if (!isStatic) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
