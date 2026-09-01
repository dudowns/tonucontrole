// ============================================
// TONUCONTROLE SERVICE WORKER
// ============================================

const CACHE_NAME = 'tonucontrole-v2.1.0';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/theme.css',
  '/css/dark-theme.css',
  '/css/dashboard.css',
  '/css/transactions.css',
  '/css/goals.css',
  '/css/investments.css',
  '/css/settings.css',
  '/css/notifications.css',
  '/css/sync.css',
  '/css/mobile.css',
  '/icons/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/js/supabase.js',
  '/js/core.js',
  '/js/security.js',
  '/js/financial-tools.js',
  '/js/sync.js',
  '/js/notifications.js',
  '/js/dashboard.js',
  '/js/transactions.js',
  '/js/goals.js',
  '/js/investments.js',
  '/js/settings.js',
  '/js/mobile/dashboard.js',
  '/pages/dashboard.html',
  '/pages/transactions.html',
  '/pages/bills.html',
  '/pages/goals.html',
  '/pages/investments.html',
  '/pages/settings.html',
  '/pages/mobile/dashboard.html',
  '/pages/mobile/transactions.html',
  '/pages/mobile/bills.html',
  '/pages/mobile/goals.html',
  '/pages/mobile/investments.html',
  '/pages/mobile/settings.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE.filter(url => !url.startsWith('https:'))).catch((err) => {
        console.warn('SW pre-cache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições de API ou métodos não-GET
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Tenta atualizar em background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});
