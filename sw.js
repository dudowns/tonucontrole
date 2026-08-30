// ==========================================================================
// TONUCONTROLE - SERVICE WORKER UNIFICADO v7 (COM STALE-WHILE-REVALIDATE)
// ==========================================================================

const CACHE_NAME = 'tonucontrole-v7';
const STATIC_CACHE = 'tonucontrole-static-v7';
const DYNAMIC_CACHE = 'tonucontrole-dynamic-v7';
const API_CACHE = 'tonucontrole-api-v7';

const APP_VERSION = '2.1.0';

const urlsToCache = [
    '/tonucontrole/',
    '/tonucontrole/index.html',
    // '/tonucontrole/404.html',
    '/tonucontrole/manifest.json',
    '/tonucontrole/css/theme.css',
    '/tonucontrole/css/dark-theme.css',
    '/tonucontrole/css/sidebar-patch.css',
    '/tonucontrole/css/dashboard.css',
    '/tonucontrole/css/transactions.css',
    '/tonucontrole/css/bills.css',
    '/tonucontrole/css/goals.css',
    '/tonucontrole/css/investments.css',
    '/tonucontrole/css/settings.css',
    '/tonucontrole/css/notifications.css',
    '/tonucontrole/css/sync.css',
    '/tonucontrole/css/sync-status.css',
    // '/tonucontrole/css/style.css',
    '/tonucontrole/js/supabase.js',
    '/tonucontrole/js/core.js',
    '/tonucontrole/js/security.js',
    '/tonucontrole/js/financial-tools.js',
    '/tonucontrole/js/auth.js',
    '/tonucontrole/js/sync.js',
    '/tonucontrole/js/notifications.js',
    '/tonucontrole/js/dashboard.js',
    '/tonucontrole/js/transactions.js',
    '/tonucontrole/js/bills.js',
    '/tonucontrole/js/goals.js',
    '/tonucontrole/js/investments.js',
    '/tonucontrole/js/settings.js',
    '/tonucontrole/js/validators.js',
    '/tonucontrole/js/pagination.js',
    '/tonucontrole/js/sw-register.js',
    '/tonucontrole/pages/dashboard.html',
    '/tonucontrole/pages/transactions.html',
    '/tonucontrole/pages/bills.html',
    '/tonucontrole/pages/goals.html',
    '/tonucontrole/pages/investments.html',
    '/tonucontrole/pages/settings.html',
    '/tonucontrole/icons/icon-72x72.png',
    '/tonucontrole/icons/icon-96x96.png',
    '/tonucontrole/icons/icon-128x128.png',
    '/tonucontrole/icons/icon-144x144.png',
    '/tonucontrole/icons/icon-152x152.png',
    '/tonucontrole/icons/icon-192x192.png',
    '/tonucontrole/icons/icon-384x384.png',
    '/tonucontrole/icons/icon-512x512.png',
    // '/tonucontrole/icons/icon-1024x1024.png',
    '/tonucontrole/icons/logo.png'
];

// ==========================================================================
// INSTALAÇÃO
// ==========================================================================

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log(`📦 Cache estático v${APP_VERSION} aberto`);

                return cache.addAll(urlsToCache)
                    .then(() => {
                        console.log('✅ Todos os recursos cacheados com sucesso');
                    })
                    .catch(err => {
                        console.warn('⚠️ Erro no addAll, tentando um por um:', err);

                        const cachePromises = urlsToCache.map(url => {
                            return cache.add(url).catch(() => {
                                console.warn(`⚠️ Falha ao cachear: ${url}`);
                            });
                        });

                        return Promise.allSettled(cachePromises);
                    });
            })
            .then(() => {
                console.log('✅ Processo de cache concluído');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('❌ Erro no cache:', err);
                return self.skipWaiting();
            })
    );
});

// ==========================================================================
// ATIVAÇÃO
// ==========================================================================

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE &&
                        cacheName !== DYNAMIC_CACHE &&
                        cacheName !== API_CACHE &&
                        cacheName.startsWith('tonucontrole-')) {
                        console.log(`🗑️ Removendo cache antigo: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
            .then(() => {
                console.log(`✅ Service Worker v${APP_VERSION} ativado e pronto`);
                return self.clients.claim();
            })
    );
});

// ==========================================================================
// MENSAGENS DO CLIENTE
// ==========================================================================

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('🔄 Skip waiting solicitado, ativando nova versão');
        self.skipWaiting();
    }
});

// ==========================================================================
// INTERCEPTAÇÃO DE REQUISIÇÕES
// ==========================================================================

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // ============================================
    // 🔥 REGRA ESPECIAL PARA O MANIFEST (NETWORK-FIRST)
    // ============================================
    if (url.pathname.includes('manifest.json')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(STATIC_CACHE).then(cache => {
                        cache.put(event.request, copy);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('use.typekit.net')) {
        event.respondWith(fetch(event.request).catch(() => {
            return new Response('', { status: 200, statusText: 'OK' });
        }));
        return;
    }

    if (event.request.method === 'POST' && url.pathname.includes('/pages/transactions.html')) {
        event.respondWith(handleShareTarget(event));
        return;
    }

    if (url.hostname.includes('supabase.co') || url.hostname.includes('brapi.dev')) {
        event.respondWith(handleApiRequest(event));
        return;
    }

    if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2)$/)) {
        event.respondWith(handleStaticRequest(event));
        return;
    }

    event.respondWith(handlePageRequest(event));
});

// ==========================================================================
// HANDLER COM STALE-WHILE-REVALIDATE PARA STATIC ASSETS
// ==========================================================================

async function handleStaticRequest(event) {
    const request = event.request;

    if (request.method === 'HEAD') {
        return new Response(null, { status: 200, statusText: 'OK' });
    }

    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request).then(async response => {
            if (response && response.status === 200) {
                try {
                    const cache = await caches.open(DYNAMIC_CACHE);
                    cache.put(request, response.clone());
                } catch (cacheError) {
                    console.warn('⚠️ Erro ao atualizar cache:', cacheError);
                }
            }
            return response;
        }).catch(error => {
            console.warn('⚠️ Falha no fetch, mantendo cache:', error);
            return cachedResponse || new Response('', { status: 200 });
        });

        if (cachedResponse) {
            fetchPromise.catch(() => { });
            return cachedResponse;
        }

        return await fetchPromise;

    } catch (error) {
        console.warn('⚠️ Erro no handleStaticRequest:', error);
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        return new Response('', { status: 200, statusText: 'OK' });
    }
}

// ==========================================================================
// HANDLER PARA PÁGINAS COM STALE-WHILE-REVALIDATE
// ==========================================================================

async function handlePageRequest(event) {
    const request = event.request;

    if (request.method === 'HEAD') {
        try {
            return await fetch(request);
        } catch {
            return new Response(null, { status: 200, statusText: 'OK' });
        }
    }

    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request).then(async response => {
            if (response && response.status === 200) {
                try {
                    const cache = await caches.open(DYNAMIC_CACHE);
                    cache.put(request, response.clone());
                } catch (e) { }
            }
            return response;
        }).catch(() => cachedResponse);

        if (cachedResponse) {
            fetchPromise.catch(() => { });
            return cachedResponse;
        }

        return await fetchPromise;

    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        return caches.match('/tonucontrole/index.html');
    }
}

// ==========================================================================
// HANDLER PARA API COM NETWORK-FIRST + TIMEOUT
// ==========================================================================

async function handleApiRequest(event) {
    const request = event.request;

    if (request.method === 'HEAD') {
        try {
            return await fetch(request);
        } catch {
            return new Response(null, { status: 200, statusText: 'OK' });
        }
    }

    try {
        const cache = await caches.open(API_CACHE);
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request).then(async response => {
            if (response && response.status === 200 && request.method === 'GET') {
                try {
                    const cache = await caches.open(API_CACHE);
                    cache.put(request, response.clone());
                } catch (e) { }
            }
            return response;
        }).catch(() => {
            if (cachedResponse) return cachedResponse;
            throw new Error('Offline e sem cache');
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 5000);
        });

        try {
            return await Promise.race([fetchPromise, timeoutPromise]);
        } catch {
            if (cachedResponse) return cachedResponse;
            throw new Error('Offline e sem cache');
        }

    } catch (error) {
        console.warn('⚠️ Erro no handleApiRequest:', error);
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        return new Response('Erro na requisição', { status: 500 });
    }
}

// ==========================================================================
// SHARE TARGET
// ==========================================================================

async function handleShareTarget(event) {
    try {
        const formData = await event.request.formData();
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const url = formData.get('url') || '';
        const receipt = formData.get('receipt');

        let fileData = null;
        if (receipt && receipt.size > 0) {
            const buffer = await receipt.arrayBuffer();
            fileData = {
                name: receipt.name,
                type: receipt.type,
                size: receipt.size,
                buffer: buffer
            };
        }

        await saveSharedDataToIndexedDB({
            title,
            text,
            url,
            file: fileData,
            timestamp: Date.now()
        });

        console.log('📥 Web Share Target recebido e armazenado!');
        return Response.redirect('/tonucontrole/pages/transactions.html?share_target=received', 303);

    } catch (err) {
        console.error('❌ Erro no Share Target:', err);
        return Response.redirect('/tonucontrole/pages/transactions.html?share_target=error', 303);
    }
}

// ==========================================================================
// BACKGROUND SYNC
// ==========================================================================

self.addEventListener('sync', event => {
    console.log('⚡ Background Sync disparado:', event.tag);

    if (event.tag === 'tonu-sync-queue') {
        event.waitUntil(processSyncQueue());
    }
});

async function processSyncQueue() {
    console.log('🔄 Processando fila de sincronização...');

    try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
            client.postMessage({
                type: 'SYNC_STARTED',
                timestamp: Date.now()
            });
        }
    } catch (err) {
        console.error('❌ Erro no Background Sync:', err);
    }
}

// ==========================================================================
// PUSH NOTIFICATIONS
// ==========================================================================

self.addEventListener('push', event => {
    let data = {
        title: 'TonuControle 💰',
        body: 'Você tem contas a vencer ou alertas financeiros importantes!',
        url: '/tonucontrole/pages/bills.html'
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: '/tonucontrole/icons/icon-128x128.png',
        badge: '/tonucontrole/icons/icon-128x128.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: data.tag || 'tonucontrole-reminder',
        renotify: true,
        requireInteraction: true,
        data: {
            url: data.url || '/tonucontrole/pages/bills.html',
            billId: data.billId,
            dateOfArrival: Date.now()
        },
        actions: [
            { action: 'view', title: '👁️ Ver Detalhes' },
            { action: 'pay', title: '✅ Marcar como Paga' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'TonuControle', options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/tonucontrole/pages/bills.html';
    const action = event.action;
    const billId = event.notification.data?.billId;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if ('focus' in client) {
                    if (action === 'pay' && billId) {
                        client.postMessage({ type: 'BILL_ACTION_PAY', billId: billId });
                    }
                    if (client.url.includes('bills.html')) {
                        return client.focus();
                    } else {
                        client.navigate(targetUrl);
                        return client.focus();
                    }
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// ==========================================================================
// INDEXEDDB HELPER
// ==========================================================================

const DB_NAME = 'TonuControlePWA_DB';
const DB_VERSION = 1;
const SHARED_STORE = 'shared_target_data';

function saveSharedDataToIndexedDB(data) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(SHARED_STORE)) {
                const store = db.createObjectStore(SHARED_STORE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            const tx = db.transaction([SHARED_STORE], 'readwrite');
            const store = tx.objectStore(SHARED_STORE);
            const addReq = store.add(data);

            addReq.onsuccess = () => resolve();
            addReq.onerror = () => reject(addReq.error);
        };

        request.onerror = () => reject(request.error);
    });
}

console.log(`✅ Service Worker v${APP_VERSION} carregado com Stale-While-Revalidate!`);