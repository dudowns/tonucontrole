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
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;
        console.log("✅ Mobile: Usuário autenticado:", currentUser.email);

        const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário";
        document.getElementById("greetingText").textContent = `Olá, ${name} 👋`;

        await loadCategories();
        await loadMobileData();
    } catch (e) {
        console.error("❌ Erro na autenticação:", e);
        window.location.href = "../../index.html";
    }
});

// ============================================
// CARREGAR CATEGORIAS
// ============================================
async function loadCategories() {
    try {
        const { data, error } = await supabaseClient
            .from("categories")
            .select("*")
            .eq("user_id", currentUser.id);

        if (error) throw error;
        categories = data || [];
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
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const firstDay = `${year}-${month}-01`;
        const lastDay = `${year}-${month}-${new Date(year, today.getMonth() + 1, 0).getDate()}`;

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

    // Contas pendentes do mês
    const today = new Date();
    const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const pendingBills = allBills.filter(b => {
        const isPaid = (b.paid === true || b.paid === 'true' || b.paid === 1);
        const billMonth = (b.due_date || '').substring(0, 7);
        return !isPaid && (!billMonth || billMonth === currentMonthPrefix);
    });
    const pendingBillsAmount = pendingBills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);

    // Proventos do mês
    const currentMonthDividends = allDividends.filter(d => {
        const divMonth = (d.payment_date || d.date || '').substring(0, 7);
        return divMonth === currentMonthPrefix;
    });
    const totalDividends = currentMonthDividends.reduce((acc, d) => acc + (Number(d.amount || d.total_amount) || 0), 0);

    const mask = (val) => isBalanceHidden ? '••••••' : val;

    const container = document.getElementById("summaryContainer");
    if (!container) return;

    container.innerHTML = `
        <!-- HERO CARD FINTECH -->
        <div class="mobile-hero-balance">
            <div class="mobile-hero-top">
                <span class="label"><i class="fas fa-wallet"></i> Saldo Disponível</span>
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
                    <span class="stat-label"><i class="fas fa-arrow-down" style="color:#fca5a5;"></i> Saídas</span>
                    <span class="stat-value expense">${mask(formatCurrency(expense))}</span>
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
                    <div class="card-value" style="color: #8b5cf6;">
                        ${mask(formatCurrency(totalDividends))}
                    </div>
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
        const catId = t.category_id || "outros";
        const amt = Number(t.amount) || 0;
        if (!catMap[catId]) catMap[catId] = 0;
        catMap[catId] += amt;
    });

    const sorted = Object.entries(catMap)
        .map(([id, amount]) => {
            const cat = categories.find(c => c.id === id);
            return {
                id: id,
                name: cat?.name || "Outros",
                icon: cat?.icon || "fa-tag",
                color: cat?.color || "#6C5CE7",
                amount: amount
            };
        })
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

    allTransactions.forEach(t => {
        if (!isTxPaid(t)) return;
        const amt = Number(t.amount) || 0;
        if (t.type === "income") income += amt;
        else if (t.type === "expense") {
            expense += amt;
            const cid = t.category_id || "outros";
            catExpenses[cid] = (catExpenses[cid] || 0) + amt;
        }
    });

    const savings = income - expense;
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;

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
    const totalDivs = monthDivs.reduce((a, d) => a + (Number(d.amount || d.total_amount || d.net_value) || 0), 0);

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

            <!-- DICA ESTRATÉGICA -->
            <div class="mobile-insight-tip">
                <i class="fas fa-lightbulb"></i>
                <div>
                    <strong>Dica Estratégica:</strong> 
                    ${topCatPercent > 35 
                        ? `A categoria <strong>${topCatName}</strong> consome ${topCatPercent}% do seu orçamento. Reduzir 15% nela liberará cerca de <strong>${formatCurrency(topCatAmount * 0.15)}</strong> para seus aportes!`
                        : `Mantenha suas reservas e invista continuamente os proventos recebidos para acelerar a bola de neve da liberdade financeira!`}
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
        const cat = categories.find(c => c.id === t.category_id);
        const color = cat?.color || (isIncome ? "#00B894" : "#FF7675");
        const icon = cat?.icon || (isIncome ? "fa-money-bill-wave" : "fa-tag");
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
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
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
