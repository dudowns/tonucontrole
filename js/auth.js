// ============================================
// AUTH - Autenticação com validação e segurança (VERSÃO SUPABASE)
// ============================================

console.log('🔐 Auth.js carregado');

// ============================================
// RATE LIMITING PARA LOGIN
// ============================================

const loginAttempts = new Map();
const BLOCK_DURATION = 5 * 60 * 1000; // 5 minutos
const MAX_ATTEMPTS = 5;

function getLoginRateLimit(email) {
    const now = Date.now();
    const attempts = loginAttempts.get(email) || [];

    const recent = attempts.filter(t => now - t < BLOCK_DURATION);
    loginAttempts.set(email, recent);

    const isBlocked = recent.length >= MAX_ATTEMPTS;
    const remaining = Math.max(0, MAX_ATTEMPTS - recent.length);
    const waitTime = isBlocked ? BLOCK_DURATION - (now - recent[0]) : 0;

    return {
        attempts: recent.length,
        remaining: remaining,
        isBlocked: isBlocked,
        waitTime: Math.ceil(waitTime / 1000),
        resetTime: isBlocked ? recent[0] + BLOCK_DURATION : null
    };
}

function recordLoginAttempt(email, success = false) {
    const now = Date.now();
    const attempts = loginAttempts.get(email) || [];

    if (success) {
        loginAttempts.delete(email);
    } else {
        attempts.push(now);
        const recent = attempts.filter(t => now - t < BLOCK_DURATION);
        loginAttempts.set(email, recent);
    }
}

// ============================================
// REFRESH TOKEN AUTOMÁTICO
// ============================================

let refreshInterval = null;

async function refreshSession() {
    if (!window.supabaseClient) return null;
    if (!navigator.onLine) return null;

    try {
        const { data, error } = await window.supabaseClient.auth.refreshSession();
        if (error) {
            if (error.status === 400 || error.status === 401) {
                console.warn('⚠️ Sessão expirada, redirecionando para login');
                if (window.showToast) {
                    window.showToast('Sessão expirada. Faça login novamente.', 'warning');
                }
                if (window.logout) {
                    setTimeout(window.logout, 1500);
                }
                return null;
            }
            throw error;
        }

        if (data.session && data.user) {
            if (window.supabaseOffline) {
                await window.supabaseOffline.saveOfflineSession(data.user);
            }
            if (window.TonuSecureSession) {
                await window.TonuSecureSession.save(data.user);
            }
            console.log('🔄 Sessão renovada automaticamente');
            return data.user;
        }
        return null;
    } catch (error) {
        console.warn('⚠️ Falha ao renovar sessão:', error);
        return null;
    }
}

function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }

    refreshInterval = setInterval(async () => {
        if (navigator.onLine) {
            const user = await refreshSession();
            if (user) {
                console.log('✅ Sessão mantida ativa');
            }
        }
    }, 25 * 60 * 1000);

    console.log('⏰ Refresh automático configurado (a cada 25 min)');
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log('⏹️ Refresh automático parado');
    }
}

// ============================================
// VERIFICAÇÕES DE SEGURANÇA
// ============================================

function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

function isMobile() {
    return /Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

function validateEmail(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

function validatePassword(password) {
    return password && password.length >= 6;
}

function sanitizeString(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/;/g, '')
        .replace(/--/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '');
}

// ============================================
// TABS
// ============================================

function switchTab(tab, event) {
    if (event) event.preventDefault();

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.auth-tab');

    tabs.forEach(t => t.classList.remove('active'));

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        tabs[0].classList.add('active');
        setTimeout(() => document.getElementById('loginEmail')?.focus(), 100);
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        tabs[1].classList.add('active');
        setTimeout(() => document.getElementById('registerName')?.focus(), 100);
    }
}

// ============================================
// LOGIN COM SUPABASE E SEGURANÇA (COM RATE LIMITING)
// ============================================

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');

    if (!email || !password) {
        showToast('Preencha todos os campos!', 'error');
        return;
    }

    if (!validateEmail(email)) {
        showToast('Digite um e-mail válido!', 'error');
        return;
    }

    if (!validatePassword(password)) {
        showToast('A senha deve ter pelo menos 6 caracteres!', 'error');
        return;
    }

    // 🔥 VERIFICAR RATE LIMITING
    const rateLimit = getLoginRateLimit(email);
    if (rateLimit.isBlocked) {
        showToast(`🔒 Muitas tentativas. Aguarde ${rateLimit.waitTime} segundos.`, 'error');
        return;
    }

    const originalText = loginBtn.innerHTML;
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> Entrando...';

    try {
        if (!window.supabaseClient) {
            throw new Error('Cliente Supabase não inicializado');
        }

        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        // 🔥 SUCESSO - LIMPAR TENTATIVAS
        recordLoginAttempt(email, true);

        showToast('Login realizado! 🎉', 'success');

        if (data.user) {
            const name = data.user.user_metadata?.full_name ||
                data.user.email?.split('@')[0] ||
                'Usuário';

            if (window.supabaseOffline) {
                await window.supabaseOffline.saveOfflineSession(data.user);
            }

            if (window.TonuSecureSession) {
                await window.TonuSecureSession.save(data.user);
            }

            await ensureProfile(data.user.id, name);
            await createDefaultCategories(data.user.id);

            if (window.TonuCSRF) {
                window.TonuCSRF.generate();
            }

            sessionStorage.setItem('tonu_user', JSON.stringify(data.user));
        }

        sessionStorage.removeItem('tonu_logout_in_progress');

        // 🔥 INICIAR REFRESH AUTOMÁTICO
        startAutoRefresh();

        setTimeout(() => {
            window.location.href = 'pages/dashboard.html';
        }, 800);

    } catch (error) {
        console.error('❌ Erro no login:', error);

        // 🔥 REGISTRAR TENTATIVA FALHA
        recordLoginAttempt(email, false);

        let msg = error.message || 'Erro ao fazer login';

        if (msg.includes('Invalid login credentials')) {
            msg = 'E-mail ou senha incorretos!';
        } else if (msg.includes('Email not confirmed')) {
            msg = 'Confirme seu e-mail antes de fazer login! Verifique sua caixa de entrada.';
        } else if (msg.includes('network')) {
            msg = 'Erro de conexão. Verifique sua internet.';
        } else if (msg.includes('rate_limit')) {
            msg = 'Muitas tentativas. Aguarde alguns minutos.';
        }

        // 🔥 MOSTRAR TENTATIVAS RESTANTES
        const newRateLimit = getLoginRateLimit(email);
        if (!newRateLimit.isBlocked && newRateLimit.remaining > 0) {
            msg += ` (${newRateLimit.remaining} tentativas restantes)`;
        }

        showToast(msg, 'error');
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalText;
    }
}

// ============================================
// REGISTRO COM SUPABASE E SEGURANÇA
// ============================================

async function handleRegister(event) {
    event.preventDefault();

    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim().toLowerCase();
    const password = document.getElementById('registerPassword').value;
    const registerBtn = document.getElementById('registerBtn');

    if (!name || !email || !password) {
        showToast('Preencha todos os campos!', 'error');
        return;
    }

    if (name.length < 2) {
        showToast('Nome muito curto!', 'error');
        return;
    }

    if (name.length > 100) {
        showToast('Nome muito longo!', 'error');
        return;
    }

    if (!validateEmail(email)) {
        showToast('Digite um e-mail válido!', 'error');
        return;
    }

    if (!validatePassword(password)) {
        showToast('A senha deve ter pelo menos 6 caracteres!', 'error');
        return;
    }

    if (password.length < 8) {
        showToast('Para maior segurança, use pelo menos 8 caracteres.', 'warning');
    }

    const originalText = registerBtn.innerHTML;
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<span class="spinner"></span> Criando...';

    try {
        if (!window.supabaseClient) {
            throw new Error('Cliente Supabase não inicializado');
        }

        const { data, error } = await window.supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: sanitizeString(name)
                }
            }
        });

        if (error) throw error;

        if (data.user) {
            if (window.supabaseOffline && data.session) {
                await window.supabaseOffline.saveOfflineSession(data.user);
            }

            if (window.TonuSecureSession && data.session) {
                await window.TonuSecureSession.save(data.user);
            }

            await ensureProfile(data.user.id, name);
            await createDefaultCategories(data.user.id);

            if (window.TonuCSRF) {
                window.TonuCSRF.generate();
            }
        }

        sessionStorage.removeItem('tonu_logout_in_progress');

        if (data.session) {
            showToast('Conta criada com sucesso! 🎉', 'success');
            // 🔥 INICIAR REFRESH AUTOMÁTICO
            startAutoRefresh();
        } else {
            showToast('Conta criada! Verifique seu e-mail para confirmar 📧', 'success');
        }

        setTimeout(() => {
            if (data.session) {
                window.location.href = 'pages/dashboard.html';
            } else {
                window.location.href = 'index.html';
            }
        }, 1500);

    } catch (error) {
        console.error('❌ Erro no registro:', error);
        let msg = error.message || 'Erro ao criar conta';

        if (msg.includes('already registered')) {
            msg = 'Este e-mail já está cadastrado!';
        } else if (msg.includes('password')) {
            msg = 'A senha deve ter pelo menos 6 caracteres!';
        } else if (msg.includes('network')) {
            msg = 'Erro de conexão. Verifique sua internet.';
        } else if (msg.includes('rate_limit')) {
            msg = 'Muitas tentativas. Aguarde alguns minutos.';
        }

        showToast(msg, 'error');
        registerBtn.disabled = false;
        registerBtn.innerHTML = originalText;
    }
}

// ============================================
// SOCIAL LOGIN (Google, GitHub)
// ============================================

async function socialLogin(provider) {
    const btn = document.getElementById(provider === 'google' ? 'googleBtn' : null);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
    }

    try {
        if (!window.supabaseClient) {
            throw new Error('Cliente Supabase não inicializado');
        }

        const baseUrl = window.getBaseUrl ? window.getBaseUrl() : window.location.origin;
        const redirectUrl = baseUrl + '/pages/dashboard.html';

        const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: redirectUrl,
                queryParams: provider === 'google' ? {
                    access_type: 'offline',
                    prompt: 'select_account'
                } : {}
            }
        });

        if (error) throw error;

        showToast(`Redirecionando para ${provider}...`, 'info');

        sessionStorage.setItem('tonu_social_login', provider);

    } catch (error) {
        console.error(`❌ Erro no login com ${provider}:`, error);
        showToast(`Erro ao conectar com ${provider}: ${error.message}`, 'error');

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-brands fa-${provider}"></i> ${provider.charAt(0).toUpperCase() + provider.slice(1)}`;
        }
    }
}

// ============================================
// RESET PASSWORD COM VALIDAÇÃO
// ============================================

async function resetPassword() {
    const email = prompt('📧 Digite seu e-mail para redefinir a senha:');
    if (!email) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!validateEmail(trimmedEmail)) {
        showToast('Digite um e-mail válido!', 'error');
        return;
    }

    try {
        if (!window.supabaseClient) {
            throw new Error('Cliente Supabase não inicializado');
        }

        const baseUrl = window.getBaseUrl ? window.getBaseUrl() : window.location.origin;

        const { error } = await window.supabaseClient.auth.resetPasswordForEmail(trimmedEmail, {
            redirectTo: baseUrl + '/index.html'
        });

        if (error) throw error;
        showToast('E-mail de recuperação enviado! 📧 Verifique sua caixa de entrada.', 'success');
    } catch (error) {
        console.error('❌ Erro ao resetar senha:', error);
        let msg = error.message || 'Erro ao enviar e-mail de recuperação';

        if (msg.includes('not found')) {
            msg = 'E-mail não encontrado. Verifique se está correto.';
        } else if (msg.includes('rate_limit')) {
            msg = 'Muitas tentativas. Aguarde alguns minutos.';
        }

        showToast(msg, 'error');
    }
}

// ============================================
// GARANTIR PERFIL
// ============================================

async function ensureProfile(userId, fullName) {
    try {
        if (!window.supabaseClient) {
            throw new Error('Cliente Supabase não inicializado');
        }

        const { data: existing, error: checkError } = await window.supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();

        if (existing) return true;

        const { error } = await window.supabaseClient
            .from('profiles')
            .insert([{
                id: userId,
                full_name: sanitizeString(fullName) || 'Usuário',
                currency: 'BRL',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);

        if (error) throw error;
        console.log('✅ Perfil criado!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao criar perfil:', error);
        return false;
    }
}

// ============================================
// CRIAR CATEGORIAS PADRÃO
// ============================================

async function createDefaultCategories(userId) {
    try {
        if (!window.supabaseClient) {
            console.warn('⚠️ Supabase client não disponível');
            return;
        }

        const { data: existing, error: checkError } = await window.supabaseClient
            .from('categories')
            .select('id')
            .eq('user_id', userId)
            .limit(1);

        if (checkError) {
            console.warn('⚠️ Erro ao verificar categorias:', checkError);
            return;
        }

        if (existing && existing.length > 0) {
            console.log('✅ Categorias já existem para este usuário');
            return;
        }

        const defaultCategories = [
            { user_id: userId, name: '🍔 Alimentação', type: 'expense', icon: 'fa-utensils', color: '#FF7675' },
            { user_id: userId, name: '🚗 Transporte', type: 'expense', icon: 'fa-car', color: '#FDCB6E' },
            { user_id: userId, name: '🏠 Moradia', type: 'expense', icon: 'fa-home', color: '#E17055' },
            { user_id: userId, name: '❤️ Saúde', type: 'expense', icon: 'fa-heartbeat', color: '#FF6B6B' },
            { user_id: userId, name: '🎮 Lazer', type: 'expense', icon: 'fa-gamepad', color: '#A29BFE' },
            { user_id: userId, name: '📚 Educação', type: 'expense', icon: 'fa-book', color: '#0984E3' },
            { user_id: userId, name: '📱 Assinaturas', type: 'expense', icon: 'fa-credit-card', color: '#636E72' },
            { user_id: userId, name: '💰 Salário', type: 'income', icon: 'fa-money-bill-wave', color: '#00B894' },
            { user_id: userId, name: '📦 Outros', type: 'expense', icon: 'fa-tag', color: '#B2BEC3' }
        ];

        const { error: insertError } = await window.supabaseClient
            .from('categories')
            .insert(defaultCategories);

        if (insertError) {
            console.warn('⚠️ Erro ao criar categorias:', insertError);
            return;
        }

        console.log('✅ Categorias padrão criadas!');

    } catch (e) {
        console.warn('⚠️ Erro ao criar categorias:', e);
    }
}

// ============================================
// VERIFICAR SESSÃO AO CARREGAR
// ============================================

async function checkAuth() {
    try {
        if (sessionStorage.getItem('tonu_logout_in_progress') === 'true') {
            console.log('🚪 Logout em progresso, ignorando checkAuth');
            return null;
        }

        let user = null;

        if (window.supabaseOffline) {
            user = await window.supabaseOffline.isAuthenticated();
        }

        if (!user && window.supabaseClient) {
            const { data: { user: authUser } } = await window.supabaseClient.auth.getUser();
            user = authUser;
        }

        const path = window.location.pathname;
        const baseUrl = window.getBaseUrl ? window.getBaseUrl() : window.location.origin;

        console.log('📌 Usuário:', user ? 'Logado' : 'Não logado');
        console.log('📌 Path:', path);
        console.log('📌 Base URL:', baseUrl);

        if (user && (path.includes('index.html') || path === '/' || path.endsWith('/'))) {
            console.log('🔀 Redirecionando para dashboard');
            sessionStorage.removeItem('tonu_logout_in_progress');
            window.location.href = baseUrl + '/pages/dashboard.html';
            return user;
        }

        if (!user && path.includes('/pages/')) {
            console.log('🔀 Redirecionando para login');
            sessionStorage.removeItem('tonu_logout_in_progress');
            window.location.href = baseUrl + '/index.html';
            return null;
        }

        if (user && path.includes('/pages/')) {
            // 🔥 INICIAR REFRESH AUTOMÁTICO
            startAutoRefresh();

            setTimeout(() => {
                if (window.loadGlobalUserProfile) {
                    window.loadGlobalUserProfile();
                }
            }, 500);
        }

        return user;

    } catch (error) {
        console.error('❌ Erro na verificação de autenticação:', error);

        if (sessionStorage.getItem('tonu_logout_in_progress') === 'true') {
            return null;
        }

        if (window.supabaseOffline) {
            const offlineUser = await window.supabaseOffline.loadOfflineSession();
            if (offlineUser && window.location.pathname.includes('/pages/')) {
                console.log('📶 Fallback: Usuário offline, permitindo acesso');
                return offlineUser;
            }
        }

        if (window.location.pathname.includes('/pages/')) {
            const baseUrl = window.getBaseUrl ? window.getBaseUrl() : window.location.origin;
            sessionStorage.removeItem('tonu_logout_in_progress');
            window.location.href = baseUrl + '/index.html';
        }

        return null;
    }
}

// ============================================
// RECUPERAR SESSÃO DE SOCIAL LOGIN
// ============================================

async function handleSocialLoginCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const code = urlParams.get('code');

    if (error) {
        showToast('Erro na autenticação com provedor externo.', 'error');
        return;
    }

    if (code) {
        try {
            if (window.supabaseClient) {
                const { data, error: sessionError } = await window.supabaseClient.auth.exchangeCodeForSession(code);
                if (sessionError) throw sessionError;

                if (data.user) {
                    if (window.supabaseOffline) {
                        await window.supabaseOffline.saveOfflineSession(data.user);
                    }
                    if (window.TonuSecureSession) {
                        await window.TonuSecureSession.save(data.user);
                    }
                    showToast('Login social realizado! 🎉', 'success');

                    const name = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Usuário';
                    await ensureProfile(data.user.id, name);
                    await createDefaultCategories(data.user.id);

                    window.history.replaceState({}, document.title, window.location.pathname);

                    sessionStorage.removeItem('tonu_logout_in_progress');

                    // 🔥 INICIAR REFRESH AUTOMÁTICO
                    startAutoRefresh();

                    setTimeout(() => {
                        window.location.href = 'pages/dashboard.html';
                    }, 500);
                }
            }
        } catch (error) {
            console.error('❌ Erro ao processar callback social:', error);
            showToast('Erro ao completar login social.', 'error');
        }
    }
}

// ============================================
// LOGOUT - COM PARADA DO REFRESH
// ============================================

async function logout() {
    // 🔥 PARAR REFRESH AUTOMÁTICO
    stopAutoRefresh();

    if (sessionStorage.getItem('tonu_logout_in_progress') === 'true') {
        console.log('🚪 Logout já em progresso');
        return;
    }

    try {
        console.log('🚪 Iniciando logout...');
        sessionStorage.setItem('tonu_logout_in_progress', 'true');

        if (window.supabaseOffline) {
            try {
                await window.supabaseOffline.logout();
            } catch (e) {
                console.warn('⚠️ Erro no logout offline:', e);
            }
        }

        if (window.supabaseClient && window.supabaseClient.auth) {
            try {
                await window.supabaseClient.auth.signOut();
            } catch (e) {
                console.warn('⚠️ Erro no logout Supabase:', e);
            }
        }

        try {
            localStorage.removeItem('tonu_secure_session_v2');
            localStorage.removeItem('tonu_offline_session');
            localStorage.removeItem('tonu_user');
            localStorage.removeItem('supabase.auth.token');
            sessionStorage.removeItem('tonu_user');
            sessionStorage.removeItem('tonu_session_unlocked');
            sessionStorage.removeItem('tonu_csrf_token');
        } catch (e) {
            console.warn('⚠️ Erro ao limpar storages:', e);
        }

        console.log('✅ Logout concluído, redirecionando...');

        setTimeout(function () {
            sessionStorage.removeItem('tonu_logout_in_progress');
            window.location.href = '../index.html';
        }, 150);

    } catch (error) {
        console.error('❌ Erro ao fazer logout:', error);
        sessionStorage.removeItem('tonu_logout_in_progress');
        window.location.href = '../index.html';
    }
}

// ============================================
// INICIALIZAR AO CARREGAR
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    sessionStorage.removeItem('tonu_logout_in_progress');

    await checkAuth();
    await handleSocialLoginCallback();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('error')) {
        showToast('Erro na autenticação com provedor externo.', 'error');
    }

    if (!navigator.onLine) {
        setTimeout(() => {
            showToast('📶 Você está offline. Dados em cache disponíveis.', 'warning');
        }, 1500);
    }

    console.log('✅ Auth.js configurado com segurança, rate limiting e refresh automático!');
});

// ============================================
// EXPORTAR FUNÇÕES
// ============================================

window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.socialLogin = socialLogin;
window.resetPassword = resetPassword;
window.ensureProfile = ensureProfile;
window.createDefaultCategories = createDefaultCategories;
window.isPWA = isPWA;
window.isMobile = isMobile;
window.validateEmail = validateEmail;
window.validatePassword = validatePassword;
window.sanitizeString = sanitizeString;
window.checkAuth = checkAuth;
window.refreshSession = refreshSession;
window.startAutoRefresh = startAutoRefresh;
window.stopAutoRefresh = stopAutoRefresh;
window.logout = logout;

console.log('✅ Auth.js configurado com segurança, rate limiting e refresh automático!');