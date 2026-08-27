// ============================================
// DASHBOARD - TonuControle
// ============================================

console.log('📊 Dashboard.js carregado');

// BRAPI_TOKEN
const BRAPI_TOKEN = window.APP_CONFIG?.BRAPI_TOKEN || 'n3pZmgKo5YZwJcNx1sfPSN';

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let categories = [];
let currentUser = null;
let categoryChart = null;
let monthlyChart = null;
let currentMonthOffset = 0;
let patrimonyUpdateInterval = null;
let allTransactions = [];
let positions = [];
let quotes = new Map();
let isUsingRealQuotes = false;

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function getLastDayOfMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function formatDateKey(year, month, day) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return year + '-' + m + '-' + d;
}

function getMonthName(month) {
    const months = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[month];
}

function formatCurrency(value) {
    const num = Number(value) || 0;
    try {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    } catch {
        return 'R$ ' + num.toFixed(2);
    }
}

function formatDate(date, format = 'short') {
    if (!date) return '--/--/----';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '--/--/----';
    if (format === 'short') {
        return d.toLocaleDateString('pt-BR');
    }
    return d.toLocaleDateString('pt-BR');
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function stripHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function updateMonthDisplay(elementId, offset) {
    offset = offset || 0;
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = months[d.getMonth()] + ' ' + d.getFullYear();
    }
    return d;
}

// ✨ FUNÇÃO DE SANITIZAÇÃO MELHORADA
function sanitizeReportText(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    return rawText
        .replace(/Ø=[^\s]{1,2}/g, '') // Remove padrões como Ø=Ü°, Ø=Ý4, Ø=ÜÊ
        .replace(/[^\x20-\x7EÀ-ž]/g, '') // Remove caracteres não imprimíveis, mantendo acentuação PT-BR
        .replace(/\s*\(pago\)\s*/gi, '') // Remove o excesso de "(pago)"
        .replace(/\s{2,}/g, ' ') // Remove espaços duplos
        .trim();
}

function inferClass(ticker) {
    const tk = ticker.toUpperCase();
    if (/^(KN|HGLG|MXRF|GGRC|RZTR|XPLG|VISC|BTLG|CPTS|IRDM|BCFF|MALL|HFOF|XPML|KNSC|RECR|HGRE|TRXF|TGAR|VILG|RECT|RBRF|RBRP|MCCI|PVBI|VRTA|ALZR|LVBI|JSRE|PATL|DEVA|RBVA|HCTR|VINO|URPR|SNFF|BARI|HSAF|KORE|MCHF|VGIP|VGIR|RBRY|KNIP|KNRI|KNCR)/.test(tk)) {
        return 'FIIs';
    }
    if (/^(IVVB|BOVA|SMAL|DIVO|HASH|GOLD|XINA|EURP|NASD|QQQ|SPXI|WRLD)/.test(tk)) {
        return 'ETFs';
    }
    if (/^(TESOURO|LFT|LTN|NTNB|NTNF|IPCA|PREFIXADO|SELIC)/.test(tk)) {
        return 'Tesouro';
    }
    if (/^[A-Z]{3,4}$/.test(tk) && !/^(FII|ETF|TESOURO)/.test(tk)) {
        return 'Acoes';
    }
    return null;
}

function normalizeClass(cls) {
    if (!cls) return 'Acoes';
    const upper = cls.toUpperCase().trim();
    if (upper === 'FII' || upper === 'FIIS') return 'FIIs';
    if (upper === 'ETF' || upper === 'ETFS') return 'ETFs';
    if (upper === 'TESOURO' || upper === 'TESOURO DIRETO') return 'Tesouro';
    if (upper === 'ACAO' || upper === 'ACOES' || upper === 'ACOES') return 'Acoes';
    if (['Acoes', 'FIIs', 'ETFs', 'Tesouro'].includes(cls)) return cls;
    return 'Acoes';
}

// ============================================
// GARANTIR PERFIL
// ============================================
async function ensureProfile(userId, fullName) {
    try {
        const { data: existing } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (existing) return true;

        await supabaseClient
            .from('profiles')
            .insert([{
                id: userId,
                full_name: fullName || 'Usuario',
                currency: 'BRL'
            }]);

        console.log('✅ Perfil criado!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao criar perfil:', error);
        return false;
    }
}

// ============================================
// CARREGAR PERFIL
// ============================================
async function loadUserProfile() {
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('full_name')
            .eq('id', currentUser.id)
            .single();

        let name = 'Usuario';
        let avatarUrl = localStorage.getItem('tonu_avatar_' + currentUser.id) ||
            currentUser.user_metadata?.avatar_url ||
            null;

        if (error || !data) {
            const fullName = currentUser.user_metadata?.full_name ||
                currentUser.email?.split('@')[0] ||
                'Usuario';
            await ensureProfile(currentUser.id, fullName);
            name = fullName;
        } else {
            name = data.full_name || 'Usuario';
            if (data.avatar_url && !avatarUrl) avatarUrl = data.avatar_url;
        }

        if (avatarUrl) {
            localStorage.setItem('tonu_avatar_' + currentUser.id, avatarUrl);
        }

        const firstName = name.split(' ')[0];
        const initial = name.charAt(0).toUpperCase();

        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        if (nameEl) nameEl.textContent = firstName;
        if (avatarEl) {
            if (window.renderAvatarElement) window.renderAvatarElement(avatarEl, avatarUrl, initial);
            else avatarEl.textContent = initial;
        }

        const sidebarNameEl = document.getElementById('sidebarUserName');
        const sidebarAvatarEl = document.getElementById('sidebarUserAvatar');
        const sidebarEmailEl = document.getElementById('sidebarUserEmail');
        if (sidebarNameEl) sidebarNameEl.textContent = name;
        if (sidebarAvatarEl) {
            if (window.renderAvatarElement) window.renderAvatarElement(sidebarAvatarEl, avatarUrl, initial);
            else sidebarAvatarEl.textContent = initial;
        }
        if (sidebarEmailEl) sidebarEmailEl.textContent = currentUser.email || 'Configuracoes';

    } catch (e) {
        console.error('❌ Erro ao carregar perfil:', e);
    }
}

// ============================================
// CARREGAR CATEGORIAS
// ============================================
async function loadCategories() {
    try {
        const cached = await window.getCachedCategories?.(currentUser.id);
        if (cached) {
            categories = cached;
            console.log('✅ Categorias carregadas do cache:', categories.length);
            return;
        }

        const { data, error } = await supabaseClient
            .from('categories')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('name');

        if (error) throw error;

        if (data && data.length > 0) {
            categories = data;
        } else {
            await window.createDefaultCategories(currentUser.id);
            const { data: newData } = await supabaseClient
                .from('categories')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('name');
            categories = newData || [];
        }

        if (window.setCachedCategories) {
            await window.setCachedCategories(currentUser.id, categories);
        }

        console.log('✅ Categorias carregadas do Supabase:', categories.length);
    } catch (error) {
        console.error('❌ Erro ao carregar categorias:', error);
        categories = [];
    }
}

// ============================================
// INVESTIMENTOS
// ============================================
async function loadInvestmentTransactions() {
    try {
        const { data, error } = await supabaseClient
            .from('investments')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('date', { ascending: true });

        if (error) throw error;
        allTransactions = data || [];
        console.log('📊 Transacoes carregadas:', allTransactions.length);

    } catch (error) {
        console.error('❌ Erro ao carregar transacoes:', error);
        allTransactions = [];
    }
}

function buildPositions() {
    const grouped = new Map();

    for (const tx of allTransactions) {
        const ticker = tx.ticker?.toUpperCase().trim() || '';
        if (!ticker) continue;

        const cls = normalizeClass(tx.asset_class || inferClass(ticker) || 'Acoes');

        if (!grouped.has(ticker)) {
            grouped.set(ticker, {
                ticker: ticker,
                assetClass: cls,
                quantity: 0,
                costBasis: 0,
                averageCost: 0,
                realizedGain: 0,
                transactions: []
            });
        }

        const pos = grouped.get(ticker);
        const qty = Number(tx.quantity) || 0;
        const unit = Number(tx.unit_price) || 0;
        const total = Number(tx.total_value) || qty * unit;
        const isBuy = tx.type === 'Compra';

        pos.transactions.push(tx);

        if (isBuy) {
            pos.costBasis += total;
            pos.quantity += qty;
            pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
        } else {
            const sellQty = Math.min(qty, pos.quantity);
            const avgCost = pos.averageCost || 0;
            pos.realizedGain += (unit - avgCost) * sellQty;
            pos.costBasis -= avgCost * sellQty;
            pos.quantity -= sellQty;
            if (pos.quantity <= 0.0000001) {
                pos.quantity = 0;
                pos.costBasis = 0;
                pos.averageCost = 0;
            }
        }
    }

    positions = [...grouped.values()]
        .filter(p => p.quantity > 0.0000001)
        .map(p => ({
            ...p,
            costBasis: Math.max(0, p.costBasis)
        }));

    console.log('📊 Posicoes calculadas:', positions.length);
}

async function fetchQuotes() {
    quotes.clear();
    const tickers = positions.map(p => p.ticker);
    if (!tickers.length) {
        console.log('📊 Nenhum ativo para buscar cotacoes');
        return;
    }

    const validTickers = tickers
        .filter(t => t && t.length >= 3 && /^[A-Z0-9]{3,}$/.test(t))
        .map(t => t.toUpperCase().trim());

    if (validTickers.length === 0) {
        console.log('⚠️ Nenhum ticker valido para buscar');
        return;
    }

    const unique = [...new Set(validTickers)];
    console.log('📊 Buscando cotacoes para:', unique.join(', '));

    try {
        let allResults = [];
        let foundCount = 0;

        for (const ticker of unique) {
            try {
                const url = 'https://brapi.dev/api/quote/' + ticker;
                const finalUrl = BRAPI_TOKEN && BRAPI_TOKEN !== 'SUA_CHAVE_AQUI' ?
                    url + '?token=' + BRAPI_TOKEN :
                    url;

                const response = await fetch(finalUrl, {
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-store'
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.results && data.results.length > 0) {
                        allResults = allResults.concat(data.results);
                    }
                } else {
                    console.warn('⚠️ Erro ' + response.status + ' para ' + ticker);
                }
            } catch (e) {
                console.warn('⚠️ Nao foi possivel buscar ' + ticker);
            }
        }

        if (allResults.length > 0) {
            isUsingRealQuotes = true;
            for (const q of allResults) {
                const tk = q.symbol?.toUpperCase().trim();
                if (!tk || !Number.isFinite(Number(q.regularMarketPrice))) continue;

                quotes.set(tk, {
                    price: Number(q.regularMarketPrice),
                    changePct: Number(q.regularMarketChangePercent || 0),
                    previousClose: Number(q.regularMarketPreviousClose || 0),
                    marketTime: q.regularMarketTime || new Date().toISOString(),
                    simulated: false,
                    source: 'BRAPI'
                });
                foundCount++;
                console.log('✅ Cotacao real de ' + tk + ': R$ ' + q.regularMarketPrice);
            }

            console.log('✅ ' + foundCount + ' cotacoes reais carregadas');
        }

        const missingTickers = unique.filter(t => !quotes.has(t));
        if (missingTickers.length > 0) {
            console.warn('⚠️ Tickers nao encontrados: ' + missingTickers.join(', '));
        }

    } catch (error) {
        console.error('❌ Erro ao buscar cotacoes:', error.message);
        isUsingRealQuotes = false;
    }
}

function decoratePositions() {
    const totalValue = positions.reduce((s, p) => s + posValue(p), 0);

    positions = positions.map(p => {
        const quote = quotes.get(p.ticker);
        const hasQuote = quote !== undefined;
        const price = hasQuote ? quote.price : p.averageCost;
        const changePct = hasQuote ? quote.changePct : 0;
        const simulated = !hasQuote;

        const currentValue = p.quantity * price;
        const gain = currentValue - p.costBasis;
        const gainPct = p.costBasis > 0 ? (gain / p.costBasis) * 100 : 0;
        const portfolioPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;

        return {
            ...p,
            quote: {
                price: price,
                changePct: changePct,
                simulated: simulated,
                source: simulated ? 'Preco Medio' : 'BRAPI'
            },
            currentValue: currentValue,
            gain: gain,
            gainPct: gainPct,
            portfolioPct: portfolioPct
        };
    });
}

function posValue(p) {
    const q = quotes.get(p.ticker);
    return p.quantity * Number(q?.price || p.averageCost || 0);
}

async function calculatePatrimony() {
    try {
        await loadInvestmentTransactions();
        buildPositions();
        await fetchQuotes();
        decoratePositions();
        const total = positions.reduce((s, p) => s + p.currentValue, 0);
        const result = Math.round(total * 100) / 100;
        console.log('🏦 Patrimonio calculado:', result);
        return result;
    } catch (error) {
        console.error('❌ Erro ao calcular patrimonio:', error);
        return 0;
    }
}

function startPatrimonyAutoUpdate() {
    if (patrimonyUpdateInterval) {
        clearInterval(patrimonyUpdateInterval);
    }
    patrimonyUpdateInterval = setInterval(async () => {
        console.log('🔄 Atualizando patrimonio automaticamente...');
        const patrimony = await calculatePatrimony();
        updatePatrimonyUI(patrimony);
    }, 300000);
    console.log('⏰ Atualizacao automatica do patrimonio configurada (a cada 5 min)');
}

function stopPatrimonyAutoUpdate() {
    if (patrimonyUpdateInterval) {
        clearInterval(patrimonyUpdateInterval);
        patrimonyUpdateInterval = null;
        console.log('⏹️ Atualizacao automatica do patrimonio parada');
    }
}

function updatePatrimonyUI(valor) {
    const patrimonyEl = document.getElementById('patrimony');
    if (patrimonyEl) {
        patrimonyEl.textContent = formatCurrency(valor);
        patrimonyEl.style.transition = 'all 0.3s ease';
        patrimonyEl.style.transform = 'scale(1.1)';
        patrimonyEl.style.color = '#00B894';
        setTimeout(() => {
            patrimonyEl.style.transform = 'scale(1)';
            patrimonyEl.style.color = '';
        }, 1000);
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Dashboard...');

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            window.location.href = '../index.html';
            return;
        }
        currentUser = user;
        console.log('✅ Usuario autenticado:', currentUser.email);
    } catch (e) {
        console.error('❌ Erro na autenticacao:', e);
        window.location.href = '../index.html';
        return;
    }

    await loadUserProfile();
    await loadCategories();
    updateMonthDisplay('selectedMonth', currentMonthOffset);
    await loadDashboard();

    // 🔥 LAZY LOADING DOS GRÁFICOS
    loadChartsLazy();

    await loadInsights();

    startPatrimonyAutoUpdate();

    console.log('✅ Dashboard initialized!');
});

// ============================================
// MÊS
// ============================================
window.changeMonth = function (dir) {
    currentMonthOffset += dir;
    updateMonthDisplay('selectedMonth', currentMonthOffset);
    loadDashboard();
    loadChartsLazy();
    loadInsights();
};

window.goToCurrentMonth = function () {
    currentMonthOffset = 0;
    updateMonthDisplay('selectedMonth', currentMonthOffset);
    loadDashboard();
    loadChartsLazy();
    loadInsights();
};

// ============================================
// CARREGAR DASHBOARD
// ============================================
async function loadDashboard() {
    console.log('📊 Carregando dashboard...');

    const d = new Date();
    d.setMonth(d.getMonth() + currentMonthOffset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const lastDay = getLastDayOfMonth(year, month);
    const firstDay = formatDateKey(year, month, 1);
    const lastDayStr = formatDateKey(year, month, lastDay);

    const dPrev = new Date();
    dPrev.setMonth(dPrev.getMonth() + currentMonthOffset - 1);
    const yearPrev = dPrev.getFullYear();
    const monthPrev = dPrev.getMonth();
    const lastDayPrev = getLastDayOfMonth(yearPrev, monthPrev);
    const firstDayPrev = formatDateKey(yearPrev, monthPrev, 1);
    const lastDayPrevStr = formatDateKey(yearPrev, monthPrev, lastDayPrev);

    try {
        // BUSCAR TRANSAÇÕES DO MÊS ATUAL
        const { data: current, error: err1 } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('paid', true)
            .eq('is_bill', false)
            .gte('date', firstDay)
            .lte('date', lastDayStr);

        if (err1) console.error('Erro ao buscar transacoes atuais:', err1);

        // BUSCAR TRANSAÇÕES DO MÊS ANTERIOR
        const { data: previous, error: err2 } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('paid', true)
            .eq('is_bill', false)
            .gte('date', firstDayPrev)
            .lte('date', lastDayPrevStr);

        if (err2) console.error('Erro ao buscar transacoes anteriores:', err2);

        // BUSCAR CONTAS NÃO PAGAS DO MÊS ATUAL
        const { data: bills, error: err3 } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('type', 'expense')
            .eq('paid', false)
            .eq('is_bill', true)
            .gte('date', firstDay)
            .lte('date', lastDayStr);

        if (err3) console.error('Erro ao buscar contas:', err3);

        // CALCULAR PATRIMÔNIO
        const patrimony = await calculatePatrimony();
        console.log('🏦 Patrimonio calculado:', patrimony);

        // CALCULAR RECEITAS E DESPESAS DO MÊS ATUAL
        let currentIncome = 0, currentExpense = 0;
        let prevIncome = 0, prevExpense = 0;

        if (current) {
            current.forEach(t => {
                if (t.type === 'income') currentIncome += Number(t.amount);
                else currentExpense += Number(t.amount);
            });
        }

        if (previous) {
            previous.forEach(t => {
                if (t.type === 'income') prevIncome += Number(t.amount);
                else prevExpense += Number(t.amount);
            });
        }

        const balance = currentIncome - currentExpense;

        // CALCULAR CONTAS
        const billsCount = bills?.length || 0;
        const billsTotal = bills?.reduce((s, t) => s + Number(t.amount), 0) || 0;

        console.log('📋 Contas: ' + billsCount + ' | Total: R$ ' + billsTotal);

        // ATUALIZAR CARDS
        const incomeEl = document.getElementById('totalIncome');
        const expenseEl = document.getElementById('totalExpense');
        const balanceEl = document.getElementById('totalBalance');
        const patrimonyEl = document.getElementById('patrimony');
        const billsCountEl = document.getElementById('billsCount');
        const billsAmountEl = document.getElementById('billsAmount');

        if (incomeEl) incomeEl.textContent = formatCurrency(currentIncome);
        if (expenseEl) expenseEl.textContent = formatCurrency(currentExpense);
        if (balanceEl) {
            balanceEl.textContent = formatCurrency(balance);
            balanceEl.style.color = balance >= 0 ? '#00B894' : '#FF7675';
        }
        if (patrimonyEl) patrimonyEl.textContent = formatCurrency(patrimony);

        // CARD CONTAS A PAGAR
        if (billsCountEl) {
            if (billsCount > 0) {
                billsCountEl.textContent = '';
                billsCountEl.style.display = 'none';
            } else {
                billsCountEl.textContent = '0 ✅';
                billsCountEl.style.color = '#00B894';
                billsCountEl.style.fontSize = '20px';
                billsCountEl.style.fontWeight = '800';
                billsCountEl.style.display = 'block';
            }
        }

        if (billsAmountEl) {
            if (billsTotal > 0) {
                billsAmountEl.textContent = formatCurrency(billsTotal);
                billsAmountEl.className = 'stat-value';
                billsAmountEl.style.color = '#FDCB6E';
                billsAmountEl.style.fontSize = '24px';
                billsAmountEl.style.fontWeight = '700';
                billsAmountEl.style.display = 'block';

                const contasText = billsCount === 1 ? '1 conta' : `${billsCount} contas`;
                let subEl = document.getElementById('billsSub');
                if (!subEl) {
                    subEl = document.createElement('div');
                    subEl.id = 'billsSub';
                    subEl.className = 'stat-sub';
                    billsAmountEl.parentElement.appendChild(subEl);
                }
                subEl.textContent = contasText;
                subEl.style.fontSize = '12px';
                subEl.style.color = '#94A3B8';
                subEl.style.fontWeight = '500';
                subEl.style.marginTop = '2px';
                subEl.style.display = 'block';

            } else {
                billsAmountEl.textContent = 'Tudo pago! ✅';
                billsAmountEl.className = 'stat-sub text-success';
                billsAmountEl.style.color = '#00B894';
                billsAmountEl.style.fontSize = '16px';
                billsAmountEl.style.fontWeight = '600';
                billsAmountEl.style.display = 'block';

                const subEl = document.getElementById('billsSub');
                if (subEl) subEl.remove();
            }
        }

        // TENDÊNCIAS
        const incomeTrend = prevIncome > 0 ? ((currentIncome - prevIncome) / prevIncome * 100) : 0;
        const expenseTrend = prevExpense > 0 ? ((currentExpense - prevExpense) / prevExpense * 100) : 0;

        const incomeTrendEl = document.getElementById('incomeTrend');
        const expenseTrendEl = document.getElementById('expenseTrend');
        const balanceStatusEl = document.getElementById('balanceStatus');

        if (incomeTrendEl) {
            const sign = incomeTrend >= 0 ? '+' : '';
            incomeTrendEl.textContent = sign + incomeTrend.toFixed(0) + '%';
            incomeTrendEl.className = 'stat-sub ' + (incomeTrend >= 0 ? 'text-success' : 'text-danger');
        }

        if (expenseTrendEl) {
            const sign = expenseTrend >= 0 ? '+' : '';
            expenseTrendEl.textContent = sign + expenseTrend.toFixed(0) + '%';
            expenseTrendEl.className = 'stat-sub ' + (expenseTrend <= 0 ? 'text-success' : 'text-danger');
        }

        if (balanceStatusEl) {
            if (balance > 0) {
                balanceStatusEl.textContent = '✅ Positivo';
                balanceStatusEl.className = 'stat-sub text-success';
            } else if (balance < 0) {
                balanceStatusEl.textContent = '⚠️ Negativo';
                balanceStatusEl.className = 'stat-sub text-danger';
            } else {
                balanceStatusEl.textContent = 'Zerado';
                balanceStatusEl.className = 'stat-sub';
            }
        }

        await checkOverdueBills();
        await loadRecentTransactions();

        console.log('✅ Dashboard atualizado!');

    } catch (error) {
        console.error('❌ Erro ao carregar dashboard:', error);
        showToast('Erro ao carregar dados', 'error');
    }
}

// ============================================
// VERIFICAR CONTAS EM ATRASO
// ============================================
async function checkOverdueBills() {
    try {
        const today = getToday();
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('type', 'expense')
            .eq('paid', false)
            .eq('is_bill', true)
            .lt('date', today);

        if (error) throw error;

        const banner = document.getElementById('dueBillsWarningBanner');
        if (!banner) return;

        if (data && data.length > 0) {
            banner.style.display = 'flex';
            const titleEl = document.getElementById('dueBannerTitle');
            const descEl = document.getElementById('dueBannerDesc');
            if (titleEl) {
                titleEl.textContent = `⚠️ Atenção: Você tem ${data.length} conta(s) em atraso!`;
            }
            if (descEl) {
                const total = data.reduce((sum, b) => sum + Number(b.amount), 0);
                descEl.textContent = `Total em atraso: ${formatCurrency(total)}. Acesse a lista e efetue o pagamento.`;
            }
        } else {
            banner.style.display = 'none';
        }
    } catch (error) {
        console.error('❌ Erro ao verificar contas em atraso:', error);
    }
}

// ============================================
// TRANSAÇÕES RECENTES
// ============================================
async function loadRecentTransactions() {
    const container = document.getElementById('transactionsList');
    if (!container) return;

    try {
        container.innerHTML = `
            <div class="loading-transactions">
                <span class="spinner"></span>
                <p>Carregando transacoes...</p>
            </div>
        `;

        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*, categories(name, icon, color)')
            .eq('user_id', currentUser.id)
            .eq('paid', true)
            .eq('is_bill', false)
            .order('date', { ascending: false })
            .limit(50);

        if (error) throw error;

        // REMOVER DUPLICATAS
        const groupedByKey = new Map();

        for (const tx of (data || [])) {
            let desc = sanitizeReportText(tx.description);
            desc = desc.replace(/\s*\(pago\)\s*/gi, '').trim();
            desc = desc.replace(/\s+$/g, '');

            const amountKey = Math.round(Number(tx.amount) * 100);
            const catKey = tx.category_id || 'null';
            const uniqueKey = desc.toLowerCase() + '_' + amountKey + '_' + catKey;

            if (!groupedByKey.has(uniqueKey) ||
                new Date(tx.date) > new Date(groupedByKey.get(uniqueKey).date)) {
                groupedByKey.set(uniqueKey, tx);
            }
        }

        const uniqueTransactions = Array.from(groupedByKey.values());
        const recentTransactions = uniqueTransactions.slice(0, 7);

        const countEl = document.getElementById('txCount');
        if (countEl) {
            countEl.textContent = recentTransactions.length;
        }

        if (recentTransactions.length === 0) {
            container.innerHTML = `
                <div class="empty-transactions">
                    <span class="empty-icon">📭</span>
                    <h4>Nenhuma transacao</h4>
                    <p>Adicione sua primeira transacao para começar a acompanhar suas financas</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recentTransactions.map(t => {
            const isIncome = t.type === 'income';
            const sign = isIncome ? '+' : '-';
            const cls = isIncome ? 'income' : 'expense';

            let category = null;
            if (t.categories) {
                category = t.categories;
            } else if (t.category_id) {
                const cat = categories.find(c => c.id === t.category_id);
                if (cat) category = cat;
            }

            const catIcon = category?.icon || 'fa-tag';
            const catColor = category?.color || '#6C5CE7';
            const catName = category?.name || 'Sem categoria';

            let displayDesc = sanitizeReportText(t.description);
            displayDesc = displayDesc.replace(/\s*\(pago\)\s*/gi, '').trim();

            return `
                <div class="transaction-item">
                    <div class="tx-left">
                        <div class="tx-icon" style="background:${catColor}">
                            <i class="fas ${catIcon}"></i>
                        </div>
                        <div class="tx-info">
                            <strong>${stripHTML(displayDesc)}</strong>
                            <div class="tx-meta">
                                <span>${formatDate(t.date)}</span>
                                <span class="tx-category" style="color:${catColor};background:${catColor}15;">
                                    <i class="fas ${catIcon}"></i>
                                    ${stripHTML(catName)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <span class="tx-amount ${cls}">${sign} ${formatCurrency(t.amount)}</span>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('❌ Erro ao carregar transacoes recentes:', error);
        container.innerHTML = `
            <div class="empty-transactions">
                <span class="empty-icon">⚠️</span>
                <h4>Erro ao carregar</h4>
                <p>Nao foi possivel carregar as transacoes. Tente novamente.</p>
            </div>
        `;
    }
}

// ============================================
// GRÁFICOS
// ============================================
async function loadCharts() {
    await loadCategoryChart();
    await loadMonthlyChart();
}

// ============================================
// 🔥 LAZY LOADING DE GRÁFICOS
// ============================================
let chartsLoaded = false;
let chartsLoading = false;

function loadChartsLazy() {
    const chartContainer = document.querySelector('.charts-grid');
    if (!chartContainer) return;

    if (chartsLoaded || chartsLoading) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !chartsLoaded && !chartsLoading) {
                chartsLoading = true;
                console.log('📊 Carregando gráficos (lazy)...');

                if (typeof loadCategoryChart === 'function') {
                    loadCategoryChart();
                }
                if (typeof loadMonthlyChart === 'function') {
                    loadMonthlyChart();
                }

                chartsLoaded = true;
                chartsLoading = false;
                observer.disconnect();
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '50px'
    });

    observer.observe(chartContainer);
}

function getCategoryStyle(name, index) {
    const n = (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (n.includes('aliment') || n.includes('comida') || n.includes('mercado') || n.includes('restaurante') || n.includes('ifood') || n.includes('lanche')) {
        return { color: '#EF4444', icon: 'fa-circle' };
    }
    if (n.includes('transport') || n.includes('uber') || n.includes('combustivel') || n.includes('gasolina') || n.includes('carro') || n.includes('onibus') || n.includes('veiculo')) {
        return { color: '#38BDF8', icon: 'fa-circle' };
    }
    if (n.includes('moradia') || n.includes('casa') || n.includes('aluguel') || n.includes('condominio') || n.includes('iptu') || n.includes('luz') || n.includes('agua') || n.includes('energia')) {
        return { color: '#8B5CF6', icon: 'fa-circle' };
    }
    if (n.includes('saude') || n.includes('farmacia') || n.includes('medico') || n.includes('hospital') || n.includes('consulta') || n.includes('drogaria') || n.includes('dentista')) {
        return { color: '#EC4899', icon: 'fa-heart' };
    }
    if (n.includes('lazer') || n.includes('viagem') || n.includes('cinema') || n.includes('passeio') || n.includes('bar') || n.includes('festa') || n.includes('hotel')) {
        return { color: '#F59E0B', icon: 'fa-circle' };
    }
    if (n.includes('educa') || n.includes('escola') || n.includes('faculdade') || n.includes('curso') || n.includes('livro') || n.includes('estudo')) {
        return { color: '#06B6D4', icon: 'fa-diamond' };
    }
    if (n.includes('assinat') || n.includes('stream') || n.includes('netflix') || n.includes('spotify') || n.includes('internet') || n.includes('software')) {
        return { color: '#475569', icon: 'fa-circle' };
    }
    if (n.includes('salar') || n.includes('renda') || n.includes('invest') || n.includes('servico') || n.includes('trabalho') || n.includes('imposto')) {
        return { color: '#10B981', icon: 'fa-circle' };
    }

    const defaultPalette = [
        { color: '#EF4444', icon: 'fa-circle' },
        { color: '#38BDF8', icon: 'fa-circle' },
        { color: '#8B5CF6', icon: 'fa-circle' },
        { color: '#EC4899', icon: 'fa-heart' },
        { color: '#F59E0B', icon: 'fa-circle' },
        { color: '#06B6D4', icon: 'fa-diamond' },
        { color: '#475569', icon: 'fa-circle' },
        { color: '#10B981', icon: 'fa-circle' },
        { color: '#94A3B8', icon: 'fa-circle' },
        { color: '#6366F1', icon: 'fa-circle' }
    ];
    return defaultPalette[index % defaultPalette.length];
}

// ============================================
// GRÁFICO DE CATEGORIAS
// ============================================
async function loadCategoryChart() {
    const canvas = document.getElementById('categoryChart');
    const legendContainer = document.getElementById('expenseLegendCard');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const d = new Date();
    d.setMonth(d.getMonth() + currentMonthOffset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const lastDay = getLastDayOfMonth(year, month);
    const firstDay = formatDateKey(year, month, 1);
    const lastDayStr = formatDateKey(year, month, lastDay);

    try {
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('amount, category_id, description')
            .eq('user_id', currentUser.id)
            .eq('type', 'expense')
            .eq('paid', true)
            .eq('is_bill', false)
            .gte('date', firstDay)
            .lte('date', lastDayStr);

        if (error) throw error;

        if (categoryChart) {
            categoryChart.destroy();
            categoryChart = null;
        }

        const { data: cats } = await supabaseClient
            .from('categories')
            .select('id, name, color')
            .eq('user_id', currentUser.id);

        const categoryMap = {};
        if (cats && cats.length > 0) {
            cats.forEach(c => {
                categoryMap[c.id] = c;
            });
        }

        const groups = {};
        if (data && data.length > 0) {
            data.forEach(t => {
                const catId = t.category_id;
                let name = 'Outros';

                if (catId && categoryMap[catId]) {
                    name = categoryMap[catId].name || 'Outros';
                } else {
                    const desc = t.description || '';
                    name = desc ? desc.substring(0, 20) : 'Outros';
                }

                if (!groups[name]) {
                    groups[name] = { total: 0 };
                }
                groups[name].total += Number(t.amount);
            });
        }

        const sortedEntries = Object.entries(groups)
            .sort((a, b) => b[1].total - a[1].total);

        const labels = [];
        const values = [];
        const colors = [];
        const icons = [];

        sortedEntries.forEach(([key, valObj], idx) => {
            const style = getCategoryStyle(key, idx);
            labels.push(key);
            values.push(valObj.total);
            colors.push(style.color);
            icons.push(style.icon);
        });

        const total = values.reduce((a, b) => a + b, 0);

        if (legendContainer) {
            if (labels.length === 0) {
                legendContainer.innerHTML = `
                    <div style="text-align:center;color:var(--color-text-muted,#94a3b8);font-size:11px;padding:8px 0;">
                        <i class="fas fa-inbox" style="font-size:16px;display:block;margin-bottom:4px;opacity:0.5;"></i>
                        Nenhuma despesa
                    </div>
                `;
            } else {
                const maxDisplay = 5;
                const displayLabels = labels.slice(0, maxDisplay);
                const displayValues = values.slice(0, maxDisplay);
                const displayColors = colors.slice(0, maxDisplay);
                const displayIcons = icons.slice(0, maxDisplay);

                legendContainer.innerHTML = displayLabels.map((label, idx) => {
                    const val = displayValues[idx];
                    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                    const color = displayColors[idx];
                    const icon = displayIcons[idx];

                    return `
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 4px;font-size:11px;border-bottom:1px solid var(--color-border-light,#f1f5f9);">
                            <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                                <span style="color:${color};font-size:9px;flex-shrink:0;width:14px;text-align:center;">
                                    <i class="fas ${icon}"></i>
                                </span>
                                <span style="font-weight:500;color:var(--color-text,#1e293b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px;font-size:10px;">${stripHTML(label)}</span>
                            </div>
                            <span style="font-weight:700;color:var(--color-text,#1e293b);font-size:10px;flex-shrink:0;">${pct}%</span>
                        </div>
                    `;
                }).join('');

                if (labels.length > maxDisplay) {
                    const otherTotal = values.slice(maxDisplay).reduce((a, b) => a + b, 0);
                    const otherPct = total > 0 ? Math.round((otherTotal / total) * 100) : 0;
                    legendContainer.innerHTML += `
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 4px;font-size:10px;border-top:1px solid var(--color-border-light,#f1f5f9);margin-top:2px;padding-top:4px;">
                            <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                                <span style="color:#94a3b8;font-size:9px;flex-shrink:0;width:14px;text-align:center;">
                                    <i class="fas fa-ellipsis-h"></i>
                                </span>
                                <span style="color:#94a3b8;font-size:10px;">Outros (${labels.length - maxDisplay})</span>
                            </div>
                            <span style="color:#94a3b8;font-size:10px;">${otherPct}%</span>
                        </div>
                    `;
                }
            }
        }

        if (labels.length === 0) {
            const isDark = document.body.classList.contains('dark-theme');
            categoryChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Sem despesas'],
                    datasets: [{
                        data: [1],
                        backgroundColor: [isDark ? '#334155' : '#E2E8F0'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    }
                },
                plugins: [{
                    id: 'emptyDonutCenter',
                    afterDraw(chart) {
                        const { ctx, chartArea: { top, bottom, left, right } } = chart;
                        const centerX = (left + right) / 2;
                        const centerY = (top + bottom) / 2;
                        const isDarkTheme = document.body.classList.contains('dark-theme');

                        ctx.save();
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        ctx.font = "800 18px 'Inter', sans-serif";
                        ctx.fillStyle = isDarkTheme ? '#F8FAFC' : '#0F172A';
                        ctx.fillText('R$ 0,00', centerX, centerY - 8);

                        ctx.font = "500 11px 'Inter', sans-serif";
                        ctx.fillStyle = isDarkTheme ? '#94A3B8' : '#64748B';
                        ctx.fillText('Total Gasto', centerX, centerY + 12);

                        ctx.restore();
                    }
                }]
            });
            return;
        }

        const customImageDonutPlugin = {
            id: 'customImageDonutPlugin',
            afterDraw(chart) {
                const { ctx, chartArea: { top, bottom, left, right } } = chart;
                const meta = chart.getDatasetMeta(0);
                if (!meta || !meta.data || meta.data.length === 0) return;

                const centerX = (left + right) / 2;
                const centerY = (top + bottom) / 2;
                const isDarkTheme = document.body.classList.contains('dark-theme');

                const primaryTextColor = isDarkTheme ? '#F8FAFC' : '#0F172A';
                const mutedTextColor = isDarkTheme ? '#94A3B8' : '#64748B';

                const firstArc = meta.data[0];
                const innerRadius = firstArc ? firstArc.innerRadius : 70;
                const outerRadius = firstArc ? firstArc.outerRadius : 120;

                ctx.save();

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const totalFormatted = formatCurrency(total);
                const valueFontSize = Math.min(22, Math.max(15, Math.floor(innerRadius * 0.28)));
                const labelFontSize = Math.min(13, Math.max(10, Math.floor(valueFontSize * 0.62)));

                ctx.font = "800 " + valueFontSize + "px 'Inter', sans-serif";
                ctx.fillStyle = primaryTextColor;
                ctx.fillText(totalFormatted, centerX, centerY - labelFontSize * 0.7);

                ctx.font = "500 " + labelFontSize + "px 'Inter', sans-serif";
                ctx.fillStyle = mutedTextColor;
                ctx.fillText('Total Gasto', centerX, centerY + valueFontSize * 0.75);

                meta.data.forEach((element, i) => {
                    const val = values[i];
                    const pct = total > 0 ? (val / total) * 100 : 0;
                    if (pct < 5.0) return;

                    const startAngle = element.startAngle;
                    const endAngle = element.endAngle;
                    const midAngle = startAngle + (endAngle - startAngle) / 2;
                    const midRadius = (innerRadius + outerRadius) / 2;

                    const textX = centerX + Math.cos(midAngle) * midRadius;
                    const textY = centerY + Math.sin(midAngle) * midRadius;

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#FFFFFF';

                    const pctFontSize = Math.min(13, Math.max(10, Math.floor((outerRadius - innerRadius) * 0.28)));
                    const valFontSize = Math.max(8, Math.floor(pctFontSize * 0.78));

                    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 1;

                    if (pct >= 9 && (outerRadius - innerRadius) > 36) {
                        ctx.font = "700 " + pctFontSize + "px 'Inter', sans-serif";
                        ctx.fillText(Math.round(pct) + '%', textX, textY - valFontSize * 0.75);

                        ctx.font = "600 " + valFontSize + "px 'Inter', sans-serif";
                        ctx.fillText(formatCurrency(val), textX, textY + pctFontSize * 0.75);
                    } else {
                        ctx.font = "700 " + pctFontSize + "px 'Inter', sans-serif";
                        ctx.fillText(Math.round(pct) + '%', textX, textY);
                    }
                    ctx.restore();
                });

                ctx.restore();
            }
        };

        const isDark = document.body.classList.contains('dark-theme');
        const sliceBorderColor = isDark ? '#1e293b' : '#ffffff';

        categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 3,
                    borderColor: sliceBorderColor,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                layout: {
                    padding: {
                        top: 20,
                        bottom: 20,
                        left: 30,
                        right: 30
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.94)',
                        titleFont: { size: 11, weight: '600' },
                        bodyFont: { size: 10 },
                        padding: 8,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                const totalVal = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = totalVal > 0 ? ((context.parsed / totalVal) * 100).toFixed(1) : 0;
                                const label = context.label || 'Outros';
                                return label + ': ' + formatCurrency(context.parsed) + ' (' + percentage + '%)';
                            }
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    duration: 600
                }
            },
            plugins: [customImageDonutPlugin]
        });

        console.log('✅ Grafico de categorias renderizado com legenda reduzida!');

    } catch (error) {
        console.error('❌ Erro no grafico de categorias:', error);
    }
}

// ============================================
// GRÁFICO MENSAL
// ============================================
async function loadMonthlyChart() {
    const canvas = document.getElementById('monthlyChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    try {
        const months = [];
        const incomes = [];
        const expenses = [];

        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i + currentMonthOffset);
            const year = d.getFullYear();
            const month = d.getMonth();
            const lastDay = getLastDayOfMonth(year, month);
            const firstDay = formatDateKey(year, month, 1);
            const lastDayStr = formatDateKey(year, month, lastDay);

            const label = d.toLocaleDateString('pt-BR', { month: 'short' });
            months.push(label);

            const { data, error } = await supabaseClient
                .from('transactions')
                .select('type, amount')
                .eq('user_id', currentUser.id)
                .eq('paid', true)
                .eq('is_bill', false)
                .gte('date', firstDay)
                .lte('date', lastDayStr);

            if (error) throw error;

            let inc = 0, exp = 0;
            if (data) {
                data.forEach(t => {
                    if (t.type === 'income') inc += Number(t.amount);
                    else exp += Number(t.amount);
                });
            }
            incomes.push(inc);
            expenses.push(exp);
        }

        if (monthlyChart) {
            monthlyChart.destroy();
            monthlyChart = null;
        }

        monthlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Receitas',
                    data: incomes,
                    backgroundColor: '#00B894',
                    borderRadius: 4,
                    borderSkipped: false
                }, {
                    label: 'Despesas',
                    data: expenses,
                    backgroundColor: '#FF7675',
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { size: 11, weight: '500' },
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            font: { size: 10 },
                            callback: function (value) {
                                return formatCurrency(value);
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });

        console.log('✅ Grafico mensal criado!');

    } catch (error) {
        console.error('❌ Erro no grafico mensal:', error);
    }
}

// ============================================
// INSIGHTS
// ============================================
async function loadInsights() {
    const container = document.getElementById('insightsContent');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;padding:12px 0;color:rgba(255,255,255,0.7);">🔍 Analisando...</p>';

    const d = new Date();
    d.setMonth(d.getMonth() + currentMonthOffset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const lastDay = getLastDayOfMonth(year, month);
    const firstDay = formatDateKey(year, month, 1);
    const lastDayStr = formatDateKey(year, month, lastDay);

    try {
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*, categories(name)')
            .eq('user_id', currentUser.id)
            .eq('paid', true)
            .eq('is_bill', false)
            .gte('date', firstDay)
            .lte('date', lastDayStr);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="insight-item info">
                    📝 Adicione transacoes este mes para receber insights personalizados
                </div>
            `;
            return;
        }

        let income = 0, expense = 0;
        const categoriesObj = {};

        data.forEach(t => {
            if (t.type === 'income') {
                income += Number(t.amount);
            } else {
                expense += Number(t.amount);
                const name = t.categories?.name || 'Outros';
                categoriesObj[name] = (categoriesObj[name] || 0) + Number(t.amount);
            }
        });

        const balance = income - expense;
        const sortedCats = Object.entries(categoriesObj).sort((a, b) => b[1] - a[1]);
        const topCategory = sortedCats[0];

        let html = '';

        if (balance > 0) {
            html += '<div class="insight-item success">✅ Saldo positivo: ' + formatCurrency(balance) + '</div>';
        } else if (balance < 0) {
            html += '<div class="insight-item danger">⚠️ Saldo negativo: ' + formatCurrency(Math.abs(balance)) + '</div>';
        }

        if (topCategory && expense > 0) {
            const pct = (topCategory[1] / expense * 100).toFixed(0);
            html += '<div class="insight-item info">📊 Maior gasto: "' + stripHTML(topCategory[0]) + '" (' + pct + '% das despesas)</div>';
        }

        if (expense > income && income > 0) {
            const pct = ((expense - income) / income * 100).toFixed(0);
            html += '<div class="insight-item danger">🚨 Gastos ' + pct + '% maiores que as receitas</div>';
        }

        if (income > 0 && balance > 0) {
            const savings = ((balance / income) * 100).toFixed(0);
            html += '<div class="insight-item success">💰 Voce economizou ' + savings + '% da sua renda este mes</div>';
        }

        const txCount = data.length;
        html += '<div class="insight-item info">📋 ' + txCount + ' transacoes registradas este mes</div>';

        container.innerHTML = html;

    } catch (error) {
        console.error('❌ Erro ao carregar insights:', error);
        container.innerHTML = '<p style="text-align:center;padding:12px 0;color:rgba(255,255,255,0.7);">Erro ao carregar insights</p>';
    }
}

// ============================================
// TOAST
// ============================================
function showToast(message, type) {
    type = type || 'info';
    const toast = document.getElementById('toast');
    if (!toast) return;

    const colors = {
        info: '#0984E3',
        success: '#00B894',
        error: '#FF7675',
        warning: '#FDCB6E'
    };

    toast.textContent = message;
    toast.style.background = colors[type] || colors.info;
    toast.style.color = '#fff';
    toast.className = 'toast show';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.className = 'toast hidden';
    }, 3000);
}

// ============================================
// SIDEBAR
// ============================================
window.toggleSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const main = document.getElementById('mainContent');

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
};

window.closeSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const main = document.getElementById('mainContent');

    if (sidebar) sidebar.classList.add('hidden');
    if (overlay) overlay.classList.remove('show');
    if (main && window.innerWidth > 768) {
        main.classList.add('full');
    }
};

document.addEventListener('click', function (e) {
    if (e.target.classList.contains('sidebar-overlay')) {
        closeSidebar();
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeSidebar();
    }
});

document.addEventListener('DOMContentLoaded', function () {
    const main = document.getElementById('mainContent');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (window.innerWidth <= 768) {
        if (main) main.classList.add('full');
        if (sidebar) sidebar.classList.add('hidden');
        if (overlay) overlay.classList.remove('show');
    } else {
        if (main) main.classList.remove('full');
        if (sidebar) sidebar.classList.remove('hidden');
    }
});

window.addEventListener('resize', function () {
    const main = document.getElementById('mainContent');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (window.innerWidth <= 768) {
        if (main) main.classList.add('full');
        if (sidebar) sidebar.classList.add('hidden');
        if (overlay) overlay.classList.remove('show');
    } else {
        if (main) main.classList.remove('full');
        if (sidebar) sidebar.classList.remove('hidden');
    }
});

// ============================================
// 📄 EXPORTAR RELATÓRIO PDF - VERSÃO PREMIUM
// ============================================
async function exportarPDF() {
    try {
        showToast('📄 Gerando relatório detalhado...', 'info');

        const d = new Date();
        d.setMonth(d.getMonth() + currentMonthOffset);
        const monthName = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        const year = d.getFullYear();
        const month = d.getMonth();
        const firstDay = formatDateKey(year, month, 1);
        const lastDayStr = formatDateKey(year, month, getLastDayOfMonth(year, month));

        const { data: transactions, error } = await supabaseClient
            .from('transactions')
            .select('*, categories(name)')
            .eq('user_id', currentUser.id)
            .eq('paid', true)
            .gte('date', firstDay)
            .lte('date', lastDayStr)
            .order('date', { ascending: false });

        if (error) throw error;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'a4');

        const PRIMARY_COLOR = [108, 92, 231];
        const SUCCESS_COLOR = [0, 184, 148];
        const DANGER_COLOR = [255, 118, 117];
        const TEXT_COLOR = [45, 52, 54];

        // --- CABEÇALHO ---
        doc.setFillColor(...PRIMARY_COLOR);
        doc.rect(0, 0, 595, 80, 'F');

        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text('TonuControle', 40, 45);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text('Gestão Financeira Pessoal', 40, 60);

        doc.setFontSize(12);
        doc.text(monthName.toUpperCase(), 450, 50, { align: 'right' });

        // --- RESUMO FINANCEIRO ---
        let income = 0, expense = 0;
        transactions?.forEach(t => {
            if (t.type === 'income') income += Number(t.amount);
            else expense += Number(t.amount);
        });
        const balance = income - expense;

        let currentY = 110;
        doc.setTextColor(...TEXT_COLOR);
        doc.setFontSize(14);
        doc.text('Resumo do Período', 40, currentY);

        doc.setDrawColor(220, 220, 220);
        doc.line(40, currentY + 5, 555, currentY + 5);

        currentY += 35;

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text('RECEITAS', 40, currentY);
        doc.setTextColor(...SUCCESS_COLOR);
        doc.setFontSize(13);
        doc.text(formatCurrency(income), 40, currentY + 15);

        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        doc.text('DESPESAS', 240, currentY);
        doc.setTextColor(...DANGER_COLOR);
        doc.setFontSize(13);
        doc.text(formatCurrency(expense), 240, currentY + 15);

        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        doc.text('SALDO', 440, currentY);
        doc.setTextColor(balance >= 0 ? SUCCESS_COLOR[0] : DANGER_COLOR[0], balance >= 0 ? SUCCESS_COLOR[1] : DANGER_COLOR[1], balance >= 0 ? SUCCESS_COLOR[2] : DANGER_COLOR[2]);
        doc.setFontSize(13);
        doc.text(formatCurrency(balance), 440, currentY + 15);

        // --- TABELA DE TRANSAÇÕES ---
        currentY += 50;
        doc.setTextColor(...TEXT_COLOR);
        doc.setFontSize(14);
        doc.text('Detalhamento de Movimentações', 40, currentY);

        currentY += 20;
        const tableHeaderY = currentY;
        doc.setFillColor(245, 246, 250);
        doc.rect(40, tableHeaderY, 515, 20, 'F');

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 100, 100);
        doc.text('DATA', 45, tableHeaderY + 13);
        doc.text('DESCRIÇÃO', 110, tableHeaderY + 13);
        doc.text('CATEGORIA', 320, tableHeaderY + 13);
        doc.text('VALOR', 550, tableHeaderY + 13, { align: 'right' });

        let rowY = tableHeaderY + 20;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...TEXT_COLOR);

        if (transactions && transactions.length > 0) {
            transactions.forEach((t, index) => {
                if (rowY > 750) {
                    doc.addPage();
                    rowY = 50;
                    doc.setFillColor(245, 246, 250);
                    doc.rect(40, rowY, 515, 20, 'F');
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(100, 100, 100);
                    doc.text('DATA', 45, rowY + 13);
                    doc.text('DESCRIÇÃO', 110, rowY + 13);
                    doc.text('CATEGORIA', 320, rowY + 13);
                    doc.text('VALOR', 550, rowY + 13, { align: 'right' });
                    rowY += 20;
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(...TEXT_COLOR);
                }

                if (index % 2 === 0) {
                    doc.setFillColor(252, 252, 255);
                    doc.rect(40, rowY, 515, 20, 'F');
                }

                const date = new Date(t.date).toLocaleDateString('pt-BR');
                const desc = sanitizeReportText(t.description || 'Sem descrição');
                const cat = t.categories?.name || 'Geral';
                const val = formatCurrency(t.amount);

                doc.setFontSize(9);
                doc.text(date, 45, rowY + 13);

                let descDisplay = desc;
                if (descDisplay.length > 45) {
                    descDisplay = descDisplay.substring(0, 42) + '...';
                }
                doc.text(descDisplay, 110, rowY + 13);
                doc.text(cat, 320, rowY + 13);

                doc.setFont("helvetica", "bold");
                doc.setTextColor(t.type === 'income' ? SUCCESS_COLOR[0] : DANGER_COLOR[0], t.type === 'income' ? SUCCESS_COLOR[1] : DANGER_COLOR[1], t.type === 'income' ? SUCCESS_COLOR[2] : DANGER_COLOR[2]);
                doc.text((t.type === 'income' ? '+ ' : '- ') + val, 550, rowY + 13, { align: 'right' });

                doc.setTextColor(...TEXT_COLOR);
                doc.setFont("helvetica", "normal");
                rowY += 20;

                doc.setDrawColor(240, 240, 240);
                doc.line(40, rowY, 555, rowY);
            });
        } else {
            doc.text('Nenhuma transação encontrada para este período.', 40, rowY + 20);
        }

        // --- RODAPÉ ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(170, 170, 170);
            const now = new Date().toLocaleString('pt-BR');
            doc.text(`Gerado em: ${now} | TonuControle Financial Report`, 40, 820);
            doc.text(`Página ${i} de ${pageCount}`, 555, 820, { align: 'right' });
        }

        const fileName = `Relatorio_Tonu_${year}_${String(month + 1).padStart(2, '0')}.pdf`;
        doc.save(fileName);
        showToast('✅ PDF profissional gerado!', 'success');

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        showToast('❌ Erro ao exportar PDF', 'error');
    }
}

// ============================================
// PROJEÇÃO DE FLUXO DE CAIXA
// ============================================
async function openCashFlowModal() {
    if (!window.TonuCashFlow) {
        showToast('Modulo de fluxo de caixa nao carregado.', 'warning');
        return;
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const [txRes, billsRes] = await Promise.all([
            supabaseClient.from('transactions').select('*').eq('user_id', user.id),
            supabaseClient.from('bills').select('*').eq('user_id', user.id)
        ]);

        const txs = txRes.data || [];
        const bills = billsRes.data || [];

        const totalIncome = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const totalExpense = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const currentBalance = totalIncome - totalExpense;

        window.TonuCashFlow.showCashFlowModal(currentBalance, txs, bills);
    } catch (err) {
        console.error('❌ Erro ao abrir fluxo de caixa:', err);
        showToast('Erro ao carregar dados do fluxo de caixa.', 'error');
    }
}

// ============================================
// LOGOUT
// ============================================
async function logout() {
    try {
        sessionStorage.setItem('tonu_logout_in_progress', 'true');

        if (window.supabaseOffline) {
            await window.supabaseOffline.logout();
        }
        await supabaseClient.auth.signOut();

        localStorage.removeItem('tonu_secure_session_v2');
        localStorage.removeItem('tonu_offline_session');
        sessionStorage.removeItem('tonu_user');

        setTimeout(() => {
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
// EXPORTA FUNÇÕES GLOBAIS
// ============================================
window.exportarPDF = exportarPDF;
window.openCashFlowModal = openCashFlowModal;
window.loadCategoryChart = loadCategoryChart;
window.loadMonthlyChart = loadMonthlyChart;
window.loadDashboard = loadDashboard;
window.loadInsights = loadInsights;
window.loadRecentTransactions = loadRecentTransactions;
window.loadCategories = loadCategories;
window.checkOverdueBills = checkOverdueBills;
window.calculatePatrimony = calculatePatrimony;
window.startPatrimonyAutoUpdate = startPatrimonyAutoUpdate;
window.stopPatrimonyAutoUpdate = stopPatrimonyAutoUpdate;
window.logout = logout;

console.log('✅ Dashboard.js carregado com sucesso!');