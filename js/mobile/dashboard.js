// ============================================
// MOBILE DASHBOARD
// ============================================

console.log("📱 Mobile Dashboard carregado");

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
    loadMobileData();
}

function goToCurrentMonth() {
    currentMonthOffset = 0;
    updateMobileMonthDisplay();
    loadMobileData();
}

window.changeMonth = changeMonth;
window.goToCurrentMonth = goToCurrentMonth;
window.changeMonthHandler = changeMonth;
window.goToCurrentMonthHandler = goToCurrentMonth;

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
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
        document.getElementById("greetingText").textContent = `Olá, ${name} 👋`;

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
async function loadMobileData() {
    try {
        updateMobileMonthDisplay();
        const targetDate = getSelectedMonthDate();
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, "0");
        const lastDayNum = new Date(year, targetDate.getMonth() + 1, 0).getDate();
        const firstDay = `${year}-${month}-01`;
        const lastDay = `${year}-${month}-${String(lastDayNum).padStart(2, "0")}`;

        // 1. Transações
        const txPromise = supabaseClient
            .from("transactions")
            .select("*")
            .eq("user_id", currentUser.id)
            .gte("date", firstDay)
            .lte("date", lastDay)
            .order("date", { ascending: false });

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

        const [txRes, billsRes, divData, goalsRes, invData] = await Promise.all([
            txPromise,
            billsPromise,
            divPromise,
            goalsPromise,
            invPromise
        ]);

        let loadedData = txRes.data || [];
        if (window.TonuDeduplicate) {
            loadedData = window.TonuDeduplicate.deduplicate(loadedData, {
                autoCleanRemote: true,
                userId: currentUser?.id
            }).cleanList;
        }
        allTransactions = loadedData;

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

        if (typeof window.checkNotifications === 'function') {
            window.checkNotifications();
        }
    } catch (error) {
        console.error("❌ Erro ao carregar dados mobile:", error);
    }
}

function setMobileCacheBanner(show) {
    let banner = document.getElementById("mobileCacheSyncBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "mobileCacheSyncBanner";
        banner.style.cssText = "display:none; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:10px; padding:8px 12px; margin:0 16px 12px 16px; font-size:12px; font-weight:600; text-align:center;";
        const container = document.getElementById("summaryContainer") || document.getElementById("main-content");
        if (container && container.parentNode) {
            container.parentNode.insertBefore(banner, container);
        }
    }
    if (show) {
        banner.innerHTML = '<i class="fas fa-wifi" style="margin-right:6px;"></i> 📶 Exibindo dados em cache — sincronizando...';
        banner.style.display = "block";
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
    renderSummary();
}

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
    const divValueColor = monthPaidDivs > 0 ? '#8b5cf6' : (monthPendingDivs > 0 ? '#0284c7' : '#8b5cf6');

    const mask = (val) => isBalanceHidden ? '••••••' : val;

    const container = document.getElementById("summaryContainer");
    if (!container) return;

    container.innerHTML = `
        <!-- HERO CARD FINTECH -->
        <div class="mobile-hero-balance">
            <div class="mobile-hero-top">
                <span class="label"><i class="fas fa-wallet"></i> Saldo Operacional</span>
                <button class="eye-toggle-btn" onclick="toggleBalanceVisibility()" title="${isBalanceHidden ? 'Mostrar Saldo' : 'Ocultar Saldo'}" aria-label="Alternar visibilidade do saldo">
                    <i class="fas ${isBalanceHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
                </button>
            </div>
            <div class="mobile-hero-value">
                ${mask(formatCurrency(balance))}
            </div>
            <div class="mobile-hero-footer">
                <div class="mobile-hero-stat">
                    <span class="stat-label"><i class="fas fa-arrow-up" style="color:#4ade80;"></i> Entradas</span>
                    <span class="stat-value income">${mask(formatCurrency(income))}</span>
                </div>
                <div class="mobile-hero-stat">
                    <span class="stat-label"><i class="fas fa-arrow-down" style="color:#fca5a5;"></i> Saídas Pagas</span>
                    <span class="stat-value expense">${mask(formatCurrency(expense))}</span>
                    ${pendingBillsAmount > 0 ? `<span style="font-size:9px; color:#fbbf24; margin-top:2px; display:block;">Falta pagar: ${mask(formatCurrency(pendingBillsAmount))}</span>` : ''}
                </div>
            </div>
        </div>

        <!-- GRID DE INDICADORES RÁPIDOS -->
        <div class="mobile-grid">
            <div class="mobile-card">
                <div class="card-icon bills"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="card-info">
                    <div class="card-label">Contas Pendentes</div>
                    <div class="card-value" style="color: ${pendingBills.length > 0 ? '#d97706' : '#10b981'}">
                        ${mask(formatCurrency(pendingBillsAmount))}
                    </div>
                </div>
            </div>
            <div class="mobile-card">
                <div class="card-icon balance" style="background:#8b5cf6;"><i class="fas fa-coins"></i></div>
                <div class="card-info">
                    <div class="card-label">Proventos Mês</div>
                    <div class="card-value" style="color: ${divValueColor};">
                        ${mask(formatCurrency(displayMonthDivs))}
                    </div>
                    ${monthPendingDivs > 0 ? `
                        <div style="font-size:9.5px; color:#0284c7; font-weight:600; margin-top:2px;">
                            <i class="far fa-clock"></i> A receber: ${mask(formatCurrency(monthPendingDivs))}
                        </div>
                    ` : (totalFutureDivs > 0 ? `
                        <div style="font-size:9.5px; color:#0284c7; font-weight:600; margin-top:2px;">
                            <i class="far fa-clock"></i> Previsto: ${mask(formatCurrency(totalFutureDivs))}
                        </div>
                    ` : '')}
                </div>
            </div>
        </div>
    `;
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
                    <i class="fas fa-chart-pie" style="color:#6C5CE7;"></i> Visão Gráfica de Gastos
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
                        <span class="center-value">${formatCurrency(totalExpensesAmount)}</span>
                    </div>
                ` : ''}
            </div>
            ${categoriesHtml}
        </div>
    `;

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
                    backgroundColor: ['#10b981', '#ef4444', '#6c5ce7'],
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
            <div class="mob-action-card" onclick="window.location.href='bills.html'" style="border-left:3px solid #ef4444;">
                <i class="fas ${isOverdue ? 'fa-exclamation-triangle' : 'fa-clock'}" style="color:#ef4444; font-size:14px;"></i>
                <div class="mob-action-desc">
                    <strong>Pagar: ${urgentMobBill.description || 'Conta'}</strong>
                    <small>${isOverdue ? 'Conta atrasada' : 'Vence em até 48h'} • ${formatCurrency(urgentMobBill.amount)}</small>
                </div>
                <span class="mob-action-tag" style="background:#fee2e2; color:#b91c1c;">Pagar</span>
            </div>
        `);
    }
    if (budgetAlertMob && budgetAlertMob.type === 'danger') {
        mobActionCards.push(`
            <div class="mob-action-card" onclick="window.location.href='transactions.html'" style="border-left:3px solid #f59e0b;">
                <i class="fas fa-chart-pie" style="color:#f59e0b; font-size:14px;"></i>
                <div class="mob-action-desc">
                    <strong>Ver Gastos: Limite Estourado</strong>
                    <small>${budgetAlertMob.text}</small>
                </div>
                <span class="mob-action-tag" style="background:#fef3c7; color:#b45309;">Revisar</span>
            </div>
        `);
    } else if (topCatPercent > 35 && topCatName && topCatName !== 'Nenhum gasto') {
        mobActionCards.push(`
            <div class="mob-action-card" onclick="window.location.href='transactions.html'" style="border-left:3px solid #f59e0b;">
                <i class="fas fa-fire" style="color:#f59e0b; font-size:14px;"></i>
                <div class="mob-action-desc">
                    <strong>${typeof sanitizeString === 'function' ? sanitizeString(topCatName) : topCatName}: ${topCatPercent}% da renda</strong>
                    <small>Maior centro de custo</small>
                </div>
                <span class="mob-action-tag" style="background:#fef3c7; color:#b45309;">Ver</span>
            </div>
        `);
    }

    // Checklist de ações rápidas no mobile restrito a "Pagar Agora" e "Ver Gastos"
    const displayedMobActionCards = mobActionCards.slice(0, 2);

    container.innerHTML = `
        <!-- CARD 1: O QUE FAZER HOJE? -->
        <div class="mobile-insights-card mob-quick-actions-card">
            <div class="mobile-insights-header">
                <div class="mobile-insights-title">
                    <i class="fas fa-bolt" style="color:#f59e0b;"></i> O que fazer hoje?
                </div>
                <span class="mobile-insights-pill" style="${displayedMobActionCards.length > 0 ? 'background:rgba(239, 68, 68, 0.12); color:#dc2626;' : 'background:rgba(16, 185, 129, 0.12); color:#10b981;'}">
                    ${displayedMobActionCards.length > 0 ? `${displayedMobActionCards.length} ${displayedMobActionCards.length === 1 ? 'pendência' : 'pendências'}` : 'Em dia ✨'}
                </span>
            </div>
            <div class="mob-checklist-wrap" style="margin-bottom:0;">
                ${displayedMobActionCards.length > 0 ? displayedMobActionCards.join('') : `
                    <div style="padding:10px 12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; font-size:11.5px; color:#15803d; display:flex; align-items:center; gap:8px; font-weight:600;">
                        <i class="fas fa-check-circle" style="font-size:15px; color:#10b981; flex-shrink:0;"></i>
                        <span>Tudo em dia! Sem pendências críticas hoje. ✨</span>
                    </div>
                `}
            </div>
        </div>

        <!-- CARD 2: SAÚDE FINANCEIRA (DIAGNÓSTICO 360º) -->
        <div class="mobile-insights-card mob-health-score-card">
            <div class="mobile-insights-header">
                <div class="mobile-insights-title">
                    <i class="fas fa-heart-pulse" style="color:#6C5CE7;"></i> Saúde Financeira
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
                <div>
                    <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:9999px; background:${mobBadge.bg}; color:${mobBadge.color};">${mobBadge.label}</span>
                    <h4 style="margin:4px 0 2px 0; font-size:14px; font-weight:700; color:var(--color-text,#1e293b);">Diagnóstico Geral</h4>
                    <p style="margin:0; font-size:11px; color:#64748b;">Equilíbrio • Contas • Dívidas • Futuro</p>
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
                <span class="mobile-insight-badge" style="background:${rateClass === 'success' ? '#dcfce7' : (rateClass === 'danger' ? '#fee2e2' : '#fef3c7')}; color:${rateClass === 'success' ? '#15803d' : (rateClass === 'danger' ? '#b91c1c' : '#b45309')}">
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
                <span class="mobile-insight-badge" style="background:#fef3c7; color:#b45309;">
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
                <span class="mobile-insight-badge" style="background:#ede9fe; color:#6d28d9;">
                    ${pendingBillsAmount > 0 ? `${formatCurrency(pendingBillsAmount)} pendente` : 'Tudo em dia! ✨'}
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
                <span class="mobile-insight-badge" style="background:#f3e8ff; color:#7e22ce;">
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
                <span class="mobile-insight-badge" style="background:${extraIncome > 0 ? '#ffedd5' : '#f1f5f9'}; color:${extraIncome > 0 ? '#c2410c' : '#64748b'};">
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
        color: '#6C5CE7',
        iconBg: 'rgba(108, 92, 231, 0.14)',
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
    const cardsHtml = summaryCards.map(card => `
        <a href="goals.html" class="goal-type-card" aria-label="${card.title}: ${card.percent}% concluído">
            <div class="goal-type-card-top">
                <div class="goal-type-icon" style="background:${card.iconBg}; color:${card.color};">
                    <i class="fas ${card.icon}"></i>
                </div>
                <div class="goal-type-meta">
                    <div class="goal-type-name">${card.title}</div>
                    <div class="goal-type-sub">${card.subtitle}</div>
                </div>
                <span class="goal-type-pct" style="color:${card.color};">${card.percent}%</span>
            </div>
            <div class="goal-type-progress-track">
                <div class="goal-type-progress-fill" style="width:${card.percent}%; background:${card.color};"></div>
            </div>
            <div class="goal-type-values">
                <div class="goal-type-val-block">
                    <span class="goal-type-val-label">${card.currentLabel}</span>
                    <span class="goal-type-val-num">${card.currentValue}</span>
                </div>
                <div class="goal-type-val-block right">
                    <span class="goal-type-val-label">${card.targetLabel}</span>
                    <span class="goal-type-val-num">${card.targetValue}</span>
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

        await loadMobileData();
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
// FUNÇÕES AUXILIARES
// ============================================
function formatCurrency(value) {
    if (typeof window.formatCurrency === 'function' && window.formatCurrency !== formatCurrency) {
        return window.formatCurrency(value);
    }
    if (value === null || value === undefined || value === '') value = 0;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[R$\s]/g, '');
        if (cleaned.includes(',') && cleaned.includes('.')) {
            value = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (cleaned.includes(',')) {
            value = cleaned.replace(',', '.');
        }
        value = parseFloat(value);
    }
    const num = Number(value) || 0;
    try {
        const formatted = new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
        return formatted.replace(/\u00A0/g, ' ');
    } catch {
        const isNegative = num < 0;
        const parts = Math.abs(num).toFixed(2).split('.');
        const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        const res = 'R$ ' + intPart + ',' + parts[1];
        return isNegative ? '-' + res : res;
    }
}

function formatDate(date) {
    if (typeof window.formatDate === 'function' && window.formatDate !== formatDate) {
        return window.formatDate(date);
    }
    if (!date) return "--/--/----";
    const d = new Date(typeof date === 'string' && date.length === 10 ? date + 'T12:00:00' : date);
    return d.toLocaleDateString("pt-BR");
}

function toggleTheme() {
    if (typeof window.toggleTheme === 'function' && window.toggleTheme !== toggleTheme) {
        return window.toggleTheme();
    }
    const isDark = document.body.classList.toggle("dark-theme");
    const theme = isDark ? "dark" : "light";
    localStorage.setItem("tonu_theme", theme);
    const icon = document.querySelector("#themeIcon");
    if (icon) {
        icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    }
}

window.renderMobileInsights = renderMobileInsights;
window.renderMobileGoals = renderMobileGoals;

// Atualiza patrimônio e metas ao retornar ao Dashboard ou alterar carteira em outra aba
async function refreshDashboardGoalsSync() {
    if (!currentUser) return;
    await loadSyncedPortfolioEquity({ forceRefresh: true });
    renderMobileGoals();
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentUser) {
        refreshDashboardGoalsSync().catch(() => {});
    }
});

window.addEventListener("focus", () => {
    if (currentUser) {
        refreshDashboardGoalsSync().catch(() => {});
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
