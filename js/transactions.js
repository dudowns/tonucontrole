// ============================================
// TONUCONTROLE - TRANSACTIONS CONTROLLER
// ============================================

(function () {
    'use strict';

    console.log('💳 Transactions.js carregando...');

    let currentUser = null;
    let allTransactions = [];
    let categories = [];
    let currentEditId = null;

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
        const num = Number(val) || 0;
        try {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
        } catch {
            return 'R$ ' + num.toFixed(2);
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

            await loadCategories();
            await loadTransactions();
            setupFilterListeners();

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

            if (window.supabaseClient) {
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
            if (txs.length === 0) {
                const local = localStorage.getItem('tonu_transactions_' + currentUser.id);
                if (local) {
                    try { txs = JSON.parse(local); } catch {}
                }
            }

            allTransactions = txs;
            renderTransactions(allTransactions);
            updateSummaryCards(allTransactions);

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

    // Render transactions list
    function renderTransactions(transactions) {
        const container = document.getElementById('transactionsList') || document.getElementById('transactionsContainer');
        if (!container) return;

        if (transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align:center;padding:48px 16px;">
                    <div style="font-size:48px;margin-bottom:12px;">💳</div>
                    <h3 style="font-size:18px;font-weight:600;margin-bottom:6px;">Nenhuma transação encontrada</h3>
                    <p style="color:var(--color-text-muted,#94a3b8);font-size:14px;margin-bottom:16px;">
                        Comece registrando suas receitas e despesas.
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
            const iconClass = isIncome ? 'fa-arrow-down' : 'fa-arrow-up';
            const typeColor = isIncome ? '#00b894' : '#ff7675';
            const amountPrefix = isIncome ? '+ ' : '- ';

            html += `
                <div class="transaction-card" onclick="openModal('${sanitize(t.id)}')">
                    <div class="t-icon" style="background:${typeColor}20; color:${typeColor}; width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <i class="fas ${iconClass}"></i>
                    </div>
                    <div class="t-info" style="flex:1; min-width:0; margin-left:12px;">
                        <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${sanitize(t.description || 'Sem descrição')}
                        </div>
                        <div style="font-size:12px; color:var(--color-text-muted,#94a3b8); display:flex; gap:8px; align-items:center; margin-top:2px;">
                            <span>${formatDateDisplay(t.date)}</span>
                            <span>•</span>
                            <span>${sanitize(t.category || 'Geral')}</span>
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

        const elIncome = document.getElementById('statIncome') || document.getElementById('totalIncome');
        const elExpense = document.getElementById('statExpense') || document.getElementById('totalExpense');
        const elBalance = document.getElementById('statBalance') || document.getElementById('totalBalance');
        const elCount = document.getElementById('statCount');

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
        const searchInput = document.getElementById('filterSearch') || document.getElementById('searchInput');
        const typeSelect = document.getElementById('filterType');
        const catSelect = document.getElementById('filterCategory');
        const statusSelect = document.getElementById('filterStatus');
        const monthInput = document.getElementById('filterMonth');

        const apply = () => filterTransactions();

        if (searchInput) searchInput.addEventListener('input', apply);
        if (typeSelect) typeSelect.addEventListener('change', apply);
        if (catSelect) catSelect.addEventListener('change', apply);
        if (statusSelect) statusSelect.addEventListener('change', apply);
        if (monthInput) monthInput.addEventListener('change', apply);

        const typeFormSelect = document.getElementById('tType');
        if (typeFormSelect) {
            typeFormSelect.addEventListener('change', populateCategorySelects);
        }
    }

    function filterTransactions() {
        const query = (document.getElementById('filterSearch')?.value || '').toLowerCase().trim();
        const type = document.getElementById('filterType')?.value || '';
        const cat = document.getElementById('filterCategory')?.value || '';
        const status = document.getElementById('filterStatus')?.value || '';
        const month = document.getElementById('filterMonth')?.value || '';

        const filtered = allTransactions.filter(t => {
            if (query && !t.description?.toLowerCase().includes(query) && !t.category?.toLowerCase().includes(query)) {
                return false;
            }
            if (type && t.type !== type) return false;
            if (cat && t.category !== cat) return false;
            if (month && t.date && !t.date.startsWith(month)) return false;
            if (status === 'paid' && t.paid === false) return false;
            if (status === 'pending' && t.paid !== false) return false;
            return true;
        });

        renderTransactions(filtered);
        updateSummaryCards(filtered);
    }

    // Modal functions
    function openModal(id = null) {
        currentEditId = id;
        const modal = document.getElementById('transactionModal');
        const modalTitle = document.getElementById('modalTitle');
        const form = document.getElementById('transactionForm');
        const btnDelete = document.getElementById('btnDelete');

        if (!modal) return;

        if (form) form.reset();

        const dateInput = document.getElementById('tDate');
        if (dateInput && !id) {
            dateInput.value = new Date().toISOString().split('T')[0];
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
                if (btnDelete) btnDelete.classList.remove('hidden');
            }
        } else {
            if (modalTitle) modalTitle.textContent = 'Nova Transação';
            if (document.getElementById('editId')) document.getElementById('editId').value = '';
            if (btnDelete) btnDelete.classList.add('hidden');
            populateCategorySelects();
        }

        modal.classList.add('show');
    }

    function closeModal() {
        const modal = document.getElementById('transactionModal');
        if (modal) modal.classList.remove('show');
        currentEditId = null;
    }

    // Save transaction
    async function saveTransaction(event) {
        if (event) event.preventDefault();

        const desc = document.getElementById('tDescription')?.value.trim();
        const amount = parseFloat(document.getElementById('tAmount')?.value);
        const type = document.getElementById('tType')?.value || 'expense';
        const date = document.getElementById('tDate')?.value;
        const category = document.getElementById('tCategory')?.value || 'Outros';
        const paid = document.getElementById('tPaid')?.checked ?? true;
        const tags = document.getElementById('tTags')?.value.trim() || null;
        const notes = document.getElementById('tNotes')?.value.trim() || null;
        const editId = document.getElementById('editId')?.value || currentEditId;

        if (!desc || isNaN(amount) || amount <= 0 || !date) {
            if (window.showToast) window.showToast('Preencha os campos obrigatórios corretamente!', 'warning');
            return;
        }

        const transactionData = {
            user_id: currentUser.id,
            description: desc,
            amount: amount,
            type: type,
            date: date,
            category: category,
            paid: paid,
            tags: tags,
            notes: notes,
            updated_at: new Date().toISOString()
        };

        try {
            if (editId) {
                // Update
                if (window.supabaseClient) {
                    await window.supabaseClient
                        .from('transactions')
                        .update(transactionData)
                        .eq('id', editId)
                        .eq('user_id', currentUser.id);
                }

                const idx = allTransactions.findIndex(t => String(t.id) === String(editId));
                if (idx !== -1) {
                    allTransactions[idx] = { ...allTransactions[idx], ...transactionData, id: editId };
                }
                if (window.showToast) window.showToast('Transação atualizada com sucesso! ✅', 'success');
            } else {
                // Insert
                transactionData.id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                transactionData.created_at = new Date().toISOString();

                if (window.supabaseClient) {
                    await window.supabaseClient
                        .from('transactions')
                        .insert([transactionData]);
                }

                allTransactions.unshift(transactionData);
                if (window.showToast) window.showToast('Transação criada com sucesso! 🎉', 'success');
            }

            // Save to local cache
            localStorage.setItem('tonu_transactions_' + currentUser.id, JSON.stringify(allTransactions));

            closeModal();
            filterTransactions();

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
        if (allTransactions.length === 0) {
            if (window.showToast) window.showToast('Nenhuma transação para exportar', 'warning');
            return;
        }

        let csv = 'ID,Data,Tipo,Descricao,Valor,Categoria,Status,Tags,Notas\n';
        allTransactions.forEach(t => {
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
    window.openModal = openModal;
    window.openNewTransactionModal = openModal;
    window.closeModal = closeModal;
    window.saveTransaction = saveTransaction;
    window.deleteTransaction = deleteTransaction;
    window.filterTransactions = filterTransactions;
    window.exportTransactionsCSV = exportTransactionsCSV;
    window.loadTransactions = loadTransactions;

})();
