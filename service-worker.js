// Versioned shell: install atomically, never delete another app's caches.
const CACHE = 'fdv-shell-v4.1.2';
const ASSETS = [
 './data/sourced_chantiers.json', './js/data/data-quality.js', './js/ui/chantiers.js',
 './', './index.html', './manifest.json', './radars.json',
 './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png',
 './css/base.css', './css/cockpit.css', './css/map.css', './css/dialogs.css', './css/iphone.css',
 './vendor/leaflet/leaflet.css', './vendor/leaflet/leaflet.js',
 './js/app.js', './js/core/state.js', './js/core/storage.js',
 './js/geo/spatial-index.js', './js/geo/corridor.js', './js/geo/tracker.js',
 './js/audio/sound.js', './js/ui/hud.js', './js/ui/map-view.js', './js/ui/modals.js',
 './js/ui/wakelock.js', './js/ui/mobile.js', './js/data/radar-service.js', './js/data/lufop-parser.js'
];
self.addEventListener('install', event => {
 event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('fdv-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
 const request = event.request;
 const url = new URL(request.url);
 // Let the browser honour each tile provider's own cache policy. No tile prefetch.
 if (request.method !== 'GET' || url.origin !== self.location.origin) return;
 if (!url.href.startsWith(self.registration.scope)) return;
 const canonical = new URL(url); canonical.search = '';
 if (url.pathname.endsWith('/radars.json')) {
   event.respondWith((async () => {
     const cache = await caches.open(CACHE);
     try {
       const response = await fetch(request);
       if (!response.ok) throw new Error('Data unavailable');
       // Validate before replacing the offline snapshot.
       const data = await response.clone().json();
       if (!Array.isArray(data.radars) || !data.radars.length) throw new Error('Invalid data');
       await cache.put(canonical.href, response.clone());
       return response;
     } catch {
       return await cache.match(canonical.href) || new Response('Données indisponibles', { status: 503 });
     }
   })());
   return;
 }
 // Keep a coherent shell version until all tabs using it are closed.
 event.respondWith((async () => {
   const cache = await caches.open(CACHE);
   const cached = await cache.match(canonical.href);
   if (cached) return cached;
   try { return await fetch(request); }
   catch {
     if (request.mode === 'navigate') return await cache.match('./index.html');
     return new Response('Ressource indisponible hors ligne', { status: 503 });
   }
 })());
});
