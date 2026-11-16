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
let prevMonthBalance = null;
const _cache = { key: null, ts: 0, payload: null };
const CACHE_TTL_MS = 45 * 1000;

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
    const d = getSelectedMonthDate();
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const label = `${months[d.getMonth()]}/${d.getFullYear()}`;
    if (window.TonuDashboardComponents && typeof window.TonuDashboardComponents.updateHeader === 'function') {
        window.TonuDashboardComponents.updateHeader({
            monthLabel: label,
            isCurrentMonth: currentMonthOffset === 0
        });
    } else {
        const el = document.getElementById("selectedMonthLabel") || document.getElementById("selectedMonth");
        if (el) el.textContent = label;
    }
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

// ============================================
// INICIALIZAÇÃO & EVENTOS CSP-SAFE
// ============================================
let _mobileDashboardEventsBound = false;
function bindMobileDashboardEvents() {
    if (_mobileDashboardEventsBound) return;
    _mobileDashboardEventsBound = true;

    document.addEventListener("click", (e) => {
        const target = e.target && e.target.closest ? e.target : null;
        if (!target) return;

        const actionEl = target.closest("[data-action]");
        if (actionEl) {
            const action = actionEl.getAttribute("data-action");
            if (action === "change-month") {
                changeMonth(Number(actionEl.getAttribute("data-delta") || 0));
                return;
            }
            if (action === "go-current-month") {
                goToCurrentMonth();
                return;
            }
            if (action === "toggle-balance") {
                toggleBalanceVisibility();
                return;
            }
            if (action === "quick-add") {
                openQuickAddModal(actionEl.getAttribute("data-type") || "expense");
                return;
            }
            if (action === "close-quick-modal") {
                closeQuickAddModal();
                return;
            }
            if (action === "set-quick-type") {
                setQuickType(actionEl.getAttribute("data-type") || "expense");
                return;
            }
            if (action === "refresh-ai-insights") {
                if (typeof window.loadAIInsights === "function") {
                    window.loadAIInsights(true);
                }
                return;
            }
        }

        const navEl = target.closest("[data-nav]");
        if (navEl) {
            const href = navEl.getAttribute("data-nav");
            if (href) window.location.href = href;
        }
    });

    const overlay = document.getElementById("quickAddModal");
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeQuickAddModal();
        });
    }

    const form = document.getElementById("quickAddForm");
    if (form) {
        form.addEventListener("submit", handleQuickAddSubmit);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    bindMobileDashboardEvents();
    // Tema
    const savedTheme = localStorage.getItem("tonu_theme") || "light";
    if (savedTheme === "dark") {
        document.body.classList.add("dark-theme");
        document.documentElement.setAttribute("data-theme", "dark");
        const icon = document.querySelector("#themeIcon");
        if (icon) icon.classList.replace("fa-moon", "fa-sun");
    }

    // Autenticação
    try {
        let user = null;
        if (window.getAuthenticatedUser) {
            user = await window.getAuthenticatedUser();
        } else if (window.supabaseOffline) {
            user = await window.supabaseOffline.isAuthenticated();
        }

        if (!user && window.supabaseClient && window.supabaseClient.auth) {
            try {
                const { data: sessData } = await supabaseClient.auth.getSession();
                user = sessData?.session?.user;
                if (!user) {
                    const { data: userData } = await supabaseClient.auth.getUser();
                    user = userData?.user;
                }
            } catch (_) {}
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

        if (!user) {
            console.warn("⚠️ Nenhum usuário autenticado encontrado no Mobile Dashboard, redirecionando...");
            window.location.href = "../../index.html";
            return;
        }

        currentUser = user;
        console.log("✅ Mobile: Usuário autenticado:", currentUser.email);

        const name = user.user_metadata?.full_name || user.name || user.email?.split("@")[0] || "Usuário";
        // Injeta nome e inicial do usuário autenticado no Header
        if (window.TonuDashboardComponents && typeof window.TonuDashboardComponents.updateHeader === 'function') {
            window.TonuDashboardComponents.updateHeader({
                userName: name,
                avatarInitial: name
            });
        } else {
            const greetingEl = document.getElementById("greetingText");
            if (greetingEl) greetingEl.textContent = `Olá, ${String(name).split(/\s+/)[0]}!`;
            const avEl = document.getElementById("topbarAvatar");
            if (avEl) avEl.textContent = String(name).charAt(0).toUpperCase();
        }

        await loadCategories();
        await loadMobileData();
    } catch (e) {
        console.error("❌ Erro na autenticação mobile:", e);
        window.location.href = "../../index.html";
    }
});

// ============================================
// CARREGAR CATEGORIAS
// ============================================
async function loadCategories() {
    try {
        let loaded = null;
        try {
            const { data, error } = await supabaseClient
                .from("categories")
                .select("*")
                .or(`user_id.eq.${currentUser.id},is_default.eq.true,user_id.is.null`)
                .order("name");
            if (!error && data && data.length > 0) loaded = data;
        } catch (_) {
            const { data, error } = await supabaseClient
                .from("categories")
                .select("*")
                .eq("user_id", currentUser.id);
            if (!error && data && data.length > 0) loaded = data;
        }

        if (loaded && loaded.length > 0) {
            categories = loaded;
            // Garantir que a categoria Investimentos esteja sempre presente
            if (!categories.some(c => (c.name && c.name.toLowerCase().includes('invest')) || c.id === 'cat_investimentos')) {
                categories.push({ id: 'cat_investimentos', name: '💼 Investimentos', type: 'both', icon: 'fa-chart-line', color: '#00CEC9' });
            }
        } else {
            categories = [
                { id: 'cat_contas', name: '⚡ Contas Básicas', type: 'expense', icon: 'fa-bolt', color: '#0984E3' },
                { id: 'cat_lazer', name: '🎮 Lazer', type: 'expense', icon: 'fa-gamepad', color: '#A29BFE' },
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
        }
        console.log("✅ Categorias carregadas:", categories.length);
    } catch (e) {
        console.error("❌ Erro ao carregar categorias:", e);
        categories = [];
    }
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
// CARREGAR DADOS MOBILE UNIFICADOS
// ============================================
async function loadMobileData(options = {}) {
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
            prevMonthBalance = typeof p.prevMonthBalance === 'number' ? p.prevMonthBalance : null;
            window.allDividends = allDividends;
            window.allInvestments = allInvestments;

            await loadSyncedPortfolioEquity();
            renderSummary();
            renderMobileChart();
            renderMobileInsights();
            renderMobileGoals();
            renderCategoryBars();
            renderTransactions();
            loadAIInsights().catch(() => {});
            return;
        }

        const targetDate = getSelectedMonthDate();
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, "0");
        const lastDayNum = new Date(year, targetDate.getMonth() + 1, 0).getDate();
        const firstDay = `${year}-${month}-01`;
        const lastDay = `${year}-${month}-${String(lastDayNum).padStart(2, "0")}`;

        const prevDate = new Date(year, targetDate.getMonth() - 1, 1);
        const prevYear = prevDate.getFullYear();
        const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, "0");
        const prevLastDayNum = new Date(prevYear, prevDate.getMonth() + 1, 0).getDate();
        const prevFirstDay = `${prevYear}-${prevMonthStr}-01`;
        const prevLastDay = `${prevYear}-${prevMonthStr}-${String(prevLastDayNum).padStart(2, "0")}`;

        // 1. Transações do mês selecionado + mês anterior (para variação MoM)
        const txPromise = supabaseClient
            .from("transactions")
            .select("*")
            .eq("user_id", currentUser.id)
            .gte("date", firstDay)
            .lte("date", lastDay)
            .order("date", { ascending: false });

        const prevTxPromise = (async () => {
            try {
                return await supabaseClient
                    .from("transactions")
                    .select("type,amount,paid,is_bill")
                    .eq("user_id", currentUser.id)
                    .gte("date", prevFirstDay)
                    .lte("date", prevLastDay);
            } catch (_) {
                return { data: [] };
            }
        })();

        // 2. Contas (busca transações do tipo conta ou tabela bills se existir)
        const billsPromise = (async () => {
            try {
                const { data } = await supabaseClient
                    .from("transactions")
                    .select("*")
                    .eq("user_id", currentUser.id)
                    .eq("type", "expense")
                    .eq("is_bill", true)
                    .gte("date", firstDay)
                    .lte("date", lastDay);
                if (data && data.length > 0) return { data };
            } catch (e) {}
            try {
                return await supabaseClient
                    .from("bills")
                    .select("*")
                    .eq("user_id", currentUser.id);
            } catch (e) {
                return { data: [] };
            }
        })();

        // 3. Proventos (AWAIT)
        const divPromise = (async () => {
            return await loadDividends();
        })();

        // 4. Metas
        const goalsPromise = supabaseClient
            .from("goals")
            .select("*")
            .eq("user_id", currentUser.id);

        // 5. Investimentos (AWAIT)
        const invPromise = (async () => {
            return await loadInvestments();
        })();

        const [txRes, billsRes, divData, goalsRes, invData, prevTxRes] = await Promise.all([
            txPromise,
            billsPromise,
            divPromise,
            goalsPromise,
            invPromise,
            prevTxPromise
        ]);

        let loadedData = txRes.data || [];
        if (window.TonuDeduplicate) {
            loadedData = window.TonuDeduplicate.deduplicate(loadedData, {
                autoCleanRemote: true,
                userId: currentUser?.id
            }).cleanList;
        }
        allTransactions = loadedData;

        const computePaidBalance = (list) => {
            if (!Array.isArray(list) || list.length === 0) return null;
            let pInc = 0, pExp = 0, count = 0;
            list.forEach(t => {
                if (!isTxPaid(t)) return;
                const amt = Math.abs(Number(t.amount || 0));
                if (isNaN(amt) || amt <= 0) return;
                count++;
                if (t.type === "income") pInc += amt;
                else if (t.type === "expense") pExp += amt;
            });
            return count > 0 ? (pInc - pExp) : null;
        };

        prevMonthBalance = computePaidBalance(prevTxRes?.data || []);

        allBills = billsRes?.data || [];
        allGoals = goalsRes?.data || [];
        allDividends = Array.isArray(divData) ? divData : (allDividends || []);
        allInvestments = Array.isArray(invData) ? invData : (allInvestments || []);

        // ==================================================================
        // CANONICAL INDEXEDDB CACHE NO DASHBOARD MOBILE
        // ==================================================================
        const isRemoteEmpty = (allTransactions.length === 0 && allBills.length === 0 && allDividends.length === 0 && allGoals.length === 0 && allInvestments.length === 0);

        if (isRemoteEmpty && currentUser && currentUser.id) {
            console.log("ℹ️ Dados remotos vazios, consultando cache canônico IndexedDB...");
            let cacheFound = false;

            if (window.tonuSync) {
                try {
                    const cachedTx = await window.tonuSync.getCachedTransactions(currentUser.id);
                    if (Array.isArray(cachedTx) && cachedTx.length > 0) {
                        allTransactions = cachedTx.filter(t => t.date >= firstDay && t.date <= lastDay);
                        if (prevMonthBalance === null) {
                            const prevCached = cachedTx.filter(t => t.date >= prevFirstDay && t.date <= prevLastDay);
                            prevMonthBalance = computePaidBalance(prevCached);
                        }
                        cacheFound = true;
                    }
                } catch (_) {}

                try {
                    const cachedBills = await window.tonuSync.getCachedBills(currentUser.id);
                    if (Array.isArray(cachedBills) && cachedBills.length > 0) {
                        allBills = cachedBills.filter(b => b.date >= firstDay && b.date <= lastDay);
                        cacheFound = true;
                    }
                } catch (_) {}

                try {
                    const cachedGoals = await window.tonuSync.getCachedGoals(currentUser.id);
                    if (Array.isArray(cachedGoals) && cachedGoals.length > 0) {
                        allGoals = cachedGoals;
                        cacheFound = true;
                    }
                } catch (_) {}

                try {
                    const cachedDivs = await window.tonuSync.getCachedDividends(currentUser.id);
                    if (Array.isArray(cachedDivs) && cachedDivs.length > 0) {
                        allDividends = cachedDivs;
                        cacheFound = true;
                    }
                } catch (_) {}

                try {
                    const cachedInv = await window.tonuSync.getCachedInvestments(currentUser.id);
                    if (Array.isArray(cachedInv) && cachedInv.length > 0) {
                        allInvestments = cachedInv;
                        cacheFound = true;
                    }
                } catch (_) {}
            }

            // Migração transparente de legado de localStorage para IndexedDB
            try {
                const legacyTx = localStorage.getItem('tonu_transactions_' + currentUser.id);
                if (legacyTx && window.tonuSync) {
                    const parsed = JSON.parse(legacyTx);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        await window.tonuSync.setCachedTransactions(currentUser.id, parsed);
                        if (allTransactions.length === 0) allTransactions = parsed;
                        cacheFound = true;
                    }
                    localStorage.removeItem('tonu_transactions_' + currentUser.id);
                }
                const legacyBills = localStorage.getItem('tonu_bills_' + currentUser.id);
                if (legacyBills && window.tonuSync) {
                    const parsed = JSON.parse(legacyBills);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        await window.tonuSync.setCachedBills(currentUser.id, parsed);
                        if (allBills.length === 0) allBills = parsed;
                        cacheFound = true;
                    }
                    localStorage.removeItem('tonu_bills_' + currentUser.id);
                }
                const legacyGoals = localStorage.getItem('tonu_goals_' + currentUser.id);
                if (legacyGoals && window.tonuSync) {
                    const parsed = JSON.parse(legacyGoals);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        await window.tonuSync.setCachedGoals(currentUser.id, parsed);
                        if (allGoals.length === 0) allGoals = parsed;
                        cacheFound = true;
                    }
                    localStorage.removeItem('tonu_goals_' + currentUser.id);
                }
                const legacyDivs = localStorage.getItem('tonu_dividends_' + currentUser.id);
                if (legacyDivs && window.tonuSync) {
                    const parsed = JSON.parse(legacyDivs);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        await window.tonuSync.setCachedDividends(currentUser.id, parsed);
                        if (allDividends.length === 0) allDividends = parsed;
                        cacheFound = true;
                    }
                    localStorage.removeItem('tonu_dividends_' + currentUser.id);
                }
                const legacyInv = localStorage.getItem('tonu_investments_' + currentUser.id);
                if (legacyInv && window.tonuSync) {
                    const parsed = JSON.parse(legacyInv);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        await window.tonuSync.setCachedInvestments(currentUser.id, parsed);
                        if (allInvestments.length === 0) allInvestments = parsed;
                        cacheFound = true;
                    }
                    localStorage.removeItem('tonu_investments_' + currentUser.id);
                }
            } catch (_) {}

            if (cacheFound) {
                console.log("📶 Usando dados do cache IndexedDB:", {
                    transacoes: allTransactions.length,
                    contas: allBills.length,
                    proventos: allDividends.length,
                    investimentos: allInvestments.length,
                    metas: allGoals.length
                });
                setMobileCacheBanner(true);
            } else {
                setMobileCacheBanner(false);
            }
        } else {
            setMobileCacheBanner(false);
            // Atualiza cache canônico IndexedDB para consultas offline futuras
            if (currentUser && currentUser.id && window.tonuSync) {
                try {
                    if (allTransactions.length > 0) {
                        await window.tonuSync.setCachedTransactions(currentUser.id, allTransactions);
                    }
                    if (allBills.length > 0) {
                        await window.tonuSync.setCachedBills(currentUser.id, allBills);
                    }
                    if (allGoals.length > 0) {
                        await window.tonuSync.setCachedGoals(currentUser.id, allGoals);
                    }
                    if (allDividends.length > 0) {
                        await window.tonuSync.setCachedDividends(currentUser.id, allDividends);
                    }
                    if (allInvestments.length > 0) {
                        await window.tonuSync.setCachedInvestments(currentUser.id, allInvestments);
                    }
                } catch (_) {}
            }
            // Limpa chaves financeiras concorrentes antigas do localStorage
            if (currentUser && currentUser.id) {
                try {
                    localStorage.removeItem('tonu_transactions_' + currentUser.id);
                    localStorage.removeItem('tonu_bills_' + currentUser.id);
                    localStorage.removeItem('tonu_goals_' + currentUser.id);
                    localStorage.removeItem('tonu_dividends_' + currentUser.id);
                    localStorage.removeItem('tonu_investments_' + currentUser.id);
                } catch (_) {}
            }
        }

        // Se metas vieram vazias mas há cache IndexedDB (ex: offline parcial), recupera metas cacheadas
        if ((!allGoals || allGoals.length === 0) && currentUser?.id && window.tonuSync) {
            try {
                const cachedGoals = await window.tonuSync.getCachedGoals(currentUser.id);
                if (Array.isArray(cachedGoals) && cachedGoals.length > 0) {
                    allGoals = cachedGoals;
                }
            } catch (_) {}
        }

        // Sincroniza patrimônio em custódia antes de renderizar o carrossel de metas
        await loadSyncedPortfolioEquity();

        _cache.key = cacheKey;
        _cache.ts = Date.now();
        _cache.payload = {
            allTransactions,
            allBills,
            allDividends,
            allGoals,
            allInvestments,
            prevMonthBalance
        };

        console.log("📊 Mobile: Dados unificados prontos:", {
            transacoes: allTransactions.length,
            contas: allBills.length,
            proventos: allDividends.length,
            investimentos: allInvestments.length,
            metas: allGoals.length
        });

        renderSummary();
        renderMobileChart();
        renderMobileInsights();
        renderMobileGoals();
        renderCategoryBars();
        renderTransactions();
        loadAIInsights().catch(() => {});

        if (typeof window.checkNotifications === 'function') {
            window.checkNotifications();
        }
    } catch (error) {
        console.error("❌ Erro ao carregar dados mobile:", error);
    }
}

async function syncMobileDashboardNow() {
    try {
        if (window.tonuSync && typeof window.tonuSync.flushQueue === 'function') {
            await window.tonuSync.flushQueue();
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

function setMobileCacheBanner(show) {
    let banner = document.getElementById("mobileCacheSyncBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "mobileCacheSyncBanner";
        banner.className = "clean-cache-banner";
        const container = document.getElementById("heroCardContainer") || document.getElementById("summaryContainer") || document.getElementById("main-content");
        if (container && container.parentNode) {
            container.parentNode.insertBefore(banner, container);
        }
    }
    if (show) {
        banner.innerHTML = '<i class="fas fa-wifi" aria-hidden="true"></i> <span>Exibindo dados em cache — sincronizando...</span>';
        banner.style.display = "flex";
    } else {
        banner.style.display = "none";
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
    renderMobileChart();
    renderTransactions();
}
window.addEventListener('tonu:privacyChanged', (e) => {
    const nextHidden = Boolean(e?.detail?.hidden);
    if (isBalanceHidden !== nextHidden) {
        isBalanceHidden = nextHidden;
        renderSummary();
        renderMobileChart();
        renderTransactions();
    }
});

// ============================================
// RENDER RESUMO HERO + CARDS DE RESUMO
// ============================================
function renderSummary() {
    let income = 0, expense = 0;
    allTransactions.forEach(t => {
        if (!isTxPaid(t)) return;
        const amt = Math.abs(Number(t.amount || 0));
        if (isNaN(amt) || amt <= 0) return;
        if (t.type === "income") income += amt;
        else if (t.type === "expense") expense += amt;
    });
    const balance = income - expense;

    // Contas pendentes do mês selecionado (API: allBills)
    const selDate = getSelectedMonthDate();
    const currentMonthPrefix = `${selDate.getFullYear()}-${String(selDate.getMonth() + 1).padStart(2, "0")}`;
    const pendingBills = allBills.filter(b => {
        const isPaid = (b.paid === true || b.paid === 'true' || b.paid === 1);
        const billMonth = (b.due_date || b.date || '').substring(0, 7);
        return !isPaid && (!billMonth || billMonth === currentMonthPrefix);
    });
    const pendingBillsAmount = pendingBills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);

    // Proventos do mês selecionado (API: allDividends)
    const todayISO = new Date().toLocaleDateString('sv');
    let monthPaidDivs = 0;
    let monthPendingDivs = 0;

    allDividends.forEach(d => {
        const val = Number(d.total_value || d.net_value || d.amount || d.total_amount) || 0;
        const dt = (d.payment_date || d.date || '').substring(0, 10);
        const isCurMonth = dt && dt.substring(0, 7) === currentMonthPrefix;

        if (dt > todayISO && isCurMonth) {
            monthPendingDivs += val;
        } else if (isCurMonth) {
            monthPaidDivs += val;
        }
    });

    const displayMonthDivs = monthPaidDivs > 0 ? monthPaidDivs : (monthPendingDivs > 0 ? monthPendingDivs : 0);

    const heroContainer = document.getElementById("heroCardContainer");
    const summaryContainer = document.getElementById("summaryContainer");
    const comp = window.TonuDashboardComponents;

    let momDeltaPct = null;
    if (typeof prevMonthBalance === 'number' && Math.abs(prevMonthBalance) > 0.01) {
        momDeltaPct = ((balance - prevMonthBalance) / Math.abs(prevMonthBalance)) * 100;
    }

    if (comp) {
        // Injeta saldo do mês, comparativo MoM, entradas e saídas no HeroCard
        if (heroContainer) {
            heroContainer.innerHTML = comp.renderHeroCard({
                balance,
                income,
                expense,
                pendingBillsAmount,
                pendingBillsCount: pendingBills.length,
                momDeltaPct,
                isHidden: isBalanceHidden,
                formatCurrency
            });
        }
        // Injeta contas pendentes e proventos do mês nos SummaryCards
        if (summaryContainer) {
            summaryContainer.innerHTML = comp.renderSummaryCards({
                pendingBillsAmount,
                pendingBillsCount: pendingBills.length,
                displayMonthDivs,
                monthPendingDivs,
                isHidden: isBalanceHidden,
                formatCurrency
            });
        }
    }

    if (!isBalanceHidden && window.TonuMobileUI && typeof window.TonuMobileUI.animateValue === 'function') {
        window.TonuMobileUI.animateValue(document.getElementById('heroBalanceVal'), balance, formatCurrency);
        window.TonuMobileUI.animateValue(document.getElementById('heroIncomeVal'), income, formatCurrency);
        window.TonuMobileUI.animateValue(document.getElementById('heroExpenseVal'), expense, formatCurrency);
    }
    if (window.TonuMobileUI && typeof window.TonuMobileUI.applyPrivacyState === 'function') {
        window.TonuMobileUI.applyPrivacyState(isBalanceHidden);
    }
}

// ============================================
// RENDER GRÁFICO DE ROSCA + LEGENDA LATERAL (CHART.JS)
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

    // Calcula despesas pagas do mês agrupadas por categoria (API: allTransactions + categories)
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

        const amt = Math.abs(Number(t.amount || 0));
        if (isNaN(amt) || amt <= 0) return;

        if (!catMap[normKey]) {
            catMap[normKey] = {
                id: normKey,
                name: displayName,
                amount: 0
            };
        }
        catMap[normKey].amount += amt;
    });

    const allCategories = Object.values(catMap).sort((a, b) => b.amount - a.amount);
    const totalExpensesAmount = allCategories.reduce((sum, item) => sum + item.amount, 0);

    const comp = window.TonuDashboardComponents;
    const donutItems = comp
        ? comp.buildDonutCategoriesWithPalette(allCategories)
        : allCategories.slice(0, 6);

    if (comp) {
        container.innerHTML = comp.renderExpensesDonutCard({
            sortedCategories: allCategories,
            totalExpensesAmount,
            isHidden: isBalanceHidden,
            formatCurrency,
            sanitizeString: typeof sanitizeString === 'function' ? sanitizeString : null
        });
        comp.hydrateDynamicStyles(container);
    }

    const canvas = document.getElementById("mobileChartCanvas");
    if (!canvas || donutItems.length === 0 || totalExpensesAmount <= 0) {
        if (mobileChartInstance) {
            mobileChartInstance.destroy();
            mobileChartInstance = null;
        }
        return;
    }

    if (mobileChartInstance) {
        mobileChartInstance.destroy();
        mobileChartInstance = null;
    }

    const isDark = document.body.classList.contains('dark-theme');
    const ctx = canvas.getContext("2d");

    mobileChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: donutItems.map(s => s.name),
            datasets: [{
                data: donutItems.map(s => s.amount),
                backgroundColor: donutItems.map(s => s.paletteColor || '#6C3DD1'),
                borderWidth: 1.5,
                borderColor: isDark ? '#1E293B' : '#FFFFFF',
                hoverOffset: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '66%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const pct = totalExpensesAmount > 0 ? Math.round((context.parsed / totalExpensesAmount) * 100) : 0;
                            return ` ${context.label}: ${formatCurrency(context.parsed)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
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

    let mobBadge = { label: 'Bom', color: '#3B82F6', bg: '#EFF6FF' };
    if (finalScoreMob >= 80) mobBadge = { label: 'Excelente', color: '#10B981', bg: '#ECFDF5' };
    else if (finalScoreMob < 40) mobBadge = { label: 'Atenção', color: '#EF4444', bg: '#FEF2F2' };
    else if (finalScoreMob < 60) mobBadge = { label: 'Regular', color: '#F59E0B', bg: '#FFFBEB' };

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
            <div class="mob-action-card tone-danger" data-nav="bills.html">
                <i class="fas ${isOverdue ? 'fa-exclamation-triangle' : 'fa-clock'} mob-action-icon danger"></i>
                <div class="mob-action-desc">
                    <strong>Pagar: ${urgentMobBill.description || 'Conta'}</strong>
                    <small>${isOverdue ? 'Conta atrasada' : 'Vence em até 48h'} • ${formatCurrency(urgentMobBill.amount)}</small>
                </div>
                <span class="mob-action-tag tone-danger">Pagar</span>
            </div>
        `);
    }
    if (budgetAlertMob && budgetAlertMob.type === 'danger') {
        mobActionCards.push(`
            <div class="mob-action-card tone-warning" data-nav="transactions.html">
                <i class="fas fa-chart-pie mob-action-icon warning"></i>
                <div class="mob-action-desc">
                    <strong>Ver Gastos: Limite Estourado</strong>
                    <small>${budgetAlertMob.text}</small>
                </div>
                <span class="mob-action-tag tone-warning">Revisar</span>
            </div>
        `);
    } else if (topCatPercent > 35 && topCatName && topCatName !== 'Nenhum gasto') {
        mobActionCards.push(`
            <div class="mob-action-card tone-warning" data-nav="transactions.html">
                <i class="fas fa-fire mob-action-icon warning"></i>
                <div class="mob-action-desc">
                    <strong>${typeof sanitizeString === 'function' ? sanitizeString(topCatName) : topCatName}: ${topCatPercent}% da renda</strong>
                    <small>Maior centro de custo</small>
                </div>
                <span class="mob-action-tag tone-warning">Ver</span>
            </div>
        `);
    }

    // Checklist de ações rápidas no mobile restrito a "Pagar Agora" e "Ver Gastos"
    const displayedMobActionCards = mobActionCards.slice(0, 2);
    const mobScoreTone = finalScoreMob >= 80 ? 'excellent' : (finalScoreMob < 40 ? 'danger' : (finalScoreMob < 60 ? 'warning' : 'good'));
    const rateTone = rateClass === 'success' ? 'success' : (rateClass === 'danger' ? 'danger' : 'warning');

    const statusBadgeEl = document.getElementById('insightsStatusBadge');
    if (statusBadgeEl) {
        if (displayedMobActionCards.length > 0) {
            statusBadgeEl.className = 'clean-insights-status is-alert';
            statusBadgeEl.innerHTML = `<i class="fas fa-exclamation-circle" aria-hidden="true"></i> ${displayedMobActionCards.length} ${displayedMobActionCards.length === 1 ? 'alerta' : 'alertas'}`;
        } else {
            statusBadgeEl.className = 'clean-insights-status is-ok';
            statusBadgeEl.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i> Em dia';
        }
    }

    container.innerHTML = `
        <!-- CARD 1: O QUE FAZER HOJE? -->
        <div class="mobile-insights-card mob-quick-actions-card">
            <div class="mobile-insights-header">
                <div class="mobile-insights-title">
                    <i class="fas fa-bolt mob-title-icon warning"></i> O que fazer hoje?
                </div>
                <span class="mobile-insights-pill ${displayedMobActionCards.length > 0 ? 'tone-danger' : 'tone-success'}">
                    ${displayedMobActionCards.length > 0 ? `${displayedMobActionCards.length} ${displayedMobActionCards.length === 1 ? 'pendência' : 'pendências'}` : 'Em dia'}
                </span>
            </div>
            <div class="mob-checklist-wrap">
                ${displayedMobActionCards.length > 0 ? displayedMobActionCards.join('') : `
                    <div class="mob-all-clear-box">
                        <i class="fas fa-check-circle"></i>
                        <span>Tudo em dia! Sem pendências críticas hoje.</span>
                    </div>
                `}
            </div>
        </div>

        <!-- CARD 2: SAÚDE FINANCEIRA (DIAGNÓSTICO 360º) -->
        <div class="mobile-insights-card mob-health-score-card">
            <div class="mobile-insights-header">
                <div class="mobile-insights-title">
                    <i class="fas fa-heart-pulse mob-title-icon brand"></i> Saúde Financeira
                </div>
                <span class="mobile-insights-pill">Diagnóstico 360º</span>
            </div>

            <!-- ANEL DO SCORE 360º NO MOBILE -->
            <div class="mob-score-container">
                <div class="mob-score-ring-wrap">
                    <svg viewBox="0 0 72 72" class="mob-score-svg">
                        <circle cx="36" cy="36" r="30" fill="none" stroke="#e2e8f0" stroke-width="6" />
                        <circle cx="36" cy="36" r="30" fill="none" stroke="${mobBadge.color}" stroke-width="6" stroke-dasharray="${circMob.toFixed(1)}" stroke-dashoffset="${offsetMob.toFixed(1)}" stroke-linecap="round" />
                    </svg>
                    <div class="mob-score-center">
                        <span class="mob-score-val">${finalScoreMob}</span>
                        <span class="mob-score-sub">/100</span>
                    </div>
                </div>
                <div class="mob-score-meta">
                    <span class="mob-score-level-pill ${mobScoreTone}">${mobBadge.label}</span>
                    <h4 class="mob-score-heading">Diagnóstico Geral</h4>
                    <p class="mob-score-subtext">Equilíbrio • Contas • Dívidas • Futuro</p>
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
                        <span class="detail">${formatCurrency(Math.max(0, savings))} poupados</span>
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
                        <span class="detail">${typeof sanitizeString === 'function' ? sanitizeString(topCatName || '') : (topCatName || '')} (${formatCurrency(topCatAmount)})</span>
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
                <span class="mobile-insight-badge tone-brand">
                    ${pendingBillsAmount > 0 ? `${formatCurrency(pendingBillsAmount)} pendente` : 'Tudo em dia'}
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
                        <span class="detail">${formatCurrency(totalDividends)} proventos • ${formatCurrency(totalAportes)} aportes</span>
                    </div>
                </div>
                <span class="mobile-insight-badge tone-brand">
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
                <span class="mobile-insight-badge ${extraIncome > 0 ? 'tone-orange' : 'tone-muted'}">
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
}

// ============================================
// SINCRONIZAÇÃO DE PATRIMÔNIO PARA METAS NO DASHBOARD
// ============================================
async function loadSyncedPortfolioEquity(options = {}) {
    const force = !!(options && options.forceRefresh);
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

        if ((!corpList || corpList.length === 0) && navigator.onLine && window.supabaseClient && currentUser?.id) {
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
            color: '#8B5CF6',
            iconBg: 'rgba(139, 92, 246, 0.14)',
            percent,
            currentLabel: 'Em custódia',
            currentValue: formatCurrency(current),
            targetLabel: pending.length > 0 ? 'Próximo alvo' : 'Alvo',
            targetValue: formatCurrency(target)
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
            targetLabel: 'Alvo total',
            targetValue: formatCurrency(target)
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
            targetLabel: 'Alvo mensal',
            targetValue: formatCurrency(target)
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
            targetLabel: 'Restantes',
            targetValue: `${Math.max(0, count - doneCount)}`
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
        targetLabel: 'Alvo',
        targetValue: formatCurrency(target)
    };
}

function renderMobileGoals() {
    const container = document.getElementById("mobileGoalsContainer");
    if (!container) return;

    const comp = window.TonuDashboardComponents;
    if (!comp) return;

    const selDate = getSelectedMonthDate();
    // Injeta lista de metas + patrimônio em custódia + proventos do mês no GoalProgressCard
    container.innerHTML = comp.renderGoalProgressCard({
        goals: allGoals,
        cachedEquity: cachedDashboardEquity,
        monthlyDividends: getMonthlyDividendsTotalForDashboard(),
        selectedYear: selDate.getFullYear(),
        isHidden: isBalanceHidden,
        formatCurrency,
        sanitizeString: typeof sanitizeString === 'function' ? sanitizeString : null
    });
    comp.hydrateDynamicStyles(container);
    if (typeof window.renderMobileGoals === 'function') {
        // Also ensure privacy state refreshes cleanly on goal card
        if (window.TonuMobileUI && typeof window.TonuMobileUI.applyPrivacyState === 'function') {
            window.TonuMobileUI.applyPrivacyState(isBalanceHidden);
        }
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
// RENDER TRANSAÇÕES (3 ÚLTIMAS TRANSAÇÕES PAGAS)
// ============================================
function renderTransactions() {
    const container = document.getElementById("mobileTransactions");
    if (!container) return;

    const recent = allTransactions.filter(t => isTxPaid(t)).slice(0, 3);
    const comp = window.TonuDashboardComponents;
    if (!comp) return;

    // Injeta as 3 últimas transações pagas e categorias no componente TransactionList
    container.innerHTML = comp.renderTransactionList({
        transactions: recent,
        categories,
        isHidden: isBalanceHidden,
        formatCurrency,
        formatDate,
        sanitizeString: typeof sanitizeString === 'function' ? sanitizeString : null,
        cleanDescription: window.TonuDeduplicate ? window.TonuDeduplicate.cleanDisplayDescription : null
    });
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

function renderAIInsights(insights, meta) {
    const body = document.getElementById('aiInsightsBody');
    if (!body) return;

    const list = Array.isArray(insights) ? insights.slice(0, 3) : [];
    const badgeEl = document.getElementById('aiInsightsSourceBadge');
    if (badgeEl && meta && meta.source) {
        badgeEl.textContent = meta.source === 'cache' || meta.source === 'session' ? '90d • Cache' : '90d • IA';
    }

    if (list.length === 0) {
        body.innerHTML = '<p class="mobile-ai-empty">Insights IA indisponíveis no momento. O Diagnóstico 360º acima segue ativo.</p>';
        return;
    }

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
        renderAIInsights([]);
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
        renderAIInsights([]);
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
            renderAIInsights([]);
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

        if (!res.ok) {
            renderAIInsights([]);
            return;
        }

        const data = await res.json();
        const insights = Array.isArray(data?.insights) ? data.insights : [];
        if (insights.length > 0) {
            try {
                sessionStorage.setItem(sessionKey, JSON.stringify({
                    insights,
                    generated_at: data.generated_at || new Date().toISOString(),
                    ts: Date.now()
                }));
            } catch (_) {}
        }
        renderAIInsights(insights, { source: data?.source || 'ai' });
    } catch (_) {
        renderAIInsights([]);
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
