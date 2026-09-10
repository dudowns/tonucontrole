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
let selectedEvolutionClass = 'all';
let selectedPieClass = 'all';
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

function parseBrazilianNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;

    let str = String(value).trim();
    str = str.replace(/[R$\s]/gi, '');

    if (str.includes('.') && str.includes(',')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    } else if (str.includes('.')) {
        const parts = str.split('.');
        if (parts.length > 2) {
            str = parts.join('');
        } else if (parts[1] && parts[1].length === 3 && Number(parts[0]) >= 1) {
            str = parts[0] + parts[1];
        }
    }

    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
}

function parseNumberInput(value) {
    return parseBrazilianNumber(value);
}

function parsePriceInput(value) {
    return parseBrazilianNumber(value);
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
    const dateComInput = document.getElementById('divDateCom');
    if (dateComInput) dateComInput.value = '';
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

    // Restaura aba ativa caso presente na URL ou sessão
    const hashTab = (window.location.hash || '').replace('#', '').trim();
    if (['carteira', 'lancamentos', 'proventos'].includes(hashTab)) {
        switchTab(hashTab);
    }
});

// ============================================
// SWITCH TAB
// ============================================
async function switchTab(tab) {
    currentTab = tab;
    try {
        if (window.location.hash !== `#${tab}`) {
            history.replaceState(null, '', `#${tab}`);
        }
    } catch (e) {}

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tab}`);
    });
    if (tab === 'proventos') {
        if (!allDividends || allDividends.length === 0) {
            await loadDividends();
        } else {
            populateProventosFilterDropdowns();
            updateProventosSummary();
            renderDividendsChart();
            renderDividendsPieChart();
            renderProventosHistoryTable();
            renderProventosListTable();
        }
    }
    if (tab === 'carteira') {
        renderChart();
        renderPieChart();
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
        await Promise.allSettled([
            fetchQuotes(),
            fetchHistoricalMonthlyQuotes()
        ]);
        decoratePositions();
        updateSummary();
        updateClassCounts();
        renderTable();
        renderTransactions();
        updateQuoteStatus();
        renderChart();
        renderPieChart();

    } catch (error) {
        console.error('❌ Erro ao carregar investimentos:', error);
        showToast('Erro ao carregar dados', 'error');
    } finally {
        if (chartLoading) chartLoading.classList.add('hidden');
    }
}

async function loadTransactions() {
    try {
        let loaded = [];
        let fetchedFromDb = false;

        if (currentUser && currentUser.id && typeof supabaseClient !== 'undefined') {
            try {
                let { data, error } = await supabaseClient
                    .from('investments')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('date', { ascending: true });

                if (!error && data && data.length > 0) {
                    loaded = data;
                    fetchedFromDb = true;
                } else {
                    const fallback = await supabaseClient
                        .from('investments')
                        .select('*')
                        .order('date', { ascending: true });
                    if (!fallback.error && fallback.data && fallback.data.length > 0) {
                        const userFiltered = fallback.data.filter(inv => !inv.user_id || inv.user_id === currentUser.id);
                        if (userFiltered.length > 0) {
                            loaded = userFiltered;
                            fetchedFromDb = true;
                        }
                    }
                }
            } catch (dbErr) {
                console.warn('⚠️ Falha ao buscar transações de investimento do Supabase:', dbErr);
            }
        }

        if (fetchedFromDb && loaded.length > 0) {
            allTransactions = loaded;
            localStorage.removeItem('tonu_is_demo_active');
            updateGlobalDemoUI(false);
            console.log('📊 Transações reais carregadas do backend:', allTransactions.length);
            return;
        }

        const isDemo = localStorage.getItem('tonu_is_demo_active') === 'true';
        const dismissed = localStorage.getItem('tonu_demo_dismissed') === 'true';
        if (isDemo || !dismissed) {
            allTransactions = generateDemoTransactions();
            applyDemoQuotes();
            updateGlobalDemoUI(true);
            console.log('📊 Transações de demonstração ativas:', allTransactions.length);
        } else {
            allTransactions = [];
            updateGlobalDemoUI(false);
        }

    } catch (error) {
        console.error('❌ Erro ao carregar transações:', error);
        const dismissed = localStorage.getItem('tonu_demo_dismissed') === 'true';
        if (!dismissed || localStorage.getItem('tonu_is_demo_active') === 'true') {
            allTransactions = generateDemoTransactions();
            applyDemoQuotes();
            localStorage.setItem('tonu_is_demo_active', 'true');
            updateGlobalDemoUI(true);
        } else {
            allTransactions = [];
            updateGlobalDemoUI(false);
        }
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
        const dateCom = document.getElementById('divDateCom')?.value || '';

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

        let finalNote = note ? note.trim() : '';
        if (dateCom) {
            finalNote = `[DataCom: ${dateCom}] ` + finalNote;
        }

        const newId = 'div-' + Date.now();
        const data = {
            id: newId,
            user_id: currentUser ? currentUser.id : 'demo-user',
            ticker: ticker,
            quantity: quantity,
            unit_value: unitValue,
            total_value: totalValue,
            date: date,
            type: type,
            note: finalNote.trim() || null
        };

        let supabaseSaved = false;
        if (currentUser && currentUser.id && typeof supabaseClient !== 'undefined') {
            try {
                const { data: dbData, error } = await supabaseClient
                    .from('dividends')
                    .insert([{
                        user_id: currentUser.id,
                        ticker: ticker,
                        quantity: quantity,
                        unit_value: unitValue,
                        total_value: totalValue,
                        date: date,
                        type: type,
                        note: finalNote.trim() || null
                    }])
                    .select();

                if (!error) {
                    supabaseSaved = true;
                    if (dbData && dbData[0]) {
                        data.id = dbData[0].id;
                    }
                } else {
                    console.warn('⚠️ Supabase insert warning, salvando localmente:', error.message);
                }
            } catch (dbErr) {
                console.warn('⚠️ Supabase insert catch, fallback local:', dbErr);
            }
        }

        // Salva e atualiza o cache local
        allDividends = [data, ...allDividends.filter(d => d.id !== data.id)];
        const storageKey = `tonucontrole_dividends_${currentUser ? currentUser.id : 'demo'}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify(allDividends));
        } catch (e) {}

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
        if (currentUser && currentUser.id && !String(id).startsWith('demo-') && !String(id).startsWith('div-')) {
            try {
                await supabaseClient
                    .from('dividends')
                    .delete()
                    .eq('id', id)
                    .eq('user_id', currentUser.id);
            } catch (err) {
                console.warn('⚠️ Supabase delete warning:', err);
            }
        }

        allDividends = allDividends.filter(d => String(d.id) !== String(id));
        const storageKey = `tonucontrole_dividends_${currentUser ? currentUser.id : 'demo'}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify(allDividends));
        } catch (e) {}

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

    // Ordenação estritamente cronológica
    const sortedTransactions = [...allTransactions]
        .filter(tx => tx && tx.ticker)
        .sort((a, b) => {
            const da = new Date((a.date || '1970-01-01') + 'T12:00:00').getTime();
            const db = new Date((b.date || '1970-01-01') + 'T12:00:00').getTime();
            if (da !== db) return da - db;
            // Se mesma data, compras são processadas antes de vendas
            const typeA = (a.type || '').toLowerCase();
            const typeB = (b.type || '').toLowerCase();
            const isBuyA = typeA === 'compra' || typeA === 'buy';
            const isBuyB = typeB === 'compra' || typeB === 'buy';
            if (isBuyA && !isBuyB) return -1;
            if (!isBuyA && isBuyB) return 1;
            return (a.created_at || '').localeCompare(b.created_at || '');
        });

    for (const tx of sortedTransactions) {
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
        const qty = parseBrazilianNumber(tx.quantity);
        let unit = parseBrazilianNumber(tx.unit_price);
        let total = parseBrazilianNumber(tx.total_value);

        // Auto-reparação de dados inconsistentes
        if (total <= 0 && qty > 0 && unit > 0) {
            total = qty * unit;
        } else if (unit <= 0 && qty > 0 && total > 0) {
            unit = total / qty;
        }

        const typeLower = (tx.type || '').toLowerCase();
        const isBuy = typeLower === 'compra' || typeLower === 'buy';

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
            } else {
                pos.costBasis = Math.max(0, pos.costBasis);
                pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
            }
        }
    }

    positions = [...grouped.values()]
        .filter(p => p.quantity > 0.0000001)
        .map(p => ({
            ...p,
            costBasis: Math.max(0, Math.round(p.costBasis * 100) / 100),
            averageCost: Math.round(p.averageCost * 100) / 100
        }));

    console.log('📊 Posições calculadas:', positions.length);
}

// ============================================
// AUXILIARES DE RENDA FIXA & RENDIMENTOS
// ============================================
function isTesouroTicker(ticker) {
    if (!ticker) return false;
    const tk = ticker.toUpperCase().trim();
    return /^(TESOURO|LFT|LTN|NTNB|NTNF|IPCA|PREFIXADO|SELIC|CDB|LCI|LCA|LC|RDB)/.test(tk);
}

function getMonthsBetween(d1, d2) {
    let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    return Math.max(0, months);
}

// ============================================
// BUSCAR COTAÇÕES (BRAPI) COM CACHE RESILIENTE
// ============================================
async function fetchQuotes() {
    // Carrega cache local prévio para evitar tela zerada se houver instabilidade na API
    try {
        const rawCache = localStorage.getItem('tonu_quotes_cache');
        if (rawCache) {
            const parsed = JSON.parse(rawCache);
            if (parsed && parsed.quotes) {
                for (const [k, v] of Object.entries(parsed.quotes)) {
                    if (!quotes.has(k)) {
                        quotes.set(k, v);
                    }
                }
            }
        }
    } catch (cacheErr) {
        console.warn('⚠️ Erro ao carregar cache de cotações:', cacheErr);
    }

    const tickers = positions.map(p => p.ticker);
    if (!tickers.length) {
        console.log('📊 Nenhum ativo para buscar cotações');
        return;
    }

    const validTickers = tickers
        .filter(t => t && t.length >= 3 && /^[A-Z0-9]{3,}$/.test(t) && !isTesouroTicker(t))
        .map(t => t.toUpperCase().trim());

    if (validTickers.length === 0) {
        console.log('ℹ️ Apenas ativos de renda fixa ou tickers especiais, usando valorização inteligente');
        updateQuoteStatus();
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
                const rawTk = q.symbol?.toUpperCase().trim();
                if (!rawTk || !Number.isFinite(Number(q.regularMarketPrice))) continue;

                const cleanTk = rawTk.replace(/\.SA$/, '');
                const quoteData = {
                    price: Number(q.regularMarketPrice),
                    changePct: Number(q.regularMarketChangePercent || 0),
                    previousClose: Number(q.regularMarketPreviousClose || 0),
                    marketTime: q.regularMarketTime || new Date().toISOString(),
                    simulated: false,
                    source: 'BRAPI'
                };

                // Armazena com e sem .SA para busca rápida sem falhas de formato
                quotes.set(rawTk, quoteData);
                quotes.set(cleanTk, quoteData);
                quotes.set(`${cleanTk}.SA`, quoteData);
                foundCount++;
                console.log(`✅ Cotação real de ${cleanTk}: R$ ${q.regularMarketPrice}`);
            }

            console.log(`✅ ${foundCount} cotações reais carregadas`);

            // Salva no cache local para persistência offline e resiliente
            try {
                const cacheObj = {};
                for (const [k, v] of quotes.entries()) {
                    cacheObj[k] = v;
                }
                localStorage.setItem('tonu_quotes_cache', JSON.stringify({
                    timestamp: Date.now(),
                    quotes: cacheObj
                }));
            } catch (saveErr) {
                console.warn('⚠️ Erro ao salvar cache de cotações:', saveErr);
            }
        }

        const missingTickers = unique.filter(t => !quotes.has(t));
        if (missingTickers.length > 0) {
            console.warn(`⚠️ Tickers não encontrados na BRAPI: ${missingTickers.join(', ')}`);
        }

        updateQuoteStatus();

    } catch (error) {
        console.error('❌ Erro ao buscar cotações:', error.message);
        // Não apaga quotes se houver cache local prévio
        if (quotes.size === 0) {
            isUsingRealQuotes = false;
        }
    }
}

// ============================================
// COTAÇÕES HISTÓRICAS MENSAIS (INVESTIDOR 10 STYLE)
// ============================================
let historicalMonthlyQuotes = new Map();
try {
    const rawHist = localStorage.getItem('tonu_historical_quotes');
    if (rawHist) {
        const parsed = JSON.parse(rawHist);
        if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
                historicalMonthlyQuotes.set(k, v);
            }
        }
    }
} catch (histCacheErr) {
    console.warn('⚠️ Erro ao carregar cache de histórico:', histCacheErr);
}

async function fetchHistoricalMonthlyQuotes() {
    const allTickers = [
        ...positions.map(p => p.ticker),
        ...allTransactions.map(t => t.ticker)
    ]
    .filter(t => t && t.length >= 3 && /^[A-Z0-9\.\-]{3,}$/i.test(t) && !isTesouroTicker(t))
    .map(t => t.toUpperCase().trim().replace(/\.SA$/, ''));

    const uniqueTickers = [...new Set(allTickers)];
    if (uniqueTickers.length === 0) return;

    try {
        console.log('📈 Buscando histórico mensal para:', uniqueTickers.join(', '));
        const res = await fetch(`/api/historical-quotes?tickers=${encodeURIComponent(uniqueTickers.join(','))}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data && data.quotes) {
            let loadedCount = 0;
            for (const [tk, monthMap] of Object.entries(data.quotes)) {
                const clean = tk.toUpperCase().replace(/\.SA$/, '');
                historicalMonthlyQuotes.set(clean, monthMap);
                historicalMonthlyQuotes.set(`${clean}.SA`, monthMap);
                loadedCount++;
            }

            try {
                const cacheObj = {};
                for (const [k, v] of historicalMonthlyQuotes.entries()) {
                    cacheObj[k] = v;
                }
                localStorage.setItem('tonu_historical_quotes', JSON.stringify(cacheObj));
            } catch (e) {
                console.warn('⚠️ Falha ao salvar histórico no localStorage:', e);
            }

            console.log(`✅ ${loadedCount} ativos com histórico mensal carregados`);

            // Re-renderiza o gráfico de evolução com as cotações de fechamento exatas de cada mês
            renderChart();
        }
    } catch (e) {
        console.warn('⚠️ Não foi possível carregar histórico mensal:', e);
    }
}

function findClosestHistoricalPrice(histMap, targetMonthKey) {
    if (!histMap) return null;
    if (histMap[targetMonthKey] && Number.isFinite(histMap[targetMonthKey]) && histMap[targetMonthKey] > 0) {
        return histMap[targetMonthKey];
    }

    const months = Object.keys(histMap).sort();
    if (months.length === 0) return null;

    // Procura o mês mais recente anterior ao mês alvo
    const pastMonths = months.filter(m => m <= targetMonthKey);
    if (pastMonths.length > 0) {
        const closestPast = pastMonths[pastMonths.length - 1];
        if (histMap[closestPast]) return histMap[closestPast];
    }

    // Se o mês for anterior ao histórico mais antigo, pega o mais antigo disponível
    return histMap[months[0]] || null;
}

// ============================================
// DECORATE POSITIONS - COM PREÇO REAL
// ============================================
function decoratePositions() {
    const totalValue = positions.reduce((s, p) => s + posValue(p), 0);

    positions = positions.map(p => {
        const cleanTicker = p.ticker?.toUpperCase().trim().replace(/\.SA$/, '');
        const quote = quotes.get(cleanTicker) || quotes.get(p.ticker) || quotes.get(`${cleanTicker}.SA`);
        const hasQuote = quote !== undefined && Number.isFinite(quote.price) && quote.price > 0;
        const price = hasQuote ? quote.price : (p.averageCost || 0);
        const changePct = hasQuote ? (quote.changePct || 0) : 0;
        const simulated = !hasQuote;
        const source = hasQuote ? 'BRAPI' : 'Preço Médio';

        const currentValue = Math.round((p.quantity * price) * 100) / 100;
        const gain = Math.round((currentValue - p.costBasis) * 100) / 100;
        const gainPct = p.costBasis > 0 ? Math.round(((gain / p.costBasis) * 100) * 100) / 100 : 0;
        const portfolioPct = totalValue > 0 ? Math.round(((currentValue / totalValue) * 100) * 100) / 100 : 0;

        return {
            ...p,
            quote: {
                price: price,
                changePct: changePct,
                previousClose: hasQuote ? (quote.previousClose || price) : price,
                simulated: simulated,
                source: source
            },
            currentValue: currentValue,
            gain: gain,
            gainPct: gainPct,
            portfolioPct: portfolioPct
        };
    });
}

// ============================================
// POS VALUE - PREÇO DE MERCADO OU CUSTO MÉDIO
// ============================================
function posValue(p) {
    const cleanTicker = p.ticker?.toUpperCase().trim().replace(/\.SA$/, '');
    const q = quotes.get(cleanTicker) || quotes.get(p.ticker) || quotes.get(`${cleanTicker}.SA`);
    if (q && Number.isFinite(q.price) && q.price > 0) {
        return p.quantity * q.price;
    }
    return p.quantity * (p.averageCost || 0);
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
// PROVENTOS STATE & HELPERS (MODELO INVESTIDOR 10)
// ============================================
let proventosPeriodicity = 'monthly';
let proventosChartPeriod = '12M';
let proventosChartClass = 'ALL';
let proventosChartTicker = 'ALL';
let last12MTickersData = [];

function getAssetClassForTicker(ticker) {
    if (!ticker) return 'Ações';
    const clean = ticker.toUpperCase().trim();
    if (typeof positions !== 'undefined' && Array.isArray(positions)) {
        const pos = positions.find(p => p.ticker && p.ticker.toUpperCase() === clean);
        if (pos && pos.class) return pos.class;
    }
    if (typeof allOperations !== 'undefined' && Array.isArray(allOperations)) {
        const op = allOperations.find(o => o.ticker && o.ticker.toUpperCase() === clean);
        if (op && op.class) return op.class;
    }
    if (clean.endsWith('11') || clean.endsWith('11B')) return 'FIIs';
    if (clean.startsWith('TESOURO') || clean.includes('NTN') || clean.includes('LFT') || clean.includes('LTN')) return 'Tesouro';
    if (clean.endsWith('34') || clean.endsWith('35')) return 'BDRs';
    return 'Ações';
}

function getIconForClass(cls) {
    switch (cls) {
        case 'FIIs': return 'fas fa-building';
        case 'ETFs': return 'fas fa-layer-group';
        case 'Tesouro': return 'fas fa-landmark';
        case 'BDRs': return 'fas fa-globe';
        case 'Ações':
        default:
            return 'fas fa-chart-line';
    }
}

function extractDataCom(note) {
    if (!note) return null;
    const match = note.match(/\[DataCom:\s*([^\]]+)\]/i);
    return match ? match[1].trim() : null;
}

// ============================================
// AUXILIARES ROBUSTOS PARA PROVENTOS
// ============================================
function getDividendISODate(d) {
    if (!d || !d.date) return '';
    let s = String(d.date).trim();
    if (s.includes('T')) s = s.split('T')[0];
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        const parts = s.split('/');
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
        const parts = s.split('-');
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
        const yr = dt.getFullYear();
        const mo = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${yr}-${mo}-${day}`;
    }
    return s;
}

function getDividendYearMonth(d) {
    const iso = getDividendISODate(d);
    if (!iso || iso.length < 7) return { year: null, month: null, yearMonth: null };
    const parts = iso.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed (0=Jan, 11=Dez)
    if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
        return { year: null, month: null, yearMonth: null };
    }
    return {
        year: year,
        month: month,
        yearMonth: `${parts[0]}-${parts[1]}`
    };
}

function getDividendTotalValue(d) {
    if (!d) return 0;
    if (d.total_value !== undefined && d.total_value !== null && d.total_value !== '') {
        const val = parseBrazilianNumber(d.total_value);
        if (!isNaN(val) && val > 0) return val;
    }
    const qty = parseBrazilianNumber(d.quantity);
    const unit = parseBrazilianNumber(d.unit_value);
    const calc = qty * unit;
    return (!isNaN(calc) && calc > 0) ? calc : 0;
}

function getDividendUnitValue(d) {
    if (!d) return 0;
    if (d.unit_value !== undefined && d.unit_value !== null && d.unit_value !== '') {
        const val = parseBrazilianNumber(d.unit_value);
        if (!isNaN(val) && val > 0) return val;
    }
    const total = getDividendTotalValue(d);
    const qty = parseBrazilianNumber(d.quantity);
    if (qty > 0 && total > 0) return total / qty;
    return 0;
}

function getDividendQuantity(d) {
    if (!d) return 0;
    const qty = parseBrazilianNumber(d.quantity);
    if (!isNaN(qty) && qty > 0) return qty;
    const total = getDividendTotalValue(d);
    const unit = getDividendUnitValue(d);
    if (unit > 0 && total > 0) return Math.round(total / unit);
    return 0;
}

function populateProventosFilterDropdowns() {
    const tickers = [...new Set(allDividends.map(d => (d.ticker || '').toUpperCase().trim()).filter(Boolean))].sort();

    const tickerSelects = [
        document.getElementById('provChartTickerSelect'),
        document.getElementById('provHistoryTickerSelect'),
        document.getElementById('provListTickerSelect')
    ];

    tickerSelects.forEach(select => {
        if (!select) return;
        const currentVal = select.value || 'ALL';
        select.innerHTML = `<option value="ALL">Ativos</option>` +
            tickers.map(t => `<option value="${t}">${t}</option>`).join('');
        if (tickers.includes(currentVal) || currentVal === 'ALL') {
            select.value = currentVal;
        }
    });

    const yearSelect = document.getElementById('provListYearSelect');
    if (yearSelect) {
        const currentYear = new Date().getFullYear();
        const yearsSet = new Set(allDividends.map(d => {
            const ym = getDividendYearMonth(d);
            return ym.year;
        }).filter(Boolean));
        yearsSet.add(currentYear);
        const years = Array.from(yearsSet).sort((a, b) => b - a);

        const currentVal = yearSelect.value || 'ALL';
        yearSelect.innerHTML = `<option value="ALL">Todos os anos</option>` +
            years.map(y => `<option value="${y}">${y}</option>`).join('');
        if (years.map(String).includes(String(currentVal)) || currentVal === 'ALL') {
            yearSelect.value = currentVal;
        }
    }
}

// ============================================
// SISTEMA DE DEMONSTRAÇÃO COMPLETA (CARTEIRA + PROVENTOS)
// ============================================
function updateGlobalDemoUI(isDemo) {
    const banner = document.getElementById('demoModeBanner');
    const toggleBtn = document.getElementById('btnToggleDemoMode');
    const btnText = document.getElementById('demoBtnText');

    if (banner) {
        banner.style.display = isDemo ? 'flex' : 'none';
    }

    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isDemo);
    }

    if (btnText) {
        btnText.textContent = isDemo ? 'Demonstração Ativa' : 'Demonstração';
    }

    updateDemoUIState(isDemo);
}

function updateDemoUIState(isDemo) {
    const btnClear = document.getElementById('btnClearDemoProventos');
    const badgeText = document.getElementById('badgeProventosStatusText');
    const btnDemo = document.getElementById('btnDemoProventos');

    if (btnClear) {
        btnClear.style.display = isDemo ? 'inline-flex' : 'none';
    }
    if (badgeText) {
        badgeText.textContent = isDemo ? 'Demonstração Ativa' : 'Painel de Proventos';
        badgeText.style.color = isDemo ? '#0984E3' : 'inherit';
    }
    if (btnDemo) {
        btnDemo.innerHTML = isDemo
            ? '<i class="fas fa-redo"></i> Recarregar Demo'
            : '<i class="fas fa-magic"></i> Carregar Demonstração';
    }
}

function generateDemoTransactions() {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-indexed

    function makeDate(monthsAgo, day = 10) {
        const d = new Date(curYear, curMonth - monthsAgo, day, 12, 0, 0);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    return [
        // Tesouro Direto Selic
        {
            id: 'demo-tx-1',
            ticker: 'Tesouro Selic 2029',
            asset_class: 'Tesouro',
            type: 'Compra',
            quantity: 1,
            unit_price: 14500.00,
            total_value: 14500.00,
            date: makeDate(13, 5),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(13, 5)
        },
        // MXRF11 (FII de papel)
        {
            id: 'demo-tx-2',
            ticker: 'MXRF11',
            asset_class: 'FIIs',
            type: 'Compra',
            quantity: 300,
            unit_price: 10.10,
            total_value: 3030.00,
            date: makeDate(13, 12),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(13, 12)
        },
        {
            id: 'demo-tx-3',
            ticker: 'MXRF11',
            asset_class: 'FIIs',
            type: 'Compra',
            quantity: 200,
            unit_price: 10.25,
            total_value: 2050.00,
            date: makeDate(7, 15),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(7, 15)
        },
        // ITUB4 (Ações Itaú)
        {
            id: 'demo-tx-4',
            ticker: 'ITUB4',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 150,
            unit_price: 28.90,
            total_value: 4335.00,
            date: makeDate(12, 8),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(12, 8)
        },
        {
            id: 'demo-tx-5',
            ticker: 'ITUB4',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 150,
            unit_price: 31.00,
            total_value: 4650.00,
            date: makeDate(8, 14),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(8, 14)
        },
        {
            id: 'demo-tx-6',
            ticker: 'ITUB4',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 100,
            unit_price: 33.20,
            total_value: 3320.00,
            date: makeDate(4, 18),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(4, 18)
        },
        // PETR4 (Ações Petrobras)
        {
            id: 'demo-tx-7',
            ticker: 'PETR4',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 100,
            unit_price: 31.50,
            total_value: 3150.00,
            date: makeDate(11, 11),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(11, 11)
        },
        {
            id: 'demo-tx-8',
            ticker: 'PETR4',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 100,
            unit_price: 34.00,
            total_value: 3400.00,
            date: makeDate(7, 20),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(7, 20)
        },
        {
            id: 'demo-tx-9',
            ticker: 'PETR4',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 100,
            unit_price: 36.20,
            total_value: 3620.00,
            date: makeDate(3, 16),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(3, 16)
        },
        // HGLG11 (FII Logístico)
        {
            id: 'demo-tx-10',
            ticker: 'HGLG11',
            asset_class: 'FIIs',
            type: 'Compra',
            quantity: 40,
            unit_price: 157.00,
            total_value: 6280.00,
            date: makeDate(11, 22),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(11, 22)
        },
        {
            id: 'demo-tx-11',
            ticker: 'HGLG11',
            asset_class: 'FIIs',
            type: 'Compra',
            quantity: 20,
            unit_price: 160.00,
            total_value: 3200.00,
            date: makeDate(5, 10),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(5, 10)
        },
        // VALE3 (Ações Vale)
        {
            id: 'demo-tx-12',
            ticker: 'VALE3',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 80,
            unit_price: 64.00,
            total_value: 5120.00,
            date: makeDate(10, 7),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(10, 7)
        },
        {
            id: 'demo-tx-13',
            ticker: 'VALE3',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 50,
            unit_price: 60.50,
            total_value: 3025.00,
            date: makeDate(6, 25),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(6, 25)
        },
        // IVVB11 (ETF S&P 500)
        {
            id: 'demo-tx-14',
            ticker: 'IVVB11',
            asset_class: 'ETFs',
            type: 'Compra',
            quantity: 20,
            unit_price: 275.00,
            total_value: 5500.00,
            date: makeDate(10, 19),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(10, 19)
        },
        {
            id: 'demo-tx-15',
            ticker: 'IVVB11',
            asset_class: 'ETFs',
            type: 'Compra',
            quantity: 15,
            unit_price: 305.00,
            total_value: 4575.00,
            date: makeDate(5, 12),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(5, 12)
        },
        // XPML11 (FII Shopping)
        {
            id: 'demo-tx-16',
            ticker: 'XPML11',
            asset_class: 'FIIs',
            type: 'Compra',
            quantity: 50,
            unit_price: 102.00,
            total_value: 5100.00,
            date: makeDate(9, 14),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(9, 14)
        },
        {
            id: 'demo-tx-17',
            ticker: 'XPML11',
            asset_class: 'FIIs',
            type: 'Compra',
            quantity: 30,
            unit_price: 106.00,
            total_value: 3180.00,
            date: makeDate(4, 28),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(4, 28)
        },
        // WEGE3 (Ações WEG)
        {
            id: 'demo-tx-18',
            ticker: 'WEGE3',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 120,
            unit_price: 42.00,
            total_value: 5040.00,
            date: makeDate(9, 26),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(9, 26)
        },
        {
            id: 'demo-tx-19',
            ticker: 'WEGE3',
            asset_class: 'Ações',
            type: 'Compra',
            quantity: 80,
            unit_price: 46.50,
            total_value: 3720.00,
            date: makeDate(4, 20),
            user_id: currentUser ? currentUser.id : 'demo',
            created_at: makeDate(4, 20)
        }
    ];
}

function applyDemoQuotes() {
    const demoQuoteMap = {
        'PETR4': { price: 38.65, changePct: 1.18, previousClose: 38.20, simulated: false, source: 'Demo' },
        'VALE3': { price: 59.40, changePct: -0.42, previousClose: 59.65, simulated: false, source: 'Demo' },
        'ITUB4': { price: 35.95, changePct: 0.85, previousClose: 35.65, simulated: false, source: 'Demo' },
        'WEGE3': { price: 53.45, changePct: 1.45, previousClose: 52.68, simulated: false, source: 'Demo' },
        'MXRF11': { price: 10.45, changePct: 0.10, previousClose: 10.44, simulated: false, source: 'Demo' },
        'HGLG11': { price: 164.80, changePct: 0.25, previousClose: 164.39, simulated: false, source: 'Demo' },
        'XPML11': { price: 112.50, changePct: 0.40, previousClose: 112.05, simulated: false, source: 'Demo' },
        'IVVB11': { price: 334.00, changePct: 0.60, previousClose: 332.01, simulated: false, source: 'Demo' },
        'TESOURO SELIC 2029': { price: 16240.00, changePct: 0.04, previousClose: 16233.50, simulated: false, source: 'Demo' }
    };

    for (const [tk, q] of Object.entries(demoQuoteMap)) {
        quotes.set(tk, q);
        quotes.set(`${tk}.SA`, q);
    }

    // Preenche histórico mensal para alimentar o gráfico de evolução dos últimos 14 meses
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    const tickers = ['PETR4', 'VALE3', 'ITUB4', 'WEGE3', 'MXRF11', 'HGLG11', 'XPML11', 'IVVB11'];
    const priceCurves = {
        'PETR4': [30.2, 30.8, 31.5, 32.2, 33.1, 33.9, 34.5, 35.2, 36.0, 36.4, 37.1, 37.8, 38.2, 38.65],
        'VALE3': [66.0, 65.2, 64.0, 63.5, 62.4, 61.5, 60.5, 60.0, 59.5, 58.8, 58.2, 58.9, 59.1, 59.4],
        'ITUB4': [28.0, 28.5, 29.0, 29.8, 30.5, 31.2, 31.9, 32.5, 33.2, 33.9, 34.5, 35.1, 35.6, 35.95],
        'WEGE3': [40.0, 41.2, 42.0, 43.1, 44.5, 45.8, 47.0, 48.2, 49.5, 50.8, 51.5, 52.2, 53.0, 53.45],
        'MXRF11': [10.12, 10.15, 10.18, 10.20, 10.22, 10.25, 10.28, 10.30, 10.33, 10.36, 10.39, 10.42, 10.44, 10.45],
        'HGLG11': [157.0, 157.5, 158.0, 158.8, 159.5, 160.2, 161.0, 161.8, 162.5, 163.2, 164.0, 164.4, 164.6, 164.8],
        'XPML11': [102.0, 102.8, 103.5, 104.2, 105.0, 106.0, 107.2, 108.5, 109.8, 110.5, 111.2, 111.8, 112.2, 112.5],
        'IVVB11': [275.0, 280.0, 286.0, 292.0, 298.0, 305.0, 310.0, 316.0, 322.0, 326.0, 329.0, 331.0, 332.5, 334.0]
    };

    for (const tk of tickers) {
        const histMap = {};
        const curve = priceCurves[tk];
        for (let i = 0; i < 14; i++) {
            const d = new Date(curYear, curMonth - (13 - i), 1);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            histMap[`${y}-${m}`] = curve[i];
        }
        historicalMonthlyQuotes.set(tk, histMap);
        historicalMonthlyQuotes.set(`${tk}.SA`, histMap);
    }
}

function generateDemoDividends() {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-indexed

    const list = [];
    let idCounter = 1;

    function addDiv(ticker, type, qty, unit, yr, mo, day, note = '') {
        const monthStr = String(mo + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        const dateStr = `${yr}-${monthStr}-${dayStr}`;
        const total = parseFloat((qty * unit).toFixed(2));
        list.push({
            id: 'demo-' + (idCounter++),
            ticker: ticker,
            type: type,
            quantity: qty,
            unit_value: unit,
            total_value: total,
            date: dateStr,
            note: note,
            is_demo: true
        });
    }

    // Gerar proventos de demonstração em uma janela de 15 meses (12 passados + corrente + 2 futuros)
    for (let offset = -12; offset <= 2; offset++) {
        const targetDate = new Date(curYear, curMonth + offset, 15);
        const yr = targetDate.getFullYear();
        const mo = targetDate.getMonth();

        // MXRF11 (FII de papel - Rendimento todo mês)
        addDiv('MXRF11', 'Rendimento', 500, 0.10, yr, mo, 15, `DataCom: ${yr}-${String(mo === 0 ? 12 : mo).padStart(2, '0')}-30`);

        // HGLG11 (FII de galpão - Rendimento todo mês)
        addDiv('HGLG11', 'Rendimento', 60, 1.10, yr, mo, 14, `DataCom: ${yr}-${String(mo === 0 ? 12 : mo).padStart(2, '0')}-30`);

        // XPML11 (FII de Shopping - bimestral)
        if (mo % 2 === 0) {
            addDiv('XPML11', 'Rendimento', 80, 0.90, yr, mo, 20, `DataCom: ${yr}-${String(mo + 1).padStart(2, '0')}-05`);
        }

        // ITUB4 (JCP mensal padrão Itaú)
        addDiv('ITUB4', 'JCP', 400, 0.0176, yr, mo, 1, `DataCom: ${yr}-${String(mo === 0 ? 12 : mo).padStart(2, '0')}-30`);

        // PETR4 (Petrobras - trimestral expressivo)
        if (mo === 2 || mo === 5 || mo === 8 || mo === 10) {
            const petrType = mo % 2 === 0 ? 'Dividendo' : 'JCP';
            const petrUnit = mo % 2 === 0 ? 1.80 : 1.15;
            addDiv('PETR4', petrType, 300, petrUnit, yr, mo, 22, `DataCom: ${yr}-${String(mo + 1).padStart(2, '0')}-10`);
        }

        // VALE3 (Vale - Março e Agosto)
        if (mo === 2 || mo === 7) {
            const valeType = mo === 2 ? 'Dividendo' : 'JCP';
            addDiv('VALE3', valeType, 130, 2.45, yr, mo, 18, `DataCom: ${yr}-${String(mo + 1).padStart(2, '0')}-05`);
        }

        // BBAS3 (Banco do Brasil - Fevereiro e Agosto)
        if (mo === 1 || mo === 7) {
            addDiv('BBAS3', 'JCP', 150, 1.05, yr, mo, 28, `DataCom: ${yr}-${String(mo + 1).padStart(2, '0')}-15`);
        }
    }

    return list.sort((a, b) => (b.date > a.date ? 1 : -1));
}

async function loadAllDemoData(showUserToast = true) {
    try {
        localStorage.setItem('tonu_is_demo_active', 'true');
        localStorage.removeItem('tonu_demo_dismissed');

        allTransactions = generateDemoTransactions();
        applyDemoQuotes();

        allDividends = generateDemoDividends();
        const storageKey = `tonucontrole_dividends_${currentUser ? currentUser.id : 'demo'}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify(allDividends));
            localStorage.setItem('tonucontrole_is_demo_dividends', 'true');
        } catch (e) {}

        updateGlobalDemoUI(true);

        buildPositions();
        decoratePositions();
        updateSummary();
        updateClassCounts();
        renderTable();
        renderTransactions();
        updateQuoteStatus();
        renderChart();
        renderPieChart();

        populateProventosFilterDropdowns();
        updateProventosSummary();
        renderDividendsChart();
        renderDividendsPieChart();
        renderProventosHistoryTable();
        renderProventosListTable();

        if (showUserToast) {
            showToast('✨ Demonstração completa carregada com sucesso!', 'success');
        }
    } catch (e) {
        console.error('❌ Erro ao carregar demonstração completa:', e);
        showToast('Erro ao carregar dados de demonstração', 'error');
    }
}

async function clearAllDemoData() {
    try {
        localStorage.removeItem('tonu_is_demo_active');
        localStorage.setItem('tonu_demo_dismissed', 'true');
        localStorage.removeItem('tonucontrole_is_demo_dividends');
        const storageKey = `tonucontrole_dividends_${currentUser ? currentUser.id : 'demo'}`;
        try { localStorage.removeItem(storageKey); } catch (e) {}

        updateGlobalDemoUI(false);

        allTransactions = [];
        allDividends = [];
        positions = [];

        await refreshDashboard();
        await loadDividends();

        showToast('🧹 Demonstração desativada. Carteira zerada.', 'info');
    } catch (e) {
        console.error('❌ Erro ao limpar demonstração:', e);
    }
}

function toggleGlobalDemoMode() {
    const isDemo = localStorage.getItem('tonu_is_demo_active') === 'true';
    if (isDemo) {
        clearAllDemoData();
    } else {
        loadAllDemoData(true);
    }
}

async function loadDemoDividends() {
    return loadAllDemoData(true);
}

async function clearDemoDividends() {
    return clearAllDemoData();
}

// Expondo globalmente para chamadas inline do HTML
window.loadAllDemoData = loadAllDemoData;
window.clearAllDemoData = clearAllDemoData;
window.toggleGlobalDemoMode = toggleGlobalDemoMode;
window.loadDemoDividends = loadDemoDividends;
window.clearDemoDividends = clearDemoDividends;

// ============================================
// LOAD DIVIDENDS
// ============================================
async function loadDividends() {
    try {
        if (!currentUser || !currentUser.id) {
            try {
                if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth) {
                    const { data: { user } } = await supabaseClient.auth.getUser();
                    if (user) currentUser = user;
                }
            } catch (e) {}
        }

        let loaded = [];
        let fetchedFromDb = false;

        if (typeof supabaseClient !== 'undefined') {
            try {
                let query = supabaseClient.from('dividends').select('*').order('date', { ascending: false });
                if (currentUser && currentUser.id) {
                    query = query.eq('user_id', currentUser.id);
                }
                const { data, error } = await query;

                if (!error && data && data.length > 0) {
                    loaded = data;
                    fetchedFromDb = true;
                } else {
                    // Fallback sem filtro user_id caso RLS gerencie a autenticação ou backend compartilhado
                    const { data: fallbackData, error: fbErr } = await supabaseClient
                        .from('dividends')
                        .select('*')
                        .order('date', { ascending: false });
                    if (!fbErr && fallbackData && fallbackData.length > 0) {
                        const filtered = currentUser?.id ? fallbackData.filter(d => !d.user_id || d.user_id === currentUser.id) : fallbackData;
                        if (filtered.length > 0) {
                            loaded = filtered;
                            fetchedFromDb = true;
                        }
                    }
                }
            } catch (err) {
                console.warn('⚠️ Consulta Supabase falhou, usando fallback local:', err);
            }
        }

        const storageKey = `tonucontrole_dividends_${currentUser ? currentUser.id : 'demo'}`;
        const isDemo = localStorage.getItem('tonu_is_demo_active') === 'true' || localStorage.getItem('tonucontrole_is_demo_dividends') === 'true';

        // Sempre busca e mescla com proventos salvos localmente
        try {
            const keysToCheck = [
                storageKey,
                `tonu_dividends_${currentUser ? currentUser.id : 'demo'}`,
                'tonucontrole_dividends_demo',
                'tonu_dividends'
            ];
            const seenKeys = new Set(loaded.map(d => `${d.ticker}_${d.date}_${d.total_value}`));

            keysToCheck.forEach(k => {
                const cached = localStorage.getItem(k);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed)) {
                            parsed.forEach(p => {
                                const uk = `${p.ticker}_${p.date}_${p.total_value}`;
                                if (!seenKeys.has(uk) && (!p.is_demo || loaded.length === 0)) {
                                    loaded.push(p);
                                    seenKeys.add(uk);
                                }
                            });
                        }
                    } catch (pe) {}
                }
            });
        } catch (e) {}

        // Se realmente não houver proventos e demo estiver explicitamente ativo
        const dismissed = localStorage.getItem('tonu_demo_dismissed') === 'true';
        if (loaded.length === 0 && (isDemo || !dismissed)) {
            loaded = generateDemoDividends();
            try {
                localStorage.setItem(storageKey, JSON.stringify(loaded));
                localStorage.setItem('tonucontrole_is_demo_dividends', 'true');
            } catch (e) {}
        } else if (loaded.length > 0 && loaded.some(d => !d.is_demo)) {
            // Remove demo se o usuário tiver dados reais
            loaded = loaded.filter(d => !d.is_demo);
            try {
                localStorage.setItem(storageKey, JSON.stringify(loaded));
                localStorage.removeItem('tonucontrole_is_demo_dividends');
            } catch (e) {}
        }

        allDividends = loaded;
        const hasDemoActive = allDividends.length > 0 && allDividends.every(d => d.is_demo);
        updateDemoUIState(hasDemoActive);

        console.log('📊 Proventos prontos para visualização:', allDividends.length);

        populateProventosFilterDropdowns();
        updateProventosSummary();
        renderDividendsChart();
        renderDividendsPieChart();
        renderProventosHistoryTable();
        renderProventosListTable();
        updateSummary();

    } catch (error) {
        console.error('❌ Erro ao carregar proventos:', error);
        allDividends = [];
    }
}

// ============================================
// UPDATE PROVENTOS SUMMARY
// ============================================
function updateProventosSummary() {
    const totalAll = allDividends.reduce((sum, d) => sum + getDividendTotalValue(d), 0);
    const totalAllEl = document.getElementById('provTotalAll');
    if (totalAllEl) totalAllEl.textContent = formatCurrency(totalAll);

    // Old elements for backwards compatibility
    const oldTotalEl = document.getElementById('divTotalAmount');
    if (oldTotalEl) oldTotalEl.textContent = formatCurrency(totalAll);
    const totalDividendsEl = document.getElementById('totalDividends');
    if (totalDividendsEl) totalDividendsEl.textContent = formatCurrency(totalAll);
    const dividendsCountEl = document.getElementById('dividendsCount');
    if (dividendsCountEl) dividendsCountEl.textContent = `${allDividends.length} provento${allDividends.length !== 1 ? 's' : ''}`;

    // Last 12 months: from 11 months ago to current month
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const cutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;

    const last12MDivs = allDividends.filter(d => {
        const iso = getDividendISODate(d);
        return iso && iso >= cutoffStr;
    });
    const total12M = last12MDivs.reduce((sum, d) => sum + getDividendTotalValue(d), 0);
    const total12MEl = document.getElementById('provTotal12M');
    if (total12MEl) total12MEl.textContent = formatCurrency(total12M);

    const monthlyAvg = total12M / 12;
    const monthlyAvgEl = document.getElementById('provMonthlyAvg');
    if (monthlyAvgEl) monthlyAvgEl.textContent = formatCurrency(monthlyAvg);

    // Monthly Goal
    const goal = parseFloat(localStorage.getItem('tonu_dividend_monthly_goal') || '500');
    const goalTargetEl = document.getElementById('provGoalTarget');
    if (goalTargetEl) goalTargetEl.textContent = `/ ${formatCurrency(goal)}`;

    const goalPct = goal > 0 ? (monthlyAvg / goal) * 100 : 0;
    const goalPctEl = document.getElementById('provGoalPct');
    if (goalPctEl) goalPctEl.textContent = `${goalPct.toFixed(2).replace('.', ',')}%`;

    const progressBar = document.getElementById('provGoalProgressBar');
    if (progressBar) progressBar.style.width = `${Math.min(Math.max(goalPct, 0), 100)}%`;
}

function updateDividendsSummary() {
    updateProventosSummary();
}

// ============================================
// CONTROLS & HISTÓRICO MENSAL
// ============================================
function setProventosPeriodicity(period) {
    proventosPeriodicity = period;
    const btnMonthly = document.getElementById('segBtnMonthly');
    const btnYearly = document.getElementById('segBtnYearly');
    if (btnMonthly && btnYearly) {
        btnMonthly.classList.toggle('active', period === 'monthly');
        btnYearly.classList.toggle('active', period === 'yearly');
    }
    renderDividendsChart();
}

function onProventosChartFilterChange() {
    proventosChartPeriod = document.getElementById('provChartPeriodSelect')?.value || '12M';
    proventosChartClass = document.getElementById('provChartClassSelect')?.value || 'ALL';
    proventosChartTicker = document.getElementById('provChartTickerSelect')?.value || 'ALL';
    renderDividendsChart();
}

function renderProventosHistoryTable() {
    const body = document.getElementById('provMatrixBody');
    if (!body) return;

    const statusFilter = document.getElementById('provHistoryStatusSelect')?.value || 'todos';
    const classFilter = document.getElementById('provHistoryClassSelect')?.value || 'ALL';
    const tickerFilter = document.getElementById('provHistoryTickerSelect')?.value || 'ALL';

    const todayISO = new Date().toISOString().substring(0, 10);

    const filtered = allDividends.filter(d => {
        const ticker = (d.ticker || '').toUpperCase().trim();
        if (tickerFilter !== 'ALL' && ticker !== tickerFilter) return false;
        if (classFilter !== 'ALL') {
            const cls = getAssetClassForTicker(ticker);
            if (cls !== classFilter) return false;
        }
        const iso = getDividendISODate(d);
        if (statusFilter === 'recebidos' && iso > todayISO) return false;
        if (statusFilter === 'a_receber' && iso <= todayISO) return false;
        return true;
    });

    if (filtered.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="15" style="text-align:center;padding:32px 16px;color:var(--color-text-muted);">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                        <i class="fas fa-calendar-alt" style="font-size:24px; opacity:0.4;"></i>
                        <span style="font-size:13px; font-weight:600; color:var(--color-text);">Nenhum histórico disponível</span>
                        <span style="font-size:12px;">Cadastre proventos ou carregue uma demonstração para ver a matriz mensal completa.</span>
                        <button type="button" class="btn btn-outline-demo btn-sm" onclick="loadDemoDividends()" style="margin-top:6px;">
                            <i class="fas fa-magic"></i> Carregar Demonstração
                        </button>
                    </div>
                </td>
            </tr>
        `;
        const totalPill = document.getElementById('provHistoryTotalPill');
        if (totalPill) totalPill.textContent = 'Total R$ 0,00';
        return;
    }

    // Build matrix: year -> 12 months array
    const matrix = {};
    filtered.forEach(d => {
        const ym = getDividendYearMonth(d);
        if (ym.year === null || ym.month === null || ym.month < 0 || ym.month > 11) return;
        if (!matrix[ym.year]) {
            matrix[ym.year] = new Array(12).fill(0);
        }
        matrix[ym.year][ym.month] += getDividendTotalValue(d);
    });

    const years = Object.keys(matrix).map(Number).sort((a, b) => b - a);
    let grandTotal = 0;

    const rowsHtml = years.map(year => {
        const months = matrix[year];
        const yearTotal = months.reduce((sum, val) => sum + (Number(val) || 0), 0);
        grandTotal += yearTotal;
        const yearAvg = yearTotal / 12;

        const monthsHtml = months.map(val => {
            const num = Number(val) || 0;
            const displayVal = num > 0 ? formatNumber(num, 2) : '0,00';
            const cellClass = num > 0 ? 'matrix-active-cell' : '';
            return `<td class="${cellClass}">${displayVal}</td>`;
        }).join('');

        return `
            <tr>
                <td><strong>${year}</strong></td>
                ${monthsHtml}
                <td class="col-media"><strong>${formatNumber(yearAvg, 2)}</strong></td>
                <td class="col-total"><strong>${formatNumber(yearTotal, 2)}</strong></td>
            </tr>
        `;
    }).join('');

    body.innerHTML = rowsHtml;

    const totalPill = document.getElementById('provHistoryTotalPill');
    if (totalPill) totalPill.textContent = `Total ${formatCurrency(grandTotal)}`;
}

// ============================================
// MEUS PROVENTOS (TABELA DE TRANSAÇÕES)
// ============================================
function renderProventosListTable() {
    const body = document.getElementById('dividendsBody');
    if (!body) return;

    const yearFilter = document.getElementById('provListYearSelect')?.value || 'ALL';
    const classFilter = document.getElementById('provListClassSelect')?.value || 'ALL';
    const tickerFilter = document.getElementById('provListTickerSelect')?.value || 'ALL';

    const todayISO = new Date().toISOString().substring(0, 10);

    const filtered = allDividends.filter(d => {
        const ym = getDividendYearMonth(d);
        if (yearFilter !== 'ALL') {
            if (!ym.year || String(ym.year) !== String(yearFilter)) return false;
        }
        const ticker = (d.ticker || '').toUpperCase().trim();
        if (tickerFilter !== 'ALL' && ticker !== tickerFilter) return false;
        if (classFilter !== 'ALL') {
            const cls = getAssetClassForTicker(ticker);
            if (cls !== classFilter) return false;
        }
        return true;
    });

    const sumTotal = filtered.reduce((acc, d) => acc + getDividendTotalValue(d), 0);
    const pill = document.getElementById('provListTotalPill');
    if (pill) pill.textContent = `Total ${formatCurrency(sumTotal)}`;

    if (filtered.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="11" class="text-center text-muted" style="text-align:center;padding:36px 16px;">
                    <div style="font-size:32px;margin-bottom:8px;">💰</div>
                    <div style="font-size:14px;font-weight:600;color:var(--color-text);margin-bottom:4px;">Nenhum provento encontrado</div>
                    <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:14px;">Registre seus proventos ou carregue dados de demonstração para explorar o painel.</div>
                    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="openDividendModal()">
                            <i class="fas fa-plus"></i> Registrar Provento
                        </button>
                        <button type="button" class="btn btn-outline-demo btn-sm" onclick="loadDemoDividends()">
                            <i class="fas fa-magic"></i> Carregar Demonstração
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = filtered.map(d => {
        const ticker = (d.ticker || '').toUpperCase().trim();
        const cls = getAssetClassForTicker(ticker);
        const iconCls = getIconForClass(cls);
        const isoDate = getDividendISODate(d);
        const isPaid = isoDate <= todayISO;
        const statusBadge = isPaid
            ? `<span class="prov-status-badge paid"><i class="fas fa-check-circle"></i> Pago</span>`
            : `<span class="prov-status-badge pending"><i class="fas fa-clock"></i> A Receber</span>`;

        const dataCom = extractDataCom(d.note);
        const dataComDisplay = dataCom ? formatDate(dataCom) : '-';
        const datePayDisplay = formatDate(isoDate || d.date);

        const totalVal = getDividendTotalValue(d);
        const unitVal = getDividendUnitValue(d);
        const qtyVal = getDividendQuantity(d);
        const isJCP = (d.type && String(d.type).toUpperCase().includes('JCP'));
        const netVal = isJCP ? totalVal * 0.85 : totalVal;

        return `
            <tr>
                <td>
                    <div class="prov-ticker-cell">
                        <div class="prov-ticker-icon"><i class="${iconCls}"></i></div>
                        <span class="prov-ticker-name">${ticker}</span>
                    </div>
                </td>
                <td><span class="prov-class-badge">${cls}</span></td>
                <td>${statusBadge}</td>
                <td>${d.type || 'Dividendo'}</td>
                <td>${dataComDisplay}</td>
                <td>${datePayDisplay}</td>
                <td>${formatNumber(qtyVal)}</td>
                <td>${formatCurrency(unitVal)}</td>
                <td><strong>${formatCurrency(totalVal)}</strong></td>
                <td><strong>${formatCurrency(netVal)}</strong></td>
                <td style="text-align:right;">
                    <div class="actions" style="justify-content:flex-end;">
                        <button type="button" class="btn btn-danger btn-icon-sm" onclick="deleteDividend('${d.id}')" title="Excluir provento" aria-label="Excluir provento">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderDividendsTable() {
    renderProventosListTable();
}

// ============================================
// MODAL META & DISTRIBUIÇÃO
// ============================================
function openMonthlyGoalModal() {
    const current = localStorage.getItem('tonu_dividend_monthly_goal') || '500';
    const input = document.getElementById('goalInputValue');
    if (input) input.value = formatCurrency(parseFloat(current)).replace('R$', '').trim();
    document.getElementById('monthlyGoalModal')?.classList.remove('hidden');
}

function closeMonthlyGoalModal() {
    document.getElementById('monthlyGoalModal')?.classList.add('hidden');
}

function saveMonthlyGoal(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('goalInputValue');
    if (!input) return;
    const val = parsePriceInput(input.value);
    if (val <= 0) {
        showToast('❌ Insira um valor válido para a meta', 'error');
        return;
    }
    localStorage.setItem('tonu_dividend_monthly_goal', val.toString());
    closeMonthlyGoalModal();
    updateProventosSummary();
    showToast('✅ Meta mensal de proventos atualizada!', 'success');
}

function openAllTickersDistributionModal() {
    const container = document.getElementById('allTickersListContainer');
    if (!container) return;

    if (!last12MTickersData || last12MTickersData.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:var(--color-text-muted);text-align:center;padding:16px 0;">Nenhum provento registrado nos últimos 12 meses.</p>';
    } else {
        const totalSum = last12MTickersData.reduce((a, b) => a + b[1], 0);
        const colors = ['#0984E3', '#00B894', '#6C5CE7', '#FDCB6E', '#E17055', '#D63031', '#00CEC9', '#FD79A8'];

        container.innerHTML = last12MTickersData.map((item, idx) => {
            const pct = totalSum > 0 ? ((item[1] / totalSum) * 100).toFixed(2).replace('.', ',') : '0,00';
            const color = colors[idx % colors.length];
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--color-bg); border-radius:8px; border:1px solid var(--color-border);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block;"></span>
                        <strong style="font-size:13px;">${item[0]}</strong>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; font-size:13px;">${formatCurrency(item[1])}</div>
                        <div style="font-size:11px; color:var(--color-text-muted);">${pct}%</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    document.getElementById('allTickersModal')?.classList.remove('hidden');
}

function closeAllTickersModal() {
    document.getElementById('allTickersModal')?.classList.add('hidden');
}

function filterMeusProventosByChartClick(label) {
    if (!label) return;
    if (label.includes('/')) {
        const parts = label.split('/');
        const yr2 = parts[1];
        const fullYear = yr2.length === 2 ? `20${yr2}` : yr2;
        const yearSelect = document.getElementById('provListYearSelect');
        if (yearSelect) {
            yearSelect.value = fullYear;
            renderProventosListTable();
        }
    } else if (label.length === 4) {
        const yearSelect = document.getElementById('provListYearSelect');
        if (yearSelect) {
            yearSelect.value = label;
            renderProventosListTable();
        }
    }
    const cardMeus = document.getElementById('cardMeusProventos');
    if (cardMeus) {
        cardMeus.scrollIntoView({ behavior: 'smooth' });
    }
}

// ============================================
// ATUALIZAR UI
// ============================================
function updateSummary() {
    const totalCurrentValue = positions.reduce((s, p) => s + (p.currentValue || 0), 0);
    const totalInvested = positions.reduce((s, p) => s + (p.costBasis || 0), 0);
    const unrealizedGain = Math.round((totalCurrentValue - totalInvested) * 100) / 100;
    const returnPct = totalInvested > 0 ? (unrealizedGain / totalInvested) * 100 : 0;

    // Variação diária baseada no fechamento anterior
    const dayChange = positions.reduce((s, p) => {
        const prev = p.quote?.previousClose || p.quote?.price || 0;
        const curr = p.quote?.price || 0;
        return s + ((curr - prev) * p.quantity);
    }, 0);
    const previousTotal = totalCurrentValue - dayChange;
    const dayPct = previousTotal > 0 ? (dayChange / previousTotal) * 100 : 0;

    const totalDividends = allDividends.reduce((sum, d) => sum + (parseBrazilianNumber(d.total_value) || 0), 0);
    const dividendsCount = allDividends.length;

    salvarPatrimonio(Math.round(totalCurrentValue * 100) / 100);

    const patrimonyEl = document.getElementById('totalPatrimony');
    const variationEl = document.getElementById('patrimonyVariation');
    const assetCountEl = document.getElementById('assetCount');
    const assetSubEl = document.getElementById('assetCountSub');
    const returnEl = document.getElementById('totalReturn');
    const gainEl = document.getElementById('totalGain');
    const dividendsEl = document.getElementById('totalDividends');
    const dividendsCountEl = document.getElementById('dividendsCount');

    if (patrimonyEl) patrimonyEl.textContent = formatCurrency(totalCurrentValue);

    if (variationEl) {
        const sign = dayChange >= 0 ? '+' : '';
        const dayText = Math.abs(dayChange) > 0.01 
            ? ` | Dia: ${sign}${formatCurrency(dayChange)} (${sign}${dayPct.toFixed(2)}%)`
            : '';
        variationEl.innerHTML = `Aplicado: <strong>${formatCurrency(totalInvested)}</strong>${dayText}`;
        variationEl.className = 'stat-sub';
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
        const gainSign = unrealizedGain >= 0 ? '+' : '';
        const colorClass = unrealizedGain >= 0 ? 'text-success' : 'text-danger';
        gainEl.textContent = `Ganho de ${gainSign}${formatCurrency(unrealizedGain)}`;
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
    const myAssetsCount = document.getElementById('myAssetsCount');
    if (myAssetsCount) myAssetsCount.textContent = counts.Todos;
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
                <h3>Sua carteira está zerada</h3>
                <p>Registre sua primeira compra para começar ou explore o novo design com a demonstração.</p>
                <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;flex-wrap:wrap;">
                    <button class="btn btn-primary" onclick="openOperationModal()" style="font-size:13px;" aria-label="Nova operação">
                        <i class="fas fa-plus"></i> Nova operação
                    </button>
                    <button class="btn btn-outline-demo" onclick="loadAllDemoData(true)" style="font-size:13px;" aria-label="Carregar demonstração completa">
                        <i class="fas fa-magic"></i> Carregar Demonstração
                    </button>
                </div>
            </div>
        `;
        return;
    }

    const sortedItems = [...filtered].sort((a, b) => b.portfolioPct - a.portfolioPct);

    let html = `
        <div class="portfolio-table-wrap">
            <table class="transactions-table" style="min-width:700px;">
                <thead>
                    <tr>
                        <th>Ativo</th>
                        <th style="text-align:right;">Qtd.</th>
                        <th style="text-align:right;">Preço Médio</th>
                        <th style="text-align:right;">Cotação Atual</th>
                        <th style="text-align:right;">Valor Total</th>
                        <th style="text-align:right;">Ganho / Rentabilidade</th>
                        <th style="text-align:right;">% Carteira</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedItems.forEach(p => {
        const price = p.quote?.price || p.averageCost || 0;
        const gain = p.gain || 0;
        const gainPct = p.gainPct || 0;
        const changePct = p.quote?.changePct || 0;
        const quantity = p.quantity || 0;
        const isRealQuote = p.quote && !p.quote.simulated;

        const gainClass = gain >= 0 ? 'text-success' : 'text-danger';
        const changeClass = changePct > 0 ? 'text-success' : changePct < 0 ? 'text-danger' : 'text-muted';
        const signGain = gain >= 0 ? '+' : '';
        const signChange = changePct > 0 ? '+' : '';

        const quoteBadge = isRealQuote 
            ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#00B894;margin-left:4px;" title="Cotação ao vivo (B3)"></span>`
            : `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#94A3B8;margin-left:4px;" title="Preço Médio de Aquisição"></span>`;

        html += `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-weight:700;font-size:14px;letter-spacing:-0.01em;">${p.ticker}</span>
                        <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:9999px;background:var(--color-bg);border:1px solid var(--color-border);color:var(--color-text-light);">${p.assetClass}</span>
                    </div>
                </td>
                <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${quantity}</td>
                <td style="text-align:right;font-weight:500;color:var(--color-text-light);font-variant-numeric:tabular-nums;">${formatCurrency(p.averageCost)}</td>
                <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">
                    ${formatCurrency(price)}${quoteBadge}
                    ${isRealQuote && Math.abs(changePct) > 0.001 ? `<div style="font-size:11px;font-weight:600;" class="${changeClass}">${signChange}${changePct.toFixed(2)}%</div>` : ''}
                </td>
                <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">${formatCurrency(p.currentValue)}</td>
                <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;" class="${gainClass}">
                    ${signGain}${formatCurrency(gain)}
                    <div style="font-size:11px;font-weight:600;">${signGain}${gainPct.toFixed(2)}%</div>
                </td>
                <td style="text-align:right;font-weight:600;color:var(--color-text-light);font-variant-numeric:tabular-nums;">${p.portfolioPct.toFixed(1)}%</td>
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
                <td colspan="8" class="text-center text-muted" style="text-align:center;padding:32px 16px;">
                    <div style="font-size:32px;margin-bottom:8px;">📭</div>
                    <div style="font-size:14px;font-weight:600;color:var(--color-text);margin-bottom:4px;">Nenhum lançamento registrado</div>
                    <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:14px;">Registre suas operações ou carregue a demonstração para explorar o histórico.</div>
                    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="openOperationModal()">
                            <i class="fas fa-plus"></i> Nova Operação
                        </button>
                        <button type="button" class="btn btn-outline-demo btn-sm" onclick="loadAllDemoData(true)">
                            <i class="fas fa-magic"></i> Carregar Demonstração
                        </button>
                    </div>
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
    const qty = parseBrazilianNumber(tx.quantity);
    let price = parseBrazilianNumber(tx.unit_price);
    let totalVal = parseBrazilianNumber(tx.total_value);
    if (totalVal <= 0 && qty > 0 && price > 0) totalVal = qty * price;
    if (price <= 0 && qty > 0 && totalVal > 0) price = totalVal / qty;

    if (!simulatedPortfolio.has(ticker)) {
        simulatedPortfolio.set(ticker, { quantity: 0, costBasis: 0 });
    }
    const pos = simulatedPortfolio.get(ticker);

    const typeLower = (tx.type || '').toLowerCase();
    const isBuy = typeLower === 'compra' || typeLower === 'buy';

    if (isBuy) {
        pos.quantity += qty;
        pos.costBasis += totalVal;
    } else {
        const avgCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
        const sellQty = Math.min(qty, pos.quantity);
        pos.quantity -= sellQty;
        pos.costBasis -= avgCost * sellQty;
        if (pos.quantity <= 0.0000001) {
            simulatedPortfolio.delete(ticker);
        }
    }
}

// ============================================
// AUXILIAR PARA DATA SEGURA DE TRANSAÇÃO
// ============================================
function parseTxDate(rawDate) {
    if (!rawDate) return null;
    if (rawDate instanceof Date) return isNaN(rawDate.getTime()) ? null : rawDate;
    const str = String(rawDate).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        return new Date(year, month, day, 12, 0, 0);
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

// ============================================
// BUILD CHART DATA - INTELIGENTE E PRECISO
// ============================================
function buildChartData() {
    if (!allTransactions || allTransactions.length === 0) {
        return { labels: ['Agora'], invested: [0], gain: [0], total: [0] };
    }

    // Filtra e ordena todas as transações cronologicamente (compras antes de vendas no mesmo dia)
    const validTransactions = allTransactions
        .filter(tx => tx && tx.ticker && parseTxDate(tx.date))
        .sort((a, b) => {
            const da = parseTxDate(a.date).getTime();
            const db = parseTxDate(b.date).getTime();
            if (da !== db) return da - db;
            const typeA = (a.type || '').toLowerCase();
            const typeB = (b.type || '').toLowerCase();
            const isBuyA = typeA === 'compra' || typeA === 'buy';
            const isBuyB = typeB === 'compra' || typeB === 'buy';
            if (isBuyA && !isBuyB) return -1;
            if (!isBuyA && isBuyB) return 1;
            return (a.created_at || '').localeCompare(b.created_at || '');
        });

    if (validTransactions.length === 0) {
        return { labels: ['Agora'], invested: [0], gain: [0], total: [0] };
    }

    // Filtra transações e posições pela classe selecionada no topo do gráfico, se aplicável
    let activeTransactions = validTransactions;
    let activePositions = positions;
    if (selectedEvolutionClass && selectedEvolutionClass !== 'all') {
        activeTransactions = validTransactions.filter(tx => {
            const cls = tx.asset_class ? normalizeClass(tx.asset_class) : inferClass(tx.ticker);
            return cls === selectedEvolutionClass;
        });
        activePositions = positions.filter(p => p.assetClass === selectedEvolutionClass);
    }

    if (activeTransactions.length === 0) {
        return { labels: ['Sem dados'], invested: [0], gain: [0], total: [0] };
    }

    const end = new Date();
    let start;

    if (selectedPeriod === 'all') {
        const firstTxDate = parseTxDate(activeTransactions[0].date) || new Date(end.getFullYear(), end.getMonth() - 11, 1);
        start = new Date(firstTxDate.getFullYear(), firstTxDate.getMonth(), 1);

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
        const year = currentDate.getFullYear();
        const monthNum = currentDate.getMonth() + 1;
        const key = `${year}-${String(monthNum).padStart(2, '0')}`;
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

    for (const tx of activeTransactions) {
        const d = parseTxDate(tx.date);
        if (!d) continue;

        if (d < start) {
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

    // Preços de mercado atuais para cada ativo
    const currentPrices = new Map();
    for (const p of activePositions) {
        const cleanTicker = p.ticker?.toUpperCase().trim().replace(/\.SA$/, '');
        const quote = quotes.get(cleanTicker) || quotes.get(p.ticker) || quotes.get(`${cleanTicker}.SA`);
        const price = (quote && Number.isFinite(quote.price) && quote.price > 0) ? quote.price : (p.averageCost || 0);

        currentPrices.set(p.ticker, price);
        currentPrices.set(cleanTicker, price);
        currentPrices.set(`${cleanTicker}.SA`, price);
    }

    const labels = [];
    const invested = [];
    const gain = [];
    const total = [];

    for (let i = 0; i < allMonths.length; i++) {
        const month = allMonths[i];
        const isCurrentMonth = (i === allMonths.length - 1);

        // Aplica todas as transações realizadas neste mês
        for (const tx of month.transactions) {
            applyTxToSimulatedPortfolio(simulatedPortfolio, tx);
        }

        let runningInvested = 0;
        let totalSimulatedValue = 0;

        for (const [ticker, pos] of simulatedPortfolio) {
            if (pos.quantity > 0.0000001) {
                const investedInAsset = Math.max(0, pos.costBasis || 0);
                runningInvested += investedInAsset;

                const cleanTk = ticker.toUpperCase().trim().replace(/\.SA$/, '');
                let assetPrice = 0;

                if (isCurrentMonth) {
                    // No mês atual: usa a cotação em tempo real
                    const curPrice = currentPrices.get(cleanTk) || currentPrices.get(ticker) || currentPrices.get(`${cleanTk}.SA`);
                    if (curPrice && Number.isFinite(curPrice) && curPrice > 0) {
                        assetPrice = curPrice;
                    } else {
                        assetPrice = (pos.quantity > 0) ? (investedInAsset / pos.quantity) : 0;
                    }
                } else {
                    // Nos meses anteriores: busca o valor do último dia (fechamento do mês)
                    const histMap = historicalMonthlyQuotes.get(cleanTk) || historicalMonthlyQuotes.get(ticker) || historicalMonthlyQuotes.get(`${cleanTk}.SA`);
                    const monthPrice = histMap ? histMap[month.key] : null;

                    if (monthPrice && Number.isFinite(monthPrice) && monthPrice > 0) {
                        // Preço exato do último dia de fechamento do mês
                        assetPrice = monthPrice;
                    } else if (isTesouroTicker(ticker)) {
                        assetPrice = (pos.quantity > 0) ? (investedInAsset / pos.quantity) : 0;
                    } else {
                        // Busca fechamento histórico mais próximo disponível
                        const closestPrice = findClosestHistoricalPrice(histMap, month.key);
                        if (closestPrice && Number.isFinite(closestPrice) && closestPrice > 0) {
                            assetPrice = closestPrice;
                        } else {
                            // Fallback de mercado
                            const curPrice = currentPrices.get(cleanTk) || currentPrices.get(ticker);
                            if (curPrice && Number.isFinite(curPrice) && curPrice > 0) {
                                assetPrice = curPrice;
                            } else {
                                assetPrice = (pos.quantity > 0) ? (investedInAsset / pos.quantity) : 0;
                            }
                        }
                    }
                }

                totalSimulatedValue += pos.quantity * assetPrice;
            }
        }

        // Se a carteira não possuía ativos no mês, valores são zerados
        let unrealizedGain = 0;
        if (runningInvested > 0) {
            unrealizedGain = Math.round((totalSimulatedValue - runningInvested) * 100) / 100;
        } else {
            runningInvested = 0;
            totalSimulatedValue = 0;
            unrealizedGain = 0;
        }

        const monthLabel = `${String(month.date.getMonth() + 1).padStart(2, '0')}/${String(month.date.getFullYear()).slice(2)}`;
        labels.push(monthLabel);
        invested.push(Math.round(runningInvested * 100) / 100);
        gain.push(Math.round(unrealizedGain * 100) / 100);
        total.push(Math.round((runningInvested + unrealizedGain) * 100) / 100);
    }

    if (labels.length === 0) {
        labels.push('Agora');
        const totalCostBasis = activePositions.reduce((s, p) => s + p.costBasis, 0);
        const totalCurrentValue = activePositions.reduce((s, p) => s + p.currentValue, 0);
        const totalGain = totalCurrentValue - totalCostBasis;
        invested.push(Math.round(totalCostBasis * 100) / 100);
        gain.push(Math.round(totalGain * 100) / 100);
        total.push(Math.round(totalCurrentValue * 100) / 100);
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
        (data.invested.some(v => v !== 0) || data.gain.some(v => v !== 0));

    if (!hasData) {
        patrimonyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sem dados'],
                datasets: [{
                    label: 'Patrimônio',
                    data: [0],
                    backgroundColor: '#55EFC4',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 50,
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
            datasets: [
                {
                    label: 'Valor aplicado',
                    data: data.invested,
                    backgroundColor: '#00B894', // verde
                    hoverBackgroundColor: '#009879',
                    borderRadius: 4,
                    borderSkipped: false,
                    grouped: true,
                    barPercentage: 0.9,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Patrimônio',
                    data: data.total,
                    backgroundColor: '#55EFC4', // verde mais claro
                    hoverBackgroundColor: '#2ECC71',
                    borderRadius: 4,
                    borderSkipped: false,
                    grouped: true,
                    barPercentage: 0.9,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 50,
            categoryPercentage: 0.7,
            barPercentage: 0.85,
            maxBarThickness: 52,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: textColor,
                        font: { size: 11, weight: '500' },
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 15
                    }
                },
                tooltip: {
                    enabled: false,
                    external: function (context) {
                        const tooltipModel = context.tooltip;
                        const chartCanvas = context.chart.canvas;
                        const container = chartCanvas.parentNode;
                        let tooltipEl = container.querySelector('.custom-chart-tooltip');
                        if (!tooltipEl) {
                            tooltipEl = document.createElement('div');
                            tooltipEl.className = 'custom-chart-tooltip';
                            container.appendChild(tooltipEl);
                        }

                        if (tooltipModel.opacity === 0 || !tooltipModel.dataPoints || tooltipModel.dataPoints.length === 0) {
                            tooltipEl.style.opacity = '0';
                            return;
                        }

                        const idx = tooltipModel.dataPoints[0].dataIndex;
                        const label = data.labels[idx] || '';
                        const inv = data.invested[idx] || 0;
                        const tot = data.total[idx] || 0;
                        const gn = Math.round((tot - inv) * 100) / 100;
                        const gnPct = inv > 0 ? ((gn / inv) * 100).toFixed(2).replace('.', ',') : '0,00';
                        const gainIndicatorColor = gn >= 0 ? '#55EFC4' : '#FF7675';

                        tooltipEl.innerHTML = `
                            <div class="tooltip-header">${label}</div>
                            <div class="tooltip-row">
                                <div class="tooltip-label">
                                    <span class="tooltip-indicator" style="background: #55EFC4;"></span>
                                    <span>Patrimônio</span>
                                </div>
                                <div class="tooltip-value">${formatCurrency(tot)}</div>
                            </div>
                            <div class="tooltip-row">
                                <div class="tooltip-label">
                                    <span class="tooltip-indicator" style="background: #00B894;"></span>
                                    <span>Valor aplicado</span>
                                </div>
                                <div class="tooltip-value">${formatCurrency(inv)}</div>
                            </div>
                            <div class="tooltip-row">
                                <div class="tooltip-label">
                                    <span class="tooltip-indicator" style="background: ${gainIndicatorColor};"></span>
                                    <span>Ganho de Capital</span>
                                </div>
                                <div class="tooltip-value" style="color: ${gainIndicatorColor}; font-weight: 600;">
                                    ${gn < 0 ? '-' : '+'}${formatCurrency(Math.abs(gn))} (${gn < 0 ? '-' : '+'}${gnPct}%)
                                </div>
                            </div>
                        `;

                        const caretX = tooltipModel.caretX;
                        const caretY = tooltipModel.caretY;
                        let left = caretX + 12;
                        let top = Math.max(8, caretY - 60);

                        const tooltipWidth = 175;
                        if (left + tooltipWidth > container.clientWidth) {
                            left = Math.max(8, caretX - tooltipWidth - 12);
                        }

                        tooltipEl.style.left = left + 'px';
                        tooltipEl.style.top = top + 'px';
                        tooltipEl.style.opacity = '1';
                    }
                }
            },
            scales: {
                x: {
                    stacked: false,
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 10 },
                        maxTicksLimit: 12
                    }
                },
                y: {
                    stacked: false,
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
                duration: 600
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

    const classColors = {
        'FIIs': '#0984E3',
        'Ações': '#6C5CE7',
        'ETFs': '#00B894',
        'Tesouro': '#FDCB6E'
    };

    const palette = ['#0984E3', '#6C5CE7', '#00B894', '#FDCB6E', '#E17055', '#E84393', '#00CEC9', '#A29BFE'];

    const data = [];
    const labels = [];
    const backgroundColors = [];

    if (selectedPieClass && selectedPieClass !== 'all') {
        // Mostra distribuição individual dos ativos dentro da classe selecionada
        const filteredPositions = positions.filter(p => p.assetClass === selectedPieClass && p.currentValue > 0);
        filteredPositions.forEach((p, idx) => {
            data.push(p.currentValue);
            labels.push(p.ticker || 'Ativo');
            backgroundColors.push(palette[idx % palette.length]);
        });
    } else {
        // Mostra distribuição consolidada por classe (FIIs em azul, Ações em roxo, etc.)
        const classes = ['FIIs', 'Ações', 'ETFs', 'Tesouro'];
        classes.forEach(cls => {
            const total = positions
                .filter(p => p.assetClass === cls)
                .reduce((sum, p) => sum + p.currentValue, 0);
            if (total > 0) {
                data.push(total);
                labels.push(cls);
                backgroundColors.push(classColors[cls] || '#6C5CE7');
            }
        });
    }

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
                resizeDelay: 50,
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
                borderWidth: 2,
                borderColor: borderColor,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 50,
            cutout: '64%',
            plugins: {
                legend: {
                    position: 'right',
                    align: 'center',
                    labels: {
                        color: textColor,
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        font: { size: 11, weight: '500' },
                        boxWidth: 10,
                        boxHeight: 10,
                        generateLabels: function (chart) {
                            const dataset = chart.data.datasets[0];
                            if (!dataset || !dataset.data || dataset.data.length === 0) return [];
                            const total = dataset.data.reduce((a, b) => a + b, 0);
                            return chart.data.labels.map((label, i) => {
                                const val = dataset.data[i] || 0;
                                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return {
                                    text: `${label}        ${pct}%`,
                                    fillStyle: dataset.backgroundColor[i],
                                    strokeStyle: dataset.backgroundColor[i],
                                    lineWidth: 0,
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
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
// GRÁFICO DE PROVENTOS (MODELO INVESTIDOR 10)
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
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const borderColor = isDark ? '#334155' : '#E8ECF1';
    const todayISO = new Date().toISOString().substring(0, 10);

    if (dividendsChart) {
        dividendsChart.destroy();
        dividendsChart = null;
    }

    // Filter dividends based on selected class & ticker
    const filtered = allDividends.filter(d => {
        const ticker = (d.ticker || '').toUpperCase().trim();
        if (proventosChartTicker !== 'ALL' && ticker !== proventosChartTicker) return false;
        if (proventosChartClass !== 'ALL') {
            const cls = getAssetClassForTicker(ticker);
            if (cls !== proventosChartClass) return false;
        }
        return true;
    });

    let labels = [];
    let dataRecebidos = [];
    let dataAReceber = [];

    if (proventosPeriodicity === 'monthly') {
        const now = new Date();
        let monthKeys = [];

        if (proventosChartPeriod === 'CURRENT_YEAR') {
            const yr = now.getFullYear();
            for (let m = 1; m <= 12; m++) {
                monthKeys.push(`${yr}-${String(m).padStart(2, '0')}`);
            }
        } else if (proventosChartPeriod === 'ALL') {
            const setMonths = new Set(filtered.map(d => {
                const ym = getDividendYearMonth(d);
                return ym.yearMonth;
            }).filter(Boolean));
            if (setMonths.size === 0) {
                for (let i = 11; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                }
            } else {
                monthKeys = Array.from(setMonths).sort();
            }
        } else {
            // Default: 12M (last 12 months)
            for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
        }

        labels = monthKeys.map(m => {
            const [year, month] = m.split('-');
            return `${String(month).padStart(2, '0')}/${String(year).slice(2)}`;
        });

        monthKeys.forEach(m => {
            let rec = 0;
            let aRec = 0;
            filtered.forEach(d => {
                const ym = getDividendYearMonth(d);
                if (ym.yearMonth === m) {
                    const val = getDividendTotalValue(d);
                    const iso = getDividendISODate(d);
                    if (iso <= todayISO) {
                        rec += val;
                    } else {
                        aRec += val;
                    }
                }
            });
            dataRecebidos.push(rec);
            dataAReceber.push(aRec);
        });

    } else {
        // Yearly periodicity
        const currentYear = new Date().getFullYear();
        const yearSet = new Set(filtered.map(d => {
            const ym = getDividendYearMonth(d);
            return ym.year;
        }).filter(Boolean));
        yearSet.add(currentYear);
        const sortedYears = Array.from(yearSet).sort((a, b) => a - b);

        labels = sortedYears.map(String);
        sortedYears.forEach(yr => {
            let rec = 0;
            let aRec = 0;
            filtered.forEach(d => {
                const ym = getDividendYearMonth(d);
                if (ym.year === yr) {
                    const val = getDividendTotalValue(d);
                    const iso = getDividendISODate(d);
                    if (iso <= todayISO) {
                        rec += val;
                    } else {
                        aRec += val;
                    }
                }
            });
            dataRecebidos.push(rec);
            dataAReceber.push(aRec);
        });
    }

    dividendsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Proventos recebidos',
                    data: dataRecebidos,
                    backgroundColor: '#0984E3',
                    stack: 'provStack',
                    borderRadius: 4,
                    borderSkipped: false,
                    barPercentage: 0.6
                },
                {
                    label: 'Proventos a receber',
                    data: dataAReceber,
                    backgroundColor: '#74B9FF',
                    stack: 'provStack',
                    borderRadius: 4,
                    borderSkipped: false,
                    barPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 50,
            interaction: {
                mode: 'index',
                intersect: false
            },
            onClick: (event, elements) => {
                if (elements && elements.length > 0) {
                    const index = elements[0].index;
                    const clickedLabel = labels[index];
                    filterMeusProventosByChartClick(clickedLabel);
                }
            },
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
                            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                        },
                        footer: function (tooltipItems) {
                            let sum = 0;
                            tooltipItems.forEach(item => {
                                sum += item.parsed.y;
                            });
                            return `Total: ${formatCurrency(sum)}`;
                        }
                    }
                }
            },
            scales: {
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
                },
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 9 },
                        maxRotation: 0
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
// GRÁFICO DE PIZZA (DISTRIBUIÇÃO 12 MESES)
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

    // Filter last 12 months
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const cutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;

    let relevantDivs = allDividends.filter(d => {
        const iso = getDividendISODate(d);
        return iso && iso >= cutoffStr;
    });

    // Fallback para todos os proventos se o último ano estiver vazio
    if (relevantDivs.length === 0 && allDividends.length > 0) {
        relevantDivs = allDividends;
    }

    const byTicker = {};
    relevantDivs.forEach(d => {
        const t = (d.ticker || '').toUpperCase().trim();
        if (!t) return;
        byTicker[t] = (byTicker[t] || 0) + getDividendTotalValue(d);
    });

    const sorted = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);
    last12MTickersData = sorted;

    const legendContainer = document.getElementById('provTopTickersList');
    const total12M = sorted.reduce((sum, item) => sum + item[1], 0);

    const colors = [
        '#0984E3', '#00B894', '#6C5CE7', '#FDCB6E',
        '#E17055', '#D63031', '#00CEC9', '#FD79A8'
    ];

    if (legendContainer) {
        if (sorted.length === 0) {
            legendContainer.innerHTML = '<span style="font-size:11px;color:var(--color-text-muted);">Sem proventos registrados</span>';
        } else {
            legendContainer.innerHTML = sorted.slice(0, 3).map((item, idx) => {
                const pct = total12M > 0 ? ((item[1] / total12M) * 100).toFixed(2).replace('.', ',') : '0,00';
                const color = colors[idx % colors.length];
                return `
                    <div class="dist-legend-item">
                        <div class="dist-ticker-wrap">
                            <span class="dist-color-box" style="background:${color};"></span>
                            <span>${item[0]}</span>
                        </div>
                        <span class="dist-pct">${pct}%</span>
                    </div>
                `;
            }).join('');
        }
    }

    if (sorted.length === 0) {
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
                resizeDelay: 50,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
        return;
    }

    const labels = sorted.map(item => item[0]);
    const data = sorted.map(item => item[1]);
    const backgroundColors = data.map((_, i) => colors[i % colors.length]);

    dividendsPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: borderColor,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 50,
            cutout: '65%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: isDark ? '#334155' : '#E8ECF1',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 8,
                    callbacks: {
                        label: function (context) {
                            const val = context.parsed;
                            const pct = total12M > 0 ? ((val / total12M) * 100).toFixed(2) : 0;
                            return `${context.label}: ${formatCurrency(val)} (${pct}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 600
            }
        }
    });
}

// ============================================
// FUNÇÃO GLOBAL PARA PERÍODO E FILTROS DE GRÁFICOS
// ============================================
function setPeriod(period) {
    selectedPeriod = period;
    const periodSelect = document.getElementById('evolutionPeriodSelect');
    if (periodSelect && periodSelect.value !== period) {
        periodSelect.value = period;
    }
    document.querySelectorAll('.period-filter .btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === period) {
            btn.classList.add('active');
        }
    });
    renderChart();
}

function onPeriodSelectChange(period) {
    setPeriod(period);
}

function onEvolutionClassChange(cls) {
    selectedEvolutionClass = cls;
    renderChart();
}

function onPieClassChange(cls) {
    selectedPieClass = cls;
    renderPieChart();
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
window.onPeriodSelectChange = onPeriodSelectChange;
window.onEvolutionClassChange = onEvolutionClassChange;
window.onPieClassChange = onPieClassChange;
window.loadDividends = loadDividends;
window.refreshDashboard = refreshDashboard;

// Proventos (Modelo Investidor 10)
window.setProventosPeriodicity = setProventosPeriodicity;
window.onProventosChartFilterChange = onProventosChartFilterChange;
window.renderProventosHistoryTable = renderProventosHistoryTable;
window.renderProventosListTable = renderProventosListTable;
window.openMonthlyGoalModal = openMonthlyGoalModal;
window.closeMonthlyGoalModal = closeMonthlyGoalModal;
window.saveMonthlyGoal = saveMonthlyGoal;
window.openAllTickersDistributionModal = openAllTickersDistributionModal;
window.closeAllTickersModal = closeAllTickersModal;
window.filterMeusProventosByChartClick = filterMeusProventosByChartClick;
window.populateProventosFilterDropdowns = populateProventosFilterDropdowns;
window.updateProventosSummary = updateProventosSummary;
window.loadDemoDividends = loadDemoDividends;
window.clearDemoDividends = clearDemoDividends;
window.updateDemoUIState = updateDemoUIState;
window.generateDemoDividends = generateDemoDividends;

console.log('✅ Investments.js carregado com sistema de demonstração e anti-expansão!');