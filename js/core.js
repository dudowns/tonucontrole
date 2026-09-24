// ============================================
// TONUCONTROLE - CORE (COM VALIDAÇÃO MELHORADA)
// ============================================

console.log('✅ Core.js carregado');

// ============================================
// 0. CONFIGURAÇÕES GLOBAIS
// ============================================
if (typeof window !== 'undefined') {
    window.TONU_JCP_TAX_RATE = 0.15; // Alíquota oficial de retenção de IR na fonte sobre JCP (15%)
}
if (typeof globalThis !== 'undefined') {
    globalThis.TONU_JCP_TAX_RATE = 0.15;
}
if (typeof global !== 'undefined') {
    global.TONU_JCP_TAX_RATE = 0.15;
}

var resolvedBrapiToken = (typeof window !== 'undefined' && window.__TONU_CONFIG__ && window.__TONU_CONFIG__.brapiToken)
    ? window.__TONU_CONFIG__.brapiToken
    : ((typeof window !== 'undefined' && window.ENV && window.ENV.BRAPI_TOKEN) ? window.ENV.BRAPI_TOKEN : '');

if (!resolvedBrapiToken && typeof console !== 'undefined' && console.warn) {
    console.warn('⚠️ BRAPI_TOKEN não configurado no ambiente (.env). Cotações automáticas da B3 podem ficar limitadas.');
}

window.APP_CONFIG = {
    BRAPI_TOKEN: resolvedBrapiToken,
    VERSION: '2.1.0',
    MAX_AMOUNT: 999999999.99,
    MIN_PASSWORD_LENGTH: 6,
    MAX_DESCRIPTION_LENGTH: 200
};

// ============================================
// 1. HAPTIC FEEDBACK (VIBRAÇÃO TÁTIL PARA AÇÕES CRÍTICAS)
// ============================================
function triggerHaptic(type) {
    try {
        if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
        type = type || 'medium';
        var patterns = {
            light: 20,
            medium: 40,
            heavy: [50, 35, 50],
            success: [35, 45, 35],
            error: [60, 40, 60],
            warning: [40, 30, 40],
            info: 25
        };
        var pattern = patterns[type] !== undefined ? patterns[type] : 35;
        navigator.vibrate(pattern);
    } catch (e) {
        // Fallback seguro se vibrate não for suportado ou for restrito no iframe
    }
}
window.triggerHaptic = triggerHaptic;

// ============================================
// 2. TOAST PREMIUM (COM PROGRESSO, PAUSE NO HOVER & SWIPE TO DISMISS)
// ============================================
function showToast(message, type, actionText, onAction) {
    type = type || 'info';
    var toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast hidden';
        document.body.appendChild(toast);
    }

    // Feedback tátil automático correspondente ao tipo
    triggerHaptic(type);

    var icons = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle'
    };

    // Limpar estados anteriores de transform/opacidade
    toast.style.background = '';
    toast.style.color = '';
    toast.style.transform = '';
    toast.style.opacity = '';
    toast.style.transition = '';
    toast.className = 'toast toast-' + type;

    var iconClass = icons[type] || icons.info;
    var actionHtml = '';
    if (actionText && typeof onAction === 'function') {
        actionHtml = '<button type="button" class="toast-action-btn" id="toastActionBtn">' + actionText + '</button>';
    }

    toast.innerHTML = 
        '<div class="toast-body">' +
            '<i class="fas ' + iconClass + ' toast-icon" aria-hidden="true"></i>' +
            '<span class="toast-text">' + message + '</span>' +
            actionHtml +
            '<button type="button" class="toast-close-btn" aria-label="Fechar notificação" onclick="hideToast()">&times;</button>' +
        '</div>' +
        '<div class="toast-progress-track">' +
            '<div class="toast-progress-bar" id="toastProgressBar" style="width: 100%;"></div>' +
        '</div>';

    if (actionText && typeof onAction === 'function') {
        var actionBtn = document.getElementById('toastActionBtn');
        if (actionBtn) {
            actionBtn.onclick = function() {
                hideToast();
                try { onAction(); } catch(err) { console.error('Erro ao executar ação do toast:', err); }
            };
        }
    }

    // Controle de tempo com pausa (Pause on Hover)
    var TOTAL_DURATION = 3500;
    var remainingTime = TOTAL_DURATION;
    var startTimestamp = Date.now();
    var isPaused = false;

    clearTimeout(toast._timeout);

    function startTimer(duration) {
        clearTimeout(toast._timeout);
        startTimestamp = Date.now();
        toast._timeout = setTimeout(function () {
            hideToast();
        }, duration);
    }

    // Iniciar animação da barra de progresso
    setTimeout(function() {
        var bar = document.getElementById('toastProgressBar');
        if (bar) {
            bar.style.transition = 'width ' + (remainingTime / 1000) + 's linear';
            bar.style.width = '0%';
        }
    }, 40);

    startTimer(remainingTime);

    // ============================================
    // RECURSO 1: PAUSE TOAST ON HOVER
    // ============================================
    function pauseToast() {
        if (isPaused) return;
        isPaused = true;
        clearTimeout(toast._timeout);
        var elapsed = Date.now() - startTimestamp;
        remainingTime = Math.max(600, remainingTime - elapsed);

        var bar = document.getElementById('toastProgressBar');
        if (bar) {
            var currentWidth = window.getComputedStyle(bar).width;
            bar.style.transition = 'none';
            bar.style.width = currentWidth;
        }
    }

    function resumeToast() {
        if (!isPaused || toast.classList.contains('hidden')) return;
        isPaused = false;

        var bar = document.getElementById('toastProgressBar');
        if (bar) {
            bar.style.transition = 'width ' + (remainingTime / 1000) + 's linear';
            bar.style.width = '0%';
        }
        startTimer(remainingTime);
    }

    toast.onmouseenter = pauseToast;
    toast.onmouseleave = resumeToast;

    // ============================================
    // RECURSO 2: SWIPE TO DISMISS NO MOBILE
    // ============================================
    var touchStartX = 0;
    var touchStartY = 0;
    var touchCurrentX = 0;
    var isSwiping = false;

    toast.ontouchstart = function(e) {
        if (!e.touches || e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchCurrentX = touchStartX;
        isSwiping = false;
        pauseToast();
        toast.style.transition = 'none';
    };

    toast.ontouchmove = function(e) {
        if (!e.touches || e.touches.length !== 1) return;
        touchCurrentX = e.touches[0].clientX;
        var deltaX = touchCurrentX - touchStartX;
        var deltaY = e.touches[0].clientY - touchStartY;

        // Ativa o swipe apenas se o movimento for prioritariamente horizontal
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
            isSwiping = true;
            if (e.cancelable) e.preventDefault();
            var opacity = Math.max(0.2, 1 - (Math.abs(deltaX) / 240));
            toast.style.transform = 'translateX(' + deltaX + 'px)';
            toast.style.opacity = String(opacity);
        }
    };

    toast.ontouchend = function(e) {
        if (!isSwiping) {
            resumeToast();
            return;
        }
        var deltaX = touchCurrentX - touchStartX;
        toast.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease';

        // Limiar para descartar (65px)
        if (Math.abs(deltaX) > 65) {
            var direction = deltaX > 0 ? '125%' : '-125%';
            toast.style.transform = 'translateX(' + direction + ')';
            toast.style.opacity = '0';
            triggerHaptic('light');
            setTimeout(function() {
                hideToast();
            }, 220);
        } else {
            // Retorna suavemente à posição original se não atingiu o limiar
            toast.style.transform = '';
            toast.style.opacity = '';
            setTimeout(function() {
                resumeToast();
            }, 220);
        }
        isSwiping = false;
    };

    toast.ontouchcancel = function() {
        toast.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        toast.style.transform = '';
        toast.style.opacity = '';
        resumeToast();
        isSwiping = false;
    };
}

function hideToast() {
    var toast = document.getElementById('toast');
    if (!toast) return;
    clearTimeout(toast._timeout);
    toast.onmouseenter = null;
    toast.onmouseleave = null;
    toast.ontouchstart = null;
    toast.ontouchmove = null;
    toast.ontouchend = null;
    toast.ontouchcancel = null;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px) scale(0.95)';
    setTimeout(function() {
        toast.className = 'toast hidden';
        toast.style.opacity = '';
        toast.style.transform = '';
        toast.style.transition = '';
    }, 220);
}
window.hideToast = hideToast;
window.showToast = showToast;

// ============================================
// 2. FORMATAÇÃO
// ============================================
function formatCurrency(value) {
    if (value === null || value === undefined || value === '') {
        value = 0;
    }
    if (typeof value === 'string') {
        var cleaned = value.replace(/[R$\s]/g, '');
        if (cleaned.includes(',') && cleaned.includes('.')) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (cleaned.includes(',')) {
            cleaned = cleaned.replace(',', '.');
        }
        value = parseFloat(cleaned);
    }
    var num = Number(value);
    if (isNaN(num)) num = 0;
    try {
        var formatted = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
        return formatted.replace(/\u00A0/g, ' ');
    } catch (error) {
        var isNegative = num < 0;
        var parts = Math.abs(num).toFixed(2).split('.');
        var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        var res = 'R$ ' + intPart + ',' + parts[1];
        return isNegative ? '-' + res : res;
    }
}

function formatNumber(value, decimals) {
    if (decimals === undefined || decimals === null) decimals = 2;
    if (value === null || value === undefined || value === '') value = 0;
    var num = Number(value);
    if (isNaN(num)) num = 0;
    try {
        return num.toLocaleString('pt-BR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    } catch (e) {
        return num.toFixed(decimals).replace('.', ',');
    }
}
window.formatNumber = formatNumber;

function formatDate(date, format) {
    format = format || 'short';
    if (!date) return '--/--/----';

    var d = new Date(date);
    if (isNaN(d.getTime())) return '--/--/----';

    if (format === 'short') {
        return d.toLocaleDateString('pt-BR');
    }
    if (format === 'long') {
        return d.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
    if (format === 'month') {
        return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    }
    return d.toLocaleDateString('pt-BR');
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function getDaysBetween(date1, date2) {
    var d1 = new Date(date1);
    var d2 = new Date(date2);
    var diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ============================================
// NAVEGAÇÃO DE MÊS GLOBAL (FALLBACK & DISPATCHER)
// ============================================
function changeMonth(delta) {
    if (typeof window.changeMonthHandler === 'function') {
        return window.changeMonthHandler(delta);
    }
    var evt = new CustomEvent('tonu:changeMonth', { detail: { delta: delta } });
    window.dispatchEvent(evt);
}

function goToCurrentMonth() {
    if (typeof window.goToCurrentMonthHandler === 'function') {
        return window.goToCurrentMonthHandler();
    }
    var evt = new CustomEvent('tonu:goToCurrentMonth');
    window.dispatchEvent(evt);
}

window.changeMonth = changeMonth;
window.goToCurrentMonth = goToCurrentMonth;

// ============================================
// 3. SANITIZAÇÃO E VALIDAÇÃO
// ============================================
function sanitizeString(str) {
    if (!str) return '';
    return String(str)
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/`/g, '&#96;')
        .replace(/=/g, '&#61;')
        .replace(/\/\*/g, '')
        .replace(/\*\//g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '');
}

function stripHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function validateEmail(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

function validatePassword(password) {
    return password && password.length >= 6;
}

function validateAmount(amount) {
    var num = Number(amount);
    return num > 0 && num <= 999999999.99 && !isNaN(num);
}

function validateDate(date) {
    if (!date) return false;
    var d = new Date(date);
    return d instanceof Date && !isNaN(d);
}

function isValidEmail(email) {
    return validateEmail(email);
}

function isValidPassword(password) {
    return validatePassword(password);
}

function validateTransaction(data) {
    var errors = [];

    if (!data.description || data.description.length < 2) {
        errors.push('Descrição deve ter pelo menos 2 caracteres');
    }
    if (data.description && data.description.length > 200) {
        errors.push('Descrição muito longa (máximo 200 caracteres)');
    }
    if (isNaN(data.amount) || data.amount <= 0) {
        errors.push('Valor deve ser maior que zero');
    }
    if (data.amount && data.amount > 999999999.99) {
        errors.push('Valor excede o limite máximo');
    }
    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        errors.push('Data inválida');
    }
    if (data.type && !['income', 'expense'].includes(data.type)) {
        errors.push('Tipo inválido');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function validateBill(data) {
    var errors = [];

    if (!data.description || data.description.length < 2) {
        errors.push('Descrição deve ter pelo menos 2 caracteres');
    }
    if (isNaN(data.amount) || data.amount <= 0) {
        errors.push('Valor deve ser maior que zero');
    }
    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        errors.push('Data inválida');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function validateGoal(data) {
    var errors = [];

    if (!data.title || data.title.length < 2) {
        errors.push('Título deve ter pelo menos 2 caracteres');
    }
    if (data.title && data.title.length > 100) {
        errors.push('Título muito longo (máximo 100 caracteres)');
    }
    if (isNaN(data.target_amount) || data.target_amount <= 0) {
        errors.push('Valor alvo deve ser maior que zero');
    }
    if (data.target_amount && data.target_amount > 999999999.99) {
        errors.push('Valor alvo excede o limite máximo');
    }
    if (data.current_amount && data.current_amount < 0) {
        errors.push('Valor atual não pode ser negativo');
    }
    if (data.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) {
        errors.push('Data limite inválida');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function debounce(fn, delay) {
    delay = delay || 300;
    var timer = null;
    return function () {
        var args = arguments;
        var context = this;
        clearTimeout(timer);
        timer = setTimeout(function () {
            fn.apply(context, args);
        }, delay);
    };
}

function throttle(fn, limit) {
    limit = limit || 300;
    var inThrottle = false;
    return function () {
        var args = arguments;
        var context = this;
        if (!inThrottle) {
            fn.apply(context, args);
            inThrottle = true;
            setTimeout(function () {
                inThrottle = false;
            }, limit);
        }
    };
}

// ============================================
// 4. MONTH DISPLAY
// ============================================
function updateMonthDisplay(elementId, offset) {
    offset = offset || 0;
    var d = new Date();
    d.setMonth(d.getMonth() + offset);
    var months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    var el = document.getElementById(elementId);
    if (el) {
        el.textContent = months[d.getMonth()] + ' ' + d.getFullYear();
    }
    return d;
}

function getMonthName(month) {
    var months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[month] || '';
}

function getLastDayOfMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function formatDateKey(year, month, day) {
    var m = String(month + 1).padStart(2, '0');
    var d = String(day).padStart(2, '0');
    return year + '-' + m + '-' + d;
}

function isTransactionPaid(t) {
    if (!t) return false;
    if (t.paid === false || t.paid === 'false' || t.paid === 0) return false;
    if (t.is_bill && (t.paid !== true && t.paid !== 'true' && t.paid !== 1)) return false;
    return (t.paid === true || t.paid === 'true' || t.paid === 1 || (t.paid === undefined && !t.is_bill));
}

function isTxPaid(t) {
    return isTransactionPaid(t);
}

if (typeof window !== 'undefined') {
    window.isTransactionPaid = isTransactionPaid;
    window.isTxPaid = isTxPaid;
}

// ============================================
// 5. SIDEBAR
// ============================================
function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var main = document.getElementById('mainContent');

    if (!sidebar) return;

    if (sidebar.classList.contains('hidden')) {
        sidebar.classList.remove('hidden');
        if (window.innerWidth <= 768 && overlay) {
            overlay.classList.add('show');
        }
        if (main && window.innerWidth > 768) {
            main.classList.remove('full');
        }
    } else {
        sidebar.classList.add('hidden');
        if (overlay) overlay.classList.remove('show');
        if (main && window.innerWidth > 768) {
            main.classList.add('full');
        }
    }
}

function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var main = document.getElementById('mainContent');

    if (sidebar) sidebar.classList.add('hidden');
    if (overlay) overlay.classList.remove('show');
    if (main && window.innerWidth > 768) {
        main.classList.add('full');
    }
}

// ============================================
// 6. LOGOUT - CORRIGIDO
// ============================================
async function logout() {
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
// 7. RENDER AVATAR
// ============================================
function renderAvatarElement(element, photoUrl, initialText) {
    if (!element) return;
    if (photoUrl) {
        element.innerHTML = `<img src="${photoUrl}" alt="Avatar" class="avatar-img-element" loading="lazy" />`;
        element.style.background = 'transparent';
    } else {
        element.textContent = initialText || 'U';
        element.style.background = '';
    }
}

// ============================================
// 8. CARREGAR PERFIL DO USUÁRIO NA SIDEBAR - CORRIGIDO
// ============================================
async function loadGlobalUserProfile() {
    if (!window.supabaseClient) return;

    try {
        let user = null;

        // Tentar pegar usuário offline primeiro
        if (window.supabaseOffline) {
            user = await window.supabaseOffline.isAuthenticated();
        }

        // Se não tiver offline, tentar via Supabase
        if (!user && window.supabaseClient && window.supabaseClient.auth) {
            try {
                const { data: { user: authUser } } = await window.supabaseClient.auth.getUser();
                user = authUser;
            } catch (e) {
                console.warn('⚠️ Erro ao buscar usuário no Supabase:', e);
            }
        }

        if (!user) {
            console.log('ℹ️ Nenhum usuário logado para carregar perfil');
            return;
        }

        var fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário';
        var email = user.email || '';
        var avatarUrl = localStorage.getItem('tonu_avatar_' + user.id) ||
            user.user_metadata?.avatar_url ||
            null;

        // Tenta buscar perfil na tabela profiles
        try {
            const { data: profile, error } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profile) {
                if (profile.full_name) fullName = profile.full_name;
                if (profile.avatar_url && !avatarUrl) avatarUrl = profile.avatar_url;
            }
        } catch (e) {
            // Perfil pode não existir ainda, tudo bem
        }

        if (avatarUrl) {
            localStorage.setItem('tonu_avatar_' + user.id, avatarUrl);
        }

        var initial = fullName.charAt(0).toUpperCase();

        // ATUALIZA NOME, EMAIL E AVATAR
        var sidebarNameEl = document.getElementById('sidebarUserName');
        var sidebarAvatarEl = document.getElementById('sidebarUserAvatar');
        var sidebarEmailEl = document.getElementById('sidebarUserEmail');

        if (sidebarNameEl) sidebarNameEl.textContent = sanitizeString(fullName);
        if (sidebarAvatarEl) renderAvatarElement(sidebarAvatarEl, avatarUrl, initial);
        if (sidebarEmailEl) sidebarEmailEl.textContent = sanitizeString(email) || 'Configurações';

        var avatarLargeEl = document.getElementById('avatarLarge');
        if (avatarLargeEl) renderAvatarElement(avatarLargeEl, avatarUrl, initial);

        var userNameEl = document.getElementById('userName');
        var userAvatarEl = document.getElementById('userAvatar');
        if (userNameEl) userNameEl.textContent = sanitizeString(fullName.split(' ')[0]);
        if (userAvatarEl) renderAvatarElement(userAvatarEl, avatarUrl, initial);

        console.log('✅ Perfil carregado com sucesso!');

    } catch (e) {
        console.warn('⚠️ Erro ao carregar perfil global:', e);
    }
}

// ============================================
// 9. CACHE DE CATEGORIAS
// ============================================
async function getCachedCategories(userId) {
    try {
        if (!window.tonuSync) return null;
        const db = await window.tonuSync.openDatabase();
        if (!db) return null;

        const tx = db.transaction(['offline_entity_cache'], 'readonly');
        const store = tx.objectStore('offline_entity_cache');
        const req = store.get('categories_' + userId);

        return new Promise((resolve) => {
            req.onsuccess = () => resolve(req.result?.data || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

async function setCachedCategories(userId, categories) {
    try {
        if (!window.tonuSync) return;
        const db = await window.tonuSync.openDatabase();
        if (!db) return;

        const tx = db.transaction(['offline_entity_cache'], 'readwrite');
        const store = tx.objectStore('offline_entity_cache');
        store.put({ key: 'categories_' + userId, data: categories, timestamp: Date.now() });
    } catch (e) {
        console.warn('⚠️ Erro ao cachear categorias:', e);
    }
}

// ============================================
// 10. LOADING
// ============================================
function setLoading(button, loading, text) {
    text = text || 'Carregando...';
    if (!button) return;

    if (loading) {
        button.disabled = true;
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = '<span class="spinner"></span> ' + sanitizeString(text);
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
        }
    }
}

function showLoading(container) {
    if (!container) return;
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;">
            <span class="spinner" style="width:32px;height:32px;border-width:3px;"></span>
            <p style="margin-top:12px;color:#b2bec3;">Carregando...</p>
        </div>
    `;
}

// ============================================
// 11. MOBILE DETECT
// ============================================
function isMobile() {
    return /Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

function isTablet() {
    return /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
}

function isDesktop() {
    return !isMobile() && !isTablet();
}

// ============================================
// 12. CORES PARA GRÁFICOS
// ============================================
// 12. CORES E CONFIGURAÇÃO DE CATEGORIAS (BACKEND)
// ============================================
var BACKEND_CATEGORY_CONFIG = {
    'contas basicas': { color: '#0984E3', icon: 'fa-bolt', name: '⚡ Contas Básicas' },
    'lazer': { color: '#A29BFE', icon: 'fa-gamepad', name: '🎮 Lazer' },
    'saude': { color: '#FF6B6B', icon: 'fa-heartbeat', name: '❤️ Saúde' },
    'educacao': { color: '#0984E3', icon: 'fa-book', name: '📚 Educação' },
    'emprestimos': { color: '#D63031', icon: 'fa-hand-holding-usd', name: '🤝 Empréstimos' },
    'outros': { color: '#B2BEC3', icon: 'fa-tag', name: '📦 Outros' },
    'cartao de credito': { color: '#E17055', icon: 'fa-credit-card', name: '💳 Cartão de Crédito' },
    'moradia': { color: '#E17055', icon: 'fa-home', name: '🏠 Moradia' },
    'comunicacao': { color: '#636E72', icon: 'fa-wifi', name: '📡 Comunicação' },
    'alimentacao': { color: '#FF6B6B', icon: 'fa-utensils', name: '🍔 Alimentação' },
    'transporte': { color: '#FDCB6E', icon: 'fa-car', name: '🚗 Transporte' },
    'salario': { color: '#00B894', icon: 'fa-money-bill-wave', name: '💰 Salário' },
    'investimentos': { color: '#00CEC9', icon: 'fa-chart-line', name: '💼 Investimentos' },
    'bico / extra': { color: '#00B894', icon: 'fa-gift', name: '🛵 Bico / Extra' },
    'bico': { color: '#00B894', icon: 'fa-gift', name: '🛵 Bico / Extra' },
    'extra': { color: '#00B894', icon: 'fa-gift', name: '🛵 Bico / Extra' }
};

function getBackendCategoryStyle(name, cat) {
    if (cat && cat.color && typeof cat.color === 'string' && cat.color.startsWith('#')) {
        return {
            color: cat.color,
            icon: cat.icon || 'fa-tag',
            name: cat.name || name || 'Outros'
        };
    }

    const n = (name || '').toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    if (n.includes('contas') || n.includes('basica') || n.includes('energia') || n.includes('luz') || n.includes('agua') || n.includes('gas') || n.includes('boleto')) {
        return { color: '#0984E3', icon: 'fa-bolt', name: '⚡ Contas Básicas' };
    }
    if (n.includes('lazer') || n.includes('jogo') || n.includes('game') || n.includes('cinema') || n.includes('viagem') || n.includes('passeio') || n.includes('hotel') || n.includes('festa')) {
        return { color: '#A29BFE', icon: 'fa-gamepad', name: '🎮 Lazer' };
    }
    if (n.includes('saude') || n.includes('farmacia') || n.includes('medic') || n.includes('hospital') || n.includes('drogaria') || n.includes('dentista') || n.includes('consulta')) {
        return { color: '#FF6B6B', icon: 'fa-heartbeat', name: '❤️ Saúde' };
    }
    if (n.includes('educa') || n.includes('escola') || n.includes('faculdade') || n.includes('curso') || n.includes('livro') || n.includes('estudo')) {
        return { color: '#0984E3', icon: 'fa-book', name: '📚 Educação' };
    }
    if (n.includes('emprestim') || n.includes('divida') || n.includes('financiamento') || n.includes('parcela')) {
        return { color: '#D63031', icon: 'fa-hand-holding-usd', name: '🤝 Empréstimos' };
    }
    if (n.includes('cartao') || n.includes('credito') || n.includes('fatura') || n.includes('anuidade')) {
        return { color: '#E17055', icon: 'fa-credit-card', name: '💳 Cartão de Crédito' };
    }
    if (n.includes('moradia') || n.includes('casa') || n.includes('aluguel') || n.includes('condominio') || n.includes('iptu')) {
        return { color: '#E17055', icon: 'fa-home', name: '🏠 Moradia' };
    }
    if (n.includes('comunic') || n.includes('wifi') || n.includes('internet') || n.includes('celular') || n.includes('telefone') || n.includes('stream') || n.includes('assinat')) {
        return { color: '#636E72', icon: 'fa-wifi', name: '📡 Comunicação' };
    }
    if (n.includes('aliment') || n.includes('comida') || n.includes('mercado') || n.includes('supermercado') || n.includes('restaurante') || n.includes('ifood') || n.includes('lanche')) {
        return { color: '#FF6B6B', icon: 'fa-utensils', name: '🍔 Alimentação' };
    }
    if (n.includes('transport') || n.includes('uber') || n.includes('combustivel') || n.includes('gasolina') || n.includes('carro') || n.includes('onibus') || n.includes('veiculo')) {
        return { color: '#FDCB6E', icon: 'fa-car', name: '🚗 Transporte' };
    }
    if (n.includes('salar') || n.includes('remuner') || n.includes('provento')) {
        return { color: '#00B894', icon: 'fa-money-bill-wave', name: '💰 Salário' };
    }
    if (n.includes('invest') || n.includes('dividend') || n.includes('rendimento') || n.includes('acao') || n.includes('fii')) {
        return { color: '#00CEC9', icon: 'fa-chart-line', name: '💼 Investimentos' };
    }
    if (n.includes('bico') || n.includes('extra') || n.includes('freela')) {
        return { color: '#00B894', icon: 'fa-gift', name: '🛵 Bico / Extra' };
    }

    return { color: '#B2BEC3', icon: 'fa-tag', name: name || '📦 Outros' };
}

window.getBackendCategoryStyle = getBackendCategoryStyle;
window.BACKEND_CATEGORY_CONFIG = BACKEND_CATEGORY_CONFIG;

var chartColors = [
    '#0984E3', '#A29BFE', '#FF6B6B', '#FDCB6E', '#E17055',
    '#D63031', '#636E72', '#00B894', '#00CEC9', '#B2BEC3'
];

function getChartColors(count) {
    var colors = [];
    for (var i = 0; i < count; i++) {
        colors.push(chartColors[i % chartColors.length]);
    }
    return colors;
}

// ============================================
// 13. CRIAR CATEGORIAS PADRÃO
// ============================================
async function createDefaultCategories(userId) {
    try {
        if (!window.supabaseClient) {
            console.warn('⚠️ Supabase client não disponível');
            return;
        }

        var { data: existing, error: checkError } = await window.supabaseClient
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

        var defaultCategories = [
            { user_id: userId, name: '⚡ Contas Básicas', type: 'expense', icon: 'fa-bolt', color: '#0984E3' },
            { user_id: userId, name: '🎮 Lazer', type: 'expense', icon: 'fa-gamepad', color: '#A29BFE' },
            { user_id: userId, name: '❤️ Saúde', type: 'expense', icon: 'fa-heartbeat', color: '#FF6B6B' },
            { user_id: userId, name: '📚 Educação', type: 'expense', icon: 'fa-book', color: '#0984E3' },
            { user_id: userId, name: '🤝 Empréstimos', type: 'expense', icon: 'fa-hand-holding-usd', color: '#D63031' },
            { user_id: userId, name: '💳 Cartão de Crédito', type: 'expense', icon: 'fa-credit-card', color: '#E17055' },
            { user_id: userId, name: '🏠 Moradia', type: 'expense', icon: 'fa-home', color: '#E17055' },
            { user_id: userId, name: '📡 Comunicação', type: 'expense', icon: 'fa-wifi', color: '#636E72' },
            { user_id: userId, name: '🍔 Alimentação', type: 'expense', icon: 'fa-utensils', color: '#FF6B6B' },
            { user_id: userId, name: '🚗 Transporte', type: 'expense', icon: 'fa-car', color: '#FDCB6E' },
            { user_id: userId, name: '💰 Salário', type: 'income', icon: 'fa-money-bill-wave', color: '#00B894' },
            { user_id: userId, name: '💼 Investimentos', type: 'income', icon: 'fa-chart-line', color: '#00CEC9' },
            { user_id: userId, name: '🛵 Bico / Extra', type: 'income', icon: 'fa-gift', color: '#00B894' },
            { user_id: userId, name: '📦 Outros', type: 'expense', icon: 'fa-tag', color: '#B2BEC3' }
        ];

        var { error: insertError } = await window.supabaseClient
            .from('categories')
            .insert(defaultCategories);

        if (insertError) {
            console.warn('⚠️ Erro ao criar categorias:', insertError);
            return;
        }

        console.log('✅ Categorias padrão criadas!');

        if (window.tonuCache?.categories) {
            window.tonuCache.categories.clear();
        }

    } catch (e) {
        console.warn('⚠️ Erro ao criar categorias:', e);
    }
}

// ============================================
// 14. TEMA ESCURO / CLARO
// ============================================
function initTheme() {
    var savedTheme = localStorage.getItem('tonu_theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.documentElement.classList.add('dark-theme');
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.body.classList.remove('dark-theme');
        document.documentElement.classList.remove('dark-theme');
        document.documentElement.setAttribute('data-theme', 'light');
    }
    updateThemeToggleIcons(savedTheme);
}

function toggleTheme() {
    var isDark = document.body.classList.toggle('dark-theme');
    document.documentElement.classList.toggle('dark-theme', isDark);
    var newTheme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('tonu_theme', newTheme);
    updateThemeToggleIcons(newTheme);

    try {
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
    } catch (e) {}
}

function updateThemeToggleIcons(theme) {
    var btns = document.querySelectorAll('.theme-toggle-btn i');
    btns.forEach(function (icon) {
        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    });
}

// ============================================
// 15. INDICADOR OFFLINE / ONLINE
// ============================================
function initNetworkStatusWatcher() {
    var banner = document.getElementById('offlineBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offlineBanner';
        banner.className = 'hidden';
        banner.setAttribute('role', 'alert');
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9999999;
            background: #fef3c7;
            color: #92400e;
            text-align: center;
            padding: 4px 12px;
            font-size: 11px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.04);
            transition: transform 0.3s ease, opacity 0.3s ease;
            font-family: 'Inter', sans-serif;
            letter-spacing: 0.02em;
            height: 28px;
            transform: translateY(0);
            opacity: 1;
        `;
        banner.innerHTML = `
            <i class="fas fa-wifi-slash" style="font-size: 11px;"></i>
            <span>⚠️ Sem conexão com a internet</span>
        `;
        document.body.prepend(banner);
    }

    var updateStatus = function () {
        if (!navigator.onLine) {
            banner.className = '';
            banner.style.transform = 'translateY(0)';
            banner.style.opacity = '1';
            banner.style.background = '#fef3c7';
            banner.style.color = '#92400e';
            banner.innerHTML = `
                <i class="fas fa-wifi-slash" style="font-size: 11px;"></i>
                <span>⚠️ Sem conexão com a internet</span>
            `;
        } else {
            if (!banner.classList.contains('hidden')) {
                banner.style.background = '#d1fae5';
                banner.style.color = '#065f46';
                banner.innerHTML = `
                    <i class="fas fa-check-circle" style="font-size: 11px;"></i>
                    <span>✅ Conexão restabelecida</span>
                `;
                setTimeout(function () {
                    banner.className = 'hidden';
                    banner.style.transform = 'translateY(-100%)';
                    banner.style.opacity = '0';
                    if (window.tonuSync) window.tonuSync.flushQueue();
                }, 2500);
            }
        }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    if (!navigator.onLine) updateStatus();
}

// ============================================
// 16. VIRTUAL SCROLL ENGINE
// ============================================
class TonuVirtualScroller {
    constructor(options) {
        this.container = options.container || null;
        this.items = options.items || [];
        this.itemHeight = options.itemHeight || 72;
        this.buffer = options.buffer || 6;
        this.renderItem = options.renderItem || function (item) { return '<div>' + JSON.stringify(item) + '</div>'; };
        this.emptyRenderer = options.emptyRenderer || function () { return '<div class="empty-state">Nenhum item</div>'; };
        this.viewport = null;
        this.content = null;
        this.scrollHandler = null;
        this.cache = new Map();
        this.renderedItems = new Set();
    }

    mount(containerElement, items) {
        this.container = containerElement;
        this.items = items || [];
        this.cache.clear();
        this.renderedItems.clear();

        if (!this.container) return;

        if (this.items.length === 0) {
            this.container.innerHTML = this.emptyRenderer();
            return;
        }

        if (this.items.length < 25) {
            this.container.innerHTML = this.items.map(function (item) { return this.renderItem(item); }.bind(this)).join('');
            return;
        }

        this.setupVirtualDOM();
        this.render();
    }

    setupVirtualDOM() {
        this.container.innerHTML = '';
        this.container.style.position = 'relative';
        this.container.style.overflowY = 'auto';
        this.container.style.maxHeight = '650px';
        this.container.style.willChange = 'transform';

        this.content = document.createElement('div');
        this.content.className = 'virtual-scroll-content';
        this.content.style.position = 'relative';
        this.content.style.width = '100%';
        this.content.style.height = (this.items.length * this.itemHeight) + 'px';

        this.viewport = document.createElement('div');
        this.viewport.className = 'virtual-scroll-viewport';
        this.viewport.style.position = 'absolute';
        this.viewport.style.left = '0';
        this.viewport.style.right = '0';
        this.viewport.style.top = '0';
        this.viewport.style.willChange = 'transform';

        this.content.appendChild(this.viewport);
        this.container.appendChild(this.content);

        if (this.scrollHandler) {
            this.container.removeEventListener('scroll', this.scrollHandler);
        }

        var ticking = false;
        this.scrollHandler = function () {
            if (!ticking) {
                window.requestAnimationFrame(function () {
                    this.render();
                    ticking = false;
                }.bind(this));
                ticking = true;
            }
        }.bind(this);

        this.container.addEventListener('scroll', this.scrollHandler, { passive: true });
    }

    render() {
        if (!this.container || !this.viewport || this.items.length === 0) return;

        var scrollTop = this.container.scrollTop;
        var containerHeight = this.container.clientHeight || 500;
        var totalCount = this.items.length;
        this.content.style.height = (totalCount * this.itemHeight) + 'px';

        var startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.buffer);
        var visibleCount = Math.ceil(containerHeight / this.itemHeight);
        var endIndex = Math.min(totalCount, startIndex + visibleCount + (this.buffer * 2));

        var offsetY = startIndex * this.itemHeight;
        this.viewport.style.transform = 'translateY(' + offsetY + 'px)';

        var fragment = document.createDocumentFragment();
        for (var i = startIndex; i < endIndex; i++) {
            if (!this.cache.has(i)) {
                var element = document.createElement('div');
                element.innerHTML = this.renderItem(this.items[i]);
                this.cache.set(i, element.firstChild);
            }
            fragment.appendChild(this.cache.get(i).cloneNode(true));
        }

        this.viewport.innerHTML = '';
        this.viewport.appendChild(fragment);
    }

    updateItems(items) {
        this.items = items;
        this.cache.clear();
        this.renderedItems.clear();
        if (this.container) {
            this.container.innerHTML = '';
            this.mount(this.container, items);
        }
    }

    destroy() {
        if (this.container && this.scrollHandler) {
            this.container.removeEventListener('scroll', this.scrollHandler);
        }
        this.cache.clear();
        this.renderedItems.clear();
    }

    scrollTo(index) {
        if (!this.container) return;
        var scrollTop = index * this.itemHeight;
        this.container.scrollTop = scrollTop;
        this.render();
    }

    getStats() {
        return {
            totalItems: this.items.length,
            cachedItems: this.cache.size,
            visibleItems: this.renderedItems.size,
            itemHeight: this.itemHeight,
            buffer: this.buffer
        };
    }
}

// ============================================
// 17. WEB SHARE TARGET HANDLER
// ============================================
class WebShareTargetHandler {
    constructor() {
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { this.checkIncomingShare(); }.bind(this));
        } else {
            this.checkIncomingShare();
        }
    }

    async checkIncomingShare() {
        var urlParams = new URLSearchParams(window.location.search);
        var isShareTargetReceived = urlParams.get('share_target') === 'received';
        var sharedTitle = urlParams.get('title');
        var sharedText = urlParams.get('text');
        var sharedUrl = urlParams.get('url');

        if (isShareTargetReceived) {
            if (window.tonuSync) {
                var sharedData = await window.tonuSync.getLatestSharedData();
                if (sharedData) {
                    this.openShareModal(sharedData);
                    await window.tonuSync.clearSharedData();
                }
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (sharedTitle || sharedText || sharedUrl) {
            this.openShareModal({
                title: sharedTitle || '',
                text: sharedText || '',
                url: sharedUrl || '',
                file: null
            });
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    parseSharedText(text, title) {
        var fullContent = ((title || '') + ' ' + (text || '')).trim();

        var moneyMatch = fullContent.match(/(?:R\$|\$)?\s?(\d+(?:[.,]\d{2})?)/i);
        var amount = '';
        if (moneyMatch && moneyMatch[1]) {
            amount = moneyMatch[1].replace(',', '.');
        }

        var description = title || text || 'Despesa Compartilhada';
        if (description.length > 50) {
            description = description.substring(0, 47) + '...';
        }

        var tags = fullContent.match(/#[\w-]+/g) || [];

        return {
            amount: amount,
            description: stripHTML(description),
            notes: stripHTML(fullContent),
            tags: tags.map(function (t) { return stripHTML(t); }).join(', ')
        };
    }

    openShareModal(data) {
        this.removeExistingModal();
        var parsed = this.parseSharedText(data.text, data.title);

        var modalHTML = `
            <div class="share-target-modal show" id="shareTargetModal" 
                 style="position:fixed; inset:0; background:rgba(15,23,42,0.8); z-index:999999; 
                        display:flex; align-items:center; justify-content:center; padding:16px; 
                        backdrop-filter:blur(6px);">
                <div style="background:#ffffff; border-radius:18px; max-width:480px; width:100%; 
                            padding:24px; box-shadow:0 20px 40px rgba(0,0,0,0.3); 
                            animation:modalFadeIn 0.3s ease;"
                     role="dialog" aria-label="Item compartilhado">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">
                            <i class="fas fa-share-alt" style="color:#6c5ce7;"></i> Item Compartilhado
                        </h3>
                        <button type="button" onclick="window.webShareTarget.closeModal()" 
                                style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer;"
                                aria-label="Fechar modal">&times;</button>
                    </div>
                    <form id="shareTargetForm" onsubmit="window.webShareTarget.handleSave(event)">
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label style="font-size:12px; font-weight:600; color:#64748b;">Tipo</label>
                                <div style="display:flex; gap:16px; margin-top:4px;">
                                    <label style="font-size:13px; cursor:pointer;">
                                        <input type="radio" name="shareType" value="expense" checked> 🔴 Despesa
                                    </label>
                                    <label style="font-size:13px; cursor:pointer;">
                                        <input type="radio" name="shareType" value="income"> 🟢 Receita
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label style="font-size:12px; font-weight:600; color:#64748b;">Descrição</label>
                                <input type="text" id="shareDesc" class="form-control" 
                                       value="` + parsed.description + `" required 
                                       style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                <div>
                                    <label style="font-size:12px; font-weight:600; color:#64748b;">Valor (R$)</label>
                                    <input type="number" id="shareAmount" step="0.01" min="0.01" 
                                           class="form-control" value="` + parsed.amount + `" required 
                                           style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
                                </div>
                                <div>
                                    <label style="font-size:12px; font-weight:600; color:#64748b;">Data</label>
                                    <input type="date" id="shareDate" class="form-control" 
                                           value="` + new Date().toISOString().split('T')[0] + `" required 
                                           style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
                                </div>
                            </div>
                            <div>
                                <label style="font-size:12px; font-weight:600; color:#64748b;">Tags</label>
                                <input type="text" id="shareTags" class="form-control" 
                                       placeholder="#viagem, #trabalho" value="` + parsed.tags + `"
                                       style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
                            </div>
                            <div>
                                <label style="font-size:12px; font-weight:600; color:#64748b;">Anotações</label>
                                <textarea id="shareNotes" class="form-control" rows="2" 
                                          style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">` + parsed.notes + `</textarea>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                            <button type="button" class="btn btn-outline btn-sm" 
                                    onclick="window.webShareTarget.closeModal()">Descartar</button>
                            <button type="submit" class="btn btn-primary btn-sm">
                                <i class="fas fa-save"></i> Salvar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    async handleSave(e) {
        e.preventDefault();
        var type = document.querySelector('input[name="shareType"]:checked')?.value || 'expense';
        var description = document.getElementById('shareDesc').value.trim();
        var amount = parseFloat(document.getElementById('shareAmount').value);
        var date = document.getElementById('shareDate').value;
        var tags = document.getElementById('shareTags')?.value?.trim() || null;
        var notes = document.getElementById('shareNotes').value.trim();

        if (!description || isNaN(amount) || amount <= 0) {
            if (window.showToast) window.showToast('Preencha os campos obrigatórios.', 'warning');
            return;
        }

        var validation = validateTransaction({
            description: description,
            amount: amount,
            date: date,
            type: type
        });

        if (!validation.valid) {
            if (window.showToast) window.showToast('❌ ' + validation.errors.join('\n'), 'error');
            return;
        }

        try {
            var userId = null;
            if (window.supabaseOffline) {
                var user = await window.supabaseOffline.isAuthenticated();
                if (user) userId = user.id;
            } else if (window.supabaseClient && window.supabaseClient.auth) {
                var { data: { user } } = await window.supabaseClient.auth.getUser();
                if (user) userId = user.id;
            }

            if (!userId) {
                if (window.showToast) window.showToast('Faça login para salvar.', 'warning');
                return;
            }

            var secureData = {
                user_id: userId,
                type: type,
                description: stripHTML(description),
                amount: amount,
                date: date,
                paid: true,
                is_bill: false,
                tags: tags ? stripHTML(tags) : null,
                notes: notes || 'Importado via Web Share'
            };

            // Validação CSRF local sem poluir o payload do banco
            if (window.TonuCSRF) {
                window.TonuCSRF.validate();
            }

            delete secureData._csrf;
            delete secureData._timestamp;

            if (!navigator.onLine) {
                if (window.tonuSync) {
                    await window.tonuSync.enqueue('INSERT_TRANSACTION', secureData);
                    if (window.showToast) window.showToast('Item salvo localmente! 📦', 'success');
                }
            } else {
                const { error } = await window.supabaseClient
                    .from('transactions')
                    .insert([secureData]);
                if (error) throw error;
                if (window.showToast) window.showToast('Item compartilhado salvo com sucesso! 🎉', 'success');
            }

            this.closeModal();

            if (window.loadTransactions) window.loadTransactions();
            else if (window.loadDashboardData) window.loadDashboardData();

        } catch (err) {
            console.error('❌ Erro ao salvar item compartilhado:', err);
            if (window.showToast) window.showToast('Erro ao salvar item compartilhado', 'error');
        }
    }

    closeModal() {
        var modal = document.getElementById('shareTargetModal');
        if (modal) modal.remove();
    }

    removeExistingModal() {
        var existing = document.getElementById('shareTargetModal');
        if (existing) existing.remove();
    }
}

// ============================================
// 18. 🔥 TRANSIÇÕES ENTRE TELAS
// ============================================

function navigateTo(url, delay = 300) {
    document.body.classList.add('page-leaving');

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        mainContent.style.opacity = '0';
        mainContent.style.transform = 'translateY(12px) scale(0.98)';
    }

    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('hidden')) {
        sidebar.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        sidebar.style.transform = 'translateX(-100%)';
    }

    setTimeout(function () {
        window.location.href = url;
    }, delay);
}

function animatePageIn() {
    const mainContent = document.querySelector('.main-content');
    const content = document.querySelector('.content');

    if (mainContent) {
        mainContent.style.opacity = '0';
        mainContent.style.transform = 'translateY(16px) scale(0.98)';
        mainContent.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';

        requestAnimationFrame(function () {
            mainContent.style.opacity = '1';
            mainContent.style.transform = 'translateY(0) scale(1)';
        });
    }

    if (content) {
        content.classList.add('page-transition');
    }
}

function addStaggerToCards(containerSelector, cardSelector, delayBase = 50) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const cards = container.querySelectorAll(cardSelector);
    cards.forEach(function (card, index) {
        card.classList.add('card-stagger');
        card.style.animationDelay = ((index * delayBase) / 1000) + 's';
    });
}

function addStaggerToList(containerSelector, itemSelector, delayBase = 30) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const items = container.querySelectorAll(itemSelector);
    items.forEach(function (item, index) {
        item.classList.add('list-item-stagger');
        item.style.animationDelay = ((index * delayBase) / 1000) + 's';
    });
}

function applyStagger(selector, className = 'card-stagger', delayBase = 50) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(function (el, index) {
        el.classList.add(className);
        el.style.animationDelay = ((index * delayBase) / 1000) + 's';
    });
}

// ============================================
// 19. INICIALIZAR
// ============================================
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', function () {
        initTheme();
        initNetworkStatusWatcher();

        // 🔥 Carregar perfil com delay para evitar erro
        setTimeout(function () {
            loadGlobalUserProfile();
        }, 500);

        setTimeout(animatePageIn, 100);
    });
}

// ============================================
// 20. EXPORTAR PARA O ESCOPO GLOBAL
// ============================================
window.showToast = showToast;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.getToday = getToday;
window.getDaysBetween = getDaysBetween;
window.sanitizeString = sanitizeString;
window.stripHTML = stripHTML;
window.validateEmail = validateEmail;
window.validatePassword = validatePassword;
window.validateAmount = validateAmount;
window.validateDate = validateDate;
window.validateTransaction = validateTransaction;
window.validateBill = validateBill;
window.validateGoal = validateGoal;
window.debounce = debounce;
window.throttle = throttle;
window.updateMonthDisplay = updateMonthDisplay;
window.getMonthName = getMonthName;
window.getLastDayOfMonth = getLastDayOfMonth;
window.formatDateKey = formatDateKey;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.logout = logout;
window.setLoading = setLoading;
window.showLoading = showLoading;
window.isMobile = isMobile;
window.isTablet = isTablet;
window.isDesktop = isDesktop;
window.chartColors = chartColors;
window.getChartColors = getChartColors;
window.renderAvatarElement = renderAvatarElement;
window.loadGlobalUserProfile = loadGlobalUserProfile;
window.createDefaultCategories = createDefaultCategories;
window.initTheme = initTheme;
window.toggleTheme = toggleTheme;
window.getCachedCategories = getCachedCategories;
window.setCachedCategories = setCachedCategories;
window.TonuVirtualScroller = TonuVirtualScroller;
window.webShareTarget = new WebShareTargetHandler();

// ============================================
// LIMPEZA AUTOMÁTICA DE DEMO E CACHES OBSOLETOS
// ============================================
function purgeDemoAndTemporaryStorage(force = false) {
    try {
        const demoKeys = [
            'tonu_is_demo_active',
            'tonucontrole_is_demo_dividends',
            'tonucontrole_dividends_demo',
            'tonu_dividends_demo',
            'tonu_demo_transactions',
            'tonu_demo_data'
        ];
        
        let hasAuth = false;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) || '';
                if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
                    hasAuth = true;
                    break;
                }
            }
        } catch (e) {}

        if (hasAuth || force) {
            demoKeys.forEach(k => {
                if (localStorage.getItem(k) !== null) {
                    localStorage.removeItem(k);
                }
            });
        }
    } catch (e) {
        console.warn('⚠️ Falha ao verificar ou limpar cache demo:', e);
    }
}

// Executar limpeza automática de resíduos demo ao carregar
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => purgeDemoAndTemporaryStorage());
    } else {
        purgeDemoAndTemporaryStorage();
    }
}

window.purgeDemoAndTemporaryStorage = purgeDemoAndTemporaryStorage;
window.navigateTo = navigateTo;
window.animatePageIn = animatePageIn;
window.addStaggerToCards = addStaggerToCards;
window.addStaggerToList = addStaggerToList;
window.applyStagger = applyStagger;

// ============================================
// SKELETON HELPERS (ESTADOS DE CARREGAMENTO)
// ============================================
function renderTableSkeleton(tbodyElement, rows = 5, cols = 6) {
    if (!tbodyElement) return;
    let html = '';
    for (let r = 0; r < rows; r++) {
        html += '<tr class="skeleton-row" role="row">';
        for (let c = 0; c < cols; c++) {
            const width = Math.min(95, Math.max(35, 45 + Math.floor(Math.sin((r + 1) * (c + 2)) * 30 + 20)));
            html += `<td style="padding: 7px 8px; vertical-align: middle;"><div class="skeleton-shimmer" style="width: ${width}%; height: 14px; border-radius: 4px;"></div></td>`;
        }
        html += '</tr>';
    }
    tbodyElement.innerHTML = html;
}
window.renderTableSkeleton = renderTableSkeleton;

// ============================================
// FECHAMENTO UNIVERSAL DE MODAIS (ESC & CLICKS)
// ============================================
function closeAnyActiveModal() {
    let closed = false;

    // Fecha Quick Search se aberto
    const quickOverlay = document.getElementById('quickCmdOverlay');
    if (quickOverlay && quickOverlay.classList.contains('active')) {
        closeQuickSearch();
        closed = true;
    }

    // Procura modais visíveis
    const modalOverlays = document.querySelectorAll('.modal-overlay:not(.hidden), .modal-overlay.active, .modal-overlay.show, .mobile-modal-overlay.active');
    modalOverlays.forEach(overlay => {
        if (overlay.id === 'dividendModal' && window.closeDividendModal) {
            window.closeDividendModal();
            closed = true;
        } else if (overlay.id === 'operationModal' && window.closeOperationModal) {
            window.closeOperationModal();
            closed = true;
        } else if (overlay.id === 'monthlyGoalModal' && window.closeMonthlyGoalModal) {
            window.closeMonthlyGoalModal();
            closed = true;
        } else if (overlay.id === 'billModalOverlay' && window.closeBillModal) {
            window.closeBillModal();
            closed = true;
        } else if (overlay.id === 'allTickersModal' && window.closeAllTickersModal) {
            window.closeAllTickersModal();
            closed = true;
        } else if (overlay.id === 'addValueOverlay' && window.closeAddValue) {
            window.closeAddValue();
            closed = true;
        } else if (overlay.id === 'withdrawOverlay' && window.closeWithdrawModal) {
            window.closeWithdrawModal();
            closed = true;
        } else if (window.closeModal) {
            window.closeModal();
            closed = true;
        } else {
            overlay.classList.remove('active', 'show');
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
            closed = true;
        }
    });

    return closed;
}
window.closeAnyActiveModal = closeAnyActiveModal;

// ============================================
// PALETA DE COMANDOS & NAVEGAÇÃO RÁPIDA (CTRL+K)
// ============================================
const QUICK_COMMANDS = [
    { title: 'Visão Geral / Painel', icon: 'fa-chart-pie', badge: 'Página', action: () => navigateToPage('dashboard.html') },
    { title: 'Transações & Extrato', icon: 'fa-exchange-alt', badge: 'Página', action: () => navigateToPage('transactions.html') },
    { title: 'Contas a Pagar & Lembretes', icon: 'fa-file-invoice-dollar', badge: 'Página', action: () => navigateToPage('bills.html') },
    { title: 'Metas & Sonhos', icon: 'fa-bullseye', badge: 'Página', action: () => navigateToPage('goals.html') },
    { title: 'Investimentos & Proventos', icon: 'fa-chart-line', badge: 'Página', action: () => navigateToPage('investments.html') },
    { title: 'Configurações do Sistema', icon: 'fa-cog', badge: 'Página', action: () => navigateToPage('settings.html') },
    { 
        title: 'Nova Transação', 
        icon: 'fa-plus-circle', 
        badge: 'Ação', 
        action: () => {
            if (window.openModal) {
                window.openModal();
            } else {
                navigateToPage('transactions.html?action=new');
            }
        } 
    },
    { 
        title: 'Registrar Provento', 
        icon: 'fa-hand-holding-usd', 
        badge: 'Ação', 
        action: () => {
            if (window.openDividendModal) {
                window.openDividendModal();
            } else {
                navigateToPage('investments.html?action=dividend');
            }
        } 
    },
    { 
        title: 'Alternar Modo Escuro / Claro', 
        icon: 'fa-adjust', 
        badge: 'Tema', 
        action: () => {
            if (window.toggleTheme) window.toggleTheme();
        } 
    }
];

function navigateToPage(target) {
    const isInsidePages = window.location.pathname.includes('/pages/');
    const url = isInsidePages ? target : 'pages/' + target;
    window.location.href = url;
}

function openQuickSearch() {
    let overlay = document.getElementById('quickCmdOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'quickCmdOverlay';
        overlay.className = 'quick-cmd-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Busca Rápida de Comandos');
        overlay.onclick = function(e) {
            if (e.target === overlay) closeQuickSearch();
        };

        overlay.innerHTML = `
            <div class="quick-cmd-box" onclick="event.stopPropagation()">
                <div class="quick-cmd-header">
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <input type="text" id="quickCmdInput" class="quick-cmd-input" placeholder="Buscar página ou ação rápida..." autocomplete="off" />
                    <span class="quick-cmd-kbd">ESC</span>
                </div>
                <ul class="quick-cmd-list" id="quickCmdList"></ul>
                <div class="quick-cmd-footer">
                    <span>Navegue com as setas <strong style="font-size:10px;">&uarr; &darr;</strong> e pressione <strong style="font-size:10px;">Enter</strong></span>
                    <span>Atalho: <strong>Ctrl + K</strong></span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#quickCmdInput');
        if (input) {
            input.addEventListener('input', () => filterQuickCommands(input.value));
            input.addEventListener('keydown', handleQuickCommandKeys);
        }
    }

    renderQuickCommands(QUICK_COMMANDS);
    overlay.classList.add('active');
    setTimeout(() => {
        const input = document.getElementById('quickCmdInput');
        if (input) {
            input.value = '';
            input.focus();
        }
    }, 50);
}
window.openQuickSearch = openQuickSearch;

function closeQuickSearch() {
    const overlay = document.getElementById('quickCmdOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}
window.closeQuickSearch = closeQuickSearch;

let selectedCmdIndex = 0;
let filteredCommands = [];

function renderQuickCommands(commands) {
    filteredCommands = commands;
    selectedCmdIndex = 0;
    const list = document.getElementById('quickCmdList');
    if (!list) return;

    if (commands.length === 0) {
        list.innerHTML = '<li style="padding: 24px; text-align: center; color: var(--color-text-muted); font-size: 13px;">Nenhum comando encontrado</li>';
        return;
    }

    list.innerHTML = commands.map((cmd, idx) => `
        <li class="quick-cmd-item ${idx === 0 ? 'selected' : ''}" data-index="${idx}" onclick="executeQuickCommand(${idx})">
            <div class="quick-cmd-item-left">
                <span class="quick-cmd-icon"><i class="fas ${cmd.icon}"></i></span>
                <span>${cmd.title}</span>
            </div>
            <span class="quick-cmd-badge">${cmd.badge}</span>
        </li>
    `).join('');
}

function filterQuickCommands(query) {
    const term = (query || '').toLowerCase().trim();
    if (!term) {
        renderQuickCommands(QUICK_COMMANDS);
        return;
    }
    const filtered = QUICK_COMMANDS.filter(c => 
        c.title.toLowerCase().includes(term) || 
        c.badge.toLowerCase().includes(term)
    );
    renderQuickCommands(filtered);
}

function handleQuickCommandKeys(e) {
    const list = document.getElementById('quickCmdList');
    if (!list || filteredCommands.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedCmdIndex = (selectedCmdIndex + 1) % filteredCommands.length;
        updateSelectedCmdItem();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedCmdIndex = (selectedCmdIndex - 1 + filteredCommands.length) % filteredCommands.length;
        updateSelectedCmdItem();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        executeQuickCommand(selectedCmdIndex);
    }
}

function updateSelectedCmdItem() {
    const items = document.querySelectorAll('.quick-cmd-item');
    items.forEach((item, idx) => {
        if (idx === selectedCmdIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function executeQuickCommand(index) {
    const cmd = filteredCommands[index];
    if (cmd && typeof cmd.action === 'function') {
        closeQuickSearch();
        try {
            cmd.action();
        } catch (err) {
            console.error('Erro ao executar comando rápido:', err);
        }
    }
}
window.executeQuickCommand = executeQuickCommand;

// Ouvinte global para teclado
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeAnyActiveModal();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const overlay = document.getElementById('quickCmdOverlay');
        if (overlay && overlay.classList.contains('active')) {
            closeQuickSearch();
        } else {
            openQuickSearch();
        }
    }
});

// Injeta botão de busca rápida no topbar de todas as páginas
function injectQuickSearchButton() {
    const topbarActions = document.querySelector('.topbar-actions');
    if (!topbarActions || document.getElementById('btnQuickSearchTrigger')) return;

    const btn = document.createElement('button');
    btn.id = 'btnQuickSearchTrigger';
    btn.type = 'button';
    btn.className = 'theme-toggle-btn';
    btn.title = 'Busca Rápida e Comandos (Ctrl + K)';
    btn.setAttribute('aria-label', 'Busca rápida');
    btn.onclick = openQuickSearch;
    btn.innerHTML = '<i class="fas fa-search" aria-hidden="true"></i>';

    topbarActions.insertBefore(btn, topbarActions.firstChild);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectQuickSearchButton);
    } else {
        injectQuickSearchButton();
    }
}

console.log('✅ Core.js configurado com transições, busca rápida e animações!');