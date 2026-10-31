// Service Worker - Fou du Volant PWA v3.0.0
const VERSION = 'v3.0.0';
const SHELL_CACHE = `fdv-shell-${VERSION}`;
const RUNTIME_CACHE = `fdv-runtime-${VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './radars.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/base.css',
  './css/cockpit.css',
  './css/map.css',
  './css/dialogs.css',
  './js/app.js',
  './js/core/state.js',
  './js/core/storage.js',
  './js/geo/spatial-index.js',
  './js/geo/corridor.js',
  './js/geo/tracker.js',
  './js/audio/sound.js',
  './js/ui/hud.js',
  './js/ui/map-view.js',
  './js/ui/modals.js',
  './js/ui/wakelock.js',
  './js/data/radar-service.js',
  './js/data/lufop-parser.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS).catch((err) => {
      console.warn('Erreur mise en cache initiale :', err);
    }))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
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

  if (!url.protocol.startsWith('http')) return;

  // 1. Navigation & HTML : Stale-While-Revalidate avec fallback cache
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/' || url.pathname.endsWith('/fou_du_volant/')) {
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
        return new Response('Mode hors-ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
    );
    return;
  }

  // 2. Tuiles de carte CartoDB / OSM : Cache avec fallback réseau
  if (url.hostname.includes('basemaps.cartocdn.com') || url.hostname.includes('tile.openstreetmap.org')) {
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

  // 3. Fichiers statiques et modules JS : Cache-First
  e.respondWith(
    caches.match(req).then(async (cached) => {
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && (url.origin === location.origin || url.hostname.includes('unpkg.com'))) {
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
