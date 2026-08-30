// ============================================
// TRANSAÇÕES - TonuControle
// ============================================

console.log('📋 Transactions.js carregado');

// ============================================
// ESTADO
// ============================================
let currentUser = null;
let allTransactions = [];
let categories = [];
let isProcessing = false;
let currentMonthOffset = 0;

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

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        let user = null;
        if (window.supabaseOffline) {
            user = await window.supabaseOffline.isAuthenticated();
        }

        if (!user) {
            const { data: { user: authUser } } = await supabaseClient.auth.getUser();
            user = authUser;
        }

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

    updateMonthDisplay('selectedMonth', currentMonthOffset);

    await loadCategories();
    await loadTransactions();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterTransactions, 300));
    }

    if (window.TonuCSRF) {
        const csrfInput = document.getElementById('csrfToken');
        if (csrfInput) {
            csrfInput.value = window.TonuCSRF.get();
        }
    }

    if (window.webShareTarget) {
        setTimeout(() => {
            window.webShareTarget.checkIncomingShare();
        }, 500);
    }
});

// ============================================
// DEBOUNCE
// ============================================
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(function () {
            fn.apply(this, args);
        }, delay);
    };
}

// ============================================
// CATEGORIAS
// ============================================
async function loadCategories() {
    try {
        const cached = await window.getCachedCategories?.(currentUser.id);
        if (cached) {
            categories = cached;
            populateCategorySelects();
            console.log('✅ Categorias carregadas do cache:', categories.length);
            return;
        }

        const { data, error } = await supabaseClient
            .from('categories')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('name');

        if (error) throw error;

        categories = data || [];

        if (window.setCachedCategories) {
            await window.setCachedCategories(currentUser.id, categories);
        }

        console.log('✅ Categorias carregadas:', categories.length);

    } catch (e) {
        console.error('❌ Erro ao carregar categorias:', e);
        categories = [];
    }

    populateCategorySelects();
}

function populateCategorySelects() {
    const modalSelect = document.getElementById('tCategory');
    if (modalSelect) {
        modalSelect.innerHTML = '<option value="">Selecione...</option>';
        categories.forEach(c => {
            modalSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
    }

    const filterSelect = document.getElementById('filterCategory');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="all">Todas categorias</option>';
        categories.forEach(c => {
            filterSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
    }
}

function getCategoryById(id) {
    return categories.find(c => c.id === id) || null;
}

// ============================================
// REMOVER DUPLICATAS
// ============================================
function removeDuplicates(transactions) {
    const grouped = new Map();

    for (const tx of transactions) {
        let desc = tx.description || '';
        desc = desc.replace(/\s*\(pago\)\s*/gi, '').trim();
        desc = desc.replace(/\s+/g, ' ').trim();

        const amountKey = Math.round(Number(tx.amount) * 100);
        const catKey = tx.category_id || 'null';
        const dateKey = tx.date || 'null';
        const uniqueKey = desc.toLowerCase() + '|' + amountKey + '|' + catKey + '|' + dateKey;

        if (!grouped.has(uniqueKey) ||
            new Date(tx.created_at || tx.date) > new Date(grouped.get(uniqueKey).created_at || grouped.get(uniqueKey).date)) {
            grouped.set(uniqueKey, tx);
        }
    }

    return Array.from(grouped.values());
}

// ============================================
// CARREGAR TRANSAÇÕES - MOSTRA TODAS DO MÊS
// ============================================
async function loadTransactions() {
    try {
        const d = new Date();
        d.setMonth(d.getMonth() + currentMonthOffset);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const monthFilter = year + '-' + month;
        const lastDay = getLastDayOfMonth(year, d.getMonth());
        const firstDayStr = formatDateKey(year, d.getMonth(), 1);
        const lastDayStr = formatDateKey(year, d.getMonth(), lastDay);

        console.log('📊 Mês selecionado:', monthFilter);

        if (!navigator.onLine && window.tonuSync) {
            const cached = await window.tonuSync.getCachedTransactions?.();
            if (cached && cached.length > 0) {
                allTransactions = removeDuplicates(cached);
                updateSummary();
                const filtered = allTransactions.filter(t => t.date && t.date.startsWith(monthFilter));
                renderTransactions(filtered);
                return;
            }
        }

        // 🔥 BUSCAR TODAS AS TRANSAÇÕES DO MÊS
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .gte('date', firstDayStr)
            .lte('date', lastDayStr)
            .order('date', { ascending: false });

        if (error) throw error;

        allTransactions = removeDuplicates(data || []);

        console.log('📊 Total de transações no mês:', allTransactions.length);
        console.log('   💰 Receitas:', allTransactions.filter(t => t.type === 'income').length);
        console.log('   💸 Despesas:', allTransactions.filter(t => t.type === 'expense').length);
        console.log('   📋 Contas:', allTransactions.filter(t => t.is_bill === true).length);
        console.log('   ⏳ Não pagas:', allTransactions.filter(t => t.paid === false).length);

        updateSummary();
        renderTransactions(allTransactions);

    } catch (error) {
        console.error('❌ Erro ao carregar transações:', error);
        showToast('Erro ao carregar transações', 'error');
    }
}

// ============================================
// UPDATE SUMMARY - TODAS AS TRANSAÇÕES DO MÊS
// ============================================
function updateSummary() {
    const d = new Date();
    d.setMonth(d.getMonth() + currentMonthOffset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const monthFilter = year + '-' + month;

    const monthTransactions = allTransactions.filter(t => {
        if (!t.date) return false;
        return t.date.startsWith(monthFilter);
    });

    let income = 0, expense = 0;

    monthTransactions.forEach(t => {
        if (t.type === 'income') income += Number(t.amount);
        else if (t.type === 'expense' && t.is_bill !== true) expense += Number(t.amount);
    });

    const totalIncome = document.getElementById('totalIncome');
    const totalExpense = document.getElementById('totalExpense');
    const totalBalance = document.getElementById('totalBalance');
    const totalCount = document.getElementById('totalCount');
    const totalCountDisplay = document.getElementById('totalCountDisplay');

    if (totalIncome) totalIncome.textContent = formatCurrency(income);
    if (totalExpense) totalExpense.textContent = formatCurrency(expense);
    if (totalBalance) totalBalance.textContent = formatCurrency(income - expense);
    if (totalCount) totalCount.textContent = monthTransactions.length;
    if (totalCountDisplay) totalCountDisplay.textContent = monthTransactions.length;

    const footerInfo = document.querySelector('.filter-count');
    if (footerInfo) {
        const infoText = `📋 ${monthTransactions.length} transações | 💰 ${formatCurrency(income)} | 💸 ${formatCurrency(expense)}`;
        footerInfo.innerHTML = `<i class="fas fa-list-ul" style="margin-right:6px;"></i> ${infoText}`;
    }
}

// ============================================
// RENDER TRANSAÇÕES - COM ÍCONES PERSONALIZADOS
// ============================================
function renderTransactions(transactions) {
    const container = document.getElementById('transactionsContainer');
    if (!container) {
        console.warn('⚠️ Container transactionsContainer não encontrado');
        return;
    }

    // 🔥 FILTRAR TRANSAÇÕES DE PAGAMENTO
    const filteredTransactions = transactions.filter(t => {
        if (t.description && t.description.includes('(pago)')) {
            return false;
        }
        return true;
    });

    // Atualizar contadores
    const filteredCount = document.getElementById('filteredCount');
    if (filteredCount) filteredCount.textContent = filteredTransactions.length;

    const totalDisplay = document.getElementById('totalCountDisplay');
    if (totalDisplay) totalDisplay.textContent = filteredTransactions.length;

    const totalCount = document.getElementById('totalCount');
    if (totalCount) totalCount.textContent = filteredTransactions.length;

    if (!filteredTransactions || filteredTransactions.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding:40px 20px;">
                <span class="empty-icon">📋</span>
                <h3>Nenhuma transação neste mês</h3>
                <p>Adicione uma transação ou navegue para outro mês</p>
                <button class="btn btn-primary" onclick="openModal()" style="margin-top:16px;">
                    <i class="fas fa-plus"></i> Adicionar transação
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredTransactions.map(t => {
        const cat = getCategoryById(t.category_id);
        const isIncome = t.type === 'income';
        const sign = isIncome ? '+' : '-';
        const cls = isIncome ? 'income' : 'expense';
        const tags = t.tags ? t.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];

        // 🔥 ÍCONES PERSONALIZADOS POR DESCRIÇÃO
        const customIcons = {
            'gordo': { icon: 'fa-scooter', color: '#F39C12' },
            'gordone': { icon: 'fa-scooter', color: '#F39C12' },
            'salário': { icon: 'fa-money-bill-wave', color: '#00B894' },
            'aluguel': { icon: 'fa-home', color: '#6C5CE7' },
            'mercado': { icon: 'fa-shopping-cart', color: '#E17055' },
            'ifood': { icon: 'fa-utensils', color: '#FF7675' },
            'uber': { icon: 'fa-car', color: '#0984E3' },
            'cinema': { icon: 'fa-film', color: '#6C5CE7' },
            'academia': { icon: 'fa-dumbbell', color: '#00CEC9' },
            'internet': { icon: 'fa-wifi', color: '#0984E3' },
            'luz': { icon: 'fa-bolt', color: '#FDCB6E' },
            'agua': { icon: 'fa-tint', color: '#0984E3' },
            'celular': { icon: 'fa-mobile-alt', color: '#6C5CE7' },
            'cartão': { icon: 'fa-credit-card', color: '#636E72' },
            'investimento': { icon: 'fa-chart-line', color: '#00B894' },
            'emprestimo': { icon: 'fa-hand-holding-usd', color: '#E17055' },
            'mae': { icon: 'fa-heart', color: '#FF7675' }
        };

        // 🔥 CORREÇÃO DOS ÍCONES
        let icon = 'fa-tag';
        let color = '#6C5CE7';
        let isBill = t.is_bill || false;

        // 🔥 VERIFICAR ÍCONE PERSONALIZADO
        const descLower = (t.description || '').toLowerCase();
        let customKey = null;
        for (const [key, value] of Object.entries(customIcons)) {
            if (descLower.includes(key)) {
                customKey = key;
                break;
            }
        }

        if (customKey && customIcons[customKey]) {
            icon = customIcons[customKey].icon;
            color = customIcons[customKey].color;
        }
        // 🔥 SE FOR CONTA (is_bill = true)
        else if (isBill) {
            icon = 'fa-dollar-sign';
            color = '#FDCB6E';
        }
        // 🔥 SE TIVER CATEGORIA COM ÍCONE
        else if (cat && cat.icon) {
            icon = cat.icon;
            if (cat.color) color = cat.color;
        }
        // 🔥 SE FOR RECEITA
        else if (isIncome) {
            icon = 'fa-money-bill-wave';
            color = '#00B894';
        }
        // 🔥 SE FOR CATEGORIA "Extra" ou "Outros"
        else if (cat && (cat.name === 'Extra' || cat.name === 'Outros' || cat.name.toLowerCase().includes('extra'))) {
            icon = 'fa-plus-circle';
            color = '#FDCB6E';
        }
        // 🔥 SE FOR DESPESA SEM CATEGORIA
        else {
            icon = 'fa-tag';
            color = '#FF7675';
        }

        // Badge de status
        let statusBadge = '';
        if (t.is_bill) {
            statusBadge = `<span style="font-size:9px; background:#6C5CE7; color:#fff; padding:1px 8px; border-radius:4px; margin-left:4px;">📋 Conta</span>`;
        }
        if (!t.paid) {
            statusBadge += `<span style="font-size:9px; background:#FDCB6E; color:#2D3436; padding:1px 8px; border-radius:4px; margin-left:4px;">⏳ Pendente</span>`;
        }

        return `
            <div class="transaction-card" onclick="editTransaction('${t.id}')">
                <div class="tx-left">
                    <div class="tx-icon" style="background:${color}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="tx-info">
                        <strong>${stripHTML(t.description)} ${statusBadge}</strong>
                        <small>${cat && cat.name ? cat.name : 'Sem categoria'} • ${formatDate(t.date)}</small>
                        ${tags.length > 0 ? `
                            <div style="display:flex; gap:4px; margin-top:2px; flex-wrap:wrap;">
                                ${tags.map(tag => '<span style="font-size:10px; background:rgba(108,92,231,0.12); color:#6c5ce7; padding:1px 6px; border-radius:4px; font-weight:600;">' + stripHTML(tag.startsWith('#') ? tag : '#' + tag) + '</span>').join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="tx-right">
                    <span class="tx-amount ${cls}">${sign} ${formatCurrency(t.amount)}</span>
                    <div class="tx-actions">
                        <button class="btn btn-ghost btn-icon-sm" onclick="event.stopPropagation(); editTransaction('${t.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-icon-sm" onclick="event.stopPropagation(); deleteTransaction('${t.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// FILTROS
// ============================================
function filterTransactions() {
    const search = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    const type = document.getElementById('filterType')?.value || 'all';
    const category = document.getElementById('filterCategory')?.value || 'all';

    const d = new Date();
    d.setMonth(d.getMonth() + currentMonthOffset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const monthFilter = year + '-' + month;

    const dateStart = document.getElementById('filterDateStart')?.value || '';
    const dateEnd = document.getElementById('filterDateEnd')?.value || '';
    const minAmount = parseFloat(document.getElementById('filterMinAmount')?.value) || null;
    const maxAmount = parseFloat(document.getElementById('filterMaxAmount')?.value) || null;
    const tagFilter = document.getElementById('filterTag')?.value?.toLowerCase().replace(/^#/, '') || '';

    let filtered = allTransactions.filter(t => {
        if (!t.date) return false;
        return t.date.startsWith(monthFilter);
    });

    if (search) {
        filtered = filtered.filter(t =>
            t.description.toLowerCase().includes(search) ||
            (t.tags && t.tags.toLowerCase().includes(search))
        );
    }
    if (type !== 'all') {
        filtered = filtered.filter(t => t.type === type);
    }
    if (category !== 'all') {
        filtered = filtered.filter(t => t.category_id === category);
    }
    if (dateStart) {
        filtered = filtered.filter(t => t.date >= dateStart);
    }
    if (dateEnd) {
        filtered = filtered.filter(t => t.date <= dateEnd);
    }
    if (minAmount !== null) {
        filtered = filtered.filter(t => Number(t.amount) >= minAmount);
    }
    if (maxAmount !== null) {
        filtered = filtered.filter(t => Number(t.amount) <= maxAmount);
    }
    if (tagFilter) {
        filtered = filtered.filter(t => t.tags && t.tags.toLowerCase().includes(tagFilter));
    }

    const filteredCount = document.getElementById('filteredCount');
    if (filteredCount) {
        filteredCount.textContent = filtered.length;
    }

    renderTransactions(filtered);
}

// ============================================
// MÊS
// ============================================
function changeMonth(dir) {
    currentMonthOffset += dir;
    updateMonthDisplay('selectedMonth', currentMonthOffset);
    loadTransactions();
}

function goToCurrentMonth() {
    currentMonthOffset = 0;
    updateMonthDisplay('selectedMonth', currentMonthOffset);
    loadTransactions();
}

// ============================================
// FILTRO AVANÇADO
// ============================================
function toggleAdvancedFilters() {
    const panel = document.getElementById('advancedFiltersPanel');
    const btn = document.getElementById('btnToggleAdvFilters');
    if (panel) {
        panel.classList.toggle('hidden');
        if (btn) btn.classList.toggle('active');
    }
}

function clearAdvancedFilters() {
    ['filterDateStart', 'filterDateEnd', 'filterMinAmount', 'filterMaxAmount', 'filterTag'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    filterTransactions();
}

// ============================================
// MODAL
// ============================================
function openModal(id = null) {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('transactionModal');
    const form = document.getElementById('transactionForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('btnDelete');

    document.body.classList.add('no-scroll');

    form.reset();
    document.getElementById('editId').value = '';
    document.getElementById('tDate').value = getToday();
    deleteBtn.classList.add('hidden');
    title.textContent = 'Nova Transação';

    populateCategorySelects();

    if (window.TonuCSRF) {
        const csrfInput = document.getElementById('csrfToken');
        if (csrfInput) csrfInput.value = window.TonuCSRF.get();
    }

    if (id) {
        const tx = allTransactions.find(t => t.id === id);
        if (tx) {
            document.getElementById('editId').value = tx.id;
            document.getElementById('tType').value = tx.type;
            document.getElementById('tDescription').value = tx.description;
            document.getElementById('tAmount').value = tx.amount;
            document.getElementById('tCategory').value = tx.category_id || '';
            document.getElementById('tDate').value = tx.date;
            document.getElementById('tTags').value = tx.tags || '';
            document.getElementById('tNotes').value = tx.notes || '';
            document.getElementById('tPaid').checked = tx.paid || false;
            title.textContent = 'Editar Transação';
            deleteBtn.classList.remove('hidden');
        }
    }

    overlay.classList.add('active');
    modal.classList.remove('hidden');

    setTimeout(() => document.getElementById('tDescription')?.focus(), 100);
}

function closeModal() {
    document.body.classList.remove('no-scroll');
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('transactionModal').classList.add('hidden');
}

function editTransaction(id) {
    openModal(id);
}

// ============================================
// SALVAR TRANSAÇÃO - CORRIGIDO
// ============================================
async function saveTransaction(event) {
    event.preventDefault();

    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const editId = document.getElementById('editId').value;
    const type = document.getElementById('tType').value;
    const description = document.getElementById('tDescription').value.trim();
    const amount = parseFloat(document.getElementById('tAmount').value);
    const categoryId = document.getElementById('tCategory').value;
    const date = document.getElementById('tDate').value;
    const paid = document.getElementById('tPaid').checked;
    const tags = document.getElementById('tTags')?.value?.trim() || null;
    const notes = document.getElementById('tNotes').value.trim();

    // Validações
    if (!description || description.length < 2) {
        showToast('❌ Descrição deve ter pelo menos 2 caracteres', 'error');
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        showToast('❌ Digite um valor válido', 'error');
        return;
    }

    if (!date) {
        showToast('❌ Selecione uma data', 'error');
        return;
    }

    // Tratamento da categoria
    const finalCategoryId = (categoryId && categoryId !== '' && categoryId !== 'null') ? categoryId : null;

    const data = {
        user_id: currentUser.id,
        type: type,
        description: stripHTML(description),
        amount: amount,
        category_id: finalCategoryId,
        date: date,
        paid: paid,
        is_bill: false,
        tags: tags ? stripHTML(tags) : null,
        notes: notes ? stripHTML(notes) : null
    };

    console.log('📤 Dados a serem enviados:', data);

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    isProcessing = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
        if (!navigator.onLine && window.tonuSync) {
            if (editId) {
                await window.tonuSync.enqueue('UPDATE_TRANSACTION', { id: editId, ...data });
            } else {
                await window.tonuSync.enqueue('INSERT_TRANSACTION', data);
            }
            showToast('📦 Salvo localmente! Sincronização pendente.', 'success');
            closeModal();
            await loadTransactions();
            btn.disabled = false;
            isProcessing = false;
            btn.innerHTML = originalText;
            return;
        }

        let result;
        if (editId) {
            result = await supabaseClient
                .from('transactions')
                .update(data)
                .eq('id', editId)
                .eq('user_id', currentUser.id);
        } else {
            result = await supabaseClient
                .from('transactions')
                .insert([data]);
        }

        console.log('📥 Resposta:', result);

        if (result.error) {
            console.error('❌ Erro detalhado:', result.error);
            showToast('❌ Erro ao salvar: ' + (result.error.message || 'Erro desconhecido'), 'error');
            return;
        }

        showToast(editId ? '✅ Transação atualizada!' : '✅ Transação criada!', 'success');
        closeModal();
        await loadTransactions();

    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        showToast('❌ Erro ao salvar transação', 'error');
    } finally {
        btn.disabled = false;
        isProcessing = false;
        btn.innerHTML = originalText;
    }
}

// ============================================
// EXCLUIR TRANSAÇÃO
// ============================================
async function deleteTransaction(id) {
    const editId = id || document.getElementById('editId').value;
    if (!editId) return;

    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    if (!confirm('Excluir esta transação permanentemente?')) return;

    isProcessing = true;
    const btn = document.querySelector('.btn-danger');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
    }

    try {
        if (!navigator.onLine && window.tonuSync) {
            await window.tonuSync.enqueue('DELETE_TRANSACTION', { id: editId });
            showToast('🗑️ Exclusão agendada.', 'warning');
            closeModal();
            await loadTransactions();
            isProcessing = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
            }
            return;
        }

        await supabaseClient.from('transactions').delete().eq('id', editId).eq('user_id', currentUser.id);
        showToast('🗑️ Transação excluída!', 'success');
        closeModal();
        await loadTransactions();

    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        showToast('❌ Erro ao excluir transação', 'error');
    } finally {
        isProcessing = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
        }
    }
}

// ============================================
// TOAST
// ============================================
function showToast(message, type) {
    type = type || 'info';
    const toast = document.getElementById('toast');
    if (!toast) {
        console.warn('Toast não encontrado');
        alert(message);
        return;
    }

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
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.openModal = openModal;
window.closeModal = closeModal;
window.editTransaction = editTransaction;
window.saveTransaction = saveTransaction;
window.deleteTransaction = deleteTransaction;
window.filterTransactions = filterTransactions;
window.loadTransactions = loadTransactions;
window.loadCategories = loadCategories;
window.populateCategorySelects = populateCategorySelects;
window.debounce = debounce;
window.changeMonth = changeMonth;
window.goToCurrentMonth = goToCurrentMonth;
window.toggleAdvancedFilters = toggleAdvancedFilters;
window.clearAdvancedFilters = clearAdvancedFilters;

console.log('✅ Transactions.js carregado com sucesso!');