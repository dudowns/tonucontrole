// ============================================
// INVESTIMENTOS - TonuControle
// VERSÃO COMPLETA FINAL - CORRIGIDA
// ============================================

console.log('📈 Investments.js carregado');

// ============================================
// ANIMAÇÃO DE CARREGAMENTO
// ============================================
function showLoadingAnimation() {
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
        mainContent.style.opacity = '0';
        mainContent.style.transform = 'translateY(12px)';
        mainContent.style.transition = 'all 0.4s ease';
        setTimeout(() => {
            mainContent.style.opacity = '1';
            mainContent.style.transform = 'translateY(0)';
        }, 150);
    }
}

// ============================================
// BRAPI CONFIG
// ============================================
const BRAPI_TOKEN = window.APP_CONFIG?.BRAPI_TOKEN || 'n3pZmgKo5YZwJcNx1sfPSN';

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
        const formatted = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
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

// ============================================
// ESTADO
// ============================================
let currentUser = null;
let allTransactions = [];
let allDividends = [];
let positions = [];
let quotes = new Map();
let selectedClass = 'Todos';
let selectedPeriod = '12m';
let patrimonyChart = null;
let pieChart = null;
let dividendsChart = null;
let dividendsPieChart = null;
let isUsingRealQuotes = false;
let currentTab = 'carteira';
let editingTransactionId = null;

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function getToday() {
    const today = new Date();
    return today.toISOString().split('T')[0];
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
        return 'Ações';
    }
    return null;
}

function normalizeClass(cls) {
    if (!cls) return 'Ações';
    const upper = cls.toUpperCase().trim();
    if (upper === 'FII' || upper === 'FIIS') return 'FIIs';
    if (upper === 'ETF' || upper === 'ETFS') return 'ETFs';
    if (upper === 'TESOURO' || upper === 'TESOURO DIRETO') return 'Tesouro';
    if (upper === 'AÇÃO' || upper === 'ACOES' || upper === 'AÇÕES') return 'Ações';
    if (['Ações', 'FIIs', 'ETFs', 'Tesouro'].includes(cls)) return cls;
    return 'Ações';
}

function parseNumberInput(value) {
    if (!value || value === '') return 0;
    const clean = String(value).trim().replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
}

function parsePriceInput(value) {
    if (!value || value === '') return 0;
    const clean = String(value).trim().replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
}

// ============================================
// MODAL CONTROLS
// ============================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
        m.classList.remove('active');
    });
    modal.classList.add('active');
    document.body.classList.add('no-scroll');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    const anyOpen = document.querySelectorAll('.modal-overlay.active').length === 0;
    if (anyOpen) {
        document.body.classList.remove('no-scroll');
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
        m.classList.remove('active');
    });
    document.body.classList.remove('no-scroll');
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        closeModal(e.target.id);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllModals();
    }
});

// ============================================
// OPERAÇÃO MODAL
// ============================================
function openOperationModal() {
    editingTransactionId = null;
    const form = document.getElementById('operationForm');
    if (form) form.reset();
    const dateInput = document.getElementById('opDate');
    if (dateInput) dateInput.value = getToday();
    const totalEl = document.getElementById('opTotalValue');
    if (totalEl) totalEl.value = '';
    const hint = document.getElementById('tickerHint');
    if (hint) {
        hint.textContent = 'Digite o código do ativo.';
        hint.className = 'help-text';
    }
    const typeSelect = document.getElementById('opType');
    if (typeSelect) typeSelect.value = 'Compra';
    const title = document.getElementById('operationModalTitle');
    if (title) title.textContent = '📊 Nova Operação';
    const saveBtn = document.getElementById('saveOperationBtn');
    if (saveBtn) {
        saveBtn.textContent = '💾 Salvar operação';
    }
    const modalHeader = document.querySelector('#operationModal .modal-header');
    if (modalHeader) {
        modalHeader.style.borderLeftColor = '';
    }
    openModal('operationModal');
}

function closeOperationModal() {
    closeModal('operationModal');
}

// ============================================
// PROVENTO MODAL
// ============================================
function openDividendModal() {
    const form = document.getElementById('dividendForm');
    if (form) form.reset();
    const dateInput = document.getElementById('divDate');
    if (dateInput) dateInput.value = getToday();
    const totalEl = document.getElementById('divTotalValue');
    if (totalEl) totalEl.value = '';
    openModal('dividendModal');
}

function closeDividendModal() {
    closeModal('dividendModal');
}

// ============================================
// TICKER AUTO-CLASS
// ============================================
function onTickerInput(e) {
    const ticker = e.target.value.toUpperCase().trim();
    const hint = document.getElementById('tickerHint');
    if (!hint) return;
    if (ticker.length < 2) {
        hint.textContent = 'Digite o código do ativo.';
        hint.className = 'help-text';
        return;
    }
    const suggested = inferClass(ticker);
    const classSelect = document.getElementById('opClass');
    if (suggested && classSelect) {
        classSelect.value = suggested;
        hint.textContent = `🔍 Classe sugerida: ${suggested}`;
        hint.className = 'help-text success';
    } else {
        hint.textContent = 'Digite um ticker válido.';
        hint.className = 'help-text error';
    }
}

// ============================================
// ATUALIZAR VALOR TOTAL
// ============================================
function updateTotalValue() {
    const qty = parseNumberInput(document.getElementById('opQuantity')?.value);
    const price = parsePriceInput(document.getElementById('opUnitPrice')?.value);
    const total = qty * price;
    const totalEl = document.getElementById('opTotalValue');
    if (totalEl) {
        totalEl.value = total > 0 ? total.toFixed(2).replace('.', ',') : '';
    }
}

function calcDividendTotal() {
    const qty = parseNumberInput(document.getElementById('divQuantity')?.value);
    const unit = parsePriceInput(document.getElementById('divUnitValue')?.value);
    const total = qty * unit;
    const totalEl = document.getElementById('divTotalValue');
    if (totalEl) {
        totalEl.value = total > 0 ? total.toFixed(2).replace('.', ',') : '0,00';
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    showLoadingAnimation();

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            window.location.href = '../index.html';
            return;
        }
        currentUser = user;
        console.log('✅ Usuário autenticado:', currentUser.email);
    } catch (e) {
        console.error('❌ Erro na autenticação:', e);
        window.location.href = '../index.html';
        return;
    }

    const opDate = document.getElementById('opDate');
    const divDate = document.getElementById('divDate');
    if (opDate) opDate.value = getToday();
    if (divDate) divDate.value = getToday();

    const opQuantity = document.getElementById('opQuantity');
    const opUnitPrice = document.getElementById('opUnitPrice');
    const opTicker = document.getElementById('opTicker');

    if (opQuantity) opQuantity.addEventListener('input', updateTotalValue);
    if (opUnitPrice) opUnitPrice.addEventListener('input', updateTotalValue);
    if (opTicker) opTicker.addEventListener('input', onTickerInput);

    const divQuantity = document.getElementById('divQuantity');
    const divUnitValue = document.getElementById('divUnitValue');
    if (divQuantity) divQuantity.addEventListener('input', calcDividendTotal);
    if (divUnitValue) divUnitValue.addEventListener('input', calcDividendTotal);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) switchTab(tab);
        });
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cls = btn.dataset.class;
            if (cls) filterByClass(cls);
        });
    });

    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const period = btn.dataset.period;
            if (period) {
                selectedPeriod = period;
                renderChart();
            }
        });
    });

    await refreshDashboard();
    await loadDividends();
});

// ============================================
// SWITCH TAB
// ============================================
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tab}`);
    });
    if (tab === 'proventos') {
        renderDividendsChart();
        renderDividendsPieChart();
        renderDividendsTable();
    }
    if (tab === 'carteira') {
        const portfolioContainer = document.querySelector('.portfolio-container');
        if (portfolioContainer) {
            portfolioContainer.style.opacity = '0';
            portfolioContainer.style.transform = 'translateY(12px)';
            portfolioContainer.style.transition = 'all 0.4s ease';
            setTimeout(() => {
                portfolioContainer.style.opacity = '1';
                portfolioContainer.style.transform = 'translateY(0)';
            }, 150);
        }
    }
}

// ============================================
// FILTRO POR CLASSE
// ============================================
function filterByClass(cls) {
    selectedClass = cls;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.class === cls);
    });
    renderTable();
}

// ============================================
// CARREGAR DADOS
// ============================================
async function refreshDashboard() {
    const chartLoading = document.getElementById('chartLoading');
    if (chartLoading) chartLoading.classList.remove('hidden');

    try {
        await loadTransactions();
        buildPositions();
        await fetchQuotes();
        decoratePositions();
        updateSummary();
        updateClassCounts();
        renderTable();
        renderTransactions();
        updateQuoteStatus();
        renderChart();

    } catch (error) {
        console.error('❌ Erro ao carregar investimentos:', error);
        showToast('Erro ao carregar dados', 'error');
    } finally {
        if (chartLoading) chartLoading.classList.add('hidden');
    }
}

async function loadTransactions() {
    try {
        const { data, error } = await supabaseClient
            .from('investments')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('date', { ascending: true });

        if (error) throw error;
        allTransactions = data || [];
        console.log('📊 Transações carregadas:', allTransactions.length);

    } catch (error) {
        console.error('❌ Erro ao carregar transações:', error);
        allTransactions = [];
    }
}

// ============================================
// SALVAR OPERAÇÃO
// ============================================
async function saveOperation(e) {
    if (e) e.preventDefault();

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
        const ticker = document.getElementById('opTicker')?.value.toUpperCase().trim() || '';
        const type = document.getElementById('opType')?.value || '';
        const quantityStr = document.getElementById('opQuantity')?.value || '0';
        const unitPriceStr = document.getElementById('opUnitPrice')?.value || '0';
        const date = document.getElementById('opDate')?.value || '';
        let assetClass = document.getElementById('opClass')?.value || 'Ações';
        const note = document.getElementById('opNote')?.value || '';

        const quantity = parseNumberInput(quantityStr);
        const unitPrice = parsePriceInput(unitPriceStr);
        const totalValue = quantity * unitPrice;

        if (!ticker) {
            showToast('❌ Digite o ticker do ativo', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        if (!type) {
            showToast('❌ Selecione o tipo de operação', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        if (!quantity || quantity <= 0) {
            showToast('❌ Digite uma quantidade válida', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        if (!unitPrice || unitPrice <= 0) {
            showToast('❌ Digite um preço unitário válido', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        if (!date) {
            showToast('❌ Selecione a data da operação', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        if (!assetClass || assetClass === '') {
            assetClass = inferClass(ticker) || 'Ações';
        }

        const validClasses = ['Ações', 'FIIs', 'ETFs', 'Tesouro'];
        if (!validClasses.includes(assetClass)) {
            assetClass = 'Ações';
        }

        const data = {
            user_id: currentUser.id,
            ticker: ticker,
            type: type,
            quantity: quantity,
            unit_price: unitPrice,
            total_value: totalValue,
            date: date,
            asset_class: assetClass,
            note: note || null
        };

        if (editingTransactionId) {
            const { error } = await supabaseClient
                .from('investments')
                .update(data)
                .eq('id', editingTransactionId)
                .eq('user_id', currentUser.id);

            if (error) throw error;
            showToast(`✅ Operação atualizada com sucesso!`, 'success');
        } else {
            const { error } = await supabaseClient
                .from('investments')
                .insert([data]);

            if (error) throw error;
            showToast(`✅ ${type} de ${ticker} registrada com sucesso!`, 'success');
        }

        closeOperationModal();
        await refreshDashboard();

    } catch (error) {
        console.error('❌ Erro ao salvar operação:', error);
        showToast('❌ Erro ao salvar operação', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ============================================
// SALVAR PROVENTO
// ============================================
async function saveDividend(e) {
    if (e) e.preventDefault();

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
        const ticker = document.getElementById('divTicker')?.value.toUpperCase().trim() || '';
        const quantityStr = document.getElementById('divQuantity')?.value || '0';
        const unitValueStr = document.getElementById('divUnitValue')?.value || '0';
        const date = document.getElementById('divDate')?.value || '';
        const type = document.getElementById('divType')?.value || 'Dividendo';
        const note = document.getElementById('divNote')?.value || '';

        const quantity = parseNumberInput(quantityStr);
        const unitValue = parsePriceInput(unitValueStr);
        const totalValue = quantity * unitValue;

        if (!ticker) {
            showToast('❌ Digite o ticker do ativo', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        if (!quantity || quantity <= 0) {
            showToast('❌ Digite uma quantidade válida', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        if (!unitValue || unitValue <= 0) {
            showToast('❌ Digite um valor por unidade válido', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        if (!date) {
            showToast('❌ Selecione a data do recebimento', 'error');
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        const data = {
            user_id: currentUser.id,
            ticker: ticker,
            quantity: quantity,
            unit_value: unitValue,
            total_value: totalValue,
            date: date,
            type: type,
            note: note || null
        };

        const { error } = await supabaseClient
            .from('dividends')
            .insert([data]);

        if (error) throw error;

        showToast(`✅ Provento de ${ticker} registrado com sucesso!`, 'success');
        closeDividendModal();
        await loadDividends();
        updateSummary();

    } catch (error) {
        console.error('❌ Erro ao salvar provento:', error);
        showToast('❌ Erro ao salvar provento', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ============================================
// EXCLUIR TRANSAÇÃO
// ============================================
async function deleteTransaction(id) {
    if (!confirm('Tem certeza que deseja excluir esta transação?')) return;

    try {
        const { error } = await supabaseClient
            .from('investments')
            .delete()
            .eq('id', id)
            .eq('user_id', currentUser.id);

        if (error) throw error;
        showToast('✅ Transação excluída com sucesso!', 'success');
        await refreshDashboard();

    } catch (error) {
        console.error('❌ Erro ao excluir transação:', error);
        showToast('❌ Erro ao excluir transação', 'error');
    }
}

// ============================================
// EXCLUIR PROVENTO
// ============================================
async function deleteDividend(id) {
    if (!confirm('Tem certeza que deseja excluir este provento?')) return;

    try {
        const { error } = await supabaseClient
            .from('dividends')
            .delete()
            .eq('id', id)
            .eq('user_id', currentUser.id);

        if (error) throw error;
        showToast('✅ Provento excluído com sucesso!', 'success');
        await loadDividends();
        updateSummary();

    } catch (error) {
        console.error('❌ Erro ao excluir provento:', error);
        showToast('❌ Erro ao excluir provento', 'error');
    }
}

// ============================================
// EDITAR TRANSAÇÃO
// ============================================
async function editTransaction(id) {
    try {
        const { data, error } = await supabaseClient
            .from('investments')
            .select('*')
            .eq('id', id)
            .eq('user_id', currentUser.id)
            .single();

        if (error) throw error;

        editingTransactionId = id;

        document.getElementById('opTicker').value = data.ticker;
        document.getElementById('opType').value = data.type;
        document.getElementById('opQuantity').value = data.quantity;
        document.getElementById('opUnitPrice').value = data.unit_price;
        document.getElementById('opDate').value = data.date;
        document.getElementById('opClass').value = data.asset_class || inferClass(data.ticker) || 'Ações';
        document.getElementById('opNote').value = data.note || '';

        updateTotalValue();

        const title = document.getElementById('operationModalTitle');
        if (title) title.textContent = '✏️ Editar Operação';

        const saveBtn = document.getElementById('saveOperationBtn');
        if (saveBtn) saveBtn.textContent = '💾 Atualizar';

        const modalHeader = document.querySelector('#operationModal .modal-header');
        if (modalHeader) {
            modalHeader.style.borderLeftColor = '#6C5CE7';
            modalHeader.style.borderLeftWidth = '4px';
        }

        openModal('operationModal');

    } catch (error) {
        console.error('❌ Erro ao carregar transação para edição:', error);
        showToast('❌ Erro ao carregar transação', 'error');
    }
}

// ============================================
// BUILD POSITIONS
// ============================================
function buildPositions() {
    const grouped = new Map();

    for (const tx of allTransactions) {
        const ticker = tx.ticker?.toUpperCase().trim() || '';
        if (!ticker) continue;

        const cls = normalizeClass(tx.asset_class || inferClass(ticker) || 'Ações');

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

    console.log('📊 Posições calculadas:', positions.length);
}

// ============================================
// BUSCAR COTAÇÕES (BRAPI)
// ============================================
async function fetchQuotes() {
    quotes.clear();
    const tickers = positions.map(p => p.ticker);
    if (!tickers.length) {
        console.log('📊 Nenhum ativo para buscar cotações');
        return;
    }

    const validTickers = tickers
        .filter(t => t && t.length >= 3 && /^[A-Z0-9]{3,}$/.test(t))
        .map(t => t.toUpperCase().trim());

    if (validTickers.length === 0) {
        console.log('⚠️ Nenhum ticker válido para buscar');
        showToast('⚠️ Nenhum ticker válido para buscar cotações', 'warning');
        return;
    }

    const unique = [...new Set(validTickers)];
    console.log('📊 Buscando cotações para:', unique.join(', '));

    try {
        let allResults = [];
        let hasError = false;

        const batchSize = 10;
        for (let i = 0; i < unique.length; i += batchSize) {
            const batch = unique.slice(i, i + batchSize);
            const tickersParam = batch.map(t => encodeURIComponent(t.trim())).join(',');
            const url = `https://brapi.dev/api/quote/${tickersParam}`;

            const finalUrl = `${url}?token=${BRAPI_TOKEN}`;

            console.log(`📡 Buscando lote ${i / batchSize + 1}:`, batch.join(','));

            const response = await fetch(finalUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'TonuControle/1.0'
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                console.warn(`⚠️ Erro na BRAPI (lote ${i / batchSize + 1}): ${response.status}`);
                hasError = true;
                continue;
            }

            const data = await response.json();
            if (data.results && Array.isArray(data.results)) {
                allResults = allResults.concat(data.results);
            }
        }

        if (hasError || allResults.length === 0) {
            console.log('🔄 Buscando tickers individualmente...');

            for (const ticker of unique) {
                try {
                    const url = `https://brapi.dev/api/quote/${ticker}`;
                    const finalUrl = `${url}?token=${BRAPI_TOKEN}`;

                    const response = await fetch(finalUrl, {
                        headers: { 'Accept': 'application/json' },
                        cache: 'no-store'
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.results && data.results.length > 0) {
                            allResults = allResults.concat(data.results);
                        }
                    }
                } catch (e) {
                    console.warn(`⚠️ Não foi possível buscar ${ticker}`);
                }
            }
        }

        if (allResults.length > 0) {
            isUsingRealQuotes = true;
            let foundCount = 0;

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
                console.log(`✅ Cotação real de ${tk}: R$ ${q.regularMarketPrice}`);
            }

            console.log(`✅ ${foundCount} cotações reais carregadas`);
        }

        const missingTickers = unique.filter(t => !quotes.has(t));
        if (missingTickers.length > 0) {
            console.warn(`⚠️ Tickers não encontrados na BRAPI: ${missingTickers.join(', ')}`);
            showToast(`⚠️ ${missingTickers.length} ativo(s) sem cotação: ${missingTickers.join(', ')}`, 'warning');
        }

        updateQuoteStatus();

    } catch (error) {
        console.error('❌ Erro ao buscar cotações:', error.message);
        showToast('❌ Erro ao buscar cotações em tempo real', 'error');
        isUsingRealQuotes = false;
    }
}

// ============================================
// DECORATE POSITIONS - COM PREÇO REAL
// ============================================
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
                source: simulated ? 'Preço Médio' : 'BRAPI'
            },
            currentValue: currentValue,
            gain: gain,
            gainPct: gainPct,
            portfolioPct: portfolioPct
        };
    });
}

// ============================================
// POS VALUE - COM PREÇO REAL
// ============================================
function posValue(p) {
    const q = quotes.get(p.ticker);
    const price = q ? q.price : p.averageCost;
    return p.quantity * price;
}

function updateQuoteStatus() {
    const statusEl = document.getElementById('quoteStatus');
    if (!statusEl) return;

    const dotEl = statusEl.querySelector('.status-dot');
    const textEl = document.getElementById('quoteStatusText');

    if (positions.length === 0) {
        if (dotEl) dotEl.className = 'status-dot';
        if (textEl) {
            textEl.textContent = 'Sem ativos';
            textEl.style.color = '#b2bec3';
        }
        return;
    }

    let realCount = 0;
    let totalCount = 0;
    for (const p of positions) {
        const quote = quotes.get(p.ticker);
        if (quote) {
            totalCount++;
            if (!quote.simulated) realCount++;
        }
    }

    if (realCount === totalCount && totalCount > 0) {
        if (dotEl) dotEl.className = 'status-dot';
        if (textEl) {
            textEl.textContent = `✅ ${realCount}/${totalCount} cotações em tempo real • ${new Date().toLocaleTimeString()}`;
            textEl.style.color = '#00B894';
        }
    } else if (realCount > 0) {
        if (dotEl) dotEl.className = 'status-dot warning';
        if (textEl) {
            textEl.textContent = `⚠️ ${realCount}/${totalCount} cotações em tempo real • ${totalCount - realCount} com preço médio`;
            textEl.style.color = '#F39C12';
        }
    } else {
        if (dotEl) dotEl.className = 'status-dot warning';
        if (textEl) {
            textEl.textContent = `⚠️ Usando preço médio (sem cotações em tempo real)`;
            textEl.style.color = '#F39C12';
        }
    }
}

// ============================================
// LOAD DIVIDENDS
// ============================================
async function loadDividends() {
    try {
        const { data, error } = await supabaseClient
            .from('dividends')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('date', { ascending: false });

        if (error) throw error;
        allDividends = data || [];
        console.log('📊 Proventos carregados:', allDividends.length);

        renderDividendsTable();
        renderDividendsChart();
        renderDividendsPieChart();
        updateDividendsSummary();

    } catch (error) {
        console.error('❌ Erro ao carregar proventos:', error);
        allDividends = [];
    }
}

// ============================================
// RENDER PROVENTOS
// ============================================
function renderDividendsTable() {
    const body = document.getElementById('dividendsBody');
    if (!body) return;

    if (allDividends.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted" style="text-align:center;padding:30px 0;">
                    <span style="font-size:40px;display:block;margin-bottom:10px;">💰</span>
                    Nenhum provento registrado
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = allDividends.map(d => `
        <tr>
            <td>${formatDate(d.date)}</td>
            <td><strong>${d.ticker}</strong></td>
            <td>${d.type || 'Dividendo'}</td>
            <td>${d.quantity}</td>
            <td>${formatCurrency(d.unit_value)}</td>
            <td><strong>${formatCurrency(d.total_value)}</strong></td>
            <td>
                <div class="actions">
                    <button class="btn btn-danger btn-icon-sm" onclick="deleteDividend('${d.id}')" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ============================================
// UPDATE DIVIDENDS SUMMARY
// ============================================
function updateDividendsSummary() {
    const total = allDividends.reduce((sum, d) => sum + Number(d.total_value), 0);
    const totalEl = document.getElementById('divTotalAmount');
    if (totalEl) totalEl.textContent = formatCurrency(total);

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = lastMonth.toISOString().substring(0, 7);
    const lastMonthTotal = allDividends
        .filter(d => d.date.substring(0, 7) === lastMonthStr)
        .reduce((sum, d) => sum + Number(d.total_value), 0);
    const lastMonthEl = document.getElementById('divLastMonth');
    if (lastMonthEl) lastMonthEl.textContent = formatCurrency(lastMonthTotal);

    const byTicker = {};
    allDividends.forEach(d => {
        if (!byTicker[d.ticker]) byTicker[d.ticker] = 0;
        byTicker[d.ticker] += Number(d.total_value);
    });
    let topTicker = '-';
    let topValue = 0;
    for (const [ticker, value] of Object.entries(byTicker)) {
        if (value > topValue) {
            topValue = value;
            topTicker = ticker;
        }
    }
    const topTickerEl = document.getElementById('divTopTicker');
    if (topTickerEl) {
        topTickerEl.textContent = topTicker !== '-' ? `${topTicker}` : '-';
    }

    const totalDividendsEl = document.getElementById('totalDividends');
    const dividendsCountEl = document.getElementById('dividendsCount');
    if (totalDividendsEl) totalDividendsEl.textContent = formatCurrency(total);
    if (dividendsCountEl) dividendsCountEl.textContent = `${allDividends.length} provento${allDividends.length !== 1 ? 's' : ''}`;
}

// ============================================
// ATUALIZAR UI
// ============================================
function updateSummary() {
    const total = positions.reduce((s, p) => s + p.currentValue, 0);
    const invested = positions.reduce((s, p) => s + p.costBasis, 0);
    const gain = total - invested;
    const returnPct = invested > 0 ? (gain / invested) * 100 : 0;

    const dayChange = positions.reduce((s, p) => {
        const prev = p.quote?.previousClose || 0;
        return s + (prev ? (p.quote.price - prev) * p.quantity : 0);
    }, 0);
    const previousTotal = total - dayChange;
    const dayPct = previousTotal > 0 ? (dayChange / previousTotal) * 100 : 0;

    const totalDividends = allDividends.reduce((sum, d) => sum + Number(d.total_value), 0);
    const dividendsCount = allDividends.length;

    salvarPatrimonio(Math.round(total * 100) / 100);

    const patrimonyEl = document.getElementById('totalPatrimony');
    const variationEl = document.getElementById('patrimonyVariation');
    const assetCountEl = document.getElementById('assetCount');
    const assetSubEl = document.getElementById('assetCountSub');
    const returnEl = document.getElementById('totalReturn');
    const gainEl = document.getElementById('totalGain');
    const dividendsEl = document.getElementById('totalDividends');
    const dividendsCountEl = document.getElementById('dividendsCount');

    if (patrimonyEl) patrimonyEl.textContent = formatCurrency(total);

    if (variationEl) {
        const sign = dayChange >= 0 ? '+' : '';
        const colorClass = dayChange >= 0 ? 'text-success' : 'text-danger';
        variationEl.textContent = `${sign}${formatCurrency(dayChange)} (${sign}${dayPct.toFixed(2)}%)`;
        variationEl.className = `stat-sub ${colorClass}`;
    }

    if (assetCountEl) assetCountEl.textContent = positions.length;
    if (assetSubEl) assetSubEl.textContent =
        `${positions.length} posição${positions.length !== 1 ? 'ões' : ''} ativa${positions.length !== 1 ? 's' : ''}`;

    if (returnEl) {
        const returnSign = returnPct >= 0 ? '+' : '';
        const colorClass = returnPct >= 0 ? 'text-success' : 'text-danger';
        returnEl.textContent = `${returnSign}${returnPct.toFixed(2)}%`;
        returnEl.className = `stat-value ${colorClass}`;
    }

    if (gainEl) {
        const gainSign = gain >= 0 ? '+' : '';
        const colorClass = gain >= 0 ? 'text-success' : 'text-danger';
        gainEl.textContent = `${gainSign}${formatCurrency(gain)}`;
        gainEl.className = `stat-sub ${colorClass}`;
    }

    if (dividendsEl) dividendsEl.textContent = formatCurrency(totalDividends);
    if (dividendsCountEl) dividendsCountEl.textContent = `${dividendsCount} provento${dividendsCount !== 1 ? 's' : ''}`;
}

async function salvarPatrimonio(valor) {
    try {
        if (!currentUser || !currentUser.id) return;
        if (!window.supabaseClient || typeof window.supabaseClient.from !== 'function') return;

        const tableQuery = window.supabaseClient.from('user_stats');
        if (tableQuery && typeof tableQuery.upsert === 'function') {
            const { error } = await tableQuery.upsert({
                user_id: currentUser.id,
                patrimony: valor,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

            if (error) throw error;
            console.log('✅ Patrimônio salvo:', valor);
        } else if (tableQuery) {
            const { data: existing } = await tableQuery.select('id').eq('user_id', currentUser.id).maybeSingle();
            if (existing && existing.id) {
                await tableQuery.update({ patrimony: valor, updated_at: new Date().toISOString() }).eq('user_id', currentUser.id);
            } else {
                await tableQuery.insert([{ user_id: currentUser.id, patrimony: valor, updated_at: new Date().toISOString() }]);
            }
            console.log('✅ Patrimônio salvo via fallback:', valor);
        }
    } catch (error) {
        console.warn('⚠️ Não foi possível sincronizar patrimônio em user_stats:', error?.message || error);
    }
}

function updateClassCounts() {
    const counts = { Todos: positions.length, Ações: 0, FIIs: 0, ETFs: 0, Tesouro: 0 };

    for (const p of positions) {
        if (counts.hasOwnProperty(p.assetClass)) {
            counts[p.assetClass]++;
        }
    }

    const countTodos = document.getElementById('countTodos');
    const countAcoes = document.getElementById('countAções');
    const countFIIs = document.getElementById('countFIIs');
    const countETFs = document.getElementById('countETFs');
    const countTesouro = document.getElementById('countTesouro');

    if (countTodos) countTodos.textContent = counts.Todos;
    if (countAcoes) countAcoes.textContent = counts.Ações;
    if (countFIIs) countFIIs.textContent = counts.FIIs;
    if (countETFs) countETFs.textContent = counts.ETFs;
    if (countTesouro) countTesouro.textContent = counts.Tesouro;
}

// ============================================
// RENDER CARDS POR CLASSE
// ============================================
function renderClassCards() {
    const container = document.getElementById('classCards');
    if (!container) return;

    const classes = ['Ações', 'FIIs', 'ETFs', 'Tesouro'];
    const icons = {
        'Ações': '📈',
        'FIIs': '🏢',
        'ETFs': '📊',
        'Tesouro': '🏛️'
    };

    let html = '';

    classes.forEach(cls => {
        const items = positions.filter(p => p.assetClass === cls);
        const total = items.reduce((s, p) => s + p.currentValue, 0);
        const count = items.length;
        const isActive = cls === selectedClass ? 'active' : '';

        html += `
            <div class="class-card ${isActive}" onclick="filterByClass('${cls}')" style="cursor:pointer;" data-class="${cls}">
                <div class="class-header">
                    <span class="class-name">${cls}</span>
                    <span class="class-icon">${icons[cls] || '📦'}</span>
                </div>
                <div class="class-total">${formatCurrency(total)}</div>
                <div class="class-stats">
                    <span>${count} ativo${count !== 1 ? 's' : ''}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================
// RENDER CARTEIRA
// ============================================
function renderTable() {
    const container = document.getElementById('assetList');
    if (!container) return;

    let filtered = positions;
    if (selectedClass !== 'Todos') {
        filtered = positions.filter(p => p.assetClass === selectedClass);
    }

    updateClassCounts();

    const total = positions.reduce((s, p) => s + p.currentValue, 0);
    const totalEl = document.getElementById('portfolioTotal');
    if (totalEl) totalEl.textContent = formatCurrency(total);

    renderClassCards();
    renderPieChart();

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📊</span>
                <h3>Nenhum investimento</h3>
                <p>Registre sua primeira compra para começar.</p>
                <button class="btn btn-primary" onclick="openOperationModal()" style="margin-top:var(--space-md);">
                    <i class="fas fa-plus"></i> Nova operação
                </button>
            </div>
        `;
        return;
    }

    const sortedItems = [...filtered].sort((a, b) => b.portfolioPct - a.portfolioPct);

    let html = `
        <div class="portfolio-table-wrap">
            <table class="transactions-table" style="min-width:600px;">
                <thead>
                    <tr>
                        <th>Ativo</th>
                        <th style="text-align:right;">Quant.</th>
                        <th style="text-align:right;">Preço</th>
                        <th style="text-align:right;">Variação</th>
                        <th style="text-align:right;">Ganho/Perda</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedItems.forEach(p => {
        const price = p.quote?.price || p.averageCost || 0;
        const gain = p.gain || 0;
        const changePct = p.quote?.changePct || 0;
        const quantity = p.quantity || 0;

        const gainClass = gain >= 0 ? 'text-success' : 'text-danger';
        const changeClass = changePct > 0 ? 'text-success' : changePct < 0 ? 'text-danger' : 'text-muted';
        const signGain = gain >= 0 ? '+' : '';
        const signChange = changePct > 0 ? '+' : '';

        html += `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-weight:700;font-size:14px;letter-spacing:-0.01em;">${p.ticker}</span>
                        <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:9999px;background:var(--color-bg);border:1px solid var(--color-border);color:var(--color-text-light);">${p.assetClass}</span>
                    </div>
                </td>
                <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${quantity}</td>
                <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${formatCurrency(price)}</td>
                <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;" class="${changeClass}">${signChange}${changePct.toFixed(2)}%</td>
                <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;" class="${gainClass}">${signGain}${formatCurrency(gain)}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

// ============================================
// RENDER LANÇAMENTOS
// ============================================
function renderTransactions() {
    const body = document.getElementById('transactionsBody');
    if (!body) return;

    if (allTransactions.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted" style="text-align:center;padding:30px 0;">
                    <span style="font-size:40px;display:block;margin-bottom:10px;">📭</span>
                    Nenhum lançamento registrado
                </td>
            </tr>
        `;
        return;
    }

    const sorted = [...allTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    body.innerHTML = sorted.map(tx => {
        const isBuy = tx.type === 'Compra';
        const badgeClass = isBuy ? 'badge-buy' : 'badge-sell';
        const badgeText = isBuy ? 'Compra' : 'Venda';

        const assetClass = normalizeClass(tx.asset_class || inferClass(tx.ticker) || 'Ações');
        const classIcons = {
            'Ações': '📈',
            'FIIs': '🏢',
            'ETFs': '📊',
            'Tesouro': '🏛️'
        };
        const classIcon = classIcons[assetClass] || '📦';

        return `
            <tr>
                <td>${formatDate(tx.date)}</td>
                <td><strong>${tx.ticker}</strong></td>
                <td><span style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${classIcon} ${assetClass}</span></td>
                <td><span class="${badgeClass}">${badgeText}</span></td>
                <td>${tx.quantity}</td>
                <td>${formatCurrency(tx.unit_price)}</td>
                <td><strong>${formatCurrency(tx.total_value)}</strong></td>
                <td>
                    <div class="actions">
                        <button class="btn btn-ghost btn-icon-sm" onclick="editTransaction('${tx.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-icon-sm" onclick="deleteTransaction('${tx.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// AUXILIAR PARA ATUALIZAR POSIÇÕES SIMULADAS
// ============================================
function applyTxToSimulatedPortfolio(simulatedPortfolio, tx) {
    if (!tx || !tx.ticker) return;
    const ticker = tx.ticker.toUpperCase().trim();
    const qty = Number(tx.quantity) || 0;
    const price = Number(tx.unit_price) || 0;
    const totalVal = Number(tx.total_value) || (qty * price);

    if (!simulatedPortfolio.has(ticker)) {
        simulatedPortfolio.set(ticker, { quantity: 0, costBasis: 0 });
    }
    const pos = simulatedPortfolio.get(ticker);

    if (tx.type === 'Compra') {
        pos.quantity += qty;
        pos.costBasis += totalVal;
    } else {
        const avgCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
        const sellQty = Math.min(qty, pos.quantity);
        pos.quantity -= sellQty;
        pos.costBasis -= avgCost * sellQty;
        if (pos.quantity <= 0.0001) {
            simulatedPortfolio.delete(ticker);
        }
    }
}

// ============================================
// BUILD CHART DATA - INTELIGENTE E DINÂMICO
// ============================================
function buildChartData() {
    if (!allTransactions || allTransactions.length === 0) {
        return { labels: ['Agora'], invested: [0], gain: [0], total: [0] };
    }

    // Filtra e ordena todas as transações cronologicamente
    const validTransactions = allTransactions
        .filter(tx => tx.date && !isNaN(new Date(tx.date + 'T12:00:00').getTime()))
        .sort((a, b) => new Date(a.date + 'T12:00:00') - new Date(b.date + 'T12:00:00'));

    if (validTransactions.length === 0) {
        return { labels: ['Agora'], invested: [0], gain: [0], total: [0] };
    }

    const end = new Date();
    let start;

    if (selectedPeriod === 'all') {
        // Encontra a data da primeira transação de investimento real
        const firstTxDate = new Date(validTransactions[0].date + 'T12:00:00');
        start = new Date(firstTxDate.getFullYear(), firstTxDate.getMonth(), 1);

        // Se a primeira transação tiver menos de 3 meses, garante uma janela mínima para boa visualização
        const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
        if (diffMonths < 3) {
            start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
        }
    } else {
        const monthsCount = selectedPeriod === '3m' ? 3 : (selectedPeriod === '6m' ? 6 : 12);
        start = new Date(end.getFullYear(), end.getMonth() - monthsCount + 1, 1);
    }

    // Gera os meses contínuos do período
    const allMonths = [];
    const currentDate = new Date(start);

    while (currentDate <= end || (currentDate.getFullYear() === end.getFullYear() && currentDate.getMonth() === end.getMonth())) {
        const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        allMonths.push({
            key: key,
            date: new Date(currentDate),
            transactions: []
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Agrupa transações nos meses correspondentes e pré-acumula as anteriores
    const simulatedPortfolio = new Map();
    const txByMonth = new Map();

    for (const tx of validTransactions) {
        const d = new Date(tx.date + 'T12:00:00');
        if (d < start) {
            // Transações anteriores a start alimentam o portfólio acumulado inicial
            applyTxToSimulatedPortfolio(simulatedPortfolio, tx);
        } else {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!txByMonth.has(key)) {
                txByMonth.set(key, []);
            }
            txByMonth.get(key).push(tx);
        }
    }

    for (const month of allMonths) {
        if (txByMonth.has(month.key)) {
            month.transactions = txByMonth.get(month.key);
        }
    }

    const currentPrices = new Map();
    for (const p of positions) {
        const quote = quotes.get(p.ticker);
        const price = quote ? quote.price : p.averageCost;
        currentPrices.set(p.ticker, price);
    }

    const labels = [];
    const invested = [];
    const gain = [];
    const total = [];

    for (let i = 0; i < allMonths.length; i++) {
        const month = allMonths[i];

        for (const tx of month.transactions) {
            applyTxToSimulatedPortfolio(simulatedPortfolio, tx);
        }

        let runningInvested = 0;
        for (const [, pos] of simulatedPortfolio) {
            runningInvested += (pos.costBasis || 0);
        }

        let monthGain = 0;
        if (simulatedPortfolio.size > 0) {
            let totalSimulatedValue = 0;
            for (const [ticker, pos] of simulatedPortfolio) {
                const currentPrice = currentPrices.get(ticker) || (pos.quantity > 0 ? pos.costBasis / pos.quantity : 0);
                totalSimulatedValue += pos.quantity * currentPrice;
            }
            monthGain = Math.max(0, totalSimulatedValue - runningInvested);
        }

        const monthLabel = `${String(month.date.getMonth() + 1).padStart(2, '0')}/${String(month.date.getFullYear()).slice(2)}`;
        labels.push(monthLabel);
        invested.push(Math.round(runningInvested * 100) / 100);
        gain.push(Math.round(monthGain * 100) / 100);
        total.push(Math.round((runningInvested + monthGain) * 100) / 100);
    }

    if (labels.length === 0) {
        labels.push('Agora');
        const totalCostBasis = positions.reduce((s, p) => s + p.costBasis, 0);
        const totalCurrentValue = positions.reduce((s, p) => s + p.currentValue, 0);
        invested.push(totalCostBasis);
        gain.push(Math.max(0, totalCurrentValue - totalCostBasis));
        total.push(totalCurrentValue);
    }

    return { labels, invested, gain, total };
}

// ============================================
// GRÁFICO DE EVOLUÇÃO - DUAS CAMADAS
// ============================================
function renderChart() {
    const canvas = document.getElementById('patrimonyChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = buildChartData();

    if (patrimonyChart) {
        patrimonyChart.destroy();
        patrimonyChart = null;
    }

    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#E2E8F0' : '#2D3436';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const borderColor = isDark ? '#334155' : '#E8ECF1';

    const hasData = data && data.labels && data.labels.length > 0 &&
        data.invested.some(v => v !== 0);

    if (!hasData) {
        patrimonyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sem dados'],
                datasets: [{
                    label: 'Patrimônio',
                    data: [0],
                    backgroundColor: '#6C5CE7',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { size: 10 },
                            callback: function (value) {
                                return formatCurrency(value);
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { size: 10 } }
                    }
                }
            }
        });
        return;
    }

    patrimonyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Valor Aplicado',
                data: data.invested,
                backgroundColor: '#6C5CE7',
                borderRadius: 4,
                borderSkipped: false,
                stack: 'patrimony'
            }, {
                label: 'Ganho de Capital',
                data: data.gain,
                backgroundColor: '#FDCB6E',
                borderRadius: 4,
                borderSkipped: false,
                stack: 'patrimony'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            categoryPercentage: 0.7,
            barPercentage: 0.85,
            maxBarThickness: 52,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    labels: {
                        color: textColor,
                        font: { size: 11, weight: '500' },
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 12,
                        boxHeight: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: borderColor,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: {
                        label: function (context) {
                            const sign = context.parsed.y >= 0 ? '+' : '';
                            return `${context.dataset.label}: ${sign}${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 10 },
                        maxTicksLimit: 12
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { size: 10 },
                        callback: function (value) {
                            return formatCurrency(value);
                        }
                    }
                }
            },
            animation: {
                duration: 800
            }
        }
    });
}

// ============================================
// GRÁFICO DE PIZZA
// ============================================
function renderPieChart() {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#E2E8F0' : '#2D3436';
    const borderColor = isDark ? '#1E293B' : '#FFFFFF';

    const classes = ['Ações', 'FIIs', 'ETFs', 'Tesouro'];
    const colors = {
        'Ações': '#6C5CE7',
        'FIIs': '#00B894',
        'ETFs': '#0984E3',
        'Tesouro': '#FDCB6E'
    };
    const icons = {
        'Ações': '📈',
        'FIIs': '🏢',
        'ETFs': '📊',
        'Tesouro': '🏛️'
    };

    const data = [];
    const labels = [];
    const backgroundColors = [];

    classes.forEach(cls => {
        const total = positions
            .filter(p => p.assetClass === cls)
            .reduce((sum, p) => sum + p.currentValue, 0);
        if (total > 0) {
            data.push(total);
            labels.push(`${icons[cls]} ${cls}`);
            backgroundColors.push(colors[cls]);
        }
    });

    if (pieChart) {
        pieChart.destroy();
        pieChart = null;
    }

    if (data.length === 0) {
        pieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sem dados'],
                datasets: [{
                    data: [1],
                    backgroundColor: [isDark ? '#334155' : '#E8ECF1'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
        return;
    }

    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 3,
                borderColor: borderColor,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        padding: 10,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 10, weight: '500' },
                        boxWidth: 10,
                        boxHeight: 10
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: isDark ? '#334155' : '#E8ECF1',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatCurrency(context.parsed)} (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 800
            }
        }
    });
}

// ============================================
// GRÁFICO DE PROVENTOS - COM LABELS MM/AA
// ============================================
function renderDividendsChart() {
    const canvas = document.getElementById('dividendsChart');
    if (!canvas) {
        console.warn('⚠️ Canvas dividendsChart não encontrado');
        return;
    }

    const ctx = canvas.getContext('2d');
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#E2E8F0' : '#2D3436';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const borderColor = isDark ? '#334155' : '#E8ECF1';

    if (dividendsChart) {
        dividendsChart.destroy();
        dividendsChart = null;
    }

    if (allDividends.length === 0) {
        dividendsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sem dados'],
                datasets: [{
                    label: 'Proventos',
                    data: [0],
                    backgroundColor: [isDark ? '#334155' : '#E8ECF1'],
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor }
                    }
                },
                scales: {
                    y: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            callback: function (value) {
                                return formatCurrency(value);
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor }
                    }
                }
            }
        });
        return;
    }

    const byMonth = {};
    allDividends.forEach(d => {
        const month = d.date.substring(0, 7);
        if (!byMonth[month]) byMonth[month] = 0;
        byMonth[month] += Number(d.total_value);
    });

    const sortedMonths = Object.keys(byMonth).sort();

    const labels = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        return `${String(month).padStart(2, '0')}/${String(year).slice(2)}`;
    });

    const data = sortedMonths.map(m => byMonth[m]);

    dividendsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Proventos Recebidos',
                data: data,
                backgroundColor: function (context) {
                    const chart = context.chart;
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return '#FDCB6E';

                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    gradient.addColorStop(0, '#FDCB6E');
                    gradient.addColorStop(1, '#F39C12');
                    return gradient;
                },
                borderRadius: 6,
                borderSkipped: false,
                barPercentage: 0.6
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
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: borderColor,
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: {
                        label: function (context) {
                            return 'Proventos: ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { size: 10 },
                        callback: function (value) {
                            return formatCurrency(value);
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 9 },
                        maxTicksLimit: 10
                    }
                }
            },
            animation: {
                duration: 600
            }
        }
    });
}

// ============================================
// GRÁFICO DE PIZZA DOS PROVENTOS
// ============================================
function renderDividendsPieChart() {
    const canvas = document.getElementById('dividendsPieChart');
    if (!canvas) {
        console.warn('⚠️ Canvas dividendsPieChart não encontrado');
        return;
    }

    const ctx = canvas.getContext('2d');
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#E2E8F0' : '#2D3436';
    const borderColor = isDark ? '#1E293B' : '#FFFFFF';

    if (dividendsPieChart) {
        dividendsPieChart.destroy();
        dividendsPieChart = null;
    }

    if (allDividends.length === 0) {
        dividendsPieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sem dados'],
                datasets: [{
                    data: [1],
                    backgroundColor: [isDark ? '#334155' : '#E8ECF1'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
        return;
    }

    const byTicker = {};
    allDividends.forEach(d => {
        if (!byTicker[d.ticker]) byTicker[d.ticker] = 0;
        byTicker[d.ticker] += Number(d.total_value);
    });

    const sorted = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(item => item[0]);
    const data = sorted.map(item => item[1]);

    const colors = [
        '#6C5CE7', '#00B894', '#FDCB6E', '#0984E3',
        '#FF7675', '#E17055', '#A29BFE', '#55EFC4',
        '#FAB1A0', '#FFEAA7', '#74B9FF', '#FD79A8'
    ];

    const backgroundColors = data.map((_, i) => colors[i % colors.length]);

    dividendsPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 3,
                borderColor: borderColor,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        padding: 8,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 9, weight: '500' },
                        boxWidth: 10,
                        boxHeight: 10
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: isDark ? '#334155' : '#E8ECF1',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatCurrency(context.parsed)} (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 700
            }
        }
    });
}

// ============================================
// FUNÇÃO GLOBAL PARA PERÍODO
// ============================================
function setPeriod(period) {
    selectedPeriod = period;
    document.querySelectorAll('.period-filter .btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === period) {
            btn.classList.add('active');
        }
    });
    renderChart();
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
// EXPORTA FUNÇÕES GLOBAIS
// ============================================
window.openOperationModal = openOperationModal;
window.closeOperationModal = closeOperationModal;
window.openDividendModal = openDividendModal;
window.closeDividendModal = closeDividendModal;
window.saveOperation = saveOperation;
window.saveDividend = saveDividend;
window.deleteTransaction = deleteTransaction;
window.deleteDividend = deleteDividend;
window.editTransaction = editTransaction;
window.filterByClass = filterByClass;
window.switchTab = switchTab;
window.setPeriod = setPeriod;
window.loadDividends = loadDividends;
window.refreshDashboard = refreshDashboard;

console.log('✅ Investments.js carregado com labels MM/AA!');