/* sw.js — KAMIKAZZI 3D Service Worker
 *
 * Caching strategy:
 *   Shell (game JS/HTML/manifest/icons)  → Precached at install, cache-first
 *   Game assets (images/audio/models)    → Cache-first (lazy-cached on first request)
 *   Three.js CDN + Google Fonts          → Stale-while-revalidate
 *   Puter API calls                      → Network-only (never cached)
 *
 * Version the cache so activate() cleans old caches on upgrade.
 */

const CACHE_NAME = 'kamikazzi3d-v1';

// ---- App shell — precached at install ----
// Only the essential game files. Large assets (GLB model, audio, graffiti,
// floor textures, level backgrounds) are cached lazily on first request
// via the cache-first fetch handler for /assets/* paths.
// This keeps install fast and avoids a single failing fetch bricking the SW.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/game/main.js',
  '/game/renderer.js',
  '/game/ui.js',
  '/game/controls/index.js',
  '/game/controls/shared.js',
  '/game/controls/keyboard.js',
  '/game/controls/touch.js',
  '/game/controls/joystick.js',
  '/game/controls/gyro.js',
  '/game/world.js',
  '/game/world/shared.js',
  '/game/world/ideas.js',
  '/game/world/plane/factory.js',
  '/game/world/plane/controller.js',
  '/game/world/buildings.js',
  '/game/world/explosion.js',
  '/game/world/powerups.js',
  '/game/world/magnet_halo.js',
  '/game/puter-client.js',
  '/assets/icon.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/apple-touch-icon.png',
];

// ---- Install: precache the app shell ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      // Force the waiting service worker to activate immediately
      return self.skipWaiting();
    }).catch(err => {
      console.warn('[SW] Precaching failed:', err);
    })
  );
});

// ---- Activate: clean old caches + take control of all clients ----
self.addEventListener('activate', event => {
  const expectedCaches = new Set([CACHE_NAME]);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (!expectedCaches.has(name)) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      // Claim all open clients immediately without requiring a reload
      return self.clients.claim();
    })
  );
});

// ---- Fetch: routing logic ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isLocal = url.origin === location.origin;

  // Network-only for Puter API calls (never cache cloud data)
  if (url.hostname.endsWith('.puter.com') || url.hostname === 'api.puter.com') {
    return;
  }

  // esm.sh CDN (Three.js): stale-while-revalidate
  if (url.hostname === 'esm.sh') {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Google Fonts CSS + font files: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Local assets: cache-first (lazy-cached on first request)
  if (isLocal && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Local app shell: cache-first (precached or lazy-cached)
  if (isLocal) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: network-first fallback
  event.respondWith(networkFirst(event.request));
});

// ---- Caching strategies ----

/**
 * Cache-first: serve from cache if available, otherwise fetch from network
 * and cache the response for next time.
 * Used for: local assets, app shell.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    // Offline and not in cache — for navigation requests, serve index.html
    // so the SPA boot screen still shows.
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    throw new Error('[SW] Failed to fetch (offline + uncached): ' + request.url);
  }
}

/**
 * Network-first: try the network, fall back to cache on failure.
 * Used for: anything not matched by other strategies.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline navigation fallback
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    throw new Error('[SW] Network-first failed (offline + no cache): ' + request.url);
  }
}

/**
 * Stale-while-revalidate: serve from cache instantly, then fetch from network
 * in background to update the cache for next time.
 * Used for: CDN dependencies where freshness matters but speed is priority.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}
