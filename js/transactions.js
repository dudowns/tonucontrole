// ============================================
// TONUCONTROLE - TRANSACTIONS CONTROLLER
// ============================================

(function () {
    'use strict';

    console.log('💳 Transactions.js carregando...');

    let currentUser = null;
    let allTransactions = [];
    let currentFilteredTransactions = [];
    let categories = [];
    let currentEditId = null;
    let currentMonthOffset = 0;

    const MONTH_NAMES = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    function getSelectedMonthDate() {
        const d = new Date();
        d.setDate(1); // Previne salto de mês quando o dia atual for 29, 30 ou 31
        d.setMonth(d.getMonth() + currentMonthOffset);
        return d;
    }

    function getSelectedYearMonth() {
        const d = getSelectedMonthDate();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    function getTxYearMonth(dateVal) {
        if (!dateVal) return '';
        if (typeof dateVal === 'string') {
            const m = dateVal.trim().match(/^(\d{4})-(\d{1,2})/);
            if (m) {
                return `${m[1]}-${m[2].padStart(2, '0')}`;
            }
        }
        try {
            const d = new Date(dateVal);
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                return `${y}-${m}`;
            }
        } catch {}
        return '';
    }

    function updateMonthDisplay() {
        const d = getSelectedMonthDate();
        const el = document.getElementById('selectedMonth');
        if (el) {
            el.textContent = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        }
        return d;
    }

    function changeMonth(delta) {
        currentMonthOffset += Number(delta) || 0;
        updateMonthDisplay();
        filterTransactions();
    }

    function goToCurrentMonth() {
        currentMonthOffset = 0;
        updateMonthDisplay();
        filterTransactions();
    }

    function toggleAdvancedFilters() {
        const panel = document.getElementById('advancedFiltersPanel');
        if (panel) {
            panel.classList.toggle('hidden');
        }
    }

    function clearAdvancedFilters() {
        const dateStart = document.getElementById('filterDateStart');
        const dateEnd = document.getElementById('filterDateEnd');
        const minAmount = document.getElementById('filterMinAmount');
        const maxAmount = document.getElementById('filterMaxAmount');
        const filterTag = document.getElementById('filterTag');

        if (dateStart) dateStart.value = '';
        if (dateEnd) dateEnd.value = '';
        if (minAmount) minAmount.value = '';
        if (maxAmount) maxAmount.value = '';
        if (filterTag) filterTag.value = '';

        filterTransactions();
    }

    // Helper functions
    function sanitize(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatBRL(val) {
        if (typeof window.formatCurrency === 'function') {
            return window.formatCurrency(val);
        }
        if (val === null || val === undefined || val === '') val = 0;
        if (typeof val === 'string') {
            const cleaned = val.replace(/[R$\s]/g, '');
            if (cleaned.includes(',') && cleaned.includes('.')) {
                val = cleaned.replace(/\./g, '').replace(',', '.');
            } else if (cleaned.includes(',')) {
                val = cleaned.replace(',', '.');
            }
            val = parseFloat(val);
        }
        const num = Number(val) || 0;
        try {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num).replace(/\u00A0/g, ' ');
        } catch {
            const isNegative = num < 0;
            const parts = Math.abs(num).toFixed(2).split('.');
            const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            const res = 'R$ ' + intPart + ',' + parts[1];
            return isNegative ? '-' + res : res;
        }
    }

    function formatDateDisplay(dateStr) {
        if (!dateStr) return '--/--/----';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            let user = null;
            if (window.supabaseOffline) {
                user = await window.supabaseOffline.isAuthenticated();
            }

            if (!user && window.supabaseClient?.auth) {
                const { data: { user: authUser } } = await window.supabaseClient.auth.getUser();
                user = authUser;
            }

            if (!user) {
                console.warn('⚠️ Usuário não logado, redirecionando para login');
                window.location.href = '../index.html';
                return;
            }

            currentUser = user;
            console.log('✅ Transações: Usuário autenticado:', currentUser.email);

            if (window.loadGlobalUserProfile) {
                await window.loadGlobalUserProfile();
            }

            updateMonthDisplay();
            await loadCategories();
            await loadTransactions();
            setupFilterListeners();

            // Vincular controles de parcelamento e recorrência
            if (window.TonuInstallments) {
                window.TonuInstallments.bindFormControls('t');
            }

            // Check if URL has ?new=true to open modal automatically
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('new') === 'true') {
                openModal();
            }

        } catch (err) {
            console.error('❌ Erro na inicialização das transações:', err);
        }
    });

    // Load categories
    async function loadCategories() {
        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('categories')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('name');

                if (!error && data && data.length > 0) {
                    categories = data;
                }
            }

            if (categories.length === 0) {
                // Fallback default categories
                categories = [
                    { id: 'cat_salario', name: 'Salário', type: 'income', icon: 'fa-money-bill-wave' },
                    { id: 'cat_invest', name: 'Investimentos', type: 'income', icon: 'fa-chart-line' },
                    { id: 'cat_outras_rec', name: 'Outras Receitas', type: 'income', icon: 'fa-plus-circle' },
                    { id: 'cat_alimentacao', name: 'Alimentação', type: 'expense', icon: 'fa-utensils' },
                    { id: 'cat_moradia', name: 'Moradia', type: 'expense', icon: 'fa-home' },
                    { id: 'cat_transporte', name: 'Transporte', type: 'expense', icon: 'fa-car' },
                    { id: 'cat_saude', name: 'Saúde', type: 'expense', icon: 'fa-heartbeat' },
                    { id: 'cat_lazer', name: 'Lazer', type: 'expense', icon: 'fa-gamepad' },
                    { id: 'cat_educacao', name: 'Educação', type: 'expense', icon: 'fa-graduation-cap' },
                    { id: 'cat_outros', name: 'Outros', type: 'expense', icon: 'fa-tags' }
                ];
            }

            populateCategorySelects();
        } catch (e) {
            console.warn('⚠️ Falha ao carregar categorias:', e);
        }
    }

    function populateCategorySelects() {
        const catSelect = document.getElementById('tCategory');
        const filterCat = document.getElementById('filterCategory');
        const selectedType = document.getElementById('tType')?.value || 'expense';

        if (catSelect) {
            catSelect.innerHTML = '<option value="">Selecione uma categoria...</option>';
            const filtered = categories.filter(c => !c.type || c.type === selectedType);
            filtered.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                catSelect.appendChild(opt);
            });
        }

        if (filterCat && filterCat.options.length <= 1) {
            filterCat.innerHTML = '<option value="">Todas as categorias</option>';
            const uniqueNames = Array.from(new Set(categories.map(c => c.name)));
            uniqueNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                filterCat.appendChild(opt);
            });
        }
    }

    // Load transactions
    async function loadTransactions() {
        const container = document.getElementById('transactionsList') || document.getElementById('transactionsContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align:center;padding:40px 16px;">
                    <span class="spinner" style="width:32px;height:32px;border-width:3px;margin-bottom:12px;"></span>
                    <p style="color:var(--color-text-muted,#94a3b8);">Carregando transações...</p>
                </div>
            `;
        }

        try {
            let txs = [];

            if (window.supabaseClient && currentUser) {
                const { data, error } = await window.supabaseClient
                    .from('transactions')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('date', { ascending: false });

                if (!error && data) {
                    txs = data;
                }
            }

            // Fallback to local storage if offline or empty
            if (txs.length === 0 && currentUser) {
                const local = localStorage.getItem('tonu_transactions_' + currentUser.id);
                if (local) {
                    try { txs = JSON.parse(local); } catch {}
                }
            }

            allTransactions = txs;
            // Aplica imediatamente o filtro do mês selecionado
            filterTransactions();

        } catch (err) {
            console.error('❌ Erro ao carregar transações:', err);
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center;padding:30px;color:var(--color-danger,#ff7675);">
                        <p>Erro ao carregar transações. Verifique sua conexão.</p>
                    </div>
                `;
            }
        }
    }

    // Helper to resolve category icon, color, and display name
    function getCategoryInfo(t) {
        const isIncome = t.type === 'income';
        const defaultColor = isIncome ? '#00b894' : '#ff7675';
        let cat = null;

        if (t.categories && typeof t.categories === 'object') {
            cat = t.categories;
        } else if (t.category_id && categories && categories.length > 0) {
            cat = categories.find(c => c.id === t.category_id);
        }

        if (!cat && t.category && categories && categories.length > 0) {
            const rawName = String(t.category).trim().toLowerCase();
            const cleanName = rawName.replace(/^[\p{Emoji}\s]+/u, '').trim();
            cat = categories.find(c => {
                const cRaw = (c.name || '').trim().toLowerCase();
                const cClean = cRaw.replace(/^[\p{Emoji}\s]+/u, '').trim();
                return cRaw === rawName || (cleanName && cClean === cleanName) || cRaw.includes(cleanName) || (cleanName && cleanName.includes(cClean));
            });
        }

        let icon = cat?.icon;
        let color = cat?.color || defaultColor;
        let name = cat?.name || t.category || (isIncome ? 'Receita' : 'Despesa');

        if (!icon) {
            const catLower = (t.category || '').toLowerCase();
            if (catLower.includes('salário') || catLower.includes('salario') || catLower.includes('renda') || catLower.includes('soldo')) {
                icon = 'fa-money-bill-wave';
            } else if (catLower.includes('invest') || catLower.includes('rendimento') || catLower.includes('dividendo') || catLower.includes('ações') || catLower.includes('acoes')) {
                icon = 'fa-chart-line';
            } else if (catLower.includes('aliment') || catLower.includes('comida') || catLower.includes('restaurante') || catLower.includes('mercado') || catLower.includes('lanche') || catLower.includes('ifood') || catLower.includes('café') || catLower.includes('cafe')) {
                icon = 'fa-utensils';
            } else if (catLower.includes('mora') || catLower.includes('casa') || catLower.includes('aluguel') || catLower.includes('condom') || catLower.includes('energia') || catLower.includes('luz') || catLower.includes('água') || catLower.includes('agua') || catLower.includes('iptu')) {
                icon = 'fa-home';
            } else if (catLower.includes('transp') || catLower.includes('carro') || catLower.includes('uber') || catLower.includes('combust') || catLower.includes('gasolina') || catLower.includes('onibus') || catLower.includes('ônibus') || catLower.includes('metro') || catLower.includes('metrô') || catLower.includes('veículo') || catLower.includes('veiculo')) {
                icon = 'fa-car';
            } else if (catLower.includes('saude') || catLower.includes('saúde') || catLower.includes('farm') || catLower.includes('médic') || catLower.includes('medic') || catLower.includes('hospital') || catLower.includes('dent')) {
                icon = 'fa-heartbeat';
            } else if (catLower.includes('lazer') || catLower.includes('viag') || catLower.includes('game') || catLower.includes('jogo') || catLower.includes('cinema') || catLower.includes('praia') || catLower.includes('festa') || catLower.includes('passeio')) {
                icon = 'fa-gamepad';
            } else if (catLower.includes('educa') || catLower.includes('curso') || catLower.includes('livro') || catLower.includes('faculd') || catLower.includes('escola') || catLower.includes('treinamento')) {
                icon = 'fa-graduation-cap';
            } else if (catLower.includes('assinatura') || catLower.includes('stream') || catLower.includes('netfl') || catLower.includes('spot') || catLower.includes('mensal') || catLower.includes('software')) {
                icon = 'fa-credit-card';
            } else if (catLower.includes('free') || catLower.includes('bico') || catLower.includes('trabalho') || catLower.includes('serviço') || catLower.includes('servico') || catLower.includes('consultoria')) {
                icon = 'fa-laptop-code';
            } else if (catLower.includes('compra') || catLower.includes('shopping') || catLower.includes('vestu') || catLower.includes('roupa')) {
                icon = 'fa-shopping-bag';
            } else if (catLower.includes('pet') || catLower.includes('veterin') || catLower.includes('animal')) {
                icon = 'fa-paw';
            } else {
                icon = isIncome ? 'fa-wallet' : 'fa-tags';
            }
        }

        if (icon && !icon.startsWith('fa-')) {
            icon = 'fa-' + icon;
        }

        return { icon, color, name };
    }

    // Render transactions list
    function renderTransactions(transactions) {
        const container = document.getElementById('transactionsList') || document.getElementById('transactionsContainer');
        if (!container) return;

        if (transactions.length === 0) {
            const selDate = getSelectedMonthDate();
            const monthName = MONTH_NAMES[selDate.getMonth()];
            const yearNum = selDate.getFullYear();
            container.innerHTML = `
                <div class="empty-state" style="text-align:center;padding:48px 16px;">
                    <div style="font-size:48px;margin-bottom:12px;">📅</div>
                    <h3 style="font-size:18px;font-weight:600;margin-bottom:6px;">Nenhuma transação em ${monthName} de ${yearNum}</h3>
                    <p style="color:var(--color-text-muted,#94a3b8);font-size:14px;margin-bottom:16px;">
                        Não foram encontradas transações para este mês ou com os filtros aplicados.
                    </p>
                    <button class="btn btn-primary" onclick="openModal()">
                        <i class="fas fa-plus"></i> Nova Transação
                    </button>
                </div>
            `;
            return;
        }

        let html = '<div class="transactions-list-grid">';
        transactions.forEach(t => {
            const isIncome = t.type === 'income';
            const catInfo = getCategoryInfo(t);
            const typeColor = isIncome ? '#00b894' : '#ff7675';
            const amountPrefix = isIncome ? '+ ' : '- ';
            const instInfo = window.TonuInstallments ? window.TonuInstallments.getInstallmentInfo(t) : null;

            html += `
                <div class="transaction-card" onclick="openModal('${sanitize(t.id)}')">
                    <div class="t-icon" style="background:${catInfo.color}20; color:${catInfo.color}; width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:16px;" title="${sanitize(catInfo.name)}">
                        <i class="fas ${catInfo.icon}"></i>
                    </div>
                    <div class="t-info" style="flex:1; min-width:0; margin-left:12px;">
                        <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${sanitize(t.description || 'Sem descrição')}
                        </div>
                        ${instInfo && instInfo.badgeHtml ? instInfo.badgeHtml : ''}
                        <div style="font-size:12px; color:var(--color-text-muted,#94a3b8); display:flex; gap:8px; align-items:center; margin-top:2px;">
                            <span>${formatDateDisplay(t.date)}</span>
                            <span>•</span>
                            <span>${sanitize(catInfo.name)}</span>
                            ${t.paid === false ? '<span class="badge-pending" style="font-size:10px; padding:1px 6px; background:#fff3cd; color:#856404; border-radius:4px;">Pendente</span>' : ''}
                        </div>
                    </div>
                    <div class="t-amount" style="font-weight:700; font-size:15px; color:${typeColor}; text-align:right; flex-shrink:0;">
                        ${amountPrefix}${formatBRL(t.amount)}
                    </div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    }

    // Update summary metrics
    function updateSummaryCards(transactions) {
        let income = 0;
        let expense = 0;

        transactions.forEach(t => {
            const amt = parseFloat(t.amount) || 0;
            if (t.type === 'income') income += amt;
            else if (t.type === 'expense') expense += amt;
        });

        const balance = income - expense;

        const elIncome = document.getElementById('totalIncome') || document.getElementById('statIncome');
        const elExpense = document.getElementById('totalExpense') || document.getElementById('statExpense');
        const elBalance = document.getElementById('totalBalance') || document.getElementById('statBalance');
        const elCount = document.getElementById('totalCount') || document.getElementById('statCount');

        if (elIncome) elIncome.textContent = formatBRL(income);
        if (elExpense) elExpense.textContent = formatBRL(expense);
        if (elBalance) {
            elBalance.textContent = formatBRL(balance);
            elBalance.style.color = balance >= 0 ? 'var(--color-success,#00b894)' : 'var(--color-danger,#ff7675)';
        }
        if (elCount) elCount.textContent = String(transactions.length);
    }

    // Filters
    function setupFilterListeners() {
        const searchInput = document.getElementById('searchInput') || document.getElementById('filterSearch');
        const typeSelect = document.getElementById('filterType');
        const recSelect = document.getElementById('filterRecurrence');
        const catSelect = document.getElementById('filterCategory');
        const statusSelect = document.getElementById('filterStatus');
        const monthInput = document.getElementById('filterMonth');

        const apply = () => filterTransactions();

        if (searchInput) searchInput.addEventListener('input', apply);
        if (typeSelect) typeSelect.addEventListener('change', apply);
        if (recSelect) recSelect.addEventListener('change', apply);
        if (catSelect) catSelect.addEventListener('change', apply);
        if (statusSelect) statusSelect.addEventListener('change', apply);
        if (monthInput) monthInput.addEventListener('change', apply);

        const typeFormSelect = document.getElementById('tType');
        if (typeFormSelect) {
            typeFormSelect.addEventListener('change', populateCategorySelects);
        }
    }

    function filterTransactions() {
        const query = (document.getElementById('searchInput')?.value || document.getElementById('filterSearch')?.value || '').toLowerCase().trim();
        const type = document.getElementById('filterType')?.value || '';
        const recurrenceFilter = document.getElementById('filterRecurrence')?.value || 'all';
        const cat = document.getElementById('filterCategory')?.value || '';
        const status = document.getElementById('filterStatus')?.value || '';
        const dateStart = document.getElementById('filterDateStart')?.value || '';
        const dateEnd = document.getElementById('filterDateEnd')?.value || '';
        const minAmount = parseFloat(document.getElementById('filterMinAmount')?.value);
        const maxAmount = parseFloat(document.getElementById('filterMaxAmount')?.value);
        const tag = (document.getElementById('filterTag')?.value || '').toLowerCase().trim();

        const selectedYearMonth = getSelectedYearMonth();

        const filtered = allTransactions.filter(t => {
            // Filtragem por mês do seletor (ou intervalo personalizado se preenchido nos filtros avançados)
            if (dateStart || dateEnd) {
                const tDateOnly = (t.date || '').substring(0, 10);
                if (!tDateOnly) return false;
                if (dateStart && tDateOnly < dateStart) return false;
                if (dateEnd && tDateOnly > dateEnd) return false;
            } else {
                // Filtrar estritamente apenas pelo mês do seletor
                const txYM = getTxYearMonth(t.date);
                if (txYM !== selectedYearMonth) {
                    return false;
                }
            }

            if (query) {
                const descMatch = (t.description || '').toLowerCase().includes(query);
                const catMatch = (t.category || '').toLowerCase().includes(query);
                const tagMatch = (t.tags || '').toLowerCase().includes(query);
                if (!descMatch && !catMatch && !tagMatch) return false;
            }

            if (type && type !== 'all' && t.type !== type) return false;

            // Recorrência / Parcelamento
            if (recurrenceFilter !== 'all') {
                const info = window.TonuInstallments ? window.TonuInstallments.getInstallmentInfo(t) : { type: 'single' };
                if (recurrenceFilter === 'installments' && !info.isInstallment) return false;
                if (recurrenceFilter === 'recurring' && !info.isRecurring) return false;
                if (recurrenceFilter === 'single' && (info.isInstallment || info.isRecurring)) return false;
            }

            if (cat && cat !== 'all' && cat !== '' && t.category !== cat) return false;
            if (status === 'paid' && t.paid === false) return false;
            if (status === 'pending' && t.paid !== false) return false;

            const amt = parseFloat(t.amount) || 0;
            if (!isNaN(minAmount) && amt < minAmount) return false;
            if (!isNaN(maxAmount) && amt > maxAmount) return false;

            if (tag) {
                const cleanTag = tag.startsWith('#') ? tag : '#' + tag;
                const txTags = (t.tags || '').toLowerCase();
                if (!txTags.includes(tag) && !txTags.includes(cleanTag)) return false;
            }

            return true;
        });

        currentFilteredTransactions = filtered;
        renderTransactions(filtered);
        updateSummaryCards(filtered);

        const filteredCountEl = document.getElementById('filteredCount');
        if (filteredCountEl) filteredCountEl.textContent = String(filtered.length);

        const totalCountDisplay = document.getElementById('totalCountDisplay');
        if (totalCountDisplay) {
            const monthTotal = allTransactions.filter(t => getTxYearMonth(t.date) === selectedYearMonth).length;
            totalCountDisplay.textContent = String(monthTotal);
        }
    }

    // Modal functions
    function openModal(id = null) {
        currentEditId = id;
        const modal = document.getElementById('transactionModal');
        const overlay = document.getElementById('modalOverlay');
        const modalTitle = document.getElementById('modalTitle');
        const form = document.getElementById('transactionForm');
        const btnDelete = document.getElementById('btnDelete');

        const recTypeInput = document.getElementById('tRecurrenceType');
        const instTotalInput = document.getElementById('tInstallmentTotal');
        const instCurrentInput = document.getElementById('tInstallmentCurrent');
        const futureGroup = document.getElementById('tGenerateFutureGroup');

        if (!modal) return;

        if (form) form.reset();

        const dateInput = document.getElementById('tDate');
        if (dateInput && !id) {
            const selDate = getSelectedMonthDate();
            const now = new Date();
            // Se estiver no mês atual real, preenche com a data de hoje; se estiver em outro mês, preenche com o 1º dia do mês selecionado
            if (selDate.getFullYear() === now.getFullYear() && selDate.getMonth() === now.getMonth()) {
                dateInput.value = now.toISOString().split('T')[0];
            } else {
                const y = selDate.getFullYear();
                const m = String(selDate.getMonth() + 1).padStart(2, '0');
                dateInput.value = `${y}-${m}-01`;
            }
        }

        const paidCheckbox = document.getElementById('tPaid');
        if (paidCheckbox && !id) paidCheckbox.checked = true;

        if (id) {
            const tx = allTransactions.find(t => String(t.id) === String(id));
            if (tx) {
                if (modalTitle) modalTitle.textContent = 'Editar Transação';
                document.getElementById('editId').value = tx.id;
                document.getElementById('tType').value = tx.type || 'expense';
                populateCategorySelects();
                document.getElementById('tDescription').value = tx.description || '';
                document.getElementById('tAmount').value = tx.amount || '';
                document.getElementById('tDate').value = tx.date || '';
                document.getElementById('tCategory').value = tx.category || '';
                if (paidCheckbox) paidCheckbox.checked = tx.paid !== false;
                if (document.getElementById('tTags')) document.getElementById('tTags').value = tx.tags || '';
                if (document.getElementById('tNotes')) document.getElementById('tNotes').value = tx.notes || '';

                // Carregar Recorrência e Parcelas
                const hasInstallments = (parseInt(tx.installments, 10) > 1);
                let recVal = tx.recurrence_type;
                if (!recVal) {
                    if (hasInstallments) recVal = 'installments';
                    else if (tx.is_recurring) recVal = 'monthly';
                    else recVal = 'single';
                }
                if (recTypeInput) recTypeInput.value = recVal;
                if (instTotalInput) instTotalInput.value = tx.installments || 2;
                if (instCurrentInput) instCurrentInput.value = tx.current_installment || 1;
                if (futureGroup) futureGroup.style.display = 'none';

                if (btnDelete) btnDelete.classList.remove('hidden');
            }
        } else {
            if (modalTitle) modalTitle.textContent = 'Nova Transação';
            if (document.getElementById('editId')) document.getElementById('editId').value = '';
            if (btnDelete) btnDelete.classList.add('hidden');
            populateCategorySelects();

            if (recTypeInput) recTypeInput.value = 'single';
            if (instTotalInput) instTotalInput.value = '2';
            if (instCurrentInput) instCurrentInput.value = '1';
            if (futureGroup) futureGroup.style.display = 'flex';
        }

        if (recTypeInput) {
            recTypeInput.dispatchEvent(new Event('change'));
        }

        if (overlay) overlay.classList.add('active');
        modal.classList.remove('hidden');
        modal.classList.add('show');
        document.body.classList.add('no-scroll');

        setTimeout(() => {
            const descInput = document.getElementById('tDescription');
            if (descInput) descInput.focus();
        }, 60);
    }

    function closeModal() {
        const modal = document.getElementById('transactionModal');
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.classList.remove('active');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('show');
        }
        document.body.classList.remove('no-scroll');
        currentEditId = null;
    }

    // Tecla ESC para fechar modal de transação
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('modalOverlay');
            if (overlay && overlay.classList.contains('active')) {
                closeModal();
            }
        }
    });

    // Save transaction
    async function saveTransaction(event) {
        if (event) event.preventDefault();

        const desc = document.getElementById('tDescription')?.value.trim();
        const rawAmount = parseFloat(document.getElementById('tAmount')?.value);
        const type = document.getElementById('tType')?.value || 'expense';
        const date = document.getElementById('tDate')?.value;
        const category = document.getElementById('tCategory')?.value || 'Outros';
        const paid = document.getElementById('tPaid')?.checked ?? true;
        const tags = document.getElementById('tTags')?.value.trim() || null;
        const notes = document.getElementById('tNotes')?.value.trim() || null;
        const editId = document.getElementById('editId')?.value || currentEditId;

        const recurrenceType = document.getElementById('tRecurrenceType')?.value || 'single';
        let installmentsTotal = 1;
        let installmentCurrent = 1;
        let generateFuture = false;
        let finalAmount = rawAmount;

        if (recurrenceType === 'installments') {
            installmentsTotal = Math.max(2, parseInt(document.getElementById('tInstallmentTotal')?.value, 10) || 2);
            installmentCurrent = Math.max(1, Math.min(installmentsTotal, parseInt(document.getElementById('tInstallmentCurrent')?.value, 10) || 1));
            const mode = document.querySelector('input[name="tAmountMode"]:checked')?.value || 'per_installment';
            if (mode === 'total') {
                finalAmount = parseFloat((rawAmount / installmentsTotal).toFixed(2));
            }
            generateFuture = !editId && (document.getElementById('tGenerateFuture')?.checked ?? false);
        }

        const isRecurring = (recurrenceType === 'monthly' || recurrenceType === 'semiannual');

        if (!desc || isNaN(finalAmount) || finalAmount <= 0 || !date) {
            if (window.showToast) window.showToast('Preencha os campos obrigatórios corretamente!', 'warning');
            return;
        }

        let matchedCatId = null;
        if (categories && categories.length > 0) {
            const found = categories.find(c => c.name === category);
            if (found) matchedCatId = found.id;
        }

        const baseTransactionData = {
            user_id: currentUser.id,
            description: desc,
            amount: finalAmount,
            type: type,
            date: date,
            category: category,
            ...(matchedCatId ? { category_id: matchedCatId } : {}),
            paid: paid,
            tags: tags,
            notes: notes,
            recurrence_type: recurrenceType,
            is_recurring: isRecurring,
            installments: recurrenceType === 'installments' ? installmentsTotal : 1,
            current_installment: recurrenceType === 'installments' ? installmentCurrent : 1,
            updated_at: new Date().toISOString()
        };

        try {
            if (editId) {
                // Update
                if (window.supabaseClient) {
                    await window.supabaseClient
                        .from('transactions')
                        .update(baseTransactionData)
                        .eq('id', editId)
                        .eq('user_id', currentUser.id);
                }

                const idx = allTransactions.findIndex(t => String(t.id) === String(editId));
                if (idx !== -1) {
                    allTransactions[idx] = { ...allTransactions[idx], ...baseTransactionData, id: editId };
                }
                if (window.showToast) window.showToast('Transação atualizada com sucesso! ✅', 'success');
            } else {
                if (generateFuture && installmentsTotal > installmentCurrent) {
                    // Geração em lote das parcelas futuras
                    const batch = [];
                    const cleanDesc = desc.replace(/\s*\(\d+\/\d+\)$/, '').trim();

                    for (let i = installmentCurrent; i <= installmentsTotal; i++) {
                        const monthOffset = i - installmentCurrent;
                        const dueDate = window.TonuInstallments ? window.TonuInstallments.addMonthsToDate(date, monthOffset) : date;
                        const itemPaid = (i === installmentCurrent) ? paid : false;
                        const txId = 'tx_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 4);

                        batch.push({
                            ...baseTransactionData,
                            id: txId,
                            description: `${cleanDesc} (${i}/${installmentsTotal})`,
                            amount: finalAmount,
                            date: dueDate,
                            installments: installmentsTotal,
                            current_installment: i,
                            paid: itemPaid,
                            created_at: new Date().toISOString()
                        });
                    }

                    if (window.supabaseClient) {
                        await window.supabaseClient
                            .from('transactions')
                            .insert(batch);
                    }

                    // Prepend to allTransactions
                    batch.forEach(item => allTransactions.unshift(item));
                    if (window.showToast) window.showToast(`Lançamento parcelado criado com ${batch.length} parcelas registradas! 📦`, 'success');
                } else {
                    const newTx = {
                        ...baseTransactionData,
                        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        created_at: new Date().toISOString()
                    };

                    if (window.supabaseClient) {
                        await window.supabaseClient
                            .from('transactions')
                            .insert([newTx]);
                    }

                    allTransactions.unshift(newTx);
                    if (window.showToast) window.showToast('Transação criada com sucesso! 🎉', 'success');
                }
            }

            // Save to local cache
            localStorage.setItem('tonu_transactions_' + currentUser.id, JSON.stringify(allTransactions));

            closeModal();
            filterTransactions();

            // Check category budget limits and show notifications if approaching or exceeding
            if (type === 'expense' && window.TonuBudget && currentUser) {
                try {
                    window.TonuBudget.checkLimitAfterTransaction(currentUser.id, baseTransactionData, allTransactions, categories);
                } catch (bErr) {
                    console.warn('⚠️ Erro ao verificar limite pós-transação:', bErr);
                }
            }

            if (typeof window.checkNotifications === 'function') {
                window.checkNotifications();
            }

        } catch (err) {
            console.error('❌ Erro ao salvar transação:', err);
            if (window.showToast) window.showToast('Erro ao salvar transação: ' + err.message, 'error');
        }
    }

    // Delete transaction
    async function deleteTransaction() {
        const id = document.getElementById('editId')?.value || currentEditId;
        if (!id) return;

        if (!confirm('Deseja realmente excluir esta transação?')) return;

        try {
            if (window.supabaseClient) {
                await window.supabaseClient
                    .from('transactions')
                    .delete()
                    .eq('id', id)
                    .eq('user_id', currentUser.id);
            }

            allTransactions = allTransactions.filter(t => String(t.id) !== String(id));
            localStorage.setItem('tonu_transactions_' + currentUser.id, JSON.stringify(allTransactions));

            if (window.showToast) window.showToast('Transação excluída! 🗑️', 'info');
            closeModal();
            filterTransactions();

        } catch (err) {
            console.error('❌ Erro ao excluir transação:', err);
            if (window.showToast) window.showToast('Falha ao excluir: ' + err.message, 'error');
        }
    }

    // Export functions
    function exportTransactionsCSV() {
        const txsToExport = (currentFilteredTransactions && currentFilteredTransactions.length > 0)
            ? currentFilteredTransactions
            : allTransactions;

        if (txsToExport.length === 0) {
            if (window.showToast) window.showToast('Nenhuma transação para exportar', 'warning');
            return;
        }

        let csv = 'ID,Data,Tipo,Descricao,Valor,Categoria,Status,Tags,Notas\n';
        txsToExport.forEach(t => {
            const row = [
                `"${t.id || ''}"`,
                `"${t.date || ''}"`,
                `"${t.type || ''}"`,
                `"${(t.description || '').replace(/"/g, '""')}"`,
                t.amount || 0,
                `"${(t.category || '').replace(/"/g, '""')}"`,
                t.paid ? 'Pago' : 'Pendente',
                `"${(t.tags || '').replace(/"/g, '""')}"`,
                `"${(t.notes || '').replace(/"/g, '""')}"`
            ];
            csv += row.join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transacoes_tonucontrole_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Global exports
    window.changeMonth = changeMonth;
    window.goToCurrentMonth = goToCurrentMonth;
    window.changeMonthHandler = changeMonth;
    window.goToCurrentMonthHandler = goToCurrentMonth;
    window.toggleAdvancedFilters = toggleAdvancedFilters;
    window.clearAdvancedFilters = clearAdvancedFilters;
    window.openModal = openModal;
    window.openNewTransactionModal = openModal;
    window.closeModal = closeModal;
    window.saveTransaction = saveTransaction;
    window.deleteTransaction = deleteTransaction;
    window.filterTransactions = filterTransactions;
    window.exportTransactionsCSV = exportTransactionsCSV;
    window.loadTransactions = loadTransactions;

})();
