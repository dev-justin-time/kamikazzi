/* sw.js — Kamikazzi 3D Service Worker
   Caches the app shell on install for offline PWA support.
   Uses a "Cache First, then Network" strategy for static assets
   and "Network First" for dynamic content.
*/
const CACHE_NAME = 'kamikazzi-v1';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/game/renderer.js',
  '/game/ui.js',
  '/game/world.js',
  '/game/world/shared.js',
  '/game/world/buildings.js',
  '/game/world/explosion.js',
  '/game/world/powerups.js',
  '/game/world/magnet_halo.js',
  '/game/world/ideas.js',
  '/game/world/plane/controller.js',
  '/game/world/plane/factory.js',

  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_URLS).catch(err => {
        console.warn('[SW] Some shell URLs failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and external requests
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // For the app shell URLs, serve from cache first
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // For static assets (images, audio, fonts), cache on first access
  if (/\.(png|jpg|jpeg|gif|webp|svg|wav|mp3|woff2?|js|html)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return fetch(event.request).then(response => {
          cache.put(event.request, response.clone());
          return response;
        }).catch(() => caches.match(event.request));
      })
    );
    return;
  }

  // Everything else: network first, fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
