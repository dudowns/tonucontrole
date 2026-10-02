// ============================================
// MOBILE DASHBOARD
// ============================================

console.log("📱 Mobile Dashboard carregado");

let currentUser = null;
let allTransactions = [];
let categories = [];
let allBills = [];
let allDividends = [];
let allGoals = [];
let mobileChartInstance = null;
let currentChartMode = 'categories';
let isBalanceHidden = localStorage.getItem('tonu_hide_balance') === 'true';
let currentMonthOffset = 0;

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
                { id: 'cat_investimentos', name: '💼 Investimentos', type: 'income', icon: 'fa-chart-line', color: '#00CEC9' },
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

        // 3. Proventos
        const divPromise = supabaseClient
            .from("dividends")
            .select("*")
            .eq("user_id", currentUser.id);

        // 4. Metas
        const goalsPromise = supabaseClient
            .from("goals")
            .select("*")
            .eq("user_id", currentUser.id);

        const [txRes, billsRes, divRes, goalsRes] = await Promise.all([
            txPromise,
            billsPromise,
            divPromise,
            goalsPromise
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
        allDividends = divRes?.data || [];
        allGoals = goalsRes?.data || [];

        // ==================================================================
        // CORREÇÃO 3 — FALLBACK DE CACHE LOCAL NO DASHBOARD MOBILE
        // ==================================================================
        const isRemoteEmpty = (allTransactions.length === 0 && allBills.length === 0 && allDividends.length === 0 && allGoals.length === 0);

        if (isRemoteEmpty && currentUser && currentUser.id) {
            console.log("ℹ️ Dados remotos vazios, consultando cache local de segurança...");
            let cacheFound = false;

            // 1. Tentar ler do localStorage:
            try {
                const cachedTx = localStorage.getItem('tonu_transactions_' + currentUser.id);
                if (cachedTx) {
                    const parsedTx = JSON.parse(cachedTx);
                    if (Array.isArray(parsedTx) && parsedTx.length > 0) {
                        allTransactions = parsedTx;
                        cacheFound = true;
                    }
                }
            } catch (_) {}

            try {
                const cachedBills = localStorage.getItem('tonu_bills_' + currentUser.id);
                if (cachedBills) {
                    const parsedBills = JSON.parse(cachedBills);
                    if (Array.isArray(parsedBills) && parsedBills.length > 0) {
                        allBills = parsedBills;
                        cacheFound = true;
                    }
                }
            } catch (_) {}

            try {
                const cachedGoals = localStorage.getItem('tonu_goals_' + currentUser.id);
                if (cachedGoals) {
                    const parsedGoals = JSON.parse(cachedGoals);
                    if (Array.isArray(parsedGoals) && parsedGoals.length > 0) {
                        allGoals = parsedGoals;
                        cacheFound = true;
                    }
                }
            } catch (_) {}

            try {
                const cachedDivs = localStorage.getItem('tonu_dividends_' + currentUser.id);
                if (cachedDivs) {
                    const parsedDivs = JSON.parse(cachedDivs);
                    if (Array.isArray(parsedDivs) && parsedDivs.length > 0) {
                        allDividends = parsedDivs;
                        cacheFound = true;
                    }
                }
            } catch (_) {}

            // 2. Se o cache local tiver dados, usá-los e exibir banner sutil:
            if (cacheFound) {
                console.log("📶 Usando dados do cache local:", {
                    transacoes: allTransactions.length,
                    contas: allBills.length,
                    proventos: allDividends.length,
                    metas: allGoals.length
                });
                setMobileCacheBanner(true);
            } else {
                // 3. Se ambos vazios, sim mostra conta zerada
                setMobileCacheBanner(false);
            }
        } else {
            setMobileCacheBanner(false);
            // Atualiza cache local para consultas offline futuras
            if (currentUser && currentUser.id) {
                try {
                    if (allTransactions.length > 0) {
                        localStorage.setItem('tonu_transactions_' + currentUser.id, JSON.stringify(allTransactions));
                    }
                    if (allBills.length > 0) {
                        localStorage.setItem('tonu_bills_' + currentUser.id, JSON.stringify(allBills));
                    }
                    if (allGoals.length > 0) {
                        localStorage.setItem('tonu_goals_' + currentUser.id, JSON.stringify(allGoals));
                    }
                    if (allDividends.length > 0) {
                        localStorage.setItem('tonu_dividends_' + currentUser.id, JSON.stringify(allDividends));
                    }
                } catch (_) {}
            }
        }

        console.log("📊 Mobile: Dados unificados prontos:", {
            transacoes: allTransactions.length,
            contas: allBills.length,
            proventos: allDividends.length,
            metas: allGoals.length
        });

        renderSummary();
        renderMobileChart();
        renderMobileInsights();
        renderMobileGoals();
        renderCategoryBars();
        renderTransactions();
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
        if (t.type === "income") income += Number(t.amount);
        else if (t.type === "expense") expense += Number(t.amount);
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
    const todayISO = new Date().toISOString().substring(0, 10);
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

        const name = cat?.name || t.category || (t.description ? t.description.substring(0, 20) : "Outros");
        const style = (typeof window !== 'undefined' && window.getBackendCategoryStyle)
            ? window.getBackendCategoryStyle(name, cat)
            : { color: cat?.color || '#0984E3', icon: cat?.icon || 'fa-tag', name: name };

        const groupKey = cat?.id || name;
        const amt = Number(t.amount) || 0;

        if (!catMap[groupKey]) {
            catMap[groupKey] = {
                id: groupKey,
                name: name,
                icon: style.icon,
                color: style.color,
                amount: 0
            };
        }
        catMap[groupKey].amount += amt;
        if (style.color) catMap[groupKey].color = style.color;
        if (style.icon) catMap[groupKey].icon = style.icon;
    });

    const sorted = Object.values(catMap)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6);

    const totalExpensesAmount = sorted.reduce((sum, item) => sum + item.amount, 0);

    // Gera lista de categorias integrada abaixo do gráfico
    let categoriesHtml = "";
    if (currentChartMode === 'categories' && sorted.length > 0) {
        categoriesHtml = `
            <div class="mobile-chart-categories">
                ${sorted.map(item => {
                    const pct = totalExpensesAmount > 0 ? Math.round((item.amount / totalExpensesAmount) * 100) : 0;
                    return `
                        <div class="mobile-cat-row">
                            <div class="cat-row-top">
                                <span class="cat-row-name">
                                    <span class="cat-dot" style="background:${item.color};"></span>
                                    <i class="fas ${item.icon}" style="color:${item.color}; font-size:11px; margin-right:2px;"></i>
                                    ${item.name}
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
            <div class="mobile-chart-container" style="position:relative; height: 190px;">
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
                labels: sorted.map(s => s.name),
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
            if (t.type === 'income') inc += Number(t.amount);
            else if (t.type === 'expense') exp += Number(t.amount);
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

    // Proventos
    const monthDivs = allDividends.filter(d => (d.payment_date || d.date || '').substring(0, 7) === currentMonthPrefix);
    const totalDivs = monthDivs.reduce((a, d) => a + (Number(d.total_value || d.net_value || d.amount || d.total_amount) || 0), 0);

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

    container.innerHTML = `
        <div class="mobile-insights-card">
            <div class="mobile-insights-header">
                <div class="mobile-insights-title">
                    <i class="fas fa-compass" style="color:#6C5CE7;"></i> Diagnóstico 360º
                </div>
                <span class="mobile-insights-pill">Inteligência Financeira</span>
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
                        <span class="detail">${topCatName} (${formatCurrency(topCatAmount)})</span>
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

            <!-- 4. Renda Passiva / Proventos -->
            <div class="mobile-insight-row">
                <div class="mobile-insight-left">
                    <div class="mobile-insight-icon purple">
                        <i class="fas fa-coins"></i>
                    </div>
                    <div class="mobile-insight-text">
                        <span class="title">Renda Passiva</span>
                        <span class="detail">${monthDivs.length} proventos recebidos</span>
                    </div>
                </div>
                <span class="mobile-insight-badge" style="background:#f3e8ff; color:#7e22ce;">
                    ${formatCurrency(totalDivs)}
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
                            ? `A categoria <strong>${topCatName}</strong> consome ${topCatPercent}% do seu orçamento. Reduzir 15% nela liberará cerca de <strong>${formatCurrency(topCatAmount * 0.15)}</strong> para seus aportes!`
                            : `Mantenha suas reservas e invista continuamente os proventos recebidos para acelerar a bola de neve da liberdade financeira!`)}
                </div>
            </div>
        </div>
    `;
}

// ============================================
// RENDER METAS NO MOBILE
// ============================================
function renderMobileGoals() {
    const container = document.getElementById("mobileGoalsContainer");
    if (!container) return;

    if (!allGoals || allGoals.length === 0) {
        container.innerHTML = "";
        return;
    }

    const goal = allGoals[0]; // Primeira meta
    const target = Number(goal.target_amount || goal.target || 0);
    const current = Number(goal.current_amount || goal.current || 0);
    const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const remaining = Math.max(0, target - current);

    container.innerHTML = `
        <div class="category-bars-card" style="margin-bottom:14px;">
            <div class="category-bars-header">
                <h3><i class="fas fa-bullseye" style="color:#0984E3; margin-right:6px;"></i> Meta Prioritária</h3>
                <a href="goals.html" style="font-size:11px; color:#6C5CE7; font-weight:600; text-decoration:none;">Ver todas →</a>
            </div>
            <div class="category-bar-item" style="margin-top:6px;">
                <div class="category-bar-info">
                    <span class="cat-name"><strong>${goal.title || goal.name || 'Minha Meta'}</strong></span>
                    <span class="cat-amount">${percent}%</span>
                </div>
                <div class="category-bar-track" style="height:8px; border-radius:4px; margin:6px 0;">
                    <div class="category-bar-fill" style="width: ${percent}%; background: linear-gradient(90deg, #0984E3, #6C5CE7); border-radius:4px;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--color-text-muted, #94a3b8);">
                    <span>Atual: ${formatCurrency(current)}</span>
                    <span>Falta: ${formatCurrency(remaining)}</span>
                </div>
            </div>
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
        const displayDesc = window.TonuDeduplicate ? window.TonuDeduplicate.cleanDisplayDescription(t.description) : (t.description || 'Sem descrição');

        return `
            <div class="mobile-transaction" onclick="window.location.href='transactions.html'">
                <div class="tx-left">
                    <div class="tx-icon" style="background:${color}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="tx-info">
                        <strong>${displayDesc}</strong>
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
            dateInput.value = new Date().toISOString().split("T")[0];
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

    const filtered = categories.filter(c => !c.type || c.type === currentQuickType);
    select.innerHTML = '<option value="">Selecione a categoria...</option>' +
        (filtered.length > 0 ? filtered : categories).map(c => `<option value="${c.id}">${c.name}</option>`).join("");
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
        const { data, error } = await supabaseClient.from("transactions").insert([{
            user_id: currentUser.id,
            description: desc,
            amount: amount,
            type: currentQuickType,
            category_id: category_id,
            date: date
        }]).select();

        if (error) throw error;

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
    if (!date) return "--/--/----";
    const d = new Date(date);
    return d.toLocaleDateString("pt-BR");
}

function toggleTheme() {
    const isDark = document.body.classList.toggle("dark-theme");
    const theme = isDark ? "dark" : "light";
    localStorage.setItem("tonu_theme", theme);
    const icon = document.querySelector("#themeIcon");
    if (icon) {
        icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    }
}

console.log("✅ Mobile Dashboard pronto!");
