// Minimal service worker: makes the portals installable and shows a friendly page when offline.
// Pages and scripts are always fetched fresh when online (so updates show up at once); nothing from Supabase is cached.
const CACHE = 'harigroup-shell-v1';
const OFFLINE = 'offline.html';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE, 'icon-192.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') e.respondWith(fetch(r).catch(() => caches.match(OFFLINE)));
});
