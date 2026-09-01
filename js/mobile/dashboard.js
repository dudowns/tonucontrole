// ============================================
// MOBILE DASHBOARD
// ============================================

console.log("📱 Mobile Dashboard carregado");

let currentUser = null;
let allTransactions = [];
let categories = [];

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
// CARREGAR DADOS MOBILE
// ============================================
async function loadMobileData() {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const firstDay = `${year}-${month}-01`;
        const lastDay = `${year}-${month}-${new Date(year, today.getMonth() + 1, 0).getDate()}`;

        const { data, error } = await supabaseClient
            .from("transactions")
            .select("*")
            .eq("user_id", currentUser.id)
            .gte("date", firstDay)
            .lte("date", lastDay)
            .order("date", { ascending: false });

        if (error) throw error;

        allTransactions = data || [];
        console.log("📊 Mobile: Transações carregadas:", allTransactions.length);

        renderSummary();
        renderCategoryBars();
        renderTransactions();
    } catch (error) {
        console.error("❌ Erro ao carregar dados mobile:", error);
    }
}

// ============================================
// RENDER RESUMO
// ============================================
function renderSummary() {
    let income = 0, expense = 0;
    allTransactions.forEach(t => {
        if (t.type === "income") income += Number(t.amount);
        else if (t.type === "expense") expense += Number(t.amount);
    });
    const balance = income - expense;

    const container = document.getElementById("summaryContainer");
    container.innerHTML = `
        <div class="mobile-card">
            <div class="card-icon income"><i class="fas fa-arrow-up"></i></div>
            <div class="card-info">
                <div class="card-label">Receitas</div>
                <div class="card-value">${formatCurrency(income)}</div>
            </div>
        </div>
        <div class="mobile-card">
            <div class="card-icon expense"><i class="fas fa-arrow-down"></i></div>
            <div class="card-info">
                <div class="card-label">Despesas</div>
                <div class="card-value">${formatCurrency(expense)}</div>
            </div>
        </div>
        <div class="mobile-card">
            <div class="card-icon balance"><i class="fas fa-wallet"></i></div>
            <div class="card-info">
                <div class="card-label">Saldo</div>
                <div class="card-value" style="color:${balance >= 0 ? '#00B894' : '#FF7675'}">
                    ${formatCurrency(balance)}
                </div>
            </div>
        </div>
        <div class="mobile-card">
            <div class="card-icon count"><i class="fas fa-receipt"></i></div>
            <div class="card-info">
                <div class="card-label">Transações</div>
                <div class="card-value">${allTransactions.length}</div>
            </div>
        </div>
    `;
}

// ============================================
// RENDER CATEGORIAS EM BARRA
// ============================================
function renderCategoryBars() {
    const container = document.getElementById("categoryBarsContainer");
    if (!container) return;

    const expenses = allTransactions.filter(t => t.type === "expense");
    if (expenses.length === 0) {
        container.innerHTML = "";
        return;
    }

    const catMap = {};
    let totalExpense = 0;

    expenses.forEach(t => {
        const catId = t.category_id || "outros";
        const amt = Number(t.amount) || 0;
        totalExpense += amt;
        if (!catMap[catId]) catMap[catId] = 0;
        catMap[catId] += amt;
    });

    const sortedCats = Object.entries(catMap)
        .map(([catId, amount]) => {
            const cat = categories.find(c => c.id === catId);
            return {
                id: catId,
                name: cat?.name || "Outros",
                icon: cat?.icon || "fa-tag",
                color: cat?.color || "#FF7675",
                amount: amount,
                percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0
            };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 4);

    container.innerHTML = `
        <div class="category-bars-card">
            <div class="category-bars-header">
                <h3><i class="fas fa-chart-pie" style="color:#6C5CE7; margin-right:6px;"></i> Gastos por Categoria</h3>
                <span>${sortedCats.length} categorias</span>
            </div>
            ${sortedCats.map(cat => `
                <div class="category-bar-item">
                    <div class="category-bar-info">
                        <span class="cat-name"><i class="fas ${cat.icon}" style="color:${cat.color}"></i> ${cat.name}</span>
                        <span class="cat-amount">${formatCurrency(cat.amount)} <small style="color:#94a3b8; font-weight:normal;">(${cat.percent}%)</small></span>
                    </div>
                    <div class="category-bar-track">
                        <div class="category-bar-fill" style="width: ${cat.percent}%; background: ${cat.color};"></div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// ============================================
// RENDER TRANSAÇÕES
// ============================================
function renderTransactions() {
    const container = document.getElementById("mobileTransactions");

    const recent = allTransactions.slice(0, 10);

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

        return `
            <div class="mobile-transaction" onclick="window.location.href='transactions.html'">
                <div class="tx-left">
                    <div class="tx-icon" style="background:${color}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="tx-info">
                        <strong>${t.description}</strong>
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
    const num = Number(value) || 0;
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    } catch {
        return "R$ " + num.toFixed(2);
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
