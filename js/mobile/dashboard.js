// ============================================
// MOBILE DASHBOARD
// ============================================

console.log("📱 Mobile Dashboard carregado");

var formatCurrency = window.formatCurrency;
var formatDate = window.formatDate;
var toggleTheme = window.toggleTheme;
var colorTo15PercentAlpha = window.colorTo15PercentAlpha;

let currentUser = null;
let allTransactions = [];
let categories = [];
let allBills = [];
let allDividends = [];
let allInvestments = [];
let allGoals = [];

window.allDividends = window.allDividends || [];
window.allInvestments = window.allInvestments || [];
window.extraIncome = 0;
window.totalAportes = 0;
window.totalDividends = 0;
let mobileChartInstance = null;
let currentChartMode = 'categories';
let isBalanceHidden = localStorage.getItem('tonu_hide_balance') === 'true';
let currentMonthOffset = 0;
let cachedDashboardEquity = 0;
let isDashboardEquityLoaded = false;
const _cache = { key: null, ts: 0, payload: null };
const CACHE_TTL_MS = 45 * 1000;
const MOBILE_REMOTE_SYNC_TIMEOUT_MS = 5000;
let _mobileLoadSeq = 0;

const DEFAULT_MOBILE_CATEGORIES = [
    { id: 'cat_contas', name: '⚡ Contas Básicas', type: 'expense', icon: 'fa-bolt', color: '#0984E3' },
    { id: 'cat_lazer', name: '🎮 Lazer', type: 'expense', icon: 'fa-gamepad', color: '#8B5CF6' },
    { id: 'cat_saude', name: '❤️ Saúde', type: 'expense', icon: 'fa-heartbeat', color: '#FF6B6B' },
    { id: 'cat_educacao', name: '📚 Educação', type: 'expense', icon: 'fa-book', color: '#0984E3' },
    { id: 'cat_emprestimos', name: '🤝 Empréstimos', type: 'expense', icon: 'fa-hand-holding-usd', color: '#D63031' },
    { id: 'cat_cartao', name: '💳 Cartão de Crédito', type: 'expense', icon: 'fa-credit-card', color: '#E17055' },
    { id: 'cat_moradia', name: '🏠 Moradia', type: 'expense', icon: 'fa-home', color: '#E17055' },
    { id: 'cat_comunicacao', name: '📡 Comunicação', type: 'expense', icon: 'fa-wifi', color: '#636E72' },
    { id: 'cat_alimentacao', name: '🍔 Alimentação', type: 'expense', icon: 'fa-utensils', color: '#FF6B6B' },
    { id: 'cat_transporte', name: '🚗 Transporte', type: 'expense', icon: 'fa-car', color: '#FDCB6E' },
    { id: 'cat_salario', name: '💰 Salário', type: 'income', icon: 'fa-money-bill-wave', color: '#00B894' },
    { id: 'cat_investimentos', name: '💼 Investimentos', type: 'both', icon: 'fa-chart-line', color: '#00CEC9' },
    { id: 'cat_bico', name: '🛵 Bico / Extra', type: 'income', icon: 'fa-gift', color: '#00B894' },
    { id: 'cat_outros', name: '📦 Outros', type: 'expense', icon: 'fa-tag', color: '#B2BEC3' }
];

function withMobileTimeout(promise, ms, fallbackValue) {
    let timerId = null;
    const timeoutPromise = new Promise((resolve) => {
        timerId = setTimeout(() => resolve({ timedOut: true, value: fallbackValue }), ms);
    });
    return Promise.race([
        Promise.resolve(promise).then(
            (value) => ({ timedOut: false, value }),
            (error) => ({ timedOut: false, error, value: fallbackValue })
        ),
        timeoutPromise
    ]).finally(() => {
        if (timerId !== null) clearTimeout(timerId);
    });
}

// ============================================
// NAVEGAÇÃO DE MÊS NO MOBILE
// ============================================
function getSelectedMonthDate() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + currentMonthOffset);
    return d;
}

function updateMobileMonthDisplay() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById("selectedMonth");
    if (!el) return;
    const d = getSelectedMonthDate();
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    el.textContent = `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function changeMonth(delta) {
    currentMonthOffset += Number(delta) || 0;
    updateMobileMonthDisplay();
    loadMobileData({ forceRefresh: true });
}

function goToCurrentMonth() {
    currentMonthOffset = 0;
    updateMobileMonthDisplay();
    loadMobileData({ forceRefresh: true });
}

window.changeMonth = changeMonth;
window.goToCurrentMonth = goToCurrentMonth;
window.changeMonthHandler = changeMonth;
window.goToCurrentMonthHandler = goToCurrentMonth;

// Atualiza o mês imediatamente ao carregar o script (antes mesmo de auth/DB)
try {
    if (typeof document !== 'undefined' && document.readyState !== 'loading') {
        updateMobileMonthDisplay();
    }
} catch (_) {}

// ============================================
// PERFIL, SAUDAÇÃO & CALLBACK OAUTH MOBILE
// ============================================
function hydrateMobileHeaderUser(user) {
    if (!user || typeof document === 'undefined') return;
    const rawName = user.user_metadata?.full_name || user.user_metadata?.name || user.name || user.email?.split("@")[0] || "Usuário";
    const safeName = String(rawName).trim() || "Usuário";

    const greetingEl = document.getElementById("greetingText");
    if (greetingEl) {
        greetingEl.textContent = `Olá, ${safeName} 👋`;
    }

    const avatarEl = document.getElementById("topbarAvatar");
    if (avatarEl) {
        const parts = safeName.split(/\s+/).filter(Boolean);
        const initials = parts.length >= 2
            ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
            : safeName.slice(0, 2).toUpperCase();
        avatarEl.textContent = initials || "U";
    }
}

async function ensureMobileProfileAndDefaults(user) {
    if (!user || !user.id || !window.supabaseClient) return;
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.name || user.email?.split("@")[0] || "Usuário";
    const safeName = typeof sanitizeString === 'function' ? sanitizeString(fullName) : fullName;

    try {
        const { data: existingProfile } = await window.supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

        if (!existingProfile) {
            await window.supabaseClient.from('profiles').insert([{
                id: user.id,
                full_name: safeName || 'Usuário',
                currency: 'BRL',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);
        }
    } catch (_) {}

    try {
        const { data: existingCats, error: catCheckErr } = await window.supabaseClient
            .from('categories')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);

        if (!catCheckErr && (!existingCats || existingCats.length === 0)) {
            const seed = DEFAULT_MOBILE_CATEGORIES.map(c => ({
                user_id: user.id,
                name: c.name,
                type: c.type === 'both' ? 'income' : c.type,
                icon: c.icon,
                color: c.color
            }));
            await window.supabaseClient.from('categories').insert(seed);
        }
    } catch (_) {}
}

function cleanMobileOAuthUrl() {
    try {
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } catch (_) {}
}

async function waitForOAuthHashSession(timeoutMs) {
    const client = window.supabaseClient;
    if (!client?.auth?.onAuthStateChange) return null;

    return new Promise((resolve) => {
        let settled = false;
        let sub = null;
        const finish = (u) => {
            if (settled) return;
            settled = true;
            try { sub?.unsubscribe?.(); } catch (_) {}
            clearTimeout(timer);
            resolve(u || null);
        };
        const timer = setTimeout(() => finish(null), timeoutMs || 2500);
        try {
            const { data } = client.auth.onAuthStateChange((event, session) => {
                if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
                    finish(session.user);
                }
            });
            sub = data?.subscription;
        } catch (_) {
            finish(null);
        }
    });
}

async function resolveMobileOAuthSession() {
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    const urlParams = new URLSearchParams(search);
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

    const oauthError = urlParams.get('error') || hashParams.get('error');
    const oauthCode = urlParams.get('code');
    const hasHashToken = hashParams.has('access_token') || hash.includes('access_token=');
    const hadOAuthParams = Boolean(oauthError || oauthCode || hasHashToken || urlParams.has('state'));

    if (oauthError) {
        cleanMobileOAuthUrl();
    }

    let user = null;

    // 1. Tenta getSession primeiro (processa detectSessionInUrl automaticamente no SDK v2)
    if (window.supabaseClient?.auth?.getSession) {
        const sessRes = await withMobileTimeout(window.supabaseClient.auth.getSession(), 4000, null);
        user = sessRes?.value?.data?.session?.user || null;
    }

    // 2. Se veio ?code= (PKCE) e getSession ainda não resolveu a sessão, troca explicitamente
    if (!user && oauthCode && window.supabaseClient?.auth?.exchangeCodeForSession) {
        try {
            const exRes = await withMobileTimeout(window.supabaseClient.auth.exchangeCodeForSession(oauthCode), 4500, null);
            user = exRes?.value?.data?.user || exRes?.value?.data?.session?.user || null;
        } catch (_) {}
    }

    // 3. Se veio #access_token= no hash, aguarda brevemente o evento SIGNED_IN
    if (!user && hasHashToken) {
        user = await waitForOAuthHashSession(2500);
        if (!user && window.supabaseClient?.auth?.getSession) {
            const retrySess = await withMobileTimeout(window.supabaseClient.auth.getSession(), 2000, null);
            user = retrySess?.value?.data?.session?.user || null;
        }
    }

    // 4. Fluxo padrão de sessão autenticada / offline (com timeout para nunca travar)
    if (!user) {
        if (typeof window.getAuthenticatedUser === 'function') {
            const authRes = await withMobileTimeout(window.getAuthenticatedUser(), 3500, null);
            user = authRes?.value || null;
        } else if (window.supabaseOffline?.isAuthenticated) {
            const offRes = await withMobileTimeout(window.supabaseOffline.isAuthenticated(), 3500, null);
            user = offRes?.value || null;
        }
    }

    if (!user && window.supabaseClient?.auth?.getUser && navigator.onLine !== false) {
        const uRes = await withMobileTimeout(window.supabaseClient.auth.getUser(), 3000, null);
        user = uRes?.value?.data?.user || null;
    }

    if (!user) {
        try {
            const s = sessionStorage.getItem("tonu_user");
            if (s) {
                const p = JSON.parse(s);
                user = p.user || p;
            }
        } catch (_) {}
    }

    if (!user) {
        try {
            const off = localStorage.getItem("tonu_offline_session");
            if (off) {
                const p = JSON.parse(off);
                user = p.user || p;
            }
        } catch (_) {}
    }

    if (!user && oauthError) {
        return { user: null, oauthError, hadOAuthParams };
    }

    if (user) {
        if (hadOAuthParams) {
            cleanMobileOAuthUrl();
        }
        try {
            sessionStorage.removeItem('tonu_logout_in_progress');
            sessionStorage.setItem('tonu_user', JSON.stringify(user));
        } catch (_) {}

        if (window.supabaseOffline?.saveOfflineSession) {
            try { await window.supabaseOffline.saveOfflineSession(user); } catch (_) {}
        }
        if (window.TonuSecureSession?.save) {
            try { await window.TonuSecureSession.save(user); } catch (_) {}
        }
        if (hadOAuthParams) {
            // Garante perfil e categorias padrão em background sem bloquear a renderização
            ensureMobileProfileAndDefaults(user).catch(() => {});
        }
    }

    return { user, oauthError: null, hadOAuthParams };
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
    // Atualiza o mês imediatamente (zero "Carregando..." preso)
    updateMobileMonthDisplay();

    // Tema
    const savedTheme = localStorage.getItem("tonu_theme") || "light";
    if (savedTheme === "dark") {
        document.body.classList.add("dark-theme");
        document.documentElement.setAttribute("data-theme", "dark");
        const icon = document.querySelector("#themeIcon");
        if (icon) icon.classList.replace("fa-moon", "fa-sun");
    }

    // Autenticação + tratamento OAuth mobile
    try {
        const { user, oauthError } = await resolveMobileOAuthSession();

        if (!user) {
            if (oauthError) {
                showMobileToast("Erro na autenticação social. Faça login novamente.", "error");
                setTimeout(() => { window.location.href = "../../index.html"; }, 900);
                return;
            }
            console.warn("⚠️ Nenhum usuário autenticado encontrado no Mobile Dashboard, redirecionando...");
            window.location.href = "../../index.html";
            return;
        }

        currentUser = user;
        console.log("✅ Mobile: Usuário autenticado:", currentUser.email);

        hydrateMobileHeaderUser(currentUser);
        window.TonuPostLoginTransition?.updateUser(currentUser);
        window.TonuPostLoginTransition?.setStage("Sincronizando seu resumo financeiro...");

        // Inicia carregamento progressivo sem bloquear em loadCategories remoto
        loadCategories({ cacheOnly: true }).catch(() => {});
        await loadMobileData();
    } catch (e) {
        console.error("❌ Erro na autenticação mobile:", e);
        window.TonuPostLoginTransition?.complete({ forceImmediate: true });
        window.location.href = "../../index.html";
    }
});

// ============================================
// CARREGAR CATEGORIAS (CACHE-FIRST + TIMEOUT)
// ============================================
function normalizeMobileCategoriesList(list) {
    const out = Array.isArray(list) ? list.slice() : [];
    if (!out.some(c => (c.name && c.name.toLowerCase().includes('invest')) || c.id === 'cat_investimentos')) {
        out.push({ id: 'cat_investimentos', name: '💼 Investimentos', type: 'both', icon: 'fa-chart-line', color: '#00CEC9' });
    }
    return out;
}

async function loadCategories(options = {}) {
    const cacheOnly = !!(options && options.cacheOnly);
    const uid = currentUser?.id;

    // 1. Cache local rápido (IndexedDB / localStorage) ou fallback imediato
    if (categories.length === 0 && uid) {
        let cachedCats = null;
        if (window.tonuSync?.getEntityCache) {
            try {
                const res = await withMobileTimeout(window.tonuSync.getEntityCache(`categories_${uid}`), 400, null);
                if (Array.isArray(res?.value) && res.value.length > 0) cachedCats = res.value;
            } catch (_) {}
        }
        if (!cachedCats) {
            try {
                const raw = localStorage.getItem(`tonu_categories_${uid}`);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) cachedCats = parsed;
                }
            } catch (_) {}
        }
        categories = normalizeMobileCategoriesList(cachedCats || DEFAULT_MOBILE_CATEGORIES);
    } else if (categories.length === 0) {
        categories = normalizeMobileCategoriesList(DEFAULT_MOBILE_CATEGORIES);
    }

    if (cacheOnly || !uid || !window.supabaseClient || navigator.onLine === false) {
        return categories;
    }

    // 2. Atualização remota com timeout seguro
    try {
        const fetchCatsPromise = (async () => {
            try {
                const { data, error } = await supabaseClient
                    .from("categories")
                    .select("*")
                    .or(`user_id.eq.${uid},is_default.eq.true,user_id.is.null`)
                    .order("name");
                if (!error && Array.isArray(data) && data.length > 0) return data;
            } catch (_) {}
            const { data, error } = await supabaseClient
                .from("categories")
                .select("*")
                .eq("user_id", uid);
            if (!error && Array.isArray(data) && data.length > 0) return data;
            return null;
        })();

        const remoteRes = await withMobileTimeout(fetchCatsPromise, 3500, null);
        const loaded = remoteRes?.value;
        if (Array.isArray(loaded) && loaded.length > 0) {
            categories = normalizeMobileCategoriesList(loaded);
            if (window.tonuSync?.setEntityCache) {
                window.tonuSync.setEntityCache(`categories_${uid}`, categories).catch(() => {});
            }
            try {
                localStorage.setItem(`tonu_categories_${uid}`, JSON.stringify(categories));
            } catch (_) {}
        }
        console.log("✅ Categorias carregadas:", categories.length);
    } catch (e) {
        console.error("❌ Erro ao carregar categorias:", e);
        if (categories.length === 0) {
            categories = normalizeMobileCategoriesList(DEFAULT_MOBILE_CATEGORIES);
        }
    }
    return categories;
}

// ============================================
// 📈 CARREGADORES DE PROVENTOS E INVESTIMENTOS (MOBILE)
// ============================================
async function loadDividends() {
    if (!currentUser || !currentUser.id) return [];
    let loaded = [];
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from("dividends")
                .select("*")
                .eq("user_id", currentUser.id)
                .order("date", { ascending: false });
            if (!error && Array.isArray(data)) {
                loaded = data;
            }
        } catch (e) {
            console.warn("⚠️ Erro ao carregar proventos mobile:", e);
        }
    }
    if (loaded.length === 0 && window.tonuSync) {
        try {
            const cachedDivs = await window.tonuSync.getCachedDividends(currentUser.id);
            if (Array.isArray(cachedDivs) && cachedDivs.length > 0) {
                loaded = cachedDivs;
            }
        } catch (_) {}
    }
    if (loaded.length === 0) {
        try {
            const localKeys = [
                `tonucontrole_dividends_${currentUser.id}`,
                `tonu_dividends_${currentUser.id}`,
                'tonucontrole_dividends_demo',
                'tonu_dividends'
            ];
            for (const k of localKeys) {
                const raw = localStorage.getItem(k);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        loaded = parsed;
                        break;
                    }
                }
            }
        } catch (_) {}
    }
    allDividends = loaded;
    window.allDividends = loaded;
    return loaded;
}

async function loadInvestments() {
    if (!currentUser || !currentUser.id) return [];
    let loaded = [];
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from("investments")
                .select("*")
                .eq("user_id", currentUser.id)
                .order("date", { ascending: true });
            if (!error && Array.isArray(data)) {
                loaded = data;
            }
        } catch (e) {
            console.warn("⚠️ Erro ao carregar investimentos mobile:", e);
        }
    }
    if (loaded.length === 0 && window.tonuSync) {
        try {
            const cachedInv = await window.tonuSync.getCachedInvestments(currentUser.id);
            if (Array.isArray(cachedInv) && cachedInv.length > 0) {
                loaded = cachedInv;
            }
        } catch (_) {}
    }
    if (loaded.length === 0) {
        try {
            const localKeys = [
                `tonucontrole_investments_${currentUser.id}`,
                `tonu_investments_${currentUser.id}`,
                'tonucontrole_investments_demo',
                'tonu_investments'
            ];
            for (const k of localKeys) {
                const raw = localStorage.getItem(k);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        loaded = parsed;
                        break;
                    }
                }
            }
        } catch (_) {}
    }
    allInvestments = loaded;
    window.allInvestments = loaded;
    return loaded;
}

window.loadDividends = loadDividends;
window.loadInvestments = loadInvestments;

// ============================================
// 💼 CÁLCULO DO CUSTO DE CUSTÓDIA ATUAL (OPÇÃO A)
// ============================================
function calculateCurrentCustodyCost(investments = []) {
    if (!Array.isArray(investments) || investments.length === 0) return 0;

    const parseVal = (val) => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        let s = String(val).replace(/[R$\s]/gi, '').trim();
        if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
        else if (s.includes(',')) s = s.replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    };

    const sorted = [...investments].sort((a, b) => {
        const da = new Date((a.date || '1970-01-01') + 'T12:00:00').getTime();
        const db = new Date((b.date || '1970-01-01') + 'T12:00:00').getTime();
        if (da !== db) return da - db;
        const typeA = (a.type || '').toLowerCase();
        const typeB = (b.type || '').toLowerCase();
        const prioA = typeA.includes('compra') || typeA.includes('buy') ? 1 : 2;
        const prioB = typeB.includes('compra') || typeB.includes('buy') ? 1 : 2;
        return prioA - prioB;
    });

    const positionsMap = new Map();

    sorted.forEach(item => {
        const ticker = (item.ticker || '').toUpperCase().trim();
        if (!ticker) return;

        if (!positionsMap.has(ticker)) {
            positionsMap.set(ticker, {
                quantity: 0,
                costBasis: 0,
                averageCost: 0
            });
        }

        const pos = positionsMap.get(ticker);
        const qty = parseVal(item.quantity);
        let unit = parseVal(item.unit_price || item.price);
        let total = parseVal(item.total_value || item.amount);
        if (total <= 0 && qty > 0 && unit > 0) total = qty * unit;
        if (unit <= 0 && qty > 0 && total > 0) unit = total / qty;

        const type = (item.type || '').toLowerCase();
        if (type.includes('compra') || type.includes('buy')) {
            pos.costBasis += total;
            pos.quantity += qty;
            pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
        } else if (type.includes('venda') || type.includes('sell')) {
            const avg = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
            const sellQty = Math.min(qty, pos.quantity);
            pos.costBasis = Math.max(0, pos.costBasis - (avg * sellQty));
            pos.quantity = Math.max(0, pos.quantity - sellQty);
            if (pos.quantity <= 0.0000001) {
                pos.quantity = 0;
                pos.costBasis = 0;
                pos.averageCost = 0;
            } else {
                pos.averageCost = pos.costBasis / pos.quantity;
            }
        }
    });

    let totalCustody = 0;
    for (const pos of positionsMap.values()) {
        if (pos.quantity > 0.0000001) {
            const cost = pos.quantity * (pos.averageCost || 0);
            totalCustody += (cost > 0 ? cost : (pos.costBasis > 0 ? pos.costBasis : 0));
        }
    }

    return Math.round(totalCustody * 100) / 100;
}

window.calculateCurrentCustodyCost = calculateCurrentCustodyCost;

// ============================================
// CARREGAR DADOS MOBILE UNIFICADOS (CACHE-FIRST + TIMEOUT 5S)
// ============================================
function renderAllMobileWidgets() {
    renderSummary();
    renderMobileChart();
    renderMobileInsights();
    renderMobileGoals();
    renderCategoryBars();
    renderTransactions();
}

function computeMobileDataFingerprint() {
    const txHead = allTransactions.length > 0 ? `${allTransactions[0]?.id || ''}:${allTransactions[0]?.amount || ''}` : '';
    const txSum = allTransactions.reduce((acc, t) => acc + Math.abs(Number(t?.amount || 0)), 0);
    const billsSum = allBills.reduce((acc, b) => acc + Math.abs(Number(b?.amount || 0)), 0);
    return [
        currentMonthOffset,
        allTransactions.length,
        txHead,
        Math.round(txSum * 100),
        allBills.length,
        Math.round(billsSum * 100),
        allDividends.length,
        allGoals.length,
        allInvestments.length,
        Math.round(Number(cachedDashboardEquity || 0) * 100),
        categories.length
    ].join('|');
}

async function hydrateMobileFromCache(userId, firstDay, lastDay, monthPrefix) {
    const emptyResult = {
        found: false,
        allTransactions: [],
        allBills: [],
        allGoals: [],
        allDividends: [],
        allInvestments: []
    };
    if (!userId) return emptyResult;

    let found = false;
    let cachedTxList = [];
    let cachedBillsList = [];
    let cachedGoalsList = [];
    let cachedDivsList = [];
    let cachedInvList = [];

    if (window.tonuSync) {
        const readCachePromise = Promise.all([
            window.tonuSync.getCachedTransactions(userId).catch(() => []),
            window.tonuSync.getCachedBills(userId).catch(() => []),
            window.tonuSync.getCachedGoals(userId).catch(() => []),
            window.tonuSync.getCachedDividends(userId).catch(() => []),
            window.tonuSync.getCachedInvestments(userId).catch(() => [])
        ]);
        const cacheRes = await withMobileTimeout(readCachePromise, 650, [[], [], [], [], []]);
        const [txRaw, billsRaw, goalsRaw, divsRaw, invRaw] = Array.isArray(cacheRes?.value) ? cacheRes.value : [[], [], [], [], []];

        if (Array.isArray(txRaw) && txRaw.length > 0) {
            cachedTxList = txRaw.filter(t => {
                const dt = String(t?.date || '').substring(0, 10);
                return dt >= firstDay && dt <= lastDay;
            });
            found = true;
        }
        if (Array.isArray(billsRaw) && billsRaw.length > 0) {
            cachedBillsList = billsRaw.filter(b => {
                const dt = String(b?.date || b?.due_date || '').substring(0, 10);
                if (!dt) return true;
                return (dt >= firstDay && dt <= lastDay) || dt.substring(0, 7) === monthPrefix;
            });
            found = true;
        }
        if (Array.isArray(goalsRaw) && goalsRaw.length > 0) {
            cachedGoalsList = goalsRaw;
            found = true;
        }
        if (Array.isArray(divsRaw) && divsRaw.length > 0) {
            cachedDivsList = divsRaw;
            found = true;
        }
        if (Array.isArray(invRaw) && invRaw.length > 0) {
            cachedInvList = invRaw;
            found = true;
        }
    }

    // Migração transparente de legado de localStorage para IndexedDB
    try {
        const legacyMap = [
            ['tonu_transactions_', 'setCachedTransactions', (arr) => {
                if (cachedTxList.length === 0) {
                    cachedTxList = arr.filter(t => {
                        const dt = String(t?.date || '').substring(0, 10);
                        return !dt || (dt >= firstDay && dt <= lastDay);
                    });
                }
            }],
            ['tonu_bills_', 'setCachedBills', (arr) => {
                if (cachedBillsList.length === 0) cachedBillsList = arr;
            }],
            ['tonu_goals_', 'setCachedGoals', (arr) => {
                if (cachedGoalsList.length === 0) cachedGoalsList = arr;
            }],
            ['tonu_dividends_', 'setCachedDividends', (arr) => {
                if (cachedDivsList.length === 0) cachedDivsList = arr;
            }],
            ['tonu_investments_', 'setCachedInvestments', (arr) => {
                if (cachedInvList.length === 0) cachedInvList = arr;
            }]
        ];
        for (const [prefix, setter, assignFn] of legacyMap) {
            const raw = localStorage.getItem(prefix + userId);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (window.tonuSync?.[setter]) {
                        window.tonuSync[setter](userId, parsed).catch(() => {});
                    }
                    assignFn(parsed);
                    found = true;
                }
                localStorage.removeItem(prefix + userId);
            }
        }
    } catch (_) {}

    if (window.TonuDeduplicate && cachedTxList.length > 0) {
        try {
            cachedTxList = window.TonuDeduplicate.deduplicate(cachedTxList, {
                autoCleanRemote: false,
                userId
            }).cleanList;
        } catch (_) {}
    }

    return {
        found,
        allTransactions: cachedTxList,
        allBills: cachedBillsList,
        allGoals: cachedGoalsList,
        allDividends: cachedDivsList,
        allInvestments: cachedInvList
    };
}

function persistCanonicalMobileCache(userId, txList, billsList, goalsList, divsList, invList) {
    if (!userId) return;
    try { localStorage.setItem(`tonu_has_synced_${userId}`, '1'); } catch (_) {}
    if (window.tonuSync) {
        if (txList.length > 0) window.tonuSync.setCachedTransactions(userId, txList).catch(() => {});
        if (billsList.length > 0) window.tonuSync.setCachedBills(userId, billsList).catch(() => {});
        if (goalsList.length > 0) window.tonuSync.setCachedGoals(userId, goalsList).catch(() => {});
        if (divsList.length > 0) window.tonuSync.setCachedDividends(userId, divsList).catch(() => {});
        if (invList.length > 0) window.tonuSync.setCachedInvestments(userId, invList).catch(() => {});
    }
    try {
        localStorage.removeItem('tonu_transactions_' + userId);
        localStorage.removeItem('tonu_bills_' + userId);
        localStorage.removeItem('tonu_goals_' + userId);
        localStorage.removeItem('tonu_dividends_' + userId);
        localStorage.removeItem('tonu_investments_' + userId);
    } catch (_) {}
}

async function fetchRemoteMobileBundle(year, month, firstDay, lastDay) {
    // Atualiza categorias e busca todas as entidades em paralelo
    const catPromise = loadCategories({ cacheOnly: false });

    const txPromise = supabaseClient
        .from("transactions")
        .select("*")
        .eq("user_id", currentUser.id)
        .gte("date", firstDay)
        .lte("date", lastDay)
        .order("date", { ascending: false });

    const billsPromise = (async () => {
        try {
            const { data, error } = await supabaseClient
                .from("transactions")
                .select("*")
                .eq("user_id", currentUser.id)
                .eq("type", "expense")
                .eq("is_bill", true)
                .gte("date", firstDay)
                .lte("date", lastDay);
            if (!error && data && data.length > 0) return { data, error: null };
        } catch (_) {}
        try {
            return await supabaseClient
                .from("bills")
                .select("*")
                .eq("user_id", currentUser.id);
        } catch (e) {
            return { data: [], error: e };
        }
    })();

    const divPromise = loadDividends();
    const goalsPromise = supabaseClient
        .from("goals")
        .select("*")
        .eq("user_id", currentUser.id);
    const invPromise = loadInvestments();

    const [, txRes, billsRes, divData, goalsRes, invData] = await Promise.all([
        catPromise,
        txPromise,
        billsPromise,
        divPromise,
        goalsPromise,
        invPromise
    ]);

    return {
        txRes: txRes || { data: [] },
        billsRes: billsRes || { data: [] },
        divData: Array.isArray(divData) ? divData : [],
        goalsRes: goalsRes || { data: [] },
        invData: Array.isArray(invData) ? invData : []
    };
}

async function applyRemoteBundle(remote, seq, cacheKey, renderedFingerprint) {
    if (seq !== _mobileLoadSeq || !remote) return;

    const { txRes, billsRes, divData, goalsRes, invData } = remote;
    const hadRemoteError = Boolean(txRes?.error && billsRes?.error && goalsRes?.error);

    let nextTx = Array.isArray(txRes?.data) ? txRes.data : allTransactions;
    if (Array.isArray(txRes?.data) && window.TonuDeduplicate) {
        nextTx = window.TonuDeduplicate.deduplicate(nextTx, {
            autoCleanRemote: true,
            userId: currentUser?.id
        }).cleanList;
    }

    const nextBills = Array.isArray(billsRes?.data) ? billsRes.data : allBills;
    let nextGoals = Array.isArray(goalsRes?.data) ? goalsRes.data : allGoals;
    const nextDivs = Array.isArray(divData) ? divData : allDividends;
    const nextInv = Array.isArray(invData) ? invData : allInvestments;

    // Se metas vieram vazias por erro/offline parcial, preserva metas cacheadas
    if ((!nextGoals || nextGoals.length === 0) && currentUser?.id && window.tonuSync) {
        try {
            const cachedGoals = await withMobileTimeout(window.tonuSync.getCachedGoals(currentUser.id), 450, []);
            if (Array.isArray(cachedGoals?.value) && cachedGoals.value.length > 0) {
                nextGoals = cachedGoals.value;
            }
        } catch (_) {}
    }

    if (!hadRemoteError) {
        allTransactions = nextTx;
        allBills = nextBills;
        allGoals = nextGoals;
        allDividends = nextDivs;
        allInvestments = nextInv;
        window.allDividends = allDividends;
        window.allInvestments = allInvestments;

        await withMobileTimeout(loadSyncedPortfolioEquity({ forceRefresh: true }), 2500, cachedDashboardEquity);
        persistCanonicalMobileCache(currentUser?.id, allTransactions, allBills, allGoals, allDividends, allInvestments);

        _cache.key = cacheKey;
        _cache.ts = Date.now();
        _cache.payload = {
            allTransactions,
            allBills,
            allDividends,
            allGoals,
            allInvestments
        };
    }

    if (seq !== _mobileLoadSeq) return;

    setMobileCacheBanner(navigator.onLine === false && renderedFingerprint ? 'cache' : 'hidden');

    const newFingerprint = computeMobileDataFingerprint();
    if (!renderedFingerprint || newFingerprint !== renderedFingerprint) {
        renderAllMobileWidgets();
    }

    loadAIInsights().catch(() => {});
    if (typeof window.checkNotifications === 'function') {
        window.checkNotifications();
    }
}

async function loadMobileData(options = {}) {
    const seq = ++_mobileLoadSeq;
    try {
        updateMobileMonthDisplay();
        const forceRefresh = !!(options && options.forceRefresh);
        const cacheKey = `${currentUser?.id || 'anon'}:${currentMonthOffset}`;
        const now = Date.now();

        if (!forceRefresh && _cache.payload && _cache.key === cacheKey && (now - _cache.ts) < CACHE_TTL_MS) {
            const p = _cache.payload;
            allTransactions = p.allTransactions;
            allBills = p.allBills;
            allDividends = p.allDividends;
            allGoals = p.allGoals;
            allInvestments = p.allInvestments;
            window.allDividends = allDividends;
            window.allInvestments = allInvestments;

            setMobileCacheBanner('hidden');
            await loadSyncedPortfolioEquity({ cacheOnly: true });
            renderAllMobileWidgets();
            window.TonuPostLoginTransition?.complete();
            loadAIInsights().catch(() => {});
            return;
        }

        const targetDate = getSelectedMonthDate();
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, "0");
        const lastDayNum = new Date(year, targetDate.getMonth() + 1, 0).getDate();
        const firstDay = `${year}-${month}-01`;
        const lastDay = `${year}-${month}-${String(lastDayNum).padStart(2, "0")}`;
        const monthPrefix = `${year}-${month}`;

        // 1. RENDERIZAÇÃO PROGRESSIVA (CACHE-FIRST NO INDEXEDDB)
        const cached = await hydrateMobileFromCache(currentUser?.id, firstDay, lastDay, monthPrefix);
        if (seq !== _mobileLoadSeq) return;

        let renderedFingerprint = null;
        const hasPreviousSync = (() => {
            try { return Boolean(currentUser?.id && localStorage.getItem(`tonu_has_synced_${currentUser.id}`)); } catch (_) { return false; }
        })();

        if (cached.found || hasPreviousSync) {
            allTransactions = cached.allTransactions;
            allBills = cached.allBills;
            allGoals = cached.allGoals;
            allDividends = cached.allDividends;
            allInvestments = cached.allInvestments;
            window.allDividends = allDividends;
            window.allInvestments = allInvestments;

            await loadSyncedPortfolioEquity({ cacheOnly: true });
            renderAllMobileWidgets();
            renderedFingerprint = computeMobileDataFingerprint();
            window.TonuPostLoginTransition?.complete();
            loadAIInsights(false).catch(() => {});

            setMobileCacheBanner(navigator.onLine === false ? 'cache' : 'syncing');
        } else {
            setMobileCacheBanner('hidden');
        }

        // Se estiver offline, não tenta aguardar chamadas remotas
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            if (!renderedFingerprint) renderAllMobileWidgets();
            setMobileCacheBanner(cached.found ? 'cache' : 'hidden');
            window.TonuPostLoginTransition?.complete();
            return;
        }

        // 2. SINCRONIZAÇÃO EM BACKGROUND COM TIMEOUT DE SEGURANÇA (5s)
        const remotePromise = fetchRemoteMobileBundle(year, month, firstDay, lastDay);
        const raceResult = await withMobileTimeout(remotePromise, MOBILE_REMOTE_SYNC_TIMEOUT_MS, { __timedOut: true });

        if (seq !== _mobileLoadSeq) return;

        if (raceResult?.timedOut || raceResult?.value?.__timedOut) {
            console.warn("⏱️ Sincronização mobile excedeu 5s; exibindo dados em cache/disponíveis.");
            setMobileCacheBanner(renderedFingerprint ? 'cache' : 'hidden');
            if (!renderedFingerprint) {
                renderAllMobileWidgets();
            }
            window.TonuPostLoginTransition?.complete();
            showMobileToast("Sincronização lenta. Exibindo dados disponíveis...", "warning");

            // Se responder em segundo plano logo depois no mesmo mês, atualiza silenciosamente
            remotePromise.then(async (lateRemote) => {
                if (seq !== _mobileLoadSeq || !lateRemote) return;
                await applyRemoteBundle(lateRemote, seq, cacheKey, computeMobileDataFingerprint());
            }).catch(() => {});
            return;
        }

        if (raceResult?.error || !raceResult?.value) {
            setMobileCacheBanner(renderedFingerprint ? 'cache' : 'hidden');
            if (!renderedFingerprint) {
                renderAllMobileWidgets();
            }
            window.TonuPostLoginTransition?.complete();
            return;
        }

        await applyRemoteBundle(raceResult.value, seq, cacheKey, renderedFingerprint);
        window.TonuPostLoginTransition?.complete();

        console.log("📊 Mobile: Dados unificados prontos:", {
            transacoes: allTransactions.length,
            contas: allBills.length,
            proventos: allDividends.length,
            investimentos: allInvestments.length,
            metas: allGoals.length
        });
    } catch (error) {
        console.error("❌ Erro ao carregar dados mobile:", error);
        setMobileCacheBanner('hidden');
        renderAllMobileWidgets();
        window.TonuPostLoginTransition?.complete();
    }
}

async function syncMobileDashboardNow() {
    try {
        if (window.tonuSync && typeof window.tonuSync.flushQueue === 'function') {
            await withMobileTimeout(window.tonuSync.flushQueue(), 4000, null);
        }
        await loadMobileData({ forceRefresh: true });
        showMobileToast("Dados sincronizados! ☁️", "success");
    } catch (e) {
        console.warn("Erro ao sincronizar dashboard mobile:", e);
        await loadMobileData({ forceRefresh: true });
    }
}

window.loadMobileData = loadMobileData;
window.syncMobileDashboardNow = syncMobileDashboardNow;

function setMobileCacheBanner(mode) {
    const banner = document.getElementById("mobileCacheSyncBanner");
    if (!banner) return;

    if (mode === true || mode === 'cache') {
        banner.className = "mob-sync-status-pill is-visible is-cache";
        banner.innerHTML = '<i class="fas fa-wifi" aria-hidden="true"></i> <span>Exibindo dados em cache — sincronizando...</span>';
    } else if (mode === 'syncing') {
        banner.className = "mob-sync-status-pill is-visible";
        banner.innerHTML = '<i class="fas fa-sync-alt fa-spin" aria-hidden="true"></i> <span>Sincronizando dados em segundo plano...</span>';
    } else {
        banner.className = "mob-sync-status-pill";
        banner.innerHTML = '';
    }
}

function isTxPaid(t) {
    if (!t) return false;
    if (t.paid === false || t.paid === 'false' || t.paid === 0) return false;
    if (t.is_bill && (t.paid !== true && t.paid !== 'true' && t.paid !== 1)) return false;
    return (t.paid === true || t.paid === 'true' || t.paid === 1 || (t.paid === undefined && !t.is_bill));
}

// Alternar visibilidade do saldo
function toggleBalanceVisibility() {
    isBalanceHidden = !isBalanceHidden;
    localStorage.setItem('tonu_hide_balance', isBalanceHidden ? 'true' : 'false');
    if (window.TonuMobileUI && typeof window.TonuMobileUI.applyPrivacyState === 'function') {
        window.TonuMobileUI.applyPrivacyState(isBalanceHidden);
        window.TonuMobileUI.haptic('light');
    }
    renderSummary();
}
window.addEventListener('tonu:privacyChanged', (e) => {
    const nextHidden = Boolean(e?.detail?.hidden);
    if (isBalanceHidden !== nextHidden) {
        isBalanceHidden = nextHidden;
        renderSummary();
    }
});

// ============================================
// RENDER RESUMO HERO + GRID
// ============================================
function renderSummary() {
    let income = 0, expense = 0;
    let paidCount = 0;
    allTransactions.forEach(t => {
        if (!isTxPaid(t)) return;
        paidCount++;
        const amt = Math.abs(Number(t.amount || 0));
        if (isNaN(amt) || amt <= 0) return;
        if (t.type === "income") income += amt;
        else if (t.type === "expense") expense += amt;
    });
    const balance = income - expense;

    // Contas pendentes do mês selecionado
    const selDate = getSelectedMonthDate();
    const currentMonthPrefix = `${selDate.getFullYear()}-${String(selDate.getMonth() + 1).padStart(2, "0")}`;
    const pendingBills = allBills.filter(b => {
        const isPaid = (b.paid === true || b.paid === 'true' || b.paid === 1);
        const billMonth = (b.due_date || '').substring(0, 7);
        return !isPaid && (!billMonth || billMonth === currentMonthPrefix);
    });
    const pendingBillsAmount = pendingBills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);

    // Proventos do mês selecionado (Recebidos vs A Receber)
    const todayISO = new Date().toLocaleDateString('sv');
    let monthPaidDivs = 0;
    let monthPendingDivs = 0;
    let totalFutureDivs = 0;

    allDividends.forEach(d => {
        const val = Number(d.total_value || d.net_value || d.amount || d.total_amount) || 0;
        const dt = (d.payment_date || d.date || '').substring(0, 10);
        const isCurMonth = dt && dt.substring(0, 7) === currentMonthPrefix;

        if (dt > todayISO) {
            totalFutureDivs += val;
            if (isCurMonth) {
                monthPendingDivs += val;
            }
        } else if (isCurMonth) {
            monthPaidDivs += val;
        }
    });

    const displayMonthDivs = monthPaidDivs > 0 ? monthPaidDivs : (monthPendingDivs > 0 ? monthPendingDivs : 0);
    const divValueColor = monthPaidDivs > 0 ? '#4338CA' : (monthPendingDivs > 0 ? '#0284c7' : '#4338CA');

    const mask = (val) => isBalanceHidden ? '••••••' : val;

    const container = document.getElementById("summaryContainer");
    if (!container) return;

    const billsSubText = pendingBills.length > 0
        ? `${pendingBills.length} ${pendingBills.length === 1 ? 'conta aberta' : 'contas abertas'}`
        : 'Tudo em dia';

    const divsSubText = monthPendingDivs > 0
        ? `A receber: ${mask(formatCurrency(monthPendingDivs))}`
        : (totalFutureDivs > 0 ? `Previsto: ${mask(formatCurrency(totalFutureDivs))}` : 'No mês atual');

    container.innerHTML = `
        <!-- HERO CARD FINTECH AURORA -->
        <div class="mobile-hero-balance">
            <div class="mobile-hero-top">
                <span class="label"><i class="fas fa-wallet"></i> Saldo Operacional</span>
                <button type="button" class="eye-toggle-btn" onclick="toggleBalanceVisibility()" title="${isBalanceHidden ? 'Mostrar Saldo' : 'Ocultar Saldo'}" aria-label="Alternar visibilidade do saldo">
                    <i class="fas ${isBalanceHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
                </button>
            </div>
            <div class="mobile-hero-value" id="heroBalanceVal" data-sensitive>
                ${mask(formatCurrency(balance))}
            </div>
            <div class="mobile-hero-footer">
                <div class="mobile-hero-stat">
                    <span class="stat-label"><i class="fas fa-arrow-up" style="color:#4ade80;"></i> Entradas</span>
                    <span class="stat-value income" id="heroIncomeVal" data-sensitive>${mask(formatCurrency(income))}</span>
                </div>
                <div class="mobile-hero-stat">
                    <span class="stat-label"><i class="fas fa-arrow-down" style="color:#fca5a5;"></i> Saídas Pagas</span>
                    <span class="stat-value expense" id="heroExpenseVal" data-sensitive>${mask(formatCurrency(expense))}</span>
                    ${pendingBillsAmount > 0 ? `<span class="hero-pending-note">Falta pagar: <span id="heroPendingNoteVal" data-sensitive>${mask(formatCurrency(pendingBillsAmount))}</span></span>` : ''}
                </div>
            </div>
        </div>

        <!-- GRID DE INDICADORES COMPACTOS -->
        <div class="mobile-grid mobile-grid--compact">
            <a href="bills.html" class="mobile-card mobile-card--compact" aria-label="Contas Pendentes: ${formatCurrency(pendingBillsAmount)}">
                <div class="card-icon bills ${pendingBills.length > 0 ? 'has-pending' : 'all-clear'}">
                    <i class="fas fa-file-invoice-dollar"></i>
                </div>
                <div class="card-info">
                    <div class="card-label">Contas Pendentes</div>
                    <div class="card-value ${pendingBills.length > 0 ? 'is-warning' : 'is-success'}" id="kpiPendingBillsVal" data-sensitive>
                        ${mask(formatCurrency(pendingBillsAmount))}
                    </div>
                    <div class="card-sub-meta">${billsSubText}</div>
                </div>
            </a>
            <a href="investments.html" class="mobile-card mobile-card--compact" aria-label="Proventos do Mês: ${formatCurrency(displayMonthDivs)}">
                <div class="card-icon balance">
                    <i class="fas fa-coins"></i>
                </div>
                <div class="card-info">
                    <div class="card-label">Proventos Mês</div>
                    <div class="card-value" id="kpiMonthDivsVal" data-sensitive style="color: ${divValueColor};">
                        ${mask(formatCurrency(displayMonthDivs))}
                    </div>
                    <div class="card-sub-meta ${monthPendingDivs > 0 || totalFutureDivs > 0 ? 'is-info' : ''}" data-sensitive>${divsSubText}</div>
                </div>
            </a>
        </div>
    `;

    if (!isBalanceHidden && window.TonuMobileUI && typeof window.TonuMobileUI.animateValue === 'function') {
        window.TonuMobileUI.animateValue(document.getElementById('heroBalanceVal'), balance, formatCurrency);
        window.TonuMobileUI.animateValue(document.getElementById('heroIncomeVal'), income, formatCurrency);
        window.TonuMobileUI.animateValue(document.getElementById('heroExpenseVal'), expense, formatCurrency);
        window.TonuMobileUI.animateValue(document.getElementById('heroPendingNoteVal'), pendingBillsAmount, formatCurrency);
        window.TonuMobileUI.animateValue(document.getElementById('kpiPendingBillsVal'), pendingBillsAmount, formatCurrency);
        window.TonuMobileUI.animateValue(document.getElementById('kpiMonthDivsVal'), displayMonthDivs, formatCurrency);
    }
    if (window.TonuMobileUI && typeof window.TonuMobileUI.applyPrivacyState === 'function') {
        window.TonuMobileUI.applyPrivacyState(isBalanceHidden);
    }
}

// ============================================
// RENDER GRÁFICO INTERATIVO MOBILE (CHART.JS)
// ============================================
function setMobileChartMode(mode) {
    currentChartMode = mode;
    renderMobileChart();
}

function renderMobileChart() {
    const container = document.getElementById("mobileChartContainer");
    if (!container) return;

    if (typeof Chart === 'undefined') {
        container.innerHTML = '';
        return;
    }

    // Calcula dados de despesas por categoria
    const expenses = allTransactions.filter(t => t.type === "expense" && isTxPaid(t));
    const catMap = {};
    expenses.forEach(t => {
        let cat = null;
        if (t.category_id && categories && categories.length > 0) {
            cat = categories.find(c => c.id === t.category_id);
        }
        if (!cat && t.categories && typeof t.categories === 'object') {
            cat = t.categories;
        }
        if (!cat && t.category && categories && categories.length > 0) {
            const clean = t.category.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            cat = categories.find(c => {
                const cClean = (c.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                return cClean === clean || cClean.includes(clean) || clean.includes(cClean);
            });
        }

        const normalizeCatKey = (val) => {
            if (!val) return 'outros';
            const clean = String(val)
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
                .trim();
            if (clean.includes('outro') || clean.includes('outra') || clean.includes('sem categoria') || clean === '' || clean === 'diversos' || clean === 'geral') {
                return 'outros';
            }
            return clean;
        };

        const rawName = cat?.name || t.category || (t.description ? t.description.substring(0, 20) : "Outros");
        const normKey = normalizeCatKey(rawName);
        const displayName = normKey === 'outros' ? 'Outros' : rawName;

        const style = (typeof window !== 'undefined' && window.getBackendCategoryStyle)
            ? window.getBackendCategoryStyle(displayName, cat)
            : { color: normKey === 'outros' ? '#94a3b8' : (cat?.color || '#0984E3'), icon: normKey === 'outros' ? 'fa-ellipsis-h' : (cat?.icon || 'fa-tag'), name: displayName };

        const amt = Math.abs(Number(t.amount || 0));
        if (isNaN(amt) || amt <= 0) return;

        if (!catMap[normKey]) {
            catMap[normKey] = {
                id: normKey,
                name: displayName,
                icon: normKey === 'outros' ? 'fa-ellipsis-h' : style.icon,
                color: normKey === 'outros' ? '#94a3b8' : style.color,
                amount: 0
            };
        }
        catMap[normKey].amount += amt;
    });

    // Todas as categorias unificadas por nome normalizado
    const allCategories = Object.values(catMap).sort((a, b) => b.amount - a.amount);
    const totalExpensesAmount = allCategories.reduce((sum, item) => sum + item.amount, 0);

    // OPÇÃO A: Se até 8 categorias, mostra TODAS no gráfico sem esconder cauda em Outros
    let sorted = [];
    if (allCategories.length <= 8) {
        sorted = [...allCategories];
    } else {
        // Se houver mais de 8 categorias, top 8 + cauda em Outros
        const regularCategories = allCategories.filter(item => item.id !== 'outros');
        const existingOutros = allCategories.find(item => item.id === 'outros');
        const top8 = regularCategories.slice(0, 8);
        const tail = regularCategories.slice(8);
        const tailAmount = tail.reduce((sum, item) => sum + item.amount, 0);
        const combinedOutrosTotal = (existingOutros ? existingOutros.amount : 0) + tailAmount;

        sorted = [...top8];
        if (combinedOutrosTotal > 0) {
            sorted.push({
                id: 'outros',
                name: 'Outros',
                icon: 'fa-ellipsis-h',
                color: '#94a3b8',
                amount: combinedOutrosTotal
            });
        }
    }

    // Gera lista de categorias integrada abaixo do gráfico
    let categoriesHtml = "";
    if (currentChartMode === 'categories' && sorted.length > 0) {
        categoriesHtml = `
            <div class="mobile-chart-categories">
                ${sorted.map(item => {
                    const pct = totalExpensesAmount > 0 ? Math.round((item.amount / totalExpensesAmount) * 100) : 0;
                    const rawNameStr = String(item.name || '');
                    // Remove all emoji characters so only the clean text remains beside FontAwesome icon
                    const cleanedName = rawNameStr.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '').trim() || rawNameStr;
                    const safeName = typeof sanitizeString === 'function' ? sanitizeString(cleanedName) : cleanedName;
                    const hasIcon = !!item.icon;
                    return `
                        <div class="mobile-cat-row">
                            <div class="cat-row-top">
                                <span class="cat-row-name">
                                    ${hasIcon ? `<i class="fas ${item.icon}" style="color:${item.color}; font-size:12px; width:14px; text-align:center; margin-right:4px;"></i>` : `<span class="cat-dot" style="background:${item.color};"></span>`}
                                    ${safeName}
                                </span>
                                <span class="cat-row-amount">
                                    <strong>${formatCurrency(item.amount)}</strong>
                                    <small>(${pct}%)</small>
                                </span>
                            </div>
                            <div class="cat-progress-track">
                                <div class="cat-progress-fill" style="width: ${pct}%; background: ${item.color};"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    container.innerHTML = `
        <div class="mobile-chart-card">
            <div class="mobile-chart-header">
                <div class="mobile-chart-title">
                    <i class="fas fa-chart-pie" style="color:#4338CA;"></i> Visão de Gastos
                </div>
                <div class="mobile-chart-toggle">
                    <button class="mobile-chart-btn ${currentChartMode === 'categories' ? 'active' : ''}" onclick="setMobileChartMode('categories')">
                        Categorias
                    </button>
                    <button class="mobile-chart-btn ${currentChartMode === 'flow' ? 'active' : ''}" onclick="setMobileChartMode('flow')">
                        Fluxo
                    </button>
                </div>
            </div>
            <div class="mobile-chart-container" style="position:relative; height: 215px; margin-bottom: 8px;">
                <canvas id="mobileChartCanvas"></canvas>
                ${currentChartMode === 'categories' && sorted.length > 0 ? `
                    <div class="chart-center-total">
                        <span class="center-label">Total Gasto</span>
                        <span class="center-value" id="mobileDonutCenterVal" data-sensitive>${isBalanceHidden ? '••••••' : formatCurrency(totalExpensesAmount)}</span>
                    </div>
                ` : ''}
            </div>
            ${categoriesHtml}
        </div>
    `;

    if (currentChartMode === 'categories' && sorted.length > 0 && !isBalanceHidden && window.TonuMobileUI && typeof window.TonuMobileUI.animateValue === 'function') {
        window.TonuMobileUI.animateValue(document.getElementById('mobileDonutCenterVal'), totalExpensesAmount, formatCurrency);
    }

    const canvas = document.getElementById("mobileChartCanvas");
    if (!canvas) return;

    if (mobileChartInstance) {
        mobileChartInstance.destroy();
        mobileChartInstance = null;
    }

    const ctx = canvas.getContext("2d");

    if (currentChartMode === 'categories') {
        if (sorted.length === 0) {
            ctx.font = "12px Inter, sans-serif";
            ctx.fillStyle = "#94a3b8";
            ctx.textAlign = "center";
            ctx.fillText("Nenhuma despesa para exibir", canvas.width / 2, 80);
            return;
        }

        mobileChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sorted.map(s => {
                    const rName = String(s.name || '');
                    return rName.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '').trim() || rName;
                }),
                datasets: [{
                    data: sorted.map(s => s.amount),
                    backgroundColor: sorted.map(s => s.color),
                    borderWidth: 2,
                    borderColor: document.body.classList.contains('dark-theme') ? '#1e293b' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${formatCurrency(context.parsed)}`;
                            }
                        }
                    }
                },
                cutout: '72%'
            }
        });
    } else {
        // Fluxo: Entradas vs Saídas
        let inc = 0, exp = 0;
        allTransactions.forEach(t => {
            if (!isTxPaid(t)) return;
            const amt = Math.abs(Number(t.amount || 0));
            if (isNaN(amt) || amt <= 0) return;
            if (t.type === 'income') inc += amt;
            else if (t.type === 'expense') exp += amt;
        });

        mobileChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Entradas', 'Saídas', 'Líquido'],
                datasets: [{
                    data: [inc, exp, Math.max(0, inc - exp)],
                    backgroundColor: ['#10B981', '#EF4444', '#4338CA'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                    axis: 'x'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: 9 },
                            callback: function(v) {
                                return 'R$ ' + v;
                            }
                        }
                    },
                    x: {
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });
    }
}

// ============================================
// RENDER DIAGNÓSTICO 360º MOBILE
// ============================================
function renderMobileInsights() {
    const container = document.getElementById("mobileInsightsContainer");
    if (!container) return;

    let income = 0, expense = 0;
    const catExpenses = {};
    let extraIncome = 0;
    let extraIncomeCount = 0;
    let loansPaid = 0;

    allTransactions.forEach(t => {
        if (!isTxPaid(t)) return;
        const amt = Number(t.amount) || 0;
        const desc = (t.description || '').toLowerCase();
        const catObj = categories.find(c => c.id === t.category_id);
        const catName = (catObj ? catObj.name : (t.category || '')).toLowerCase();

        if (t.type === "income") {
            income += amt;
            if (
                catName.includes('bico') ||
                catName.includes('extra') ||
                catName.includes('freela') ||
                catName.includes('bonificação') ||
                catName.includes('bonificacao') ||
                desc.includes('bico') ||
                desc.includes('extra') ||
                desc.includes('freela') ||
                desc.includes('uber') ||
                desc.includes('99') ||
                desc.includes('ifood') ||
                desc.includes('comissão') ||
                desc.includes('comissao')
            ) {
                extraIncome += amt;
                extraIncomeCount++;
            }
        } else if (t.type === "expense") {
            expense += amt;
            const cid = t.category_id || "outros";
            catExpenses[cid] = (catExpenses[cid] || 0) + amt;

            if (
                catName.includes('empréstimo') ||
                catName.includes('emprestimo') ||
                catName.includes('financiamento') ||
                catName.includes('dívida') ||
                catName.includes('divida') ||
                desc.includes('empréstimo') ||
                desc.includes('emprestimo') ||
                desc.includes('financiamento')
            ) {
                loansPaid += amt;
            }
        }
    });

    window.extraIncome = extraIncome;
    const savings = income - expense;
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;
    const extraIncomePercent = income > 0 ? Math.round((extraIncome / income) * 100) : 0;

    // Maior Categoria
    let topCatName = "Nenhum gasto";
    let topCatAmount = 0;
    let topCatPercent = 0;

    const sortedCats = Object.entries(catExpenses).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length > 0) {
        const top = sortedCats[0];
        topCatAmount = top[1];
        topCatPercent = expense > 0 ? Math.round((top[1] / expense) * 100) : 0;
        const found = categories.find(c => c.id === top[0]);
        topCatName = found ? found.name : "Outros";
    }

    // Contas do Mês
    const today = new Date();
    const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    // 1) Transações com flag is_bill
    let monthBills = allTransactions.filter(t => 
        t.type === "expense" && 
        (t.is_bill === true || t.is_bill === 'true' || t.is_bill === 1)
    );

    // 2) Se não houver com is_bill, verificar na lista allBills carregada
    if (monthBills.length === 0 && Array.isArray(allBills) && allBills.length > 0) {
        monthBills = allBills.filter(b => (b.date || b.due_date || '').substring(0, 7) === currentMonthPrefix);
    }

    // 3) Se ainda não houver marcadas como conta, usar as despesas gerais do mês como contas correntes
    if (monthBills.length === 0) {
        monthBills = allTransactions.filter(t => t.type === "expense");
    }

    const paidBills = monthBills.filter(b => isTxPaid(b));
    const pendingBills = monthBills.filter(b => !isTxPaid(b));
    const pendingBillsAmount = pendingBills.reduce((a, b) => a + (Number(b.amount) || 0), 0);

    // Aportes & Investimentos (Custo de Custódia Atual - Opção A)
    let totalAportes = calculateCurrentCustodyCost(window.allInvestments || allInvestments);
    const mobUid = currentUser?.id || 'demo';
    const mobSavedInvested = parseFloat(localStorage.getItem('tonu_total_invested_' + mobUid) || '0');
    if (totalAportes === 0 && mobSavedInvested > 0) {
        totalAportes = mobSavedInvested;
    }
    window.totalAportes = totalAportes;

    // Proventos Recebidos no Mês
    const monthDivs = (window.allDividends || allDividends || []).filter(d => (d.payment_date || d.date || '').substring(0, 7) === currentMonthPrefix);
    const totalDividends = monthDivs.reduce((a, d) => a + (Number(d.total_value || d.net_value || d.amount || d.total_amount) || (Number(d.unit_value || 0) * Number(d.quantity || 0))), 0);
    const totalDivs = totalDividends;
    window.totalDividends = totalDividends;

    // Badge Poupança
    let rateClass = "info";
    let rateLabel = `${savingsRate}% Guardado`;
    if (savingsRate >= 20) {
        rateClass = "success";
        rateLabel = `${savingsRate}% Excelente`;
    } else if (savingsRate > 0) {
        rateClass = "warning";
        rateLabel = `${savingsRate}% Regular`;
    } else {
        rateClass = "danger";
        rateLabel = `${savingsRate}% Déficit`;
    }

    // ============================================
    // CÁLCULO DO SCORE 360º MOBILE (0 A 100)
    // ============================================
    const safeFreeCashMob = income - (expense + pendingBillsAmount);
    const todayStrMob = today.toISOString().split('T')[0];
    const overdueBillsMob = pendingBills.filter(b => {
        const d = (b.date || b.due_date || '').substring(0, 10);
        return d && d < todayStrMob;
    });

    let nearestGoalMob = null;
    let highestProgMob = -1;
    (allGoals || []).filter(g => !g.completed).forEach(g => {
        const cur = Number(g.current_amount || 0);
        const tgt = Number(g.target_amount || 0);
        if (tgt > 0) {
            const pct = (cur / tgt) * 100;
            if (pct > highestProgMob) {
                highestProgMob = pct;
                nearestGoalMob = { title: g.title, pct: Math.round(pct), current: cur, target: tgt };
            }
        }
    });

    let budgetAlertMob = null;
    if (window.TonuBudget && currentUser) {
        try {
            const progress = window.TonuBudget.calculateCategoryProgress(currentUser.id, allTransactions, categories || []);
            const exceeded = progress.filter(b => b.isExceeded);
            if (exceeded.length > 0) {
                budgetAlertMob = { type: 'danger', text: `${exceeded[0].name} estourou o teto` };
            }
        } catch (_) {}
    }

    const mobilePillars = [];
    // Pilar 1: Equilíbrio (30%)
    if (income > 0) {
        let eqScore = 0;
        if (savingsRate >= 20) eqScore = 100;
        else if (savingsRate > 0) eqScore = Math.round((savingsRate / 20) * 100);
        else if (savingsRate >= -10) eqScore = 25;
        mobilePillars.push({ weight: 30, score: eqScore });
    }
    // Pilar 2: Pontualidade & Contas (30%)
    if (monthBills.length > 0) {
        let pScore = 0;
        if (overdueBillsMob.length > 0) pScore = Math.max(0, 100 - (overdueBillsMob.length * 35));
        else if (pendingBills.length === 0) pScore = 100;
        else if (safeFreeCashMob >= 0) pScore = 90;
        else pScore = 60;
        mobilePillars.push({ weight: 30, score: pScore });
    }
    // Pilar 3: Endividamento (20%)
    if (income > 0) {
        const debtPct = (loansPaid / income) * 100;
        let dScore = 100;
        if (debtPct > 30) dScore = Math.max(10, Math.round(50 - (debtPct - 30) * 2));
        else if (debtPct > 15) dScore = 65;
        else if (debtPct > 0) dScore = 85;
        mobilePillars.push({ weight: 20, score: dScore });
    }
    // Pilar 4: Futuros & Metas / Proventos (20%)
    let futScoreMobile = 0;
    let futActiveMobile = false;
    if (totalDividends > 0 || totalAportes > 0) { futScoreMobile += 50; futActiveMobile = true; }
    if (nearestGoalMob && nearestGoalMob.pct > 0) { futScoreMobile += 50; futActiveMobile = true; }
    if (futActiveMobile) mobilePillars.push({ weight: 20, score: Math.min(100, futScoreMobile) });

    const totalWeightMob = mobilePillars.reduce((a, b) => a + b.weight, 0);
    const finalScoreMob = totalWeightMob > 0 
        ? Math.round(mobilePillars.reduce((a, b) => a + (b.score * b.weight), 0) / totalWeightMob)
        : 70;

    let mobBadge = { label: 'Bom', color: '#3B82F6', toneClass: 'info' };
    if (finalScoreMob >= 80) mobBadge = { label: 'Excelente', color: '#10B981', toneClass: 'success' };
    else if (finalScoreMob < 40) mobBadge = { label: 'Atenção', color: '#EF4444', toneClass: 'danger' };
    else if (finalScoreMob < 60) mobBadge = { label: 'Regular', color: '#F59E0B', toneClass: 'warning' };

    const circMob = 2 * Math.PI * 30;
    const offsetMob = circMob - (finalScoreMob / 100) * circMob;

    // CHECKLIST RÁPIDO MOBILE ("O QUE FAZER HOJE?")
    const mobActionCards = [];
    const urgentMobBill = overdueBillsMob[0] || pendingBills.find(b => {
        const bDate = (b.date || b.due_date || '').substring(0, 10);
        if (!bDate) return false;
        const diffDays = Math.ceil((new Date(bDate) - new Date(todayStrMob)) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 2;
    });
    if (urgentMobBill) {
        const isOverdue = overdueBillsMob.includes(urgentMobBill);
        mobActionCards.push(`
            <div class="mob-action-card" onclick="window.location.href='bills.html'">
                <span class="mob-action-icon tone-danger"><i class="fas ${isOverdue ? 'fa-exclamation-triangle' : 'fa-clock'}"></i></span>
                <div class="mob-action-desc">
                    <strong>Pagar: ${typeof sanitizeString === 'function' ? sanitizeString(urgentMobBill.description || 'Conta') : (urgentMobBill.description || 'Conta')}</strong>
                    <small>${isOverdue ? 'Conta atrasada' : 'Vence em até 48h'} · ${formatCurrency(urgentMobBill.amount)}</small>
                </div>
                <span class="mob-action-tag tone-danger">Pagar</span>
            </div>
        `);
    }
    if (budgetAlertMob && budgetAlertMob.type === 'danger') {
        mobActionCards.push(`
            <div class="mob-action-card" onclick="window.location.href='transactions.html'">
                <span class="mob-action-icon tone-warning"><i class="fas fa-chart-pie"></i></span>
                <div class="mob-action-desc">
                    <strong>Ver Gastos: Limite Estourado</strong>
                    <small>${budgetAlertMob.text}</small>
                </div>
                <span class="mob-action-tag tone-warning">Revisar</span>
            </div>
        `);
    } else if (topCatPercent > 35 && topCatName && topCatName !== 'Nenhum gasto') {
        mobActionCards.push(`
            <div class="mob-action-card" onclick="window.location.href='transactions.html'">
                <span class="mob-action-icon tone-warning"><i class="fas fa-fire"></i></span>
                <div class="mob-action-desc">
                    <strong>${typeof sanitizeString === 'function' ? sanitizeString(topCatName) : topCatName}: ${topCatPercent}% da renda</strong>
                    <small>Maior centro de custo</small>
                </div>
                <span class="mob-action-tag tone-warning">Ver</span>
            </div>
        `);
    }

    const displayedMobActionCards = mobActionCards.slice(0, 2);
    const rateTone = rateClass === 'success' ? 'success' : (rateClass === 'danger' ? 'danger' : 'warning');

    container.innerHTML = `
        <!-- CARD 1: O QUE FAZER HOJE? -->
        <div class="mobile-insights-card mob-quick-actions-card ${displayedMobActionCards.length === 0 ? 'is-all-clear' : ''}">
            <div class="mobile-insights-header">
                <div class="mobile-insights-title">
                    <i class="fas fa-bolt mob-title-icon-warn"></i> O que fazer hoje?
                </div>
                <span class="mob-status-badge ${displayedMobActionCards.length > 0 ? 'tone-danger' : 'tone-success'}">
                    ${displayedMobActionCards.length > 0 ? `${displayedMobActionCards.length} ${displayedMobActionCards.length === 1 ? 'pendência' : 'pendências'}` : 'Tudo em dia'}
                </span>
            </div>
            ${displayedMobActionCards.length > 0 ? `
                <div class="mob-checklist-wrap">${displayedMobActionCards.join('')}</div>
            ` : `
                <p class="mob-today-ok-note"><i class="fas fa-check-circle"></i> Sem contas urgentes ou alertas críticos para hoje.</p>
            `}
        </div>

        <!-- CARD 2: SAÚDE FINANCEIRA (DIAGNÓSTICO 360º) -->
        <div class="mobile-insights-card mob-health-score-card">
            <div class="mobile-insights-header">
                <div class="mobile-insights-title">
                    <i class="fas fa-heart-pulse mob-title-icon-primary"></i> Saúde Financeira
                </div>
                <span class="mob-header-kicker">Diagnóstico 360º</span>
            </div>

            <!-- ANEL DO SCORE 360º NO MOBILE -->
            <div class="mob-score-container">
                <div class="mob-score-ring-wrap">
                    <svg viewBox="0 0 72 72" class="mob-score-svg">
                        <circle cx="36" cy="36" r="30" fill="none" stroke="var(--mob-border-strong)" stroke-width="6" />
                        <circle cx="36" cy="36" r="30" fill="none" stroke="${mobBadge.color}" stroke-width="6" stroke-dasharray="${circMob.toFixed(1)}" stroke-dashoffset="${offsetMob.toFixed(1)}" stroke-linecap="round" />
                    </svg>
                    <div class="mob-score-center">
                        <span class="mob-score-val" id="mobHealthScoreVal">${finalScoreMob}</span>
                        <span class="mob-score-sub">/100</span>
                    </div>
                </div>
                <div class="mob-score-meta">
                    <span class="mob-status-badge tone-${mobBadge.toneClass}">${mobBadge.label}</span>
                    <h4>Diagnóstico Geral</h4>
                    <p>Equilíbrio · Contas · Dívidas · Futuro</p>
                </div>
            </div>

            <!-- 1. Taxa de Poupança -->
            <div class="mobile-insight-row">
                <div class="mobile-insight-left">
                    <div class="mobile-insight-icon ${rateClass}">
                        <i class="fas fa-piggy-bank"></i>
                    </div>
                    <div class="mobile-insight-text">
                        <span class="title">Taxa de Poupança</span>
                        <span class="detail"><span id="mobInsightSavingsVal" data-sensitive>${formatCurrency(Math.max(0, savings))}</span> poupados</span>
                    </div>
                </div>
                <span class="mobile-insight-badge tone-${rateTone}">
                    ${rateLabel}
                </span>
            </div>

            <!-- 2. Maior Gasto -->
            <div class="mobile-insight-row">
                <div class="mobile-insight-left">
                    <div class="mobile-insight-icon warning">
                        <i class="fas fa-fire"></i>
                    </div>
                    <div class="mobile-insight-text">
                        <span class="title">Maior Despesa</span>
                        <span class="detail">${typeof sanitizeString === 'function' ? sanitizeString(topCatName || '') : (topCatName || '')} (<span id="mobInsightTopCatVal" data-sensitive>${formatCurrency(topCatAmount)}</span>)</span>
                    </div>
                </div>
                <span class="mobile-insight-badge tone-warning">
                    ${topCatPercent}% do total
                </span>
            </div>

            <!-- 3. Contas do Mês -->
            <div class="mobile-insight-row">
                <div class="mobile-insight-left">
                    <div class="mobile-insight-icon info">
                        <i class="fas fa-file-invoice-dollar"></i>
                    </div>
                    <div class="mobile-insight-text">
                        <span class="title">Contas do Mês</span>
                        <span class="detail">${paidBills.length} de ${monthBills.length || 0} pagas</span>
                    </div>
                </div>
                <span class="mobile-insight-badge tone-purple">
                    ${pendingBillsAmount > 0 ? `<span id="mobInsightPendingBillsVal" data-sensitive>${formatCurrency(pendingBillsAmount)}</span> pendente` : 'Em dia'}
                </span>
            </div>

            <!-- 4. Investimentos & Proventos -->
            <div class="mobile-insight-row">
                <div class="mobile-insight-left">
                    <div class="mobile-insight-icon purple">
                        <i class="fas fa-coins"></i>
                    </div>
                    <div class="mobile-insight-text">
                        <span class="title">Investimentos & Proventos</span>
                        <span class="detail">${formatCurrency(totalDividends)} proventos · ${formatCurrency(totalAportes)} aportes</span>
                    </div>
                </div>
                <span class="mobile-insight-badge tone-purple" id="mobInsightInvestTotalVal" data-sensitive>
                    ${formatCurrency(totalAportes + totalDividends)}
                </span>
            </div>

            <!-- 5. Bicos e Renda Extra -->
            <div class="mobile-insight-row">
                <div class="mobile-insight-left">
                    <div class="mobile-insight-icon orange">
                        <i class="fas fa-motorcycle"></i>
                    </div>
                    <div class="mobile-insight-text">
                        <span class="title">Bicos & Renda Extra</span>
                        <span class="detail">${extraIncomeCount} lançamento${extraIncomeCount === 1 ? '' : 's'} (${extraIncomePercent}% da renda)</span>
                    </div>
                </div>
                <span class="mobile-insight-badge ${extraIncome > 0 ? 'tone-orange' : 'tone-neutral'}" id="mobInsightExtraVal" data-sensitive>
                    ${formatCurrency(extraIncome)}
                </span>
            </div>

            <!-- DICA ESTRATÉGICA -->
            <div class="mobile-insight-tip">
                <i class="fas fa-lightbulb"></i>
                <div>
                    <strong>Dica Estratégica:</strong> 
                    ${extraIncome > 0 
                        ? `Você recebeu <strong>${formatCurrency(extraIncome)}</strong> em bicos e extras! Sugestão 40/30/30: adiantar <strong>${formatCurrency(extraIncome * 0.4)}</strong> em empréstimos ou dívidas, reservar <strong>${formatCurrency(extraIncome * 0.3)}</strong> para fazer algo importante/lazer consciente, e guardar/investir <strong>${formatCurrency(extraIncome * 0.3)}</strong> para sua liberdade financeira.`
                        : (topCatPercent > 35 
                            ? `A categoria <strong>${typeof sanitizeString === 'function' ? sanitizeString(topCatName || '') : (topCatName || '')}</strong> consome ${topCatPercent}% do seu orçamento. Reduzir 15% nela liberará cerca de <strong>${formatCurrency(topCatAmount * 0.15)}</strong> para seus aportes!`
                            : `Mantenha suas reservas e invista continuamente os proventos recebidos para acelerar a bola de neve da liberdade financeira!`)}
                </div>
            </div>
        </div>
    `;

    if (window.TonuMobileUI && typeof window.TonuMobileUI.animateValue === 'function') {
        window.TonuMobileUI.animateValue(document.getElementById('mobHealthScoreVal'), finalScoreMob, v => String(Math.round(v)));
        if (!isBalanceHidden) {
            window.TonuMobileUI.animateValue(document.getElementById('mobInsightSavingsVal'), Math.max(0, savings), formatCurrency);
            window.TonuMobileUI.animateValue(document.getElementById('mobInsightTopCatVal'), topCatAmount, formatCurrency);
            if (pendingBillsAmount > 0) {
                window.TonuMobileUI.animateValue(document.getElementById('mobInsightPendingBillsVal'), pendingBillsAmount, formatCurrency);
            }
            window.TonuMobileUI.animateValue(document.getElementById('mobInsightInvestTotalVal'), totalAportes + totalDividends, formatCurrency);
            window.TonuMobileUI.animateValue(document.getElementById('mobInsightExtraVal'), extraIncome, formatCurrency);
        }
    }
}

// ============================================
// SINCRONIZAÇÃO DE PATRIMÔNIO PARA METAS NO DASHBOARD
// ============================================
async function loadSyncedPortfolioEquity(options = {}) {
    const force = !!(options && options.forceRefresh);
    const cacheOnly = !!(options && options.cacheOnly);
    if (!force && isDashboardEquityLoaded && cachedDashboardEquity > 0) {
        return cachedDashboardEquity;
    }

    const uid = currentUser?.id || 'demo';

    // 1. Cálculo ao vivo da custódia (investimentos + eventos corporativos + cotações)
    try {
        let invList = Array.isArray(allInvestments) && allInvestments.length > 0 ? allInvestments : [];
        let corpList = [];

        if (window.tonuSync && currentUser?.id) {
            try {
                if (invList.length === 0) invList = await window.tonuSync.getCachedInvestments(currentUser.id);
                corpList = await window.tonuSync.getCachedCorporateEvents(currentUser.id);
            } catch (_) {}
        }

        if (!cacheOnly && (!corpList || corpList.length === 0) && navigator.onLine && window.supabaseClient && currentUser?.id) {
            try {
                const { data: corpData } = await window.supabaseClient
                    .from("corporate_events")
                    .select("*")
                    .eq("user_id", currentUser.id);
                if (Array.isArray(corpData) && corpData.length > 0) corpList = corpData;
            } catch (_) {}
        }

        if (Array.isArray(invList) && invList.length > 0) {
            const quoteMap = new Map();
            try {
                const rawQ = localStorage.getItem('tonu_quotes_cache');
                if (rawQ) {
                    const parsedQ = JSON.parse(rawQ);
                    if (parsedQ && parsedQ.quotes) {
                        for (const [tk, val] of Object.entries(parsedQ.quotes)) {
                            quoteMap.set(tk.toUpperCase().trim(), val);
                        }
                    }
                }
            } catch (_) {}

            const normalizedTx = invList.map(t => ({
                ...t,
                isCorporateEvent: false,
                sortDate: t.date || '1970-01-01',
                sortPriority: (t.type || '').toLowerCase().includes('compra') ? 1 : 2
            }));

            const normalizedEvents = (corpList || []).map(ev => ({
                ...ev,
                isCorporateEvent: true,
                sortDate: ev.event_date || ev.date || '1970-01-01',
                sortPriority: 0
            }));

            const timeline = [...normalizedTx, ...normalizedEvents].sort((a, b) => {
                const da = new Date(a.sortDate + 'T12:00:00').getTime();
                const db = new Date(b.sortDate + 'T12:00:00').getTime();
                if (da !== db) return da - db;
                if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
                return (a.created_at || '').localeCompare(b.created_at || '');
            });

            const posMap = new Map();
            timeline.forEach(item => {
                const ticker = (item.ticker || '').toUpperCase().trim();
                if (!ticker) return;
                const cleanTk = ticker.replace(/\.SA$/, '').replace(/F$/, '');
                if (!posMap.has(cleanTk)) {
                    posMap.set(cleanTk, { quantity: 0, costBasis: 0, averageCost: 0 });
                }
                const pos = posMap.get(cleanTk);

                if (item.isCorporateEvent) {
                    const evType = (item.event_type || item.type || '').trim();
                    if (evType === 'Desdobramento' || evType === 'Agrupamento' || evType === 'Split' || evType === 'Inplit') {
                        const rf = parseFloat(item.ratio_from) || 1;
                        const rt = parseFloat(item.ratio_to) || 1;
                        if (rf > 0 && rt > 0 && pos.quantity > 0) {
                            pos.quantity = pos.quantity * (rt / rf);
                            pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                        }
                    } else if (evType === 'Bonificação' || evType === 'Subscrição') {
                        const bShares = parseFloat(item.bonus_shares || item.quantity || 0);
                        const bCost = parseFloat(item.unit_cost || item.unit_price || 0);
                        if (bShares > 0) {
                            pos.quantity += bShares;
                            pos.costBasis += (bShares * bCost);
                            pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                        }
                    } else if (evType === 'Amortização') {
                        const amort = parseFloat(item.amortization_per_share || item.unit_value || 0);
                        if (amort > 0 && pos.quantity > 0) {
                            pos.costBasis = Math.max(0, pos.costBasis - (amort * pos.quantity));
                            pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                        }
                    }
                    return;
                }

                const qty = parseFloat(item.quantity) || 0;
                const total = parseFloat(item.total_value || item.amount || (qty * (parseFloat(item.unit_price) || 0))) || 0;
                const type = (item.type || '').toLowerCase();

                if (type.includes('compra') || type.includes('buy')) {
                    pos.costBasis += total;
                    pos.quantity += qty;
                    pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                } else if (type.includes('venda') || type.includes('sell')) {
                    const avg = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                    pos.costBasis = Math.max(0, pos.costBasis - (avg * qty));
                    pos.quantity = Math.max(0, pos.quantity - qty);
                    if (pos.quantity <= 0.0001) {
                        pos.quantity = 0;
                        pos.costBasis = 0;
                        pos.averageCost = 0;
                    } else {
                        pos.averageCost = pos.costBasis / pos.quantity;
                    }
                }
            });

            let computedPatrimonio = 0;
            for (const [tk, p] of posMap.entries()) {
                if (p.quantity > 0.0001) {
                    const qData = quoteMap.get(tk) || quoteMap.get(`${tk}.SA`);
                    const quotePrice = (qData && Number.isFinite(qData.price) && qData.price > 0) ? qData.price : p.averageCost;
                    const val = p.quantity * quotePrice;
                    computedPatrimonio += (val > 0 ? val : (p.costBasis || 0));
                }
            }

            if (computedPatrimonio > 0) {
                cachedDashboardEquity = Math.round(computedPatrimonio * 100) / 100;
                isDashboardEquityLoaded = true;
                try { localStorage.setItem('tonu_total_equity_' + uid, String(cachedDashboardEquity)); } catch (_) {}
                return cachedDashboardEquity;
            }
        }
    } catch (_) {}

    // 2. Fallback: portfolio_snapshots no Supabase
    if (!cacheOnly) {
        try {
            if (navigator.onLine && window.supabaseClient && currentUser?.id) {
                const { data } = await window.supabaseClient
                    .from('portfolio_snapshots')
                    .select('total_equity')
                    .eq('user_id', currentUser.id)
                    .order('date', { ascending: false })
                    .limit(1);
                if (data && data[0]?.total_equity && Number(data[0].total_equity) > 0) {
                    cachedDashboardEquity = Number(data[0].total_equity);
                    isDashboardEquityLoaded = true;
                    try { localStorage.setItem('tonu_total_equity_' + uid, String(cachedDashboardEquity)); } catch (_) {}
                    return cachedDashboardEquity;
                }
            }
        } catch (_) {}

        // 3. Fallback: user_stats no Supabase
        try {
            if (navigator.onLine && window.supabaseClient && currentUser?.id) {
                const { data: uStat } = await window.supabaseClient
                    .from('user_stats')
                    .select('patrimony')
                    .eq('user_id', currentUser.id)
                    .maybeSingle();
                if (uStat && Number(uStat.patrimony) > 0) {
                    cachedDashboardEquity = Number(uStat.patrimony);
                    isDashboardEquityLoaded = true;
                    return cachedDashboardEquity;
                }
            }
        } catch (_) {}
    }

    // 4. Fallback: localStorage sincronizado com metas/investimentos
    try {
        const cached =
            localStorage.getItem('tonu_total_equity_' + uid) ||
            localStorage.getItem('tonu_portfolio_equity_' + uid) ||
            localStorage.getItem('tonu_total_equity') ||
            localStorage.getItem('tonu_investments_equity') ||
            localStorage.getItem('tonu_cached_equity_val');
        if (cached) {
            const val = Number(cached);
            if (!isNaN(val) && val > 0) {
                cachedDashboardEquity = val;
                isDashboardEquityLoaded = true;
                return cachedDashboardEquity;
            }
        }
    } catch (_) {}

    isDashboardEquityLoaded = true;
    return cachedDashboardEquity;
}

// ============================================
// RENDER METAS AGRUPADAS POR TIPO (CARROSSEL)
// ============================================
function normalizeDashboardGoalType(goal) {
    const raw = String(goal?.type || goal?.goal_type || goal?.category || '').toLowerCase().trim();
    if (raw === 'wealth' || raw === 'net_worth' || raw === 'patrimonio') return 'wealth';
    if (raw === 'dividends' || raw === 'proventos') return 'dividends';
    if (raw === 'project' || raw === 'habit' || raw === 'projeto') return 'project';
    if (raw === 'financial' || raw === 'money' || raw === 'dinheiro' || !raw) return 'financial';
    return raw;
}

function getMonthlyDividendsTotalForDashboard() {
    const targetDate = getSelectedMonthDate();
    const curY = targetDate.getFullYear();
    const curM = targetDate.getMonth();
    return (allDividends || []).filter(d => {
        const dt = (d.payment_date || d.date || '').substring(0, 10);
        if (!dt) return false;
        const parts = dt.split('-');
        return parseInt(parts[0], 10) === curY && (parseInt(parts[1], 10) - 1) === curM;
    }).reduce((acc, d) => {
        const val = parseFloat(d.total_value || d.net_value || d.amount || d.total_amount);
        if (!isNaN(val) && val > 0) return acc + val;
        const q = parseFloat(d.quantity) || 0;
        const u = parseFloat(d.unit_value) || 0;
        return acc + (q * u);
    }, 0);
}

function buildGoalTypeSummaryCard(typeKey, items) {
    const esc = (str) => (typeof sanitizeString === 'function' ? sanitizeString(str || '') : String(str || ''));
    const count = items.length;
    const countLabel = `${count} ${count === 1 ? 'meta' : 'metas'}`;

    if (typeKey === 'wealth') {
        const maxStored = items.reduce((mx, g) => Math.max(mx, Number(g.current_amount || g.current || 0)), 0);
        const current = cachedDashboardEquity > 0 ? cachedDashboardEquity : maxStored;
        const pending = items
            .filter(g => !g.completed && Number(g.target_amount || g.target || 0) > current)
            .sort((a, b) => Number(a.target_amount || a.target || 0) - Number(b.target_amount || b.target || 0));
        const rep = pending[0] || items.slice().sort((a, b) => Number(b.target_amount || b.target || 0) - Number(a.target_amount || a.target || 0))[0];
        const target = Number(rep?.target_amount || rep?.target || 0);
        const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        const repName = esc(rep?.title || rep?.name || 'Reserva Patrimonial');
        return {
            typeKey,
            title: 'Patrimônio',
            subtitle: `${countLabel} · ${repName}`,
            icon: 'fa-chart-pie',
            color: '#4338CA',
            iconBg: 'rgba(67, 56, 202, 0.14)',
            percent,
            currentLabel: 'Em custódia',
            currentValue: formatCurrency(current),
            currentNum: current,
            targetLabel: pending.length > 0 ? 'Próximo alvo' : 'Alvo',
            targetValue: formatCurrency(target),
            targetNum: target,
            isMoney: true
        };
    }

    if (typeKey === 'financial') {
        const current = items.reduce((acc, g) => acc + (Number(g.current_amount || g.current || 0)), 0);
        const target = items.reduce((acc, g) => acc + (Number(g.target_amount || g.target || 0)), 0);
        const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        const activeFirst = items.find(g => !g.completed) || items[0];
        const repName = esc(activeFirst?.title || activeFirst?.name || 'Reserva Financeira');
        return {
            typeKey,
            title: 'Dinheiro',
            subtitle: count > 1 ? `${countLabel} · ${repName}` : repName,
            icon: 'fa-dollar-sign',
            color: '#F59E0B',
            iconBg: 'rgba(245, 158, 11, 0.14)',
            percent,
            currentLabel: 'Acumulado',
            currentValue: formatCurrency(current),
            currentNum: current,
            targetLabel: 'Alvo total',
            targetValue: formatCurrency(target),
            targetNum: target,
            isMoney: true
        };
    }

    if (typeKey === 'dividends') {
        const current = getMonthlyDividendsTotalForDashboard();
        const pending = items
            .filter(g => !g.completed && Number(g.target_amount || g.target || 0) > current)
            .sort((a, b) => Number(a.target_amount || a.target || 0) - Number(b.target_amount || b.target || 0));
        const rep = pending[0] || items.slice().sort((a, b) => Number(b.target_amount || b.target || 0) - Number(a.target_amount || a.target || 0))[0];
        const target = Number(rep?.target_amount || rep?.target || 0);
        const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        const repName = esc(rep?.title || rep?.name || 'Renda Passiva');
        return {
            typeKey,
            title: 'Proventos',
            subtitle: `${countLabel} · ${repName}`,
            icon: 'fa-hand-holding-usd',
            color: '#10B981',
            iconBg: 'rgba(16, 185, 129, 0.14)',
            percent,
            currentLabel: 'Recebido no mês',
            currentValue: formatCurrency(current),
            currentNum: current,
            targetLabel: 'Alvo mensal',
            targetValue: formatCurrency(target),
            targetNum: target,
            isMoney: true
        };
    }

    if (typeKey === 'project') {
        const doneCount = items.filter(g => !!g.completed).length;
        const percent = count > 0 ? Math.min(100, Math.round((doneCount / count) * 100)) : 0;
        const nextPending = items.find(g => !g.completed) || items[0];
        const nextTitle = esc(nextPending?.title || nextPending?.name || 'Checklist');
        return {
            typeKey,
            title: 'Projetos',
            subtitle: doneCount === count ? `${countLabel} concluídos` : `Próximo: ${nextTitle}`,
            icon: 'fa-tasks',
            color: '#0EA5E9',
            iconBg: 'rgba(14, 165, 233, 0.14)',
            percent,
            currentLabel: 'Concluídos',
            currentValue: `${doneCount} de ${count}`,
            currentNum: doneCount,
            targetLabel: 'Restantes',
            targetValue: `${Math.max(0, count - doneCount)}`,
            targetNum: Math.max(0, count - doneCount),
            totalCount: count,
            isMoney: false
        };
    }

    const current = items.reduce((acc, g) => acc + (Number(g.current_amount || g.current || 0)), 0);
    const target = items.reduce((acc, g) => acc + (Number(g.target_amount || g.target || 0)), 0);
    const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const repName = esc(items[0]?.title || items[0]?.name || 'Metas');
    return {
        typeKey,
        title: esc(typeKey.charAt(0).toUpperCase() + typeKey.slice(1)),
        subtitle: `${countLabel} · ${repName}`,
        icon: 'fa-bullseye',
        color: '#4338CA',
        iconBg: 'rgba(67, 56, 202, 0.14)',
        percent,
        currentLabel: 'Atual',
        currentValue: formatCurrency(current),
        currentNum: current,
        targetLabel: 'Alvo',
        targetValue: formatCurrency(target),
        targetNum: target,
        isMoney: true
    };
}

function renderMobileGoals() {
    const container = document.getElementById("mobileGoalsContainer");
    if (!container) return;

    if (!allGoals || allGoals.length === 0) {
        container.innerHTML = "";
        return;
    }

    const grouped = new Map();
    allGoals.forEach(g => {
        const typeKey = normalizeDashboardGoalType(g);
        if (!grouped.has(typeKey)) grouped.set(typeKey, []);
        grouped.get(typeKey).push(g);
    });

    const preferredOrder = ['wealth', 'financial', 'dividends', 'project'];
    const orderedKeys = [
        ...preferredOrder.filter(k => grouped.has(k)),
        ...[...grouped.keys()].filter(k => !preferredOrder.includes(k))
    ];

    const summaryCards = orderedKeys.map(k => buildGoalTypeSummaryCard(k, grouped.get(k)));
    if (summaryCards.length === 0) {
        container.innerHTML = "";
        return;
    }

    const isSingle = summaryCards.length === 1;
    const cardsHtml = summaryCards.map((card, idx) => `
        <a href="goals.html" class="goal-type-card" aria-label="${card.title}: ${card.percent}% concluído">
            <div class="goal-type-card-top">
                <div class="goal-type-icon" style="background:${card.iconBg}; color:${card.color};">
                    <i class="fas ${card.icon}"></i>
                </div>
                <div class="goal-type-meta">
                    <div class="goal-type-name">${card.title}</div>
                    <div class="goal-type-sub">${card.subtitle}</div>
                </div>
                <span class="goal-type-pct" id="mobGoalCardPct_${idx}" style="color:${card.color};">${card.percent}%</span>
            </div>
            <div class="goal-type-progress-track">
                <div class="goal-type-progress-fill" style="width:${card.percent}%; background:${card.color};"></div>
            </div>
            <div class="goal-type-values">
                <div class="goal-type-val-block">
                    <span class="goal-type-val-label">${card.currentLabel}</span>
                    <span class="goal-type-val-num" id="mobGoalCardCur_${idx}" ${card.isMoney ? 'data-sensitive' : ''}>${card.currentValue}</span>
                </div>
                <div class="goal-type-val-block right">
                    <span class="goal-type-val-label">${card.targetLabel}</span>
                    <span class="goal-type-val-num" id="mobGoalCardTgt_${idx}" ${card.isMoney ? 'data-sensitive' : ''}>${card.targetValue}</span>
                </div>
            </div>
        </a>
    `).join('');

    container.innerHTML = `
        <div class="goals-carousel-header">
            <h2 class="goals-carousel-title"><i class="fas fa-bullseye"></i> Metas por Categoria</h2>
            <a href="goals.html" class="goals-carousel-all-link">Ver todas →</a>
        </div>
        <div class="goals-carousel-track ${isSingle ? 'single-card' : ''}">
            ${cardsHtml}
        </div>
    `;

    if (window.TonuMobileUI && typeof window.TonuMobileUI.animateValue === 'function') {
        summaryCards.forEach((card, idx) => {
            window.TonuMobileUI.animateValue(document.getElementById(`mobGoalCardPct_${idx}`), card.percent, v => `${Math.round(v)}%`);
            if (card.isMoney && !isBalanceHidden) {
                window.TonuMobileUI.animateValue(document.getElementById(`mobGoalCardCur_${idx}`), card.currentNum, formatCurrency);
                window.TonuMobileUI.animateValue(document.getElementById(`mobGoalCardTgt_${idx}`), card.targetNum, formatCurrency);
            }
        });
    }
}

// ============================================
// RENDER CATEGORIAS EM BARRA (INTEGRADO AO GRÁFICO)
// ============================================
function renderCategoryBars() {
    const container = document.getElementById("categoryBarsContainer");
    if (container) container.innerHTML = "";
}

// ============================================
// RENDER TRANSAÇÕES
// ============================================
function renderTransactions() {
    const container = document.getElementById("mobileTransactions");
    if (!container) return;

    const recent = allTransactions.filter(t => isTxPaid(t)).slice(0, 10);

    if (recent.length === 0) {
        container.innerHTML = `
            <div class="mobile-empty">
                <span class="empty-icon">📭</span>
                <h3>Nenhuma transação</h3>
                <p>Adicione sua primeira transação</p>
            </div>
        `;
        return;
    }

    container.innerHTML = recent.map(t => {
        const isIncome = t.type === "income";
        let cat = null;
        if (t.category_id && categories && categories.length > 0) {
            cat = categories.find(c => c.id === t.category_id);
        }
        if (!cat && t.categories && typeof t.categories === 'object') {
            cat = t.categories;
        }
        const style = (typeof window !== 'undefined' && window.getBackendCategoryStyle)
            ? window.getBackendCategoryStyle(t.category || t.description, cat)
            : { color: cat?.color || (isIncome ? "#00B894" : "#FF6B6B"), icon: cat?.icon || (isIncome ? "fa-money-bill-wave" : "fa-tag") };

        const color = cat?.color || style.color || (isIncome ? "#00B894" : "#FF6B6B");
        const icon = cat?.icon || style.icon || (isIncome ? "fa-money-bill-wave" : "fa-tag");
        const rawDesc = window.TonuDeduplicate ? window.TonuDeduplicate.cleanDisplayDescription(t.description) : (t.description || 'Sem descrição');
        const safeDesc = typeof sanitizeString === 'function' ? sanitizeString(rawDesc) : rawDesc;

        return `
            <div class="mobile-transaction" onclick="window.location.href='transactions.html'">
                <div class="tx-left">
                    <div class="tx-icon" style="background:${color}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="tx-info">
                        <strong>${safeDesc}</strong>
                        <small>${formatDate(t.date)}</small>
                    </div>
                </div>
                <span class="tx-amount ${isIncome ? 'income' : 'expense'}">
                    ${isIncome ? '+' : '-'} ${formatCurrency(t.amount)}
                </span>
            </div>
        `;
    }).join("");
}

// ============================================
// MODAL BOTTOM SHEET (NOVA TRANSAÇÃO)
// ============================================
let currentQuickType = "expense";

function openAddTransaction() {
    openQuickAddModal("expense");
}

function openQuickAddModal(type) {
    type = type || "expense";
    setQuickType(type);

    const dateInput = document.getElementById("quickDate");
    if (dateInput) {
        if (currentMonthOffset === 0) {
            dateInput.value = new Date().toLocaleDateString('sv');
        } else {
            const targetDate = getSelectedMonthDate();
            const y = targetDate.getFullYear();
            const m = String(targetDate.getMonth() + 1).padStart(2, "0");
            dateInput.value = `${y}-${m}-01`;
        }
    }

    populateCategoryOptions();

    const modal = document.getElementById("quickAddModal");
    if (modal) modal.classList.add("active");
}

function closeQuickAddModal(e) {
    if (e && e.target !== e.currentTarget && e.target.classList && !e.target.classList.contains("mobile-modal-overlay")) {
        return;
    }
    const modal = document.getElementById("quickAddModal");
    if (modal) modal.classList.remove("active");
}

function setQuickType(type) {
    currentQuickType = type;
    const expBtn = document.getElementById("toggleExpense");
    const incBtn = document.getElementById("toggleIncome");
    const title = document.getElementById("modalTitle");

    if (type === "expense") {
        expBtn?.classList.add("active");
        incBtn?.classList.remove("active");
        if (title) title.textContent = "Nova Despesa";
    } else {
        incBtn?.classList.add("active");
        expBtn?.classList.remove("active");
        if (title) title.textContent = "Nova Receita";
    }

    populateCategoryOptions();
}

function populateCategoryOptions() {
    const select = document.getElementById("quickCategory");
    if (!select) return;

    const filtered = categories.filter(c => {
        if (!c.type || c.type === 'both') return true;
        if (c.name && c.name.toLowerCase().includes('invest')) return true;
        return c.type === currentQuickType;
    });
    select.innerHTML = '<option value="">Selecione a categoria...</option>' +
        (filtered.length > 0 ? filtered : categories).map(c => {
            const safeId = typeof sanitizeString === 'function' ? sanitizeString(c.id || '') : (c.id || '');
            const safeName = typeof sanitizeString === 'function' ? sanitizeString(c.name || '') : (c.name || '');
            return `<option value="${safeId}">${safeName}</option>`;
        }).join("");
}

async function handleQuickAddSubmit(event) {
    event.preventDefault();
    const btn = document.getElementById("quickSubmitBtn");
    const desc = document.getElementById("quickDesc").value.trim();
    const amount = parseFloat(document.getElementById("quickAmount").value);
    const category_id = document.getElementById("quickCategory").value;
    const date = document.getElementById("quickDate").value;

    if (!desc || isNaN(amount) || amount <= 0 || !category_id || !date) {
        showMobileToast("Preencha todos os campos corretamente!", "error");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Salvando...";

    try {
        const genUuid = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                try { return crypto.randomUUID(); } catch (e) {}
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };

        const txId = genUuid();
        const payload = {
            id: txId,
            user_id: currentUser.id,
            description: desc,
            amount: amount,
            type: currentQuickType,
            category_id: category_id,
            date: date,
            created_at: new Date().toISOString()
        };

        allTransactions.unshift(payload);

        if (window.tonuSync && currentUser?.id) {
            await window.tonuSync.setCachedTransactions(currentUser.id, allTransactions);
            await window.tonuSync.enqueue('INSERT_TRANSACTION', payload);
        }

        showMobileToast("Transação adicionada com sucesso! 🎉", "success");
        closeQuickAddModal();
        document.getElementById("quickAddForm").reset();

        await loadMobileData({ forceRefresh: true });
    } catch (err) {
        console.error("Erro ao salvar transação rápida:", err);
        showMobileToast("Erro ao salvar: " + (err.message || "Tente novamente"), "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Salvar Transação";
    }
}

function showMobileToast(message, type) {
    if (typeof window.showToast === 'function') {
        return window.showToast(message, type);
    }
    type = type || "info";
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.className = "toast hidden";
    }, 3000);
}

// ============================================
// FUNÇÕES AUXILIARES (formatCurrency, formatDate, toggleTheme via js/core.js)
// ============================================

// ============================================
// ✨ INSIGHTS IA MOBILE (GEMINI - HORIZONTE 2 ITEM 2)
// ============================================
var AI_INSIGHTS_CLIENT_TTL_MS = 6 * 60 * 60 * 1000;
var _mobileAiInsightsFetchInFlight = false;

function _escapeMobileAiInsightHtml(str) {
    if (typeof sanitizeString === 'function') {
        return sanitizeString(String(str || ''));
    }
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _resolveMobileAiFailureMeta(meta) {
    const reason = String(meta?.reason || '').toLowerCase();
    switch (reason) {
        case 'offline':
            return {
                badge: 'Offline',
                text: 'Sem conexão no momento. Diagnóstico 360º segue ativo.'
            };
        case 'no_token':
        case 'unauthorized':
            return {
                badge: 'Sessão expirada',
                text: 'Faça login novamente para atualizar os Insights IA.'
            };
        case 'api_key_invalid':
        case 'not_configured':
            return {
                badge: 'Config. pendente',
                text: meta?.errorMessage || 'Chave de IA não configurada ou inválida no servidor.'
            };
        case 'quota_exceeded':
        case 'rate_limit':
            return {
                badge: 'Limite atingido',
                text: meta?.errorMessage || 'Cota de consultas IA atingida. Tente novamente mais tarde.'
            };
        case 'timeout':
            return {
                badge: 'Tempo esgotado',
                text: 'A IA demorou para responder. Toque no ícone acima para tentar novamente.'
            };
        default:
            return {
                badge: 'Indisponível',
                text: meta?.errorMessage || 'Não foi possível gerar os insights agora. Toque no ícone acima para tentar.'
            };
    }
}

function renderAIInsights(insights, meta) {
    const body = document.getElementById('aiInsightsBody');
    const card = document.getElementById('mobileAIInsightsCard');
    if (!body) return;

    const list = Array.isArray(insights) ? insights.slice(0, 3) : [];
    const badgeEl = document.getElementById('aiInsightsSourceBadge');
    if (badgeEl && meta && meta.source) {
        badgeEl.textContent = meta.source === 'cache' || meta.source === 'session' ? '90d · Cache' : '90d · IA';
    }

    if (list.length === 0) {
        const failure = _resolveMobileAiFailureMeta(meta);
        if (card) card.classList.add('is-unavailable');
        if (badgeEl) badgeEl.textContent = failure.badge;
        body.innerHTML = `<p class="mobile-ai-empty">${_escapeMobileAiInsightHtml(failure.text)}</p>`;
        return;
    }

    if (card) card.classList.remove('is-unavailable');

    const badgeMap = { warning: '⚠️', success: '✅', info: '💡' };
    body.innerHTML = `<div class="mobile-ai-insights-list">${list.map(item => {
        const rawType = String(item?.type || 'info').toLowerCase().trim();
        const safeType = (rawType === 'warning' || rawType === 'success' || rawType === 'info') ? rawType : 'info';
        const icon = badgeMap[safeType] || '💡';
        const safeText = _escapeMobileAiInsightHtml(item?.text || '');
        return `<div class="insight-item mobile-ai-insight-item ${safeType}"><span aria-hidden="true">${icon}</span><span>${safeText}</span></div>`;
    }).join('')}</div>`;
}

function _getMobileAiSessionKey(userId) {
    return `tonu_ai_insights_${userId || 'anon'}`;
}

function _isMobileAiCacheExpired(userId) {
    try {
        const raw = sessionStorage.getItem(_getMobileAiSessionKey(userId));
        if (!raw) return true;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.insights) || parsed.insights.length === 0 || !parsed.ts) return true;
        return (Date.now() - Number(parsed.ts)) >= AI_INSIGHTS_CLIENT_TTL_MS;
    } catch {
        return true;
    }
}

async function loadAIInsights(forceRefresh) {
    const body = document.getElementById('aiInsightsBody');
    if (!body) return;

    const force = forceRefresh === true;
    const uid = currentUser?.id;
    if (!uid) {
        renderAIInsights([], { reason: 'unauthorized' });
        return;
    }

    const sessionKey = _getMobileAiSessionKey(uid);
    if (!force) {
        try {
            const rawCached = sessionStorage.getItem(sessionKey);
            if (rawCached) {
                const cached = JSON.parse(rawCached);
                if (cached && Array.isArray(cached.insights) && cached.insights.length > 0 && (Date.now() - Number(cached.ts || 0)) < AI_INSIGHTS_CLIENT_TTL_MS) {
                    renderAIInsights(cached.insights, { source: 'session' });
                    return;
                }
            }
        } catch (_) {}
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        renderAIInsights([], { reason: 'offline' });
        return;
    }

    if (_mobileAiInsightsFetchInFlight && !force) return;
    _mobileAiInsightsFetchInFlight = true;

    const refreshBtn = document.getElementById('mobileAiInsightsRefreshBtn');
    const refreshIcon = refreshBtn ? refreshBtn.querySelector('i') : null;
    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    if (force) {
        body.innerHTML = '<p class="mobile-ai-loading">Atualizando insights com IA...</p>';
    }

    try {
        let token = '';
        if (window.supabaseClient?.auth?.getSession) {
            const { data } = await window.supabaseClient.auth.getSession();
            token = data?.session?.access_token || '';
        } else if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth?.getSession) {
            const { data } = await supabaseClient.auth.getSession();
            token = data?.session?.access_token || '';
        }
        if (!token) {
            renderAIInsights([], { reason: 'no_token' });
            return;
        }

        const base = (typeof window.getBaseUrl === 'function')
            ? String(window.getBaseUrl() || '').replace(/\/+$/, '')
            : '';
        const res = await fetch(`${base}/api/insights`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ forceRefresh: force })
        });

        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = null;
        }

        if (!res.ok) {
            renderAIInsights([], {
                reason: data?.reason || (res.status === 401 ? 'unauthorized' : 'error'),
                errorMessage: data?.error || ''
            });
            return;
        }

        const insights = Array.isArray(data?.insights) ? data.insights : [];
        if (insights.length > 0) {
            try {
                sessionStorage.setItem(sessionKey, JSON.stringify({
                    insights,
                    generated_at: data.generated_at || new Date().toISOString(),
                    ts: Date.now()
                }));
            } catch (_) {}
            renderAIInsights(insights, { source: data?.source || 'ai' });
            return;
        }

        renderAIInsights([], {
            reason: data?.reason || (data?.gemini_configured === false ? 'not_configured' : 'error'),
            errorMessage: data?.error || ''
        });
    } catch (_) {
        renderAIInsights([], { reason: (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'error' });
    } finally {
        _mobileAiInsightsFetchInFlight = false;
        if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    }
}

window.renderMobileInsights = renderMobileInsights;
window.renderMobileGoals = renderMobileGoals;
window.loadAIInsights = loadAIInsights;
window.renderAIInsights = renderAIInsights;

// Atualiza patrimônio e metas ao retornar ao Dashboard ou alterar carteira em outra aba
async function refreshDashboardGoalsSync() {
    if (!currentUser) return;
    await loadSyncedPortfolioEquity({ forceRefresh: true });
    renderMobileGoals();
    if (_isMobileAiCacheExpired(currentUser.id)) {
        loadAIInsights(false).catch(() => {});
    }
}

let _refreshTimer = null;
function debouncedRefreshDashboard() {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => {
        refreshDashboardGoalsSync().catch(() => {});
    }, 800);
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentUser) {
        debouncedRefreshDashboard();
    }
});

window.addEventListener("focus", () => {
    if (currentUser) {
        debouncedRefreshDashboard();
    }
});

window.addEventListener("storage", (e) => {
    if (e.key && (e.key.includes("tonu_total_equity") || e.key.includes("tonu_investments") || e.key.includes("tonu_goals"))) {
        refreshDashboardGoalsSync().catch(() => {});
    }
});

window.addEventListener("tonu_portfolio_updated", () => {
    refreshDashboardGoalsSync().catch(() => {});
});

console.log("✅ Mobile Dashboard pronto!");
