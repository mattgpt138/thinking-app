/* ═══════════════════════════════════════════════════════════════════════
   thinking-app service worker

   Goals, in order:
     1. Math day must work with no network at all.
     2. Reasoning day must work with no network at all.
     3. Argument day must work offline for any passage already fetched.
     4. API calls to Anthropic must never be touched.

   Bump CACHE_VERSION whenever a shell file or a data file changes.
   ═══════════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'thinking-app-v2';
const SHELL_CACHE   = CACHE_VERSION + '-shell';
const FONT_CACHE    = CACHE_VERSION + '-fonts';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './data/corpus.json',
  './data/reasoning.json',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

/* ── install ─────────────────────────────────────────────────────────── */

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ── activate: drop caches from older versions ───────────────────────── */

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.indexOf(CACHE_VERSION) !== 0).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── fetch ───────────────────────────────────────────────────────────── */

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // The Anthropic API is never cached and never intercepted. Interference
  // here would be the one thing capable of blocking a session.
  if (url.hostname === 'api.anthropic.com') return;

  // Google Fonts: cache first, fill in on the first online visit.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // Anything else off-origin is left alone.
  if (url.origin !== self.location.origin) return;

  // Navigations fall back to the cached shell so the app opens offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Own assets: serve from cache immediately, refresh in the background.
  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

/* ── strategies ──────────────────────────────────────────────────────── */

function cacheFirst(req, cacheName) {
  return caches.match(req).then(hit => {
    if (hit) return hit;
    return fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(cacheName).then(c => c.put(req, copy));
      }
      return res;
    });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.match(req, { ignoreSearch: true }).then(hit => {
    const network = fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(cacheName).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit);

    return hit || network;
  });
}
