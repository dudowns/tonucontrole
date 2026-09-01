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
// FUNÇÃO PARA ABRIR NOVA TRANSAÇÃO
// ============================================
function openAddTransaction() {
    window.location.href = "transactions.html";
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
