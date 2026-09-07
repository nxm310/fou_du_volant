// Service worker - Radars France PWA (Auto-Update Engine)
const VERSION = 'v2.7.7';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './config.js',
  './radars.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1. Ignore non-HTTP schemes
  if (!url.protocol.startsWith('http')) return;

  // 2. Bypass Service Worker entirely for dynamic external APIs & Proxies
  if (url.origin !== location.origin &&
      !url.hostname.includes('unpkg.com') &&
      !url.hostname.includes('jsdelivr.net') &&
      !url.hostname.includes('cdnjs.cloudflare.com') &&
      !url.hostname.endsWith('tile.openstreetmap.org')) {
    return;
  }

  // 3. Navigation / HTML & Config : Network-First avec Fallback Cache
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('config.js') || url.pathname === '/' || url.pathname.endsWith('/fou_du_volant/')) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const indexCached = await caches.match('./index.html');
        if (indexCached) return indexCached;
        return new Response('Hors-ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
    );
    return;
  }

  // 4. Tuiles OpenStreetMap : Cache-First / Stale-While-Revalidate
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);

        if (cached) return cached;
        const res = await fetchPromise;
        return res || new Response('', { status: 408 });
      })
    );
    return;
  }

  // 5. Fichiers statiques et librairies
  e.respondWith(
    caches.match(req).then(async (cached) => {
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && (url.origin === location.origin || url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com')) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, clone));
        }
        return res;
      } catch (err) {
        return new Response('Ressource non disponible', { status: 404 });
      }
    })
  );
});
