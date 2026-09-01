// ==========================================================================
// TONUCONTROLE - CONTAS A PAGAR & VENCIMENTOS (BILLS ENGINE)
// Integração completa com Supabase (transactions com is_bill = true)
// ==========================================================================

(function () {
    'use strict';

    console.log('📋 Inicializando motor de Contas a Pagar (Bills)...');

    // Estado da aplicação
    let currentUser = null;
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    let allBills = [];
    let categories = [];
    let currentEditBillId = null;

    const MONTH_NAMES = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // ============================================
    // HELPERS E UTILITÁRIOS
    // ============================================
    function sanitize(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatCurrency(val) {
        const num = Number(val) || 0;
        try {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
        } catch {
            return 'R$ ' + num.toFixed(2);
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return '--/--/----';
        const parts = String(dateStr).split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateStr;
    }

    function getTodayString() {
        return new Date().toISOString().split('T')[0];
    }

    function showToast(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
            return;
        }
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            // Autenticação
            let user = null;
            if (window.supabaseOffline) {
                user = await window.supabaseOffline.isAuthenticated();
            }
            if (!user && window.supabaseClient?.auth) {
                const { data: { user: authUser } } = await window.supabaseClient.auth.getUser();
                user = authUser;
            }

            if (!user) {
                console.warn('⚠️ Usuário não autenticado em Contas');
                const isMobilePage = window.location.pathname.includes('/mobile/');
                window.location.href = isMobilePage ? '../../index.html' : '../index.html';
                return;
            }

            currentUser = user;
            console.log('✅ Contas: Usuário autenticado:', currentUser.email);

            if (window.loadGlobalUserProfile) {
                await window.loadGlobalUserProfile();
            }

            updateMonthHeader();
            await loadCategories();
            await loadBills();
            setupFilters();

            // Abrir modal automaticamente se houver parâmetro action=new
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('action') === 'new' || urlParams.get('action') === 'bill') {
                openBillModal();
            }

        } catch (err) {
            console.error('❌ Erro na inicialização de contas:', err);
        }
    });

    // ============================================
    // NAVEGAÇÃO DE MÊS
    // ============================================
    function updateMonthHeader() {
        const label = document.getElementById('currentMonthLabel');
        if (label) {
            label.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
        }
    }

    function changeMonth(delta) {
        currentMonth += delta;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear -= 1;
        } else if (currentMonth > 11) {
            currentMonth = 0;
            currentYear += 1;
        }
        updateMonthHeader();
        loadBills();
    }

    function goToCurrentMonth() {
        const now = new Date();
        currentMonth = now.getMonth();
        currentYear = now.getFullYear();
        updateMonthHeader();
        loadBills();
    }

    // ============================================
    // CARREGAMENTO DE CATEGORIAS
    // ============================================
    async function loadCategories() {
        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('categories')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true });

                if (!error && data) {
                    categories = data;
                }
            }

            if (categories.length === 0) {
                const localCats = localStorage.getItem('tonu_categories_' + currentUser.id);
                if (localCats) {
                    try { categories = JSON.parse(localCats); } catch {}
                }
            }

            populateCategoryDropdowns();
        } catch (err) {
            console.error('Erro ao carregar categorias:', err);
        }
    }

    function populateCategoryDropdowns() {
        const filterSelect = document.getElementById('billFilterCategory');
        const modalSelect = document.getElementById('billCategory');

        const catOptions = categories
            .filter(c => !c.type || c.type === 'expense')
            .map(c => `<option value="${c.id}">${c.name}</option>`)
            .join('');

        if (filterSelect) {
            filterSelect.innerHTML = '<option value="all">Todas as categorias</option>' + catOptions;
        }
        if (modalSelect) {
            modalSelect.innerHTML = '<option value="">Selecione uma categoria...</option>' + catOptions;
        }
    }

    // ============================================
    // CARREGAMENTO DE CONTAS (TRANSACTIONS IS_BILL)
    // ============================================
    async function loadBills() {
        const container = document.getElementById('billsContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align:center;padding:40px;">
                    <span class="spinner"></span>
                    <p style="color:var(--color-text-muted,#94a3b8);margin-top:10px;font-size:13px;">Carregando contas de ${MONTH_NAMES[currentMonth]}...</p>
                </div>
            `;
        }

        const mStr = String(currentMonth + 1).padStart(2, '0');
        const firstDay = `${currentYear}-${mStr}-01`;
        const lastDayNum = new Date(currentYear, currentMonth + 1, 0).getDate();
        const lastDay = `${currentYear}-${mStr}-${String(lastDayNum).padStart(2, '0')}`;

        try {
            let bills = [];

            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('transactions')
                    .select('*, categories(id, name, icon, color)')
                    .eq('user_id', currentUser.id)
                    .eq('type', 'expense')
                    .eq('is_bill', true)
                    .gte('date', firstDay)
                    .lte('date', lastDay)
                    .order('date', { ascending: true });

                if (!error && data) {
                    bills = data;
                }
            }

            if (bills.length === 0) {
                const cacheKey = `tonu_bills_cache_${currentUser.id}_${currentYear}_${mStr}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try { bills = JSON.parse(cached); } catch {}
                }
            } else {
                const cacheKey = `tonu_bills_cache_${currentUser.id}_${currentYear}_${mStr}`;
                localStorage.setItem(cacheKey, JSON.stringify(bills));
            }

            allBills = bills;
            applyFiltersAndRender();
            updateSummaryCards(allBills);

        } catch (err) {
            console.error('❌ Erro ao carregar contas:', err);
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center;padding:30px;color:var(--color-danger,#ff7675);">
                        <i class="fas fa-exclamation-triangle" style="font-size:28px;margin-bottom:8px;"></i>
                        <p>Erro ao conectar com o banco de dados de contas.</p>
                        <button class="btn btn-outline btn-sm" onclick="loadBills()" style="margin-top:8px;">Tentar Novamente</button>
                    </div>
                `;
            }
        }
    }

    // ============================================
    // ATUALIZAÇÃO DOS CARDS DE RESUMO E PROGRESSO
    // ============================================
    function updateSummaryCards(bills) {
        let total = 0;
        let paid = 0;
        let pending = 0;
        let overdue = 0;

        let totalCount = bills.length;
        let paidCount = 0;
        let pendingCount = 0;
        let overdueCount = 0;

        const todayStr = getTodayString();

        bills.forEach(b => {
            const amt = parseFloat(b.amount) || 0;
            total += amt;

            if (b.paid) {
                paid += amt;
                paidCount++;
            } else if (b.date && b.date < todayStr) {
                overdue += amt;
                overdueCount++;
                pending += amt;
                pendingCount++;
            } else {
                pending += amt;
                pendingCount++;
            }
        });

        // Atualizar textos dos cards
        const elTotal = document.getElementById('billsStatTotal');
        const elTotalCount = document.getElementById('billsStatTotalCount');
        const elPaid = document.getElementById('billsStatPaid');
        const elPaidCount = document.getElementById('billsStatPaidCount');
        const elPending = document.getElementById('billsStatPending');
        const elPendingCount = document.getElementById('billsStatPendingCount');
        const elOverdue = document.getElementById('billsStatOverdue');
        const elOverdueCount = document.getElementById('billsStatOverdueCount');

        if (elTotal) elTotal.textContent = formatCurrency(total);
        if (elTotalCount) elTotalCount.textContent = `${totalCount} ${totalCount === 1 ? 'conta' : 'contas'}`;
        if (elPaid) elPaid.textContent = formatCurrency(paid);
        if (elPaidCount) elPaidCount.textContent = `${paidCount} ${paidCount === 1 ? 'paga' : 'pagas'}`;
        if (elPending) elPending.textContent = formatCurrency(pending);
        if (elPendingCount) elPendingCount.textContent = `${pendingCount} ${pendingCount === 1 ? 'a vencer' : 'a vencer'}`;
        if (elOverdue) elOverdue.textContent = formatCurrency(overdue);
        if (elOverdueCount) elOverdueCount.textContent = `${overdueCount} ${overdueCount === 1 ? 'atrasada' : 'atrasadas'}`;

        // Progresso do mês
        const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
        const elPct = document.getElementById('billsProgressPct');
        const elBar = document.getElementById('billsProgressBar');

        if (elPct) elPct.textContent = `${pct}%`;
        if (elBar) elBar.style.width = `${pct}%`;
    }

    // ============================================
    // FILTROS E RENDERIZAÇÃO
    // ============================================
    function setupFilters() {
        const searchInput = document.getElementById('billFilterSearch');
        const statusSelect = document.getElementById('billFilterStatus');
        const catSelect = document.getElementById('billFilterCategory');

        if (searchInput) searchInput.addEventListener('input', applyFiltersAndRender);
        if (statusSelect) statusSelect.addEventListener('change', applyFiltersAndRender);
        if (catSelect) catSelect.addEventListener('change', applyFiltersAndRender);
    }

    function applyFiltersAndRender() {
        const searchInput = document.getElementById('billFilterSearch');
        const statusSelect = document.getElementById('billFilterStatus');
        const catSelect = document.getElementById('billFilterCategory');

        const query = (searchInput?.value || '').toLowerCase().trim();
        const status = statusSelect?.value || 'all';
        const categoryId = catSelect?.value || 'all';
        const todayStr = getTodayString();

        const filtered = allBills.filter(b => {
            // Busca por texto
            if (query && !b.description?.toLowerCase().includes(query) && !(b.notes && b.notes.toLowerCase().includes(query))) {
                return false;
            }

            // Status
            const isOverdue = !b.paid && b.date && b.date < todayStr;
            if (status === 'paid' && !b.paid) return false;
            if (status === 'pending' && b.paid) return false;
            if (status === 'overdue' && (!isOverdue)) return false;

            // Categoria
            if (categoryId !== 'all' && b.category_id !== categoryId) return false;

            return true;
        });

        renderBills(filtered);
    }

    function renderBills(bills) {
        const container = document.getElementById('billsContainer');
        const countBadge = document.getElementById('billsCountBadge');
        if (!container) return;

        if (countBadge) {
            countBadge.textContent = `${bills.length} ${bills.length === 1 ? 'registro' : 'registros'}`;
        }

        if (bills.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:48px 20px;">
                    <div style="font-size:42px;margin-bottom:12px;opacity:0.8;">📋</div>
                    <h4 style="font-size:16px;font-weight:700;margin:0 0 6px 0;color:var(--color-text,#2d3436);">Nenhuma conta encontrada</h4>
                    <p style="color:var(--color-text-muted,#94a3b8);font-size:13px;margin:0 auto 16px auto;max-width:360px;">
                        Não há contas cadastradas para este filtro no mês de ${MONTH_NAMES[currentMonth]}.
                    </p>
                    <button class="btn btn-primary btn-sm" onclick="openBillModal()">
                        <i class="fas fa-plus"></i> Adicionar Conta
                    </button>
                </div>
            `;
            return;
        }

        const todayStr = getTodayString();
        const todayMs = new Date(todayStr + 'T00:00:00').getTime();

        let html = '<div class="bills-list-group">';

        bills.forEach(b => {
            const isPaid = !!b.paid;
            const isOverdue = !isPaid && b.date && b.date < todayStr;

            // Categoria
            const cat = b.categories || categories.find(c => c.id === b.category_id) || {};
            const catColor = cat.color || '#6C5CE7';
            const catIcon = cat.icon || 'fa-file-invoice-dollar';
            const catName = cat.name || 'Geral';

            // Cálculo de urgência / dias restantes
            let daysBadge = '';
            if (isPaid) {
                daysBadge = `<span class="days-left" style="color:#00B894;"><i class="fas fa-check"></i> Pago</span>`;
            } else if (b.date) {
                const dueMs = new Date(b.date + 'T00:00:00').getTime();
                const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));

                if (diffDays < 0) {
                    daysBadge = `<span class="days-left overdue"><i class="fas fa-exclamation-circle"></i> Vencida há ${Math.abs(diffDays)} dia(s)</span>`;
                } else if (diffDays === 0) {
                    daysBadge = `<span class="days-left urgent"><i class="fas fa-bell"></i> Vence HOJE!</span>`;
                } else if (diffDays === 1) {
                    daysBadge = `<span class="days-left urgent"><i class="fas fa-clock"></i> Vence amanhã</span>`;
                } else if (diffDays <= 3) {
                    daysBadge = `<span class="days-left" style="color:#d97706;"><i class="fas fa-clock"></i> Vence em ${diffDays} dias</span>`;
                } else {
                    daysBadge = `<span class="days-left" style="color:var(--color-text-muted,#94a3b8);">Vence em ${diffDays} dias</span>`;
                }
            }

            // Status Badge
            let statusBadge = '';
            if (isPaid) {
                statusBadge = `<span class="badge badge-success">PAGA</span>`;
            } else if (isOverdue) {
                statusBadge = `<span class="badge badge-overdue">ATRASADA</span>`;
            } else {
                statusBadge = `<span class="badge badge-pending">PENDENTE</span>`;
            }

            html += `
                <div class="bill-card ${isOverdue ? 'overdue' : ''}" id="bill_item_${b.id}">
                    <div class="bill-left">
                        <div class="bill-icon" style="background:${catColor};">
                            <i class="fas ${catIcon}"></i>
                        </div>
                        <div class="bill-info">
                            <strong>${sanitize(b.description)}</strong>
                            <small>
                                <i class="fas fa-calendar-alt" style="margin-right:3px;"></i>${formatDate(b.date)} • ${sanitize(catName)}
                                ${b.notes ? ` • <span style="font-style:italic;" title="${sanitize(b.notes)}"><i class="fas fa-info-circle"></i> ${sanitize(b.notes)}</span>` : ''}
                            </small>
                            <div style="margin-top:2px;">${daysBadge}</div>
                        </div>
                    </div>

                    <div class="bill-right">
                        <div class="bill-amount ${isPaid ? 'text-success' : (isOverdue ? 'text-danger' : 'text-warning')}">
                            ${formatCurrency(b.amount)}
                        </div>
                        ${statusBadge}
                        <div class="bill-actions">
                            <button class="btn-icon-sm btn-outline" onclick="toggleBillPaid('${b.id}')" title="${isPaid ? 'Marcar como Pendente' : 'Marcar como Paga'}">
                                <i class="fas ${isPaid ? 'fa-undo' : 'fa-check'}" style="color:${isPaid ? '#f59e0b' : '#10b981'};"></i>
                            </button>
                            <button class="btn-icon-sm btn-outline" onclick="openBillModal('${b.id}')" title="Editar conta">
                                <i class="fas fa-pencil-alt" style="color:var(--color-primary,#6c5ce7);"></i>
                            </button>
                            <button class="btn-icon-sm btn-outline text-danger" onclick="deleteBill('${b.id}')" title="Excluir conta">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // ============================================
    // AÇÃO RÁPIDA: ALTERNAR STATUS DE PAGAMENTO (1 CLIQUE)
    // ============================================
    async function toggleBillPaid(id) {
        const bill = allBills.find(b => String(b.id) === String(id));
        if (!bill) return;

        const newPaidStatus = !bill.paid;
        const newPaidDate = newPaidStatus ? getTodayString() : null;

        // Atualização otimista na tela
        bill.paid = newPaidStatus;
        bill.paid_date = newPaidDate;
        applyFiltersAndRender();
        updateSummaryCards(allBills);

        try {
            if (window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('transactions')
                    .update({
                        paid: newPaidStatus,
                        paid_date: newPaidDate
                    })
                    .eq('id', id)
                    .eq('user_id', currentUser.id);

                if (error) throw error;
            }

            showToast(newPaidStatus ? 'Conta marcada como PAGA! ✅' : 'Conta retornou para PENDENTE ⏳', 'success');

            if (window.checkNotifications) {
                window.checkNotifications();
            }

        } catch (err) {
            console.error('❌ Erro ao atualizar status da conta:', err);
            // Reverter se falhar
            bill.paid = !newPaidStatus;
            applyFiltersAndRender();
            updateSummaryCards(allBills);
            showToast('Erro ao atualizar status: ' + err.message, 'error');
        }
    }

    // ============================================
    // MODAL DE CADASTRO E EDIÇÃO
    // ============================================
    function openBillModal(id = null) {
        currentEditBillId = id;
        const modal = document.getElementById('billModal');
        const form = document.getElementById('billForm');
        const titleEl = document.getElementById('billModalTitle');
        const btnDelete = document.getElementById('btnDeleteBill');
        const btnSave = document.getElementById('btnSaveBill');

        if (!modal) return;
        if (form) form.reset();

        populateCategoryDropdowns();

        const dateInput = document.getElementById('billDate');
        if (dateInput && !id) {
            // Data padrão no mês atual
            const today = new Date();
            const year = currentYear;
            const month = String(currentMonth + 1).padStart(2, '0');
            const day = String(Math.min(today.getDate(), new Date(year, currentMonth + 1, 0).getDate())).padStart(2, '0');
            dateInput.value = `${year}-${month}-${day}`;
        }

        if (id) {
            const bill = allBills.find(b => String(b.id) === String(id));
            if (bill) {
                if (titleEl) titleEl.textContent = 'Editar Conta';
                if (btnSave) btnSave.innerHTML = '💾 Salvar Alterações';
                document.getElementById('billEditId').value = bill.id;
                document.getElementById('billDescription').value = bill.description || '';
                document.getElementById('billAmount').value = bill.amount || '';
                document.getElementById('billDate').value = (bill.date || '').split('T')[0];
                document.getElementById('billCategory').value = bill.category_id || '';
                document.getElementById('billNotes').value = bill.notes || '';
                document.getElementById('billPaid').checked = !!bill.paid;
                if (btnDelete) btnDelete.classList.remove('hidden');
            }
        } else {
            if (titleEl) titleEl.textContent = 'Nova Conta a Pagar';
            if (btnSave) btnSave.innerHTML = '💾 Salvar Conta';
            if (document.getElementById('billEditId')) document.getElementById('billEditId').value = '';
            if (btnDelete) btnDelete.classList.add('hidden');
        }

        modal.classList.add('show');
    }

    function closeBillModal() {
        const modal = document.getElementById('billModal');
        if (modal) modal.classList.remove('show');
        currentEditBillId = null;
    }

    // ============================================
    // SALVAR CONTA (INSERT / UPDATE)
    // ============================================
    async function saveBill(event) {
        if (event) event.preventDefault();

        const desc = document.getElementById('billDescription')?.value.trim();
        const amount = parseFloat(document.getElementById('billAmount')?.value);
        const date = document.getElementById('billDate')?.value;
        const categoryId = document.getElementById('billCategory')?.value || null;
        const notes = document.getElementById('billNotes')?.value.trim() || null;
        const paid = document.getElementById('billPaid')?.checked ?? false;
        const editId = document.getElementById('billEditId')?.value || currentEditBillId;

        if (!desc || isNaN(amount) || amount <= 0 || !date) {
            showToast('Preencha os campos obrigatórios corretamente!', 'warning');
            return;
        }

        const btnSave = document.getElementById('btnSaveBill');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.textContent = 'Salvando...';
        }

        const billPayload = {
            user_id: currentUser.id,
            description: desc,
            amount: amount,
            date: date,
            type: 'expense',
            is_bill: true,
            category_id: categoryId || null,
            notes: notes,
            paid: paid,
            paid_date: paid ? getTodayString() : null
        };

        try {
            if (editId) {
                if (window.supabaseClient) {
                    const { error } = await window.supabaseClient
                        .from('transactions')
                        .update(billPayload)
                        .eq('id', editId)
                        .eq('user_id', currentUser.id);

                    if (error) throw error;
                }
                showToast('Conta atualizada com sucesso! ✅', 'success');
            } else {
                if (window.supabaseClient) {
                    const { error } = await window.supabaseClient
                        .from('transactions')
                        .insert([billPayload]);

                    if (error) throw error;
                }
                showToast('Conta adicionada com sucesso! 🎉', 'success');
            }

            closeBillModal();
            await loadBills();

            if (window.checkNotifications) {
                window.checkNotifications();
            }

        } catch (err) {
            console.error('❌ Erro ao salvar conta:', err);
            showToast('Erro ao salvar conta: ' + (err.message || 'Tente novamente'), 'error');
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.textContent = '💾 Salvar Conta';
            }
        }
    }

    // ============================================
    // EXCLUIR CONTA
    // ============================================
    async function deleteBill(id = null) {
        const targetId = id || document.getElementById('billEditId')?.value || currentEditBillId;
        if (!targetId) return;

        if (!confirm('Deseja realmente excluir esta conta?')) return;

        try {
            if (window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('transactions')
                    .delete()
                    .eq('id', targetId)
                    .eq('user_id', currentUser.id);

                if (error) throw error;
            }

            showToast('Conta excluída com sucesso! 🗑️', 'info');
            closeBillModal();
            await loadBills();

            if (window.checkNotifications) {
                window.checkNotifications();
            }

        } catch (err) {
            console.error('❌ Erro ao excluir conta:', err);
            showToast('Erro ao excluir conta: ' + err.message, 'error');
        }
    }

    // Exportação global de funções
    window.openBillModal = openBillModal;
    window.closeBillModal = closeBillModal;
    window.saveBill = saveBill;
    window.deleteBill = deleteBill;
    window.toggleBillPaid = toggleBillPaid;
    window.changeMonth = changeMonth;
    window.goToCurrentMonth = goToCurrentMonth;
    window.loadBills = loadBills;

})();
