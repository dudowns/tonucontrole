// ============================================
// SUPABASE - Configuração e cliente (COM OFFLINE E CONFIG DINÂMICA)
// ============================================

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
// ============================================
// CREDENCIAIS PADRÃO DE PRODUÇÃO (FALLBACK OFFLINE / GITHUB PAGES)
// ============================================
const DEFAULT_SUPABASE_URL = 'https://rbtxrbacdpenbslqcbbl.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHhyYmFjZHBlbmJzbHFjYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDA5MjksImV4cCI6MjEwMTk3NjkyOX0.VDmJ-pty8oLzkgEad4WBpk7leR9ZR-b_bXXUE3HkPcM';

// ============================================
// RESOLUÇÃO DE CONFIGURAÇÃO SUPABASE
// ============================================
function resolveSupabaseCredentials() {
    // 1. Objeto dinâmico injetado pelo servidor Express no HTML
    if (typeof window !== 'undefined' && window.__TONU_CONFIG__ && window.__TONU_CONFIG__.supabaseUrl && window.__TONU_CONFIG__.supabaseAnonKey) {
        return {
            url: window.__TONU_CONFIG__.supabaseUrl,
            anonKey: window.__TONU_CONFIG__.supabaseAnonKey,
            source: 'injected'
        };
    }

    // 2. Objeto de configuração global alternativo
    if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL && window.APP_CONFIG.SUPABASE_ANON_KEY) {
        return {
            url: window.APP_CONFIG.SUPABASE_URL,
            anonKey: window.APP_CONFIG.SUPABASE_ANON_KEY,
            source: 'app_config'
        };
    }

    // 3. Fallback para credenciais oficiais de produção (Garante GitHub Pages, mobile, PWA e estático)
    return {
        url: DEFAULT_SUPABASE_URL,
        anonKey: DEFAULT_SUPABASE_ANON_KEY,
        source: 'default_production'
    };
}

function removeConfigurationErrorNotice() {
    if (typeof document === 'undefined') return;
    var noticeId = 'tonu-config-error-banner';
    var banner = document.getElementById(noticeId);
    if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
    }
}

function showConfigurationErrorNotice(message) {
    if (typeof document === 'undefined') return;
    var noticeId = 'tonu-config-error-banner';
    if (document.getElementById(noticeId)) return;

    var banner = document.createElement('div');
    banner.id = noticeId;
    banner.style.cssText = 'position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:999999; background:#ff7675; color:#ffffff; padding:12px 20px; border-radius:10px; font-family:sans-serif; font-size:13px; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,0.25); text-align:center; max-width:90%;';
    banner.innerHTML = `⚠️ <strong>Erro de Configuração:</strong> ${message}`;
    document.body ? document.body.appendChild(banner) : window.addEventListener('DOMContentLoaded', () => document.body.appendChild(banner));
}

// ============================================
// CRIAR CLIENTE SUPABASE REAL
// ============================================
var supabaseClient = null;
var creds = resolveSupabaseCredentials();

var SUPABASE_URL = creds ? creds.url : '';
var SUPABASE_ANON_KEY = creds ? creds.anonKey : '';

function initializeSupabaseClient(url, key) {
    if (!url || !key) {
        console.error('❌ Falha na inicialização do Supabase: credenciais ausentes.');
        showConfigurationErrorNotice('Não foi possível carregar as credenciais de banco de dados.');
        return null;
    }

    var clientInstance = null;
    var options = {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            redirectTo: getBaseUrl() + '/pages/dashboard.html'
        }
    };

    if (typeof supabase !== 'undefined' && supabase.createClient) {
        clientInstance = supabase.createClient(url, key, options);
    } else if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        clientInstance = window.supabase.createClient(url, key, options);
    } else {
        console.warn('⚠️ Supabase JS SDK não encontrado no escopo global.');
    }

    SUPABASE_URL = url;
    SUPABASE_ANON_KEY = key;
    supabaseClient = clientInstance;
    window.supabaseClient = clientInstance;

    // Remove qualquer aviso residual de erro
    removeConfigurationErrorNotice();

    return clientInstance;
}

// Inicializa imediatamente com as credenciais resolvidas
if (creds && creds.url && creds.anonKey) {
    initializeSupabaseClient(creds.url, creds.anonKey);
}

// Busca assíncrona em background para atualizar credenciais dinâmicas do servidor (se houver)
if (typeof fetch === 'function') {
    var baseApi = (typeof window.getBaseUrl === 'function' ? window.getBaseUrl() : '').replace(/\/+$/, '');
    var configEndpoint = baseApi ? (baseApi + '/api/config') : '/api/config';

    fetch(configEndpoint)
        .then(function (res) {
            if (!res.ok) return null;
            return res.json();
        })
        .then(function (data) {
            if (data && data.supabaseUrl && data.supabaseAnonKey) {
                window.__TONU_CONFIG__ = Object.assign(window.__TONU_CONFIG__ || {}, data);
                if (data.supabaseUrl !== SUPABASE_URL || data.supabaseAnonKey !== SUPABASE_ANON_KEY) {
                    initializeSupabaseClient(data.supabaseUrl, data.supabaseAnonKey);
                }
            }
        })
        .catch(function () {
            // Em hosts estáticos como GitHub Pages, /api/config não existe.
            // As credenciais de produção já ativas garantem o funcionamento perfeito e transparente.
            console.log('ℹ️ Supabase conectado via configuração estável de produção.');
        });
}

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
                var timestamp = parsed.timestamp || Date.now();
                if (Date.now() - timestamp < expiryDays * 24 * 60 * 60 * 1000) {
                    var u = parsed.user || parsed;
                    if (u && (u.id || u.email)) {
                        console.log('📂 Sessão offline carregada:', u.email);
                        return u;
                    }
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
                var { data: sessData } = await window.supabaseClient.auth.getSession();
                if (sessData && sessData.session && sessData.session.user) {
                    this.saveOfflineSession(sessData.session.user);
                    return sessData.session.user;
                }
                var { data: { user } } = await window.supabaseClient.auth.getUser();
                if (user) {
                    this.saveOfflineSession(user);
                    return user;
                }
            } catch (e) {
                console.log('⚠️ Erro ao verificar autenticação online:', e);
            }
        }

        // 2. Verificar sessionStorage ('tonu_user') - sessão da aba atual pós Face ID/biometria
        try {
            var sUser = sessionStorage.getItem('tonu_user');
            if (sUser) {
                var sParsed = JSON.parse(sUser);
                var actualS = sParsed.user || sParsed;
                if (actualS && (actualS.id || actualS.email)) {
                    return actualS;
                }
            }
        } catch (_) {}

        // 3. Carregar sessão offline salva
        var offlineUser = this.loadOfflineSession();
        if (offlineUser) {
            console.log('📶 Usuário autenticado OFFLINE:', offlineUser.email);
            return offlineUser;
        }

        // 4. Biometria configurada (Face ID)
        try {
            var bioInfo = localStorage.getItem('tonu_biometrics_user_info');
            var bioEnabled = localStorage.getItem('tonu_biometrics_enabled') === 'true';
            if (bioEnabled && bioInfo) {
                var bParsed = JSON.parse(bioInfo);
                var bUser = bParsed.user || bParsed;
                if (bUser && (bUser.id || bUser.email)) {
                    return bUser;
                }
            }
        } catch (_) {}

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