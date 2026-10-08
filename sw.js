// ============================================
// TONUCONTROLE SERVICE WORKER
// ============================================

// NOTA: Sincronizar CACHE_NAME com a versão em package.json a cada release
const CACHE_NAME = 'tonucontrole-v2.6.0';

const RELATIVE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/theme.css',
  './css/dark-theme.css',
  './css/dashboard.css',
  './css/transactions.css',
  './css/goals.css',
  './css/investments.css',
  './css/settings.css',
  './css/bills.css',
  './css/sync-status.css',
  './css/notifications.css',
  './css/sync.css',
  './css/mobile.css',
  './icons/logo.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './js/device-router.js',
  './js/supabase.js',
  './js/core.js',
  './js/auth.js',
  './js/security.js',
  './js/validators.js',
  './js/financial-tools.js',
  './js/sync.js',
  './js/notifications.js',
  './js/dashboard.js',
  './js/transactions.js',
  './js/bills.js',
  './js/goals.js',
  './js/investments.js',
  './js/settings.js',
  './js/sw-register.js',
  './js/data/cnpj-base.js',
  './js/reports/ir-report.js',
  './js/mobile/dashboard.js',
  './pages/dashboard.html',
  './pages/transactions.html',
  './pages/bills.html',
  './pages/goals.html',
  './pages/investments.html',
  './pages/settings.html',
  './pages/mobile/dashboard.html',
  './pages/mobile/transactions.html',
  './pages/mobile/bills.html',
  './pages/mobile/goals.html',
  './pages/mobile/investments.html',
  './pages/mobile/settings.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const urlsToCache = RELATIVE_ASSETS.map(asset => new URL(asset, self.registration.scope).href);
      return cache.addAll(urlsToCache).catch((err) => {
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

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// ============================================
// BACKGROUND SYNC EVENT LISTENER
// ============================================
self.addEventListener('sync', (event) => {
  console.log('⚡ Service Worker sync event disparado:', event.tag);
  if (event.tag === 'tonu-sync-queue' || event.tag === 'tonucontrole-sync') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        if (clients && clients.length > 0) {
          clients.forEach((client) => {
            client.postMessage({ type: 'TRIGGER_SYNC' });
          });
        }
      })
    );
  }
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições de API ou métodos não-GET
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  // Scripts, estilos e documentos: Rede primeiro (Network-First) com fallback para cache
  const url = event.request.url;
  const isCodeOrDoc = event.request.destination === 'script' ||
                      event.request.destination === 'style' ||
                      event.request.destination === 'document' ||
                      url.includes('.js') ||
                      url.includes('.css') ||
                      url.includes('.html');

  if (isCodeOrDoc) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            const fallbackIndex = new URL('./index.html', self.registration.scope).href;
            const fallbackRoot = new URL('./', self.registration.scope).href;
            return caches.match(fallbackIndex).then(res => res || caches.match(fallbackRoot));
          }
        });
      })
    );
    return;
  }

  // Demais arquivos (imagens, fontes): Cache-First com atualização em segundo plano
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
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
      });
    })
  );
});
