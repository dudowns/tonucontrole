// ==========================================================================
// TONUCONTROLE - PWA ADVANCED SYNC & OFFLINE MANAGER
// Background Sync, IndexedDB Canonical Cache, Offline Resilience & Web Share
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
            this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
            this.syncListeners = [];
            this.init();
        }

        async init() {
            try {
                this.db = await this.openDatabase();
                console.log('📦 TonuControle IndexedDB inicializado com sucesso');

                this.setupNetworkListeners();
                this.setupServiceWorkerSync();
                this.setupVisibilityListeners();

                if (this.isOnline) {
                    setTimeout(() => this.flushQueue(), 1500);
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
                            showToast('⚡ Ação salva localmente com segurança! Sincronizará ao retornar conexão.', 'info');
                        }
                    }

                    if (navigator.onLine) {
                        setTimeout(() => this.flushQueue(), 50);
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
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }

        async clearQueue() {
            if (!this.db) return;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([QUEUE_STORE], 'readwrite');
                const store = tx.objectStore(QUEUE_STORE);
                const req = store.clear();
                req.onsuccess = () => resolve();
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
                if (typeof window.loadDashboard === 'function') window.loadDashboard();
                if (typeof window.loadTransactions === 'function') window.loadTransactions();
                if (typeof window.loadBills === 'function') window.loadBills();
                if (typeof window.loadGoals === 'function') window.loadGoals();
                if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
                if (typeof window.loadAllInvestmentData === 'function') window.loadAllInvestmentData();
            }
        }

        // Helper para limpar ids temporários gerados offline
        _sanitizeForInsert(record) {
            if (Array.isArray(record)) {
                return record.map(r => this._sanitizeForInsert(r));
            }
            if (!record || typeof record !== 'object') return record;
            const copy = { ...record };
            if (copy.id && typeof copy.id === 'string' && (copy.id.startsWith('offline_') || copy.id.startsWith('temp_'))) {
                delete copy.id;
            }
            return copy;
        }

        // Helper para identificar erros de chave duplicada / conflito no banco (409 / 23505)
        _isDuplicateOrConflictError(error) {
            if (!error) return false;
            return error.status === 409 ||
                error.statusCode === 409 ||
                error.code === '23505' ||
                (typeof error.message === 'string' && (
                    error.message.includes('duplicate key') ||
                    error.message.includes('already exists') ||
                    error.message.includes('conflict') ||
                    error.message.includes('violates unique constraint')
                ));
        }

        async executeSyncAction(item) {
            if (!window.supabaseClient) {
                console.warn('⚠️ Supabase client não disponível para sincronizar');
                return false;
            }

            const { action, data } = item;

            // Obtém ID do usuário para proteger mutações com filtro user_id
            let userId = (typeof currentUser !== 'undefined' && currentUser?.id)
                || (typeof window !== 'undefined' && window.currentUser?.id);

            if (!userId && typeof sessionStorage !== 'undefined') {
                try {
                    const storedUser = JSON.parse(sessionStorage.getItem('tonu_user') || '{}');
                    if (storedUser && storedUser.id) userId = storedUser.id;
                } catch (e) {}
            }

            if (!userId && typeof localStorage !== 'undefined') {
                try {
                    const storedUser = JSON.parse(localStorage.getItem('tonu_user') || '{}');
                    if (storedUser && storedUser.id) userId = storedUser.id;
                } catch (e) {}
            }

            if (!userId && window.supabaseClient?.auth) {
                try {
                    const { data: authData } = await window.supabaseClient.auth.getUser();
                    if (authData?.user?.id) userId = authData.user.id;
                } catch (e) {}
            }

            switch (action) {
                case 'INSERT_TRANSACTION':
                case 'INSERT_BILL': {
                    const cleanData = this._sanitizeForInsert(data);
                    const rawPayload = Array.isArray(cleanData) ? cleanData : [cleanData];
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    const payload = rawPayload.map(item => {
                        const copy = { ...item };
                        if (copy.category_id && !uuidRegex.test(String(copy.category_id))) {
                            delete copy.category_id;
                        }
                        return copy;
                    });
                    const { error } = await window.supabaseClient.from('transactions').insert(payload);
                    if (error) {
                        if (this._isDuplicateOrConflictError(error)) {
                            console.warn('⚠️ Transação já cadastrada na nuvem (409/23505). Marcando como sincronizada.');
                            return true;
                        }
                        throw error;
                    }
                    return true;
                }
                case 'UPDATE_TRANSACTION':
                case 'UPDATE_BILL': {
                    const { id, ...updates } = data;
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (updates.category_id && !uuidRegex.test(String(updates.category_id))) {
                        delete updates.category_id;
                    }
                    let query = window.supabaseClient.from('transactions').update(updates).eq('id', id);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'DELETE_TRANSACTION':
                case 'DELETE_BILL': {
                    const targetId = data.id || data;
                    let query = window.supabaseClient.from('transactions').delete().eq('id', targetId);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'PAY_BILL': {
                    const { billId, paymentData } = data;
                    let updateQuery = window.supabaseClient.from('transactions').update({ paid: true, paid_date: new Date().toISOString().split('T')[0] }).eq('id', billId);
                    if (userId) updateQuery = updateQuery.eq('user_id', userId);
                    await updateQuery;
                    if (paymentData) {
                        const cleanPayment = this._sanitizeForInsert(paymentData);
                        const { error: insertErr } = await window.supabaseClient.from('transactions').insert([cleanPayment]);
                        if (insertErr && !this._isDuplicateOrConflictError(insertErr)) {
                            throw insertErr;
                        }
                    }
                    return true;
                }
                case 'INSERT_GOAL': {
                    const cleanData = this._sanitizeForInsert(data);
                    const { error } = await window.supabaseClient.from('goals').insert(Array.isArray(cleanData) ? cleanData : [cleanData]);
                    if (error) {
                        if (this._isDuplicateOrConflictError(error)) {
                            console.warn('⚠️ Meta já cadastrada na nuvem (409/23505). Marcando como sincronizada.');
                            return true;
                        }
                        throw error;
                    }
                    return true;
                }
                case 'UPDATE_GOAL': {
                    const { id, ...updates } = data;
                    let query = window.supabaseClient.from('goals').update(updates).eq('id', id);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'DELETE_GOAL': {
                    const targetId = data.id || data;
                    let query = window.supabaseClient.from('goals').delete().eq('id', targetId);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'INSERT_INVESTMENT': {
                    const cleanData = this._sanitizeForInsert(data);
                    const { error } = await window.supabaseClient.from('investments').insert(Array.isArray(cleanData) ? cleanData : [cleanData]);
                    if (error) {
                        if (this._isDuplicateOrConflictError(error)) {
                            console.warn('⚠️ Investimento já cadastrado na nuvem (409/23505). Marcando como sincronizado.');
                            return true;
                        }
                        throw error;
                    }
                    return true;
                }
                case 'UPDATE_INVESTMENT': {
                    const { id, ...updates } = data;
                    let query = window.supabaseClient.from('investments').update(updates).eq('id', id);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'DELETE_INVESTMENT': {
                    const targetId = data.id || data;
                    let query = window.supabaseClient.from('investments').delete().eq('id', targetId);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'INSERT_DIVIDEND': {
                    const cleanData = this._sanitizeForInsert(data);
                    const { error } = await window.supabaseClient.from('dividends').insert(Array.isArray(cleanData) ? cleanData : [cleanData]);
                    if (error) {
                        if (this._isDuplicateOrConflictError(error)) {
                            console.warn('⚠️ Provento já cadastrado na nuvem (409/23505). Marcando como sincronizado.');
                            return true;
                        }
                        throw error;
                    }
                    return true;
                }
                case 'UPDATE_DIVIDEND': {
                    const { id, ...updates } = data;
                    let query = window.supabaseClient.from('dividends').update(updates).eq('id', id);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'DELETE_DIVIDEND': {
                    const targetId = data.id || data;
                    let query = window.supabaseClient.from('dividends').delete().eq('id', targetId);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'INSERT_CORPORATE_EVENT': {
                    const cleanData = this._sanitizeForInsert(data);
                    const { error } = await window.supabaseClient.from('corporate_events').insert(Array.isArray(cleanData) ? cleanData : [cleanData]);
                    if (error) {
                        if (this._isDuplicateOrConflictError(error)) {
                            console.warn('⚠️ Evento corporativo já cadastrado na nuvem (409/23505). Marcando como sincronizado.');
                            return true;
                        }
                        throw error;
                    }
                    return true;
                }
                case 'UPDATE_CORPORATE_EVENT': {
                    const { id, ...updates } = data;
                    let query = window.supabaseClient.from('corporate_events').update(updates).eq('id', id);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                case 'DELETE_CORPORATE_EVENT': {
                    const targetId = data.id || data;
                    let query = window.supabaseClient.from('corporate_events').delete().eq('id', targetId);
                    if (userId) query = query.eq('user_id', userId);
                    const { error } = await query;
                    if (error) throw error;
                    return true;
                }
                default:
                    console.warn('⚠️ Ação desconhecida de sincronização:', action);
                    return true;
            }
        }

        // ==================================================================
        // 4. CANONICAL INDEXEDDB ENTITY CACHE (PARTE 4, 7, 8)
        // ==================================================================
        async setEntityCache(key, data) {
            if (!this.db) await this.openDatabase();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([CACHE_STORE], 'readwrite');
                const store = tx.objectStore(CACHE_STORE);
                const req = store.put({ key, data, updatedAt: Date.now() });
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            });
        }

        async getEntityCache(key) {
            if (!this.db) await this.openDatabase();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([CACHE_STORE], 'readonly');
                const store = tx.objectStore(CACHE_STORE);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result ? req.result.data : null);
                req.onerror = () => reject(req.error);
            });
        }

        async getCachedTransactions(userId) {
            const key = `transactions_${userId || 'current'}`;
            const data = await this.getEntityCache(key);
            if (Array.isArray(data) && data.length > 0) return data;
            try {
                const legacy = localStorage.getItem('tonu_' + key);
                if (legacy) {
                    const parsed = JSON.parse(legacy);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        await this.setEntityCache(key, parsed);
                        return parsed;
                    }
                }
            } catch (_) {}
            return [];
        }

        async setCachedTransactions(userId, transactions) {
            return await this.setEntityCache(`transactions_${userId || 'current'}`, transactions || []);
        }

        async getCachedBills(userId) {
            const key = `bills_${userId || 'current'}`;
            const data = await this.getEntityCache(key);
            if (Array.isArray(data) && data.length > 0) return data;
            try {
                const legacy = localStorage.getItem('tonu_' + key);
                if (legacy) {
                    const parsed = JSON.parse(legacy);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        await this.setEntityCache(key, parsed);
                        return parsed;
                    }
                }
            } catch (_) {}
            return [];
        }

        async setCachedBills(userId, bills) {
            return await this.setEntityCache(`bills_${userId || 'current'}`, bills || []);
        }

        async getCachedGoals(userId) {
            const data = await this.getEntityCache(`goals_${userId || 'current'}`);
            return Array.isArray(data) ? data : [];
        }

        async setCachedGoals(userId, goals) {
            return await this.setEntityCache(`goals_${userId || 'current'}`, goals || []);
        }

        async getCachedInvestments(userId) {
            const data = await this.getEntityCache(`investments_${userId || 'current'}`);
            return Array.isArray(data) ? data : [];
        }

        async setCachedInvestments(userId, investments) {
            return await this.setEntityCache(`investments_${userId || 'current'}`, investments || []);
        }

        async getCachedDividends(userId) {
            const data = await this.getEntityCache(`dividends_${userId || 'current'}`);
            return Array.isArray(data) ? data : [];
        }

        async setCachedDividends(userId, dividends) {
            return await this.setEntityCache(`dividends_${userId || 'current'}`, dividends || []);
        }

        async getCachedCorporateEvents(userId) {
            const data = await this.getEntityCache(`corporate_events_${userId || 'current'}`);
            return Array.isArray(data) ? data : [];
        }

        async setCachedCorporateEvents(userId, events) {
            return await this.setEntityCache(`corporate_events_${userId || 'current'}`, events || []);
        }

        // ==================================================================
        // 5. SERVICE WORKER BACKGROUND SYNC & LISTENERS
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
                    if (event.data) {
                        if (event.data.type === 'TRIGGER_SYNC') {
                            console.log('⚡ Background Sync acionado pelo Service Worker');
                            this.flushQueue();
                        } else if (event.data.type === 'SYNC_COMPLETED') {
                            console.log('📩 Mensagem do SW: Sincronização concluída');
                        }
                    }
                });
            }
        }

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

        setupVisibilityListeners() {
            // Fallback robusto quando Background Sync não é suportado pelo navegador
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible' && navigator.onLine) {
                        this.flushQueue();
                    }
                });
            }
            if (typeof window !== 'undefined') {
                window.addEventListener('focus', () => {
                    if (navigator.onLine) {
                        this.flushQueue();
                    }
                });
            }
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
    console.log('✅ TonuSyncManager PWA carregado com suporte canônico IndexedDB');

})();
