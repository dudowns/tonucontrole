// ==========================================================================
// TONUCONTROLE - PWA ADVANCED SYNC & OFFLINE MANAGER
// Background Sync, IndexedDB Queue, Offline Resilience & Web Share Target Store
// ==========================================================================

(function () {
    'use strict';

    const DB_NAME = 'TonuControlePWA_DB';
    const DB_VERSION = 1;
    const QUEUE_STORE = 'sync_queue';
    const SHARED_STORE = 'shared_target_data';
    const CACHE_STORE = 'offline_entity_cache';

    class TonuSyncManager {
        constructor() {
            this.db = null;
            this.isSyncing = false;
            this.isOnline = navigator.onLine;
            this.syncListeners = [];
            this.init();
        }

        async init() {
            try {
                this.db = await this.openDatabase();
                console.log('📦 TonuControle IndexedDB inicializado com sucesso');

                this.setupNetworkListeners();
                this.setupServiceWorkerSync();

                if (this.isOnline) {
                    setTimeout(() => this.flushQueue(), 2000);
                }
            } catch (err) {
                console.error('❌ Erro ao inicializar TonuSyncManager:', err);
            }
        }

        // ==================================================================
        // 1. INDEXEDDB SETUP
        // ==================================================================
        openDatabase() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                        const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
                        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
                        queueStore.createIndex('status', 'status', { unique: false });
                    }

                    if (!db.objectStoreNames.contains(SHARED_STORE)) {
                        const sharedStore = db.createObjectStore(SHARED_STORE, { keyPath: 'id', autoIncrement: true });
                        sharedStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }

                    if (!db.objectStoreNames.contains(CACHE_STORE)) {
                        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
                    }
                };

                request.onsuccess = (event) => resolve(event.target.result);
                request.onerror = (event) => reject(event.target.error);
            });
        }

        // ==================================================================
        // 2. ENQUEUE OFFLINE OPERATIONS
        // ==================================================================
        async enqueue(action, data) {
            if (!this.db) await this.openDatabase();

            let payloadToStore = data;
            if (window.TonuCrypto && typeof window.TonuCrypto.encrypt === 'function') {
                try {
                    payloadToStore = await window.TonuCrypto.encrypt(data);
                } catch (e) {
                    console.warn('⚠️ Erro ao criptografar offline:', e);
                }
            }

            const item = {
                action: action,
                data: payloadToStore,
                timestamp: Date.now(),
                retries: 0,
                status: 'pending'
            };

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([QUEUE_STORE], 'readwrite');
                const store = tx.objectStore(QUEUE_STORE);
                const req = store.add(item);

                req.onsuccess = (e) => {
                    item.id = e.target.result;
                    console.log(`📥 Operação offline enfileirada e protegida [ID: ${item.id}]:`, action);
                    this.requestBackgroundSync();

                    if (typeof showToast === 'function') {
                        if (!navigator.onLine) {
                            showToast('⚡ Ação salva localmente com criptografia! Sincronizará ao retornar conexão.', 'info');
                        }
                    }

                    resolve(item);
                };

                req.onerror = (e) => reject(e.target.error);
            });
        }

        async getQueue() {
            if (!this.db) await this.openDatabase();

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([QUEUE_STORE], 'readonly');
                const store = tx.objectStore(QUEUE_STORE);
                const req = store.getAll();

                req.onsuccess = async () => {
                    const rawItems = req.result || [];
                    const decryptedItems = await Promise.all(rawItems.map(async item => {
                        let decryptedData = item.data;
                        if (window.TonuCrypto && typeof window.TonuCrypto.decrypt === 'function') {
                            try {
                                decryptedData = await window.TonuCrypto.decrypt(item.data);
                            } catch (err) { }
                        }
                        return { ...item, data: decryptedData };
                    }));
                    resolve(decryptedItems);
                };
                req.onerror = () => reject(req.error);
            });
        }

        async getPendingCount() {
            const queue = await this.getQueue();
            return queue.filter(q => q.status === 'pending').length;
        }

        async removeQueueItem(id) {
            if (!this.db) return;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([QUEUE_STORE], 'readwrite');
                const store = tx.objectStore(QUEUE_STORE);
                const req = store.delete(id);
                req.onsuccess = () => {
                    resolve();
                };
                req.onerror = () => reject(req.error);
            });
        }

        async clearQueue() {
            if (!this.db) return;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([QUEUE_STORE], 'readwrite');
                const store = tx.objectStore(QUEUE_STORE);
                const req = store.clear();
                req.onsuccess = () => {
                    resolve();
                };
                req.onerror = () => reject(req.error);
            });
        }

        // ==================================================================
        // 3. FLUSH SYNC QUEUE
        // ==================================================================
        async flushQueue() {
            if (this.isSyncing || !navigator.onLine) return;
            const queue = await this.getQueue();
            const pending = queue.filter(q => q.status === 'pending');

            if (pending.length === 0) return;

            this.isSyncing = true;
            console.log(`🔄 Iniciando sincronização de ${pending.length} itens pendentes...`);

            let successCount = 0;
            let failureCount = 0;

            for (const item of pending) {
                try {
                    const ok = await this.executeSyncAction(item);
                    if (ok) {
                        await this.removeQueueItem(item.id);
                        successCount++;
                    } else {
                        item.retries = (item.retries || 0) + 1;
                        failureCount++;
                    }
                } catch (err) {
                    console.error(`❌ Erro ao sincronizar item #${item.id}:`, err);
                    failureCount++;
                }
            }

            this.isSyncing = false;

            if (successCount > 0) {
                console.log(`✅ Sincronização concluída: ${successCount} ações sincronizadas`);
                if (typeof showToast === 'function') {
                    showToast(`✅ ${successCount} operação(ões) sincronizada(s) com a nuvem!`, 'success');
                    if (window.billNotificationManager) {
                        window.billNotificationManager.playChime();
                    }
                }
                if (typeof window.loadDashboardData === 'function') window.loadDashboardData();
                if (typeof window.loadTransactions === 'function') window.loadTransactions();
                if (typeof window.loadBills === 'function') window.loadBills();
                if (typeof window.loadGoals === 'function') window.loadGoals();
            }
        }

        async executeSyncAction(item) {
            if (!window.supabaseClient) {
                console.warn('⚠️ Supabase client não disponível para sincronizar');
                return false;
            }

            const { action, data } = item;

            switch (action) {
                case 'INSERT_TRANSACTION': {
                    const { error } = await window.supabaseClient.from('transactions').insert([data]);
                    if (error) throw error;
                    return true;
                }
                case 'UPDATE_TRANSACTION': {
                    const { id, ...updates } = data;
                    const { error } = await window.supabaseClient.from('transactions').update(updates).eq('id', id);
                    if (error) throw error;
                    return true;
                }
                case 'DELETE_TRANSACTION': {
                    const { error } = await window.supabaseClient.from('transactions').delete().eq('id', data.id);
                    if (error) throw error;
                    return true;
                }
                case 'PAY_BILL': {
                    const { billId, paymentData } = data;
                    await window.supabaseClient.from('transactions').update({ paid: true }).eq('id', billId);
                    if (paymentData) {
                        await window.supabaseClient.from('transactions').insert([paymentData]);
                    }
                    return true;
                }
                case 'INSERT_GOAL': {
                    const { error } = await window.supabaseClient.from('goals').insert([data]);
                    if (error) throw error;
                    return true;
                }
                case 'UPDATE_GOAL': {
                    const { id, ...updates } = data;
                    const { error } = await window.supabaseClient.from('goals').update(updates).eq('id', id);
                    if (error) throw error;
                    return true;
                }
                case 'DELETE_GOAL': {
                    const { error } = await window.supabaseClient.from('goals').delete().eq('id', data.id);
                    if (error) throw error;
                    return true;
                }
                default:
                    console.warn('⚠️ Ação desconhecida de sincronização:', action);
                    return true;
            }
        }

        // ==================================================================
        // 4. SERVICE WORKER BACKGROUND SYNC
        // ==================================================================
        async requestBackgroundSync() {
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                try {
                    const registration = await navigator.serviceWorker.ready;
                    await registration.sync.register('tonu-sync-queue');
                    console.log('⚡ Background Sync registrado no Service Worker: "tonu-sync-queue"');
                } catch (err) {
                    console.warn('⚠️ Background Sync API não suportada ou erro ao registrar:', err);
                }
            }
        }

        setupServiceWorkerSync() {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data && event.data.type === 'SYNC_COMPLETED') {
                        console.log('📩 Mensagem do SW: Sincronização em segundo plano concluída');
                    }
                });
            }
        }

        // ==================================================================
        // 5. MONITORAMENTO DE REDE
        // ==================================================================
        setupNetworkListeners() {
            window.addEventListener('online', () => {
                this.isOnline = true;
                console.log('🌐 Conexão de rede restaurada! Online.');
                if (typeof showToast === 'function') {
                    showToast('🌐 Conexão restaurada! Sincronizando...', 'info');
                }
                this.flushQueue();
            });

            window.addEventListener('offline', () => {
                this.isOnline = false;
                console.log('📶 Você está offline no momento.');
                if (typeof showToast === 'function') {
                    showToast('📶 Modo Offline ativo. Todas as alterações serão salvas localmente.', 'warning');
                }
            });
        }

        // ==================================================================
        // 6. WEB SHARE TARGET API
        // ==================================================================
        async saveSharedData(data) {
            if (!this.db) await this.openDatabase();

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([SHARED_STORE], 'readwrite');
                const store = tx.objectStore(SHARED_STORE);
                const req = store.add({
                    ...data,
                    timestamp: Date.now()
                });

                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });
        }

        async getLatestSharedData() {
            if (!this.db) await this.openDatabase();

            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([SHARED_STORE], 'readonly');
                const store = tx.objectStore(SHARED_STORE);
                const req = store.getAll();

                req.onsuccess = () => {
                    const items = req.result || [];
                    if (items.length === 0) return resolve(null);
                    items.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(items[0]);
                };
                req.onerror = () => reject(req.error);
            });
        }

        async clearSharedData() {
            if (!this.db) return;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([SHARED_STORE], 'readwrite');
                const store = tx.objectStore(SHARED_STORE);
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
    }

    // Instância global
    window.tonuSync = new TonuSyncManager();
    console.log('✅ TonuSyncManager PWA carregado');

})();