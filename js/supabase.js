// ============================================
// SUPABASE - Configuração e cliente (COM OFFLINE)
// ============================================

const SUPABASE_URL = 'https://rbtxrbacdpenbslqcbbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHhyYmFjZHBlbmJzbHFjYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDA5MjksImV4cCI6MjEwMTk3NjkyOX0.VDmJ-pty8oLzkgEad4WBpk7leR9ZR-b_bXXUE3HkPcM';

// ============================================
// 🔥 getBaseUrl() - CORRIGIDO PARA GITHUB PAGES
// ============================================
function getBaseUrl() {
    var hostname = window.location.hostname;
    var origin = window.location.origin;
    var pathname = window.location.pathname;

    // 🔥 GitHub Pages
    if (hostname.includes('github.io')) {
        // Remove o nome do repositório do pathname
        var parts = pathname.split('/');
        if (parts.length > 1 && parts[1] !== '' && parts[1] !== 'index.html') {
            return origin + '/' + parts[1];
        }
        return origin;
    }

    // Render.com / Vercel / Netlify / localhost
    if (hostname.includes('onrender.com') ||
        hostname.includes('vercel.app') ||
        hostname.includes('netlify.app') ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1') {
        return origin;
    }

    // Fallback
    return origin;
}

// 🔥 GARANTIR QUE A FUNÇÃO ESTÁ DISPONÍVEL GLOBALMENTE
window.getBaseUrl = getBaseUrl;

// ============================================
// CRIAR CLIENTE SUPABASE
// ============================================
var supabaseClient;

// Verificar se supabase já existe (carregado pelo CDN)
if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            redirectTo: getBaseUrl() + '/pages/dashboard.html'
        }
    });
} else if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            redirectTo: getBaseUrl() + '/pages/dashboard.html'
        }
    });
} else {
    console.warn('⚠️ Supabase não encontrado globalmente, tentando criar manualmente');
    supabaseClient = {
        auth: {
            signInWithPassword: async () => ({ data: null, error: new Error('Supabase não inicializado') }),
            signUp: async () => ({ data: null, error: new Error('Supabase não inicializado') }),
            signInWithOAuth: async () => ({ data: null, error: new Error('Supabase não inicializado') }),
            resetPasswordForEmail: async () => ({ error: new Error('Supabase não inicializado') }),
            getUser: async () => ({ data: { user: null }, error: null }),
            signOut: async () => ({ error: null })
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                    single: async () => ({ data: null, error: null }),
                    limit: async () => ({ data: [], error: null }),
                    order: () => ({ data: [], error: null })
                }),
                insert: async () => ({ data: null, error: null }),
                update: async () => ({ data: null, error: null }),
                delete: async () => ({ data: null, error: null })
            })
        })
    };
}

window.supabaseClient = supabaseClient;

console.log('✅ Supabase client inicializado');
console.log('📌 Base URL:', getBaseUrl());

// ============================================
// SUPABASE OFFLINE MANAGER
// ============================================

const OFFLINE_STORAGE_KEY = 'tonu_offline_session';

class SupabaseOfflineManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.setupNetworkListeners();
        console.log('📶 Offline Manager:', this.isOnline ? 'Online' : 'Offline');
    }

    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🌐 Conexão restabelecida');
            this.tryReconnect();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📶 Modo offline ativado');
        });
    }

    saveOfflineSession(user) {
        try {
            localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify({
                user: user,
                timestamp: Date.now(),
                email: user.email
            }));
            console.log('💾 Sessão salva para offline:', user.email);
        } catch (e) {
            console.warn('⚠️ Erro ao salvar sessão offline:', e);
        }
    }

    loadOfflineSession() {
        try {
            var data = localStorage.getItem(OFFLINE_STORAGE_KEY);
            if (data) {
                var parsed = JSON.parse(data);
                var expiryDays = 7;
                if (Date.now() - parsed.timestamp < expiryDays * 24 * 60 * 60 * 1000) {
                    console.log('📂 Sessão offline carregada:', parsed.user.email);
                    return parsed.user;
                }
                localStorage.removeItem(OFFLINE_STORAGE_KEY);
                console.log('🗑️ Sessão offline expirada');
            }
        } catch (e) {
            console.warn('⚠️ Erro ao carregar sessão offline:', e);
        }
        return null;
    }

    async tryReconnect() {
        try {
            if (!window.supabaseClient || !window.supabaseClient.auth) {
                console.warn('⚠️ Supabase client não disponível para reconectar');
                return null;
            }
            var { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user) {
                this.saveOfflineSession(user);
                console.log('✅ Reconectado e sessão atualizada:', user.email);
                return user;
            }
        } catch (e) {
            console.log('⚠️ Erro ao reconectar:', e);
        }
        return null;
    }

    async isAuthenticated() {
        // SE ESTIVER NA PÁGINA DE LOGIN, NÃO VERIFICA
        if (window.__TONU_IS_LOGIN_PAGE === true) {
            console.log('🔒 Página de login - ignorando verificação');
            return null;
        }

        // VERIFICAR SE ESTÁ EM PROCESSO DE LOGOUT
        if (sessionStorage.getItem('tonu_logout_in_progress') === 'true') {
            console.log('🚪 Logout em progresso, ignorando autenticação');
            return null;
        }

        if (this.isOnline && window.supabaseClient && window.supabaseClient.auth) {
            try {
                var { data: { user } } = await window.supabaseClient.auth.getUser();
                if (user) {
                    this.saveOfflineSession(user);
                    return user;
                }
            } catch (e) {
                console.log('⚠️ Erro ao verificar autenticação online:', e);
            }
        }

        var offlineUser = this.loadOfflineSession();
        if (offlineUser) {
            console.log('📶 Usuário autenticado OFFLINE:', offlineUser.email);
            return offlineUser;
        }

        return null;
    }

    async logout() {
        try {
            localStorage.removeItem(OFFLINE_STORAGE_KEY);
            sessionStorage.removeItem('tonu_user');

            if (this.isOnline && window.supabaseClient && window.supabaseClient.auth) {
                await window.supabaseClient.auth.signOut();
            }
            console.log('🚪 Logout realizado');
        } catch (e) {
            console.warn('⚠️ Erro ao fazer logout:', e);
            localStorage.removeItem(OFFLINE_STORAGE_KEY);
        }

        sessionStorage.removeItem('tonu_logout_in_progress');
        window.location.href = getBaseUrl() + '/index.html';
    }

    forceSync() {
        if (this.isOnline) {
            console.log('🔄 Sincronizando dados...');
            this.tryReconnect();
            if (window.tonuSync) {
                window.tonuSync.flushQueue();
            }
            return true;
        } else {
            console.warn('⚠️ Não é possível sincronizar offline');
            return false;
        }
    }
}

window.supabaseOffline = new SupabaseOfflineManager();

// ============================================
// VERIFICAÇÃO DE AUTENTICAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', async function () {
    // SE ESTIVER NA PÁGINA DE LOGIN, NÃO FAZ NADA
    if (window.__TONU_IS_LOGIN_PAGE === true) {
        console.log('🔒 Página de login - sem verificação automática');
        return;
    }

    // VERIFICAR SE ESTÁ EM PROCESSO DE LOGOUT
    if (sessionStorage.getItem('tonu_logout_in_progress') === 'true') {
        console.log('🚪 Logout em progresso, aguardando...');
        setTimeout(() => {
            sessionStorage.removeItem('tonu_logout_in_progress');
        }, 2000);
        return;
    }

    try {
        var user = await window.supabaseOffline.isAuthenticated();
        var path = window.location.pathname;
        var baseUrl = getBaseUrl();

        console.log('📌 Status:', user ? 'Logado' : 'Não logado');
        console.log('📌 Path:', path);
        console.log('📌 Online:', navigator.onLine);

        if (user && (path.includes('index.html') || path === '/' || path.endsWith('/'))) {
            console.log('🔀 Redirecionando para dashboard');
            window.location.href = baseUrl + '/pages/dashboard.html';
            return;
        }

        if (!user && path.includes('/pages/')) {
            console.log('🔀 Redirecionando para login');
            window.location.href = baseUrl + '/index.html';
            return;
        }

        if (user && path.includes('/pages/')) {
            console.log('✅ Usuário logado em página protegida');
            if (window.loadGlobalUserProfile) {
                setTimeout(() => {
                    window.loadGlobalUserProfile();
                }, 500);
            }
        }

        if (user && !navigator.onLine) {
            console.log('📶 Modo Offline - Dados em cache');
            if (window.showToast) {
                setTimeout(function () {
                    window.showToast('📶 Modo Offline - Dados em cache disponíveis', 'warning');
                }, 1000);
            }
        }

        if (user && navigator.onLine && window.tonuSync) {
            setTimeout(function () {
                window.tonuSync.flushQueue();
            }, 3000);
        }

    } catch (error) {
        console.error('❌ Erro na verificação:', error);
        var offlineUser = window.supabaseOffline.loadOfflineSession();
        if (offlineUser && window.location.pathname.includes('/pages/')) {
            console.log('📶 Fallback: Usuário offline, permitindo acesso');
            return;
        }
        if (window.location.pathname.includes('/pages/')) {
            window.location.href = getBaseUrl() + '/index.html';
        }
    }
});

// ============================================
// EXPORTAR FUNÇÕES
// ============================================

window.forceSync = function () {
    return window.supabaseOffline.forceSync();
};

window.getOfflineStatus = function () {
    return {
        online: navigator.onLine,
        hasOfflineSession: !!window.supabaseOffline.loadOfflineSession(),
        user: window.supabaseOffline.loadOfflineSession()
    };
};

console.log('✅ Supabase com suporte OFFLINE carregado!');