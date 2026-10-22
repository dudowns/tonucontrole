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

    // ITEM 9: Estado de Seleção Múltipla & Soma Visual
    let isSelectionMode = false;
    let selectedBillIds = new Set();
    let currentFilteredBillsList = [];

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
        if (typeof window.formatCurrency === 'function' && window.formatCurrency !== formatCurrency) {
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

    function formatDate(dateStr) {
        if (typeof window.formatDate === 'function' && window.formatDate !== formatDate) {
            return window.formatDate(dateStr);
        }
        if (!dateStr) return '--/--/----';
        const parts = String(dateStr).split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateStr;
    }

    function getTodayString() {
        if (typeof window.getToday === 'function') {
            const t = window.getToday();
            if (t && typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
        }
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
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
            if (window.getAuthenticatedUser) user = await window.getAuthenticatedUser();
            if (!user && window.supabaseOffline) {
                user = await window.supabaseOffline.isAuthenticated();
            }
            if (!user && window.supabaseClient?.auth) {
                try {
                    const { data: sessData } = await window.supabaseClient.auth.getSession();
                    user = sessData?.session?.user;
                    if (!user) {
                        const { data: { user: authUser } } = await window.supabaseClient.auth.getUser();
                        user = authUser;
                    }
                } catch (_) {}
            }
            if (!user) {
                try {
                    const s = sessionStorage.getItem('tonu_user');
                    if (s) { const p = JSON.parse(s); user = p.user || p; }
                } catch (_) {}
            }
            if (!user) {
                try {
                    const off = localStorage.getItem('tonu_offline_session');
                    if (off) { const p = JSON.parse(off); user = p.user || p; }
                } catch (_) {}
            }

            if (!user) {
                console.warn('⚠️ Usuário não autenticado em Contas');
                const isMobilePage = window.location.pathname.includes('/mobile/');
                window.location.href = isMobilePage ? '../../index.html' : '../index.html';
                return;
            }

            currentUser = user;
            if (typeof window !== 'undefined') window.currentUser = user;
            console.log('✅ Contas: Usuário autenticado:', currentUser.email);

            if (window.loadGlobalUserProfile) {
                await window.loadGlobalUserProfile();
            }

            updateMonthHeader();
            await loadCategories();
            await loadBills();
            setupFilters();

            // Vincular controles dinâmicos de parcelamento e recorrência
            if (window.TonuInstallments) {
                window.TonuInstallments.bindFormControls('bill');
            }

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
            let fetchedFromDb = false;

            // 1. Se estiver offline, carrega do IndexedDB canônico
            if (!navigator.onLine && window.tonuSync && currentUser?.id) {
                const cached = await window.tonuSync.getCachedBills(currentUser.id);
                if (cached && cached.length > 0) {
                    allBills = cached.filter(b => b.date >= firstDay && b.date <= lastDay);
                    applyFiltersAndRender();
                    updateSummaryCards(allBills);
                    return;
                }
            }

            // 2. Se online, busca do Supabase
            if (window.supabaseClient && currentUser && navigator.onLine) {
                try {
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
                        fetchedFromDb = true;
                    }
                } catch (netErr) {
                    console.warn('⚠️ Falha ao buscar contas do Supabase, recorrendo ao cache:', netErr);
                }
            }

            // 3. Fallback para IndexedDB se falhou na rede ou não obteve dados
            if (!fetchedFromDb && window.tonuSync && currentUser?.id) {
                const cached = await window.tonuSync.getCachedBills(currentUser.id);
                if (cached && cached.length > 0) {
                    bills = cached.filter(b => b.date >= firstDay && b.date <= lastDay);
                }
            }

            // 4. Salva no IndexedDB canônico se obteve do banco
            if (fetchedFromDb && window.tonuSync && currentUser?.id) {
                await window.tonuSync.setCachedBills(currentUser.id, bills);
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

        // Total a Pagar = o que resta pagar no mês (pendentes + atrasadas)
        const remainingToPay = pending;
        const normalPending = Math.max(0, pending - overdue);
        const normalPendingCount = Math.max(0, pendingCount - overdueCount);

        // Atualizar textos dos cards
        const elTotal = document.getElementById('billsStatTotal');
        const elTotalCount = document.getElementById('billsStatTotalCount');
        const elPaid = document.getElementById('billsStatPaid');
        const elPaidCount = document.getElementById('billsStatPaidCount');
        const elPending = document.getElementById('billsStatPending');
        const elPendingCount = document.getElementById('billsStatPendingCount');
        const elOverdue = document.getElementById('billsStatOverdue');
        const elOverdueCount = document.getElementById('billsStatOverdueCount');

        if (elTotal) elTotal.textContent = formatCurrency(remainingToPay);
        if (elTotalCount) elTotalCount.textContent = `${pendingCount} ${pendingCount === 1 ? 'a pagar' : 'a pagar'}`;
        if (elPaid) elPaid.textContent = formatCurrency(paid);
        if (elPaidCount) elPaidCount.textContent = `${paidCount} ${paidCount === 1 ? 'paga' : 'pagas'}`;
        if (elPending) elPending.textContent = formatCurrency(normalPending);
        if (elPendingCount) elPendingCount.textContent = `${normalPendingCount} ${normalPendingCount === 1 ? 'a vencer' : 'a vencer'}`;
        if (elOverdue) elOverdue.textContent = formatCurrency(overdue);
        if (elOverdueCount) elOverdueCount.textContent = `${overdueCount} ${overdueCount === 1 ? 'atrasada' : 'atrasadas'}`;

        // Progresso do mês
        const totalBillsMonth = paid + pending;
        const pct = totalBillsMonth > 0 ? Math.min(100, Math.round((paid / totalBillsMonth) * 100)) : 0;
        const elPct = document.getElementById('billsProgressPct');
        const elBar = document.getElementById('billsProgressBar');

        if (elPct) elPct.textContent = `${pct}%`;
        if (elBar) elBar.style.width = `${pct}%`;

        // Métricas de Parcelamento e Banner
        updateInstallmentsBanner(bills);
    }

    function updateInstallmentsBanner(bills) {
        const banner = document.getElementById('billsInstallmentBanner');
        if (!banner) return;

        let activeCount = 0;
        let totalRemainingInstallments = 0;
        let totalRemainingDebt = 0;

        bills.forEach(b => {
            if (window.TonuInstallments) {
                const info = window.TonuInstallments.getInstallmentInfo(b);
                if (info.isInstallment && !info.isFinished) {
                    activeCount++;
                    totalRemainingInstallments += info.remaining;
                    totalRemainingDebt += info.remainingAmount;
                }
            }
        });

        if (activeCount > 0) {
            banner.style.display = 'flex';
            const countEl = document.getElementById('bannerInstallmentActiveCount');
            const detailsEl = document.getElementById('bannerInstallmentDetails');
            if (countEl) countEl.textContent = activeCount;
            if (detailsEl) {
                detailsEl.textContent = `Total de parcelas restantes a vencer: ${totalRemainingInstallments} • Saldo restante a quitar: ${formatCurrency(totalRemainingDebt)}`;
            }
        } else {
            banner.style.display = 'none';
        }
    }

    window.filterByInstallmentsOnly = function() {
        const recSelect = document.getElementById('billFilterRecurrence');
        if (recSelect) {
            recSelect.value = 'installments';
            applyFiltersAndRender();
        }
    };

    window.setStatusTab = function(status) {
        const statusSelect = document.getElementById('billFilterStatus');
        if (statusSelect) {
            statusSelect.value = status;
        }
        applyFiltersAndRender();
    };

    function syncStatusTabs(currentStatus) {
        document.querySelectorAll('.tab-status-btn').forEach(btn => {
            const isMatch = btn.dataset.status === currentStatus;
            btn.classList.toggle('active', isMatch);
            btn.style.background = isMatch ? 'var(--color-surface, #fff)' : 'transparent';
            btn.style.color = isMatch ? 'var(--color-primary, #6c5ce7)' : 'var(--color-text-muted, #64748b)';
            btn.style.boxShadow = isMatch ? '0 1px 3px rgba(0,0,0,0.08)' : 'none';
        });
    }

    // ============================================
    // FILTROS E RENDERIZAÇÃO
    // ============================================
    function setupFilters() {
        const searchInput = document.getElementById('billFilterSearch');
        const statusSelect = document.getElementById('billFilterStatus');
        const recSelect = document.getElementById('billFilterRecurrence');
        const catSelect = document.getElementById('billFilterCategory');

        if (searchInput) searchInput.addEventListener('input', applyFiltersAndRender);
        if (statusSelect) statusSelect.addEventListener('change', () => {
            syncStatusTabs(statusSelect.value);
            applyFiltersAndRender();
        });
        if (recSelect) recSelect.addEventListener('change', applyFiltersAndRender);
        if (catSelect) catSelect.addEventListener('change', applyFiltersAndRender);
    }

    function applyFiltersAndRender() {
        const searchInput = document.getElementById('billFilterSearch');
        const statusSelect = document.getElementById('billFilterStatus');
        const recSelect = document.getElementById('billFilterRecurrence');
        const catSelect = document.getElementById('billFilterCategory');

        const query = (searchInput?.value || '').toLowerCase().trim();
        const status = statusSelect?.value || 'pending';
        syncStatusTabs(status);
        const recurrenceFilter = recSelect?.value || 'all';
        const categoryId = catSelect?.value || 'all';
        const todayStr = getTodayString();

        const filtered = allBills.filter(b => {
            // Busca por texto
            if (query && !b.description?.toLowerCase().includes(query) && !(b.notes && b.notes.toLowerCase().includes(query))) {
                return false;
            }

            // Status
            const dueDateStr = b.due_date || b.date;
            const isOverdue = !b.paid && dueDateStr && dueDateStr < todayStr;
            if (status === 'paid' && !b.paid) return false;
            if (status === 'pending' && b.paid) return false;
            if (status === 'overdue' && (!isOverdue)) return false;

            // Recorrência / Parcelamento
            if (recurrenceFilter !== 'all') {
                const info = window.TonuInstallments ? window.TonuInstallments.getInstallmentInfo(b) : { type: 'single' };
                if (recurrenceFilter === 'installments' && !info.isInstallment) return false;
                if (recurrenceFilter === 'recurring' && !info.isRecurring) return false;
                if (recurrenceFilter === 'single' && (info.isInstallment || info.isRecurring)) return false;
            }

            // Categoria
            if (categoryId !== 'all' && b.category_id !== categoryId) return false;

            return true;
        });

        renderBills(filtered);
    }

    function renderBills(bills) {
        currentFilteredBillsList = bills || [];
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
        const safeParseLocalDate = (s) => {
            if (typeof window.parseLocalDate === 'function') return window.parseLocalDate(s);
            if (!s) return null;
            const p = String(s).split('T')[0].trim().split('-');
            return p.length === 3 ? new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0) : new Date(s);
        };
        const todayDate = safeParseLocalDate(todayStr);

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
            } else if (b.due_date || b.date) {
                const dueDate = safeParseLocalDate(b.due_date || b.date);
                const diffDays = Math.round((dueDate - todayDate) / 86400000);

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

            // Metadados de Parcelamento / Recorrência
            const instInfo = window.TonuInstallments ? window.TonuInstallments.getInstallmentInfo(b) : null;

            const isSelected = selectedBillIds.has(String(b.id));

            html += `
                <div class="bill-card ${isOverdue ? 'overdue' : ''} ${isSelected ? 'selected' : ''}" id="bill_item_${b.id}">
                    <div class="bill-left" style="align-items:center;">
                        ${isSelectionMode ? `
                            <div class="bill-select-box" style="margin-right:12px; display:flex; align-items:center;">
                                <input type="checkbox" class="bill-checkbox" data-id="${b.id}" ${isSelected ? 'checked' : ''} onchange="toggleSelectBill('${b.id}', this.checked)" style="width:20px; height:20px; cursor:pointer; accent-color:var(--color-primary,#6c5ce7);">
                            </div>
                        ` : ''}
                        <div class="bill-icon" style="background:${catColor};">
                            <i class="fas ${catIcon}"></i>
                        </div>
                        <div class="bill-info">
                            <strong>${sanitize(b.description)}</strong>
                            ${instInfo && instInfo.badgeHtml ? instInfo.badgeHtml : ''}
                            <small>
                                <i class="fas fa-calendar-alt" style="margin-right:3px;"></i>${formatDate(b.due_date || b.date)} • ${sanitize(catName)}
                                ${b.notes ? ` • <span style="font-style:italic;" title="${sanitize(b.notes)}"><i class="fas fa-info-circle"></i> ${sanitize(b.notes)}</span>` : ''}
                            </small>
                            <div style="margin-top:2px;">${daysBadge}</div>
                        </div>
                    </div>

                    <div class="bill-right">
                        <div class="bill-amount ${isPaid ? 'text-success' : (isOverdue ? 'text-danger' : 'text-warning')}">
                            ${formatCurrency(b.amount)}
                        </div>
                        ${isPaid ? `
                            <button class="btn-paid" onclick="toggleBillPaid('${b.id}')" title="Conta Paga! Clique para marcar como pendente">
                                <i class="fas fa-check-double"></i> Paga
                            </button>
                        ` : (isOverdue ? `
                            <button class="btn-pay btn-pay-overdue" onclick="toggleBillPaid('${b.id}')" title="Conta Atrasada! Clique para pagar">
                                <i class="fas fa-check"></i> Pagar
                            </button>
                        ` : `
                            <button class="btn-pay btn-pay-pending" onclick="toggleBillPaid('${b.id}')" title="Clique para pagar esta conta">
                                <i class="fas fa-check"></i> Pagar
                            </button>
                        `)}
                        <div class="bill-actions">
                            ${(parseInt(b.installments, 10) > 1 || (b.description && /\(\d+\/\d+\)/.test(b.description))) ? `
                                <button class="btn-icon-sm" onclick="openAnticipationModal('${b.id}')" title="Antecipar / Quitar Parcelas Futuras">
                                    <i class="fas fa-forward-step" style="color:#0284c7;"></i>
                                </button>
                            ` : ''}
                            <button class="btn-icon-sm" onclick="openBillModal('${b.id}')" title="Editar conta">
                                <i class="fas fa-pencil-alt" style="color:var(--color-primary,#6c5ce7);"></i>
                            </button>
                            <button class="btn-icon-sm text-danger" onclick="deleteBill('${b.id}')" title="Excluir conta">
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
    async function toggleBillPaid(id, targetStatus = undefined) {
        const bill = allBills.find(b => String(b.id) === String(id));
        if (!bill) return;

        // Guarda 1: Previne cliques duplos rápidos concorrentes
        if (bill._updating) return;

        const newPaidStatus = (targetStatus !== undefined) ? !!targetStatus : !bill.paid;

        // Guarda 3: Se já está no estado desejado (ex: pagar já pago), não faz nada
        if (bill.paid === newPaidStatus) return;

        bill._updating = true;

        try {
            const newPaidDate = newPaidStatus ? getTodayString() : null;

            // Ao pagar: preserva a data de vencimento em due_date e atualiza date para a data real de pagamento (extrato)
            if (newPaidStatus) {
                if (!bill.due_date) {
                    bill.due_date = bill.date;
                }
                bill.date = newPaidDate;
            } else {
                // Ao reverter para pendente: restaura date para a data de vencimento original
                if (bill.due_date) {
                    bill.date = bill.due_date;
                }
            }

            // Feedback tátil instantâneo no clique
            if (window.triggerHaptic) {
                window.triggerHaptic(newPaidStatus ? 'success' : 'medium');
            }

            // Atualização otimista na tela
            bill.paid = newPaidStatus;
            bill.paid_date = newPaidDate;
            applyFiltersAndRender();
            updateSummaryCards(allBills);

            // Atualizar cache de contas no IndexedDB canônico e enfileirar para sync
            if (window.tonuSync && currentUser?.id) {
                await window.tonuSync.setCachedBills(currentUser.id, allBills);
                await window.tonuSync.enqueue('UPDATE_BILL', {
                    id: id,
                    paid: newPaidStatus,
                    paid_date: newPaidDate,
                    date: bill.date,
                    due_date: bill.due_date || undefined
                });
            }

            showToast(newPaidStatus ? 'Conta paga e lançada nas transações com sucesso! ✅' : 'Conta retornou para PENDENTE ⏳', 'success');

            if (window.checkNotifications) {
                window.checkNotifications();
            }

        } catch (err) {
            console.error('❌ Erro ao atualizar status da conta:', err);
            // Reverter se falhar
            bill.paid = !newPaidStatus;
            bill.paid_date = !newPaidStatus ? getTodayString() : null;
            applyFiltersAndRender();
            updateSummaryCards(allBills);
            showToast('Erro ao atualizar status: ' + err.message, 'error');
        } finally {
            bill._updating = false;
        }
    }

    // ============================================
    // MODAL DE CADASTRO E EDIÇÃO
    // ============================================
    function openBillModal(id = null) {
        currentEditBillId = id;
        const overlay = document.getElementById('billModalOverlay');
        const modal = document.getElementById('billModal');
        const form = document.getElementById('billForm');
        const titleEl = document.getElementById('billModalTitle');
        const btnDelete = document.getElementById('btnDeleteBill');
        const btnSave = document.getElementById('btnSaveBill');

        const recTypeInput = document.getElementById('billRecurrenceType');
        const instTotalInput = document.getElementById('billInstallmentTotal');
        const instCurrentInput = document.getElementById('billInstallmentCurrent');
        const futureGroup = document.getElementById('billGenerateFutureGroup');

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

                // Carregar recorrência e parcelas
                const hasInstallments = (parseInt(bill.installments, 10) > 1);
                let recVal = bill.recurrence_type;
                if (!recVal) {
                    if (hasInstallments) recVal = 'installments';
                    else if (bill.is_recurring) recVal = 'monthly';
                    else recVal = 'single';
                }
                if (recTypeInput) recTypeInput.value = recVal;
                if (instTotalInput) instTotalInput.value = bill.installments || 2;
                if (instCurrentInput) instCurrentInput.value = bill.current_installment || 1;
                if (futureGroup) futureGroup.style.display = 'none';

                if (btnDelete) btnDelete.classList.remove('hidden');
            }
        } else {
            if (titleEl) titleEl.textContent = 'Nova Conta a Pagar';
            if (btnSave) btnSave.innerHTML = '💾 Salvar Conta';
            if (document.getElementById('billEditId')) document.getElementById('billEditId').value = '';
            if (btnDelete) btnDelete.classList.add('hidden');

            if (recTypeInput) recTypeInput.value = 'single';
            if (instTotalInput) instTotalInput.value = '2';
            if (instCurrentInput) instCurrentInput.value = '1';
            if (futureGroup) futureGroup.style.display = 'flex';
        }

        if (recTypeInput) {
            recTypeInput.dispatchEvent(new Event('change'));
        }

        if (overlay) {
            overlay.classList.add('active');
            overlay.style.display = 'flex';
        }
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('show');
        }
        document.body.classList.add('no-scroll');

        setTimeout(() => {
            const firstInput = document.getElementById('billDescription');
            if (firstInput) firstInput.focus();
        }, 50);
    }

    function closeBillModal() {
        const overlay = document.getElementById('billModalOverlay');
        const modal = document.getElementById('billModal');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.style.display = 'none';
        }
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('show');
        }
        document.body.classList.remove('no-scroll');
        currentEditBillId = null;
    }

    // Ouvinte global para tecla ESC fechar o modal
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('billModalOverlay');
            if (overlay && overlay.classList.contains('active')) {
                closeBillModal();
            }
        }
    });

    // ============================================
    // SALVAR CONTA (INSERT / UPDATE)
    // ============================================
    async function saveBill(event) {
        if (event) event.preventDefault();

        const desc = document.getElementById('billDescription')?.value.trim();
        const rawAmount = parseFloat(document.getElementById('billAmount')?.value);
        const date = document.getElementById('billDate')?.value;
        const categoryId = document.getElementById('billCategory')?.value || null;
        const notes = document.getElementById('billNotes')?.value.trim() || null;
        const paid = document.getElementById('billPaid')?.checked ?? false;
        const editId = document.getElementById('billEditId')?.value || currentEditBillId;

        const recurrenceType = document.getElementById('billRecurrenceType')?.value || 'single';
        let installmentsTotal = 1;
        let installmentCurrent = 1;
        let generateFuture = false;
        let finalAmount = rawAmount;

        if (recurrenceType === 'installments') {
            installmentsTotal = Math.max(2, parseInt(document.getElementById('billInstallmentTotal')?.value, 10) || 2);
            installmentCurrent = Math.max(1, Math.min(installmentsTotal, parseInt(document.getElementById('billInstallmentCurrent')?.value, 10) || 1));
            const mode = document.querySelector('input[name="billAmountMode"]:checked')?.value || 'per_installment';
            if (mode === 'total') {
                finalAmount = parseFloat((rawAmount / installmentsTotal).toFixed(2));
            }
            generateFuture = !editId && (document.getElementById('billGenerateFuture')?.checked ?? false);
        }

        const isRecurring = (recurrenceType === 'monthly' || recurrenceType === 'semiannual');

        if (!desc || isNaN(finalAmount) || finalAmount <= 0 || !date) {
            showToast('Preencha os campos obrigatórios corretamente!', 'warning');
            return;
        }

        const btnSave = document.getElementById('btnSaveBill');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.textContent = 'Salvando...';
        }

        const baseBillPayload = {
            user_id: currentUser.id,
            description: desc,
            amount: finalAmount,
            date: date,
            type: 'expense',
            is_bill: true,
            category_id: categoryId || null,
            notes: notes,
            paid: paid,
            paid_date: paid ? getTodayString() : null,
            recurrence_type: recurrenceType,
            is_recurring: isRecurring,
            installments: recurrenceType === 'installments' ? installmentsTotal : 1,
            current_installment: recurrenceType === 'installments' ? installmentCurrent : 1
        };

        try {
            const genUuid = () => {
                if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                    try { return crypto.randomUUID(); } catch (e) {}
                }
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            };

            if (editId) {
                const idx = allBills.findIndex(b => String(b.id) === String(editId));
                if (idx !== -1) {
                    allBills[idx] = { ...allBills[idx], ...baseBillPayload, id: editId };
                }

                if (window.tonuSync && currentUser?.id) {
                    await window.tonuSync.setCachedBills(currentUser.id, allBills);
                    await window.tonuSync.enqueue('UPDATE_BILL', { id: editId, ...baseBillPayload });
                }

                // Geração automática dos 11 meses seguintes se ativou recorrente mensal na edição
                if (recurrenceType === 'monthly') {
                    const existingChildren = allBills.filter(b => String(b.parent_transaction_id) === String(editId));
                    if (existingChildren.length === 0) {
                        const batch = [];
                        for (let m = 1; m < 12; m++) {
                            const dueDate = window.TonuInstallments ? window.TonuInstallments.addMonthsToDate(date, m) : date;
                            const billId = genUuid();
                            batch.push({
                                ...baseBillPayload,
                                id: billId,
                                parent_transaction_id: editId,
                                description: desc,
                                amount: finalAmount,
                                date: dueDate,
                                installments: 12,
                                current_installment: m + 1,
                                installment_total: 12,
                                installment_number: m + 1,
                                is_recurring: true,
                                recurrence_type: 'monthly',
                                paid: false,
                                paid_date: null
                            });
                        }
                        batch.forEach(item => allBills.push(item));
                        if (window.tonuSync && currentUser?.id) {
                            await window.tonuSync.setCachedBills(currentUser.id, allBills);
                            for (const b of batch) {
                                await window.tonuSync.enqueue('INSERT_BILL', b);
                            }
                        }
                        showToast('Conta atualizada e 11 meses futuros gerados! 🔁', 'success');
                    } else {
                        showToast('Conta atualizada com sucesso! ✅', 'success');
                    }
                } else {
                    showToast('Conta atualizada com sucesso! ✅', 'success');
                }
            } else {

                if (generateFuture && installmentsTotal > installmentCurrent) {
                    // Geração em lote das parcelas futuras
                    const batch = [];
                    const cleanDesc = desc.replace(/\s*\(\d+\/\d+\)$/, '').trim();
                    const parentBillId = genUuid();

                    for (let i = installmentCurrent; i <= installmentsTotal; i++) {
                        const monthOffset = i - installmentCurrent;
                        const dueDate = window.TonuInstallments ? window.TonuInstallments.addMonthsToDate(date, monthOffset) : date;
                        const itemPaid = (i === installmentCurrent) ? paid : false;
                        const billId = (i === installmentCurrent) ? parentBillId : genUuid();

                        batch.push({
                            ...baseBillPayload,
                            id: billId,
                            parent_transaction_id: (i === installmentCurrent ? null : parentBillId),
                            description: `${cleanDesc} (${i}/${installmentsTotal})`,
                            amount: finalAmount,
                            date: dueDate,
                            installments: installmentsTotal,
                            current_installment: i,
                            installment_total: installmentsTotal,
                            installment_number: i,
                            paid: itemPaid,
                            paid_date: itemPaid ? getTodayString() : null
                        });
                    }

                    batch.forEach(item => allBills.push(item));

                    if (window.tonuSync && currentUser?.id) {
                        await window.tonuSync.setCachedBills(currentUser.id, allBills);
                        for (const b of batch) {
                            await window.tonuSync.enqueue('INSERT_BILL', b);
                        }
                    }

                    showToast(`Compra parcelada criada com ${batch.length} parcelas registradas! 📦`, 'success');
                } else if (recurrenceType === 'monthly') {
                    // Geração em lote de 12 parcelas (mês original + 11 seguintes)
                    const batch = [];
                    const parentBillId = genUuid();
                    for (let m = 0; m < 12; m++) {
                        const dueDate = window.TonuInstallments ? window.TonuInstallments.addMonthsToDate(date, m) : date;
                        const itemPaid = (m === 0) ? paid : false;
                        const billId = (m === 0) ? parentBillId : genUuid();

                        batch.push({
                            ...baseBillPayload,
                            id: billId,
                            parent_transaction_id: (m === 0 ? null : parentBillId),
                            description: desc,
                            amount: finalAmount,
                            date: dueDate,
                            installments: 12,
                            current_installment: m + 1,
                            installment_total: 12,
                            installment_number: m + 1,
                            is_recurring: true,
                            recurrence_type: 'monthly',
                            paid: itemPaid,
                            paid_date: itemPaid ? getTodayString() : null
                        });
                    }

                    batch.forEach(item => allBills.push(item));

                    if (window.tonuSync && currentUser?.id) {
                        await window.tonuSync.setCachedBills(currentUser.id, allBills);
                        for (const b of batch) {
                            await window.tonuSync.enqueue('INSERT_BILL', b);
                        }
                    }

                    showToast('Conta recorrente gerada com sucesso para 12 meses! 🔁', 'success');
                } else {
                    const newBill = {
                        ...baseBillPayload,
                        id: genUuid()
                    };

                    allBills.push(newBill);

                    if (window.tonuSync && currentUser?.id) {
                        await window.tonuSync.setCachedBills(currentUser.id, allBills);
                        await window.tonuSync.enqueue('INSERT_BILL', newBill);
                    }

                    showToast('Conta adicionada com sucesso! 🎉', 'success');
                }
            }

            closeBillModal();
            applyFiltersAndRender();
            updateSummaryCards(allBills);

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

        const target = allBills.find(b => String(b.id) === String(targetId));
        let seriesInfo = { fromNow: [], all: [] };
        if (target) {
            if (typeof window.getFullSeriesInfo === 'function') {
                seriesInfo = await window.getFullSeriesInfo(target, allBills, { userId: currentUser?.id });
            } else if (typeof window.findSeriesInfo === 'function') {
                seriesInfo = window.findSeriesInfo(target, allBills);
            } else if (typeof window.findRemainingSeries === 'function') {
                const rem = window.findRemainingSeries(target, allBills);
                seriesInfo = { fromNow: rem, all: rem };
            }
        }

        let deleteMode = 'single';
        if ((seriesInfo.fromNow.length > 0 || seriesInfo.all.length > 0) && typeof window.confirmRecurringDelete === 'function') {
            deleteMode = await window.confirmRecurringDelete({
                countFromNow: seriesInfo.fromNow.length,
                countAll: seriesInfo.all.length,
                itemName: target.description || 'Conta',
                itemType: 'conta'
            });
            if (deleteMode === 'cancel') return;
        } else {
            if (!confirm('Deseja realmente excluir esta conta?')) return;
        }

        try {
            let idsToDelete = [String(targetId)];
            if (deleteMode === 'from_now') {
                idsToDelete = [String(targetId), ...seriesInfo.fromNow.map(r => String(r.id))];
            } else if (deleteMode === 'all_series' || deleteMode === 'all') {
                idsToDelete = [String(targetId), ...seriesInfo.all.map(r => String(r.id))];
            }

            const idSet = new Set(idsToDelete);
            allBills = allBills.filter(b => !idSet.has(String(b.id)));

            if (window.tonuSync && currentUser?.id) {
                try {
                    const cached = await window.tonuSync.getCachedBills(currentUser.id);
                    if (Array.isArray(cached)) {
                        const filteredCached = cached.filter(b => !idSet.has(String(b.id)));
                        await window.tonuSync.setCachedBills(currentUser.id, filteredCached);
                    } else {
                        await window.tonuSync.setCachedBills(currentUser.id, allBills);
                    }
                } catch (_) {}

                for (const delId of idsToDelete) {
                    await window.tonuSync.enqueue('DELETE_BILL', { id: delId });
                }
            }

            if (window.supabaseClient && currentUser?.id && navigator.onLine) {
                try {
                    await window.supabaseClient.from('transactions').delete().in('id', idsToDelete).eq('user_id', currentUser.id);
                } catch (supaErr) {
                    console.warn('Erro ao remover contas do Supabase:', supaErr);
                }
            }

            const msg = idsToDelete.length > 1
                ? `${idsToDelete.length} contas excluídas com sucesso! 🗑️`
                : 'Conta excluída com sucesso! 🗑️';
            showToast(msg, 'info');
            closeBillModal();
            applyFiltersAndRender();
            updateSummaryCards(allBills);

            if (window.checkNotifications) {
                window.checkNotifications();
            }

        } catch (err) {
            console.error('❌ Erro ao excluir conta:', err);
            showToast('Erro ao excluir conta: ' + err.message, 'error');
        }
    }

    // ============================================
    // ITEM 9: SELEÇÃO MÚLTIPLA + SOMA VISUAL (PC)
    // ============================================
    function updateSelectionFooter() {
        const footer = document.getElementById('billsSelectionFooter');
        const countText = document.getElementById('selectedBillsCountText');
        const totalText = document.getElementById('selectedBillsTotalText');
        if (!footer) return;

        if (!isSelectionMode) {
            footer.style.display = 'none';
            return;
        }

        footer.style.display = 'flex';
        const count = selectedBillIds.size;
        let sum = 0;
        allBills.forEach(b => {
            if (selectedBillIds.has(String(b.id))) {
                sum += Number(b.amount) || 0;
            }
        });

        if (countText) countText.textContent = `${count} selecionada(s)`;
        if (totalText) totalText.textContent = formatCurrency(sum);
    }

    function toggleBillSelectionMode() {
        isSelectionMode = !isSelectionMode;
        const btn = document.getElementById('btnToggleSelectBills');
        const label = document.getElementById('btnSelectLabel');

        if (isSelectionMode) {
            if (btn) btn.classList.add('active');
            if (label) label.textContent = 'Cancelar';
            updateSelectionFooter();
        } else {
            cancelBillSelection();
            return;
        }
        applyFiltersAndRender();
    }

    function cancelBillSelection() {
        isSelectionMode = false;
        selectedBillIds.clear();
        const btn = document.getElementById('btnToggleSelectBills');
        const label = document.getElementById('btnSelectLabel');
        if (btn) btn.classList.remove('active');
        if (label) label.textContent = 'Selecionar';

        const footer = document.getElementById('billsSelectionFooter');
        if (footer) footer.style.display = 'none';

        applyFiltersAndRender();
    }

    function toggleSelectBill(id, checked) {
        if (checked) {
            selectedBillIds.add(String(id));
        } else {
            selectedBillIds.delete(String(id));
        }
        updateSelectionFooter();

        const card = document.getElementById(`bill_item_${id}`);
        if (card) {
            if (checked) card.classList.add('selected');
            else card.classList.remove('selected');
        }
    }

    // ============================================
    // ANTECIPAÇÃO / QUITAÇÃO DE PARCELAS
    // ============================================
    async function openAnticipationModal(billId) {
        const target = allBills.find(b => String(b.id) === String(billId));
        if (!target) return;

        let series = [target];
        try {
            if (typeof window.getFullSeriesInfo === 'function') {
                const info = await window.getFullSeriesInfo(target, allBills, { userId: currentUser?.id });
                if (info && (info.all?.length > 0 || info.fromNow?.length > 0)) {
                    series = [info.target, ...(info.all || [])].filter(Boolean);
                }
            }
        } catch (e) {
            console.warn('Erro ao consultar getFullSeriesInfo:', e);
        }

        // Se ainda tem apenas o target (ex: meses futuros não carregados na tela atual), busca no IndexedDB local completo
        if (series.length <= 1 && window.tonuSync && currentUser?.id) {
            try {
                const allCached = await window.tonuSync.getCachedBills(currentUser.id);
                if (Array.isArray(allCached) && allCached.length > 0) {
                    const cleanDesc = String(target.description || '').replace(/\s*\(\d+\/\d+\)$/, '').trim().toLowerCase();
                    const pId = target.parent_transaction_id ? String(target.parent_transaction_id) : String(target.id);
                    const matched = allCached.filter(b => {
                        if (!b) return false;
                        if (String(b.id) === String(target.id)) return true;
                        if (b.parent_transaction_id && (String(b.parent_transaction_id) === pId || String(b.id) === pId)) return true;
                        if (target.parent_transaction_id && String(b.parent_transaction_id) === String(target.parent_transaction_id)) return true;
                        const bDesc = String(b.description || '').replace(/\s*\(\d+\/\d+\)$/, '').trim().toLowerCase();
                        return cleanDesc && bDesc === cleanDesc;
                    });
                    if (matched.length > 1) {
                        series = matched;
                    }
                }
            } catch (_) {}
        }

        // Garante que APENAS parcelas desta conta estão na lista enviada ao modal (isolamento estrito)
        const cleanTargetDesc = String(target.description || '').replace(/\s*\(\d+\/\d+\)$/, '').trim().toLowerCase();
        const targetPId = target.parent_transaction_id ? String(target.parent_transaction_id) : String(target.id);
        const filteredSeries = series.filter(b => {
            if (!b) return false;
            const bId = String(b.id);
            if (bId === String(target.id)) return true;

            const bPId = b.parent_transaction_id ? String(b.parent_transaction_id) : null;
            if (targetPId) {
                if (bId === targetPId) return true;
                if (bPId) return bPId === targetPId;
            }

            const bDesc = String(b.description || '').replace(/\s*\(\d+\/\d+\)$/, '').trim().toLowerCase();
            return cleanTargetDesc && bDesc === cleanTargetDesc && !bPId;
        });

        const modalFn = window.getAnticipationModal || window.showAnticipationModal;
        if (typeof modalFn === 'function') {
            modalFn({
                target: target,
                allSeries: filteredSeries.length > 0 ? filteredSeries : [target],
                onConfirm: async function (selectedBills, typedAmount, paymentDate) {
                    await processAnticipation(target, selectedBills, typedAmount, paymentDate);
                }
            });
        }
    }

    async function processAnticipation(target, selectedBills, typedAmount, paymentDate) {
        // Guarda obrigatória
        if (!typedAmount || typedAmount <= 0) {
            showToast('❌ Informe o valor pago para quitar as parcelas.', 'error');
            return;
        }

        const today = paymentDate || getTodayString();
        const selectedIds = selectedBills.map(b => String(b.id));
        const idSet = new Set(selectedIds);

        // 1. Marca as parcelas como pagas mantendo datas de vencimento e amount original intactos
        allBills.forEach(b => {
            if (idSet.has(String(b.id))) {
                b.paid = true;
                b.paid_date = today;
                if (!b.amount_paid) b.amount_paid = b.amount;
            }
        });

        // 2. Cria 1 única transação de extrato com amount = typedAmount e is_anticipation = true
        const createFn = window.createAnticipationTransaction || window.createAnticipationPayload;
        const txPayload = typeof createFn === 'function'
            ? createFn(target, selectedBills, typedAmount, today)
            : {
                id: genUuid(),
                user_id: target.user_id,
                description: `Antecipação: ${(target.description || 'Conta').replace(/\s*\(\d+\/\d+\)$/, '').trim()}`,
                amount: typedAmount,
                date: today,
                due_date: today,
                type: 'expense',
                category_id: target.category_id || null,
                is_bill: false,
                paid: true,
                paid_date: today,
                parent_transaction_id: String(target.parent_transaction_id || target.id),
                is_anticipation: true
            };

        // 3. Atualiza cache local IndexedDB e enfileira
        if (window.tonuSync && currentUser?.id) {
            try {
                const cached = await window.tonuSync.getCachedBills(currentUser.id);
                if (Array.isArray(cached)) {
                    cached.forEach(b => {
                        if (idSet.has(String(b.id))) {
                            b.paid = true;
                            b.paid_date = today;
                            if (!b.amount_paid) b.amount_paid = b.amount;
                        }
                    });
                    await window.tonuSync.setCachedBills(currentUser.id, cached);
                } else {
                    await window.tonuSync.setCachedBills(currentUser.id, allBills);
                }
            } catch (_) {}

            for (const bId of selectedIds) {
                const matchingBill = selectedBills.find(b => String(b.id) === String(bId));
                await window.tonuSync.enqueue('UPDATE_BILL', { id: bId, paid: true, paid_date: today, amount_paid: matchingBill?.amount });
            }
            await window.tonuSync.enqueue('INSERT_TRANSACTION', txPayload);
        }

        // 4. Grava no Supabase
        if (window.supabaseClient && currentUser?.id && navigator.onLine) {
            try {
                await window.supabaseClient.from('transactions').update({ paid: true, paid_date: today }).in('id', selectedIds).eq('user_id', currentUser.id);
                await window.supabaseClient.from('transactions').insert(txPayload);
            } catch (err) {
                console.warn('Erro ao salvar antecipação no Supabase:', err);
            }
        }

        showToast(`✅ ${selectedBills.length} parcela(s) quitada(s) por ${formatCurrency(typedAmount)}!`, 'success');
        applyFiltersAndRender();
        updateSummaryCards(allBills);
    }

    // Exportação global de funções
    window.openBillModal = openBillModal;
    window.closeBillModal = closeBillModal;
    window.saveBill = saveBill;
    window.deleteBill = deleteBill;
    window.toggleBillPaid = toggleBillPaid;
    window.changeMonth = changeMonth;
    window.goToCurrentMonth = goToCurrentMonth;
    window.changeMonthHandler = changeMonth;
    window.goToCurrentMonthHandler = goToCurrentMonth;
    window.loadBills = loadBills;
    window.toggleBillSelectionMode = toggleBillSelectionMode;
    window.cancelBillSelection = cancelBillSelection;
    window.toggleSelectBill = toggleSelectBill;
    window.openAnticipationModal = openAnticipationModal;

})();
