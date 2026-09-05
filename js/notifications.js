// ============================================
// TONUCONTROLE - NOTIFICATIONS & ALERTS MANAGER
// ============================================

(function () {
    'use strict';

    let notifications = [];
    let isDropdownOpen = false;

    // Helper: format currency
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
        const n = Number(val) || 0;
        try {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\u00A0/g, ' ');
        } catch {
            const isNegative = n < 0;
            const parts = Math.abs(n).toFixed(2).split('.');
            const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            const res = 'R$ ' + intPart + ',' + parts[1];
            return isNegative ? '-' + res : res;
        }
    }

    // Helper: create or get dropdown container
    function getNotificationDropdown() {
        let dropdown = document.getElementById('notifDropdownMenu');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'notifDropdownMenu';
            dropdown.className = 'notif-dropdown hidden';
            dropdown.innerHTML = `
                <div class="notif-header">
                    <h4>🔔 Notificações & Lembretes</h4>
                    <button class="notif-clear-btn" onclick="window.clearAllNotifications()">Limpar</button>
                </div>
                <div class="notif-list" id="notifListContainer">
                    <p class="notif-empty">Nenhuma notificação no momento.</p>
                </div>
            `;
            document.body.appendChild(dropdown);
        }
        return dropdown;
    }

    // Check system notifications (due bills, budget overruns, goals)
    async function checkNotifications() {
        notifications = [];
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        try {
            // 1. Check offline/online bills if available
            let bills = [];
            const user = (window.supabaseOffline ? await window.supabaseOffline.isAuthenticated() : null) ||
                         (window.supabaseClient?.auth?.getUser ? (await window.supabaseClient.auth.getUser())?.data?.user : null);

            if (user && window.supabaseClient) {
                try {
                    const { data } = await window.supabaseClient
                        .from('transactions')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('type', 'expense')
                        .eq('is_bill', true)
                        .eq('paid', false);
                    if (data) bills = data;
                } catch (e) {
                    // fallback to localStorage bills
                    const localBills = localStorage.getItem('tonu_bills_' + user.id);
                    if (localBills) {
                        try { bills = JSON.parse(localBills).filter(b => !b.paid); } catch {}
                    }
                }
            }

            // Evaluate bills
            let overdueCount = 0;
            let dueSoonCount = 0;

            bills.forEach(bill => {
                const billDate = bill.date || bill.due_date;
                const billTitle = bill.description || bill.name || 'Conta';
                if (billDate) {
                    if (billDate < todayStr) {
                        overdueCount++;
                        notifications.push({
                            id: 'bill_overdue_' + (bill.id || Math.random()),
                            type: 'danger',
                            icon: 'fa-exclamation-circle',
                            title: `Conta em atraso: ${billTitle}`,
                            message: `Venceu em ${formatDate(billDate)} no valor de ${formatCurrency(bill.amount)}`,
                            link: 'bills.html'
                        });
                    } else {
                        const dueTime = new Date(billDate + 'T00:00:00').getTime();
                        const diffDays = Math.round((dueTime - today.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays <= 3 && diffDays >= 0) {
                            dueSoonCount++;
                            notifications.push({
                                id: 'bill_due_' + (bill.id || Math.random()),
                                type: 'warning',
                                icon: 'fa-clock',
                                title: `Vence em breve: ${billTitle}`,
                                message: `Vence em ${diffDays === 0 ? 'hoje' : diffDays + ' dia(s)'} (${formatDate(billDate)})`,
                                link: 'bills.html'
                            });
                        }
                    }
                }
            });

            // Update warning banner on dashboard if present
            const banner = document.getElementById('dueBillsWarningBanner');
            if (banner) {
                if (overdueCount > 0) {
                    banner.style.display = 'flex';
                    const titleEl = document.getElementById('dueBannerTitle');
                    const descEl = document.getElementById('dueBannerDesc');
                    if (titleEl) titleEl.textContent = `⚠️ Atenção: Você tem ${overdueCount} conta(s) em atraso!`;
                    if (descEl) descEl.textContent = 'Acesse a lista e efetue o pagamento para manter suas contas em dia.';
                } else if (dueSoonCount > 0) {
                    banner.style.display = 'flex';
                    const titleEl = document.getElementById('dueBannerTitle');
                    const descEl = document.getElementById('dueBannerDesc');
                    if (titleEl) titleEl.textContent = `⏰ Lembrete: Você tem ${dueSoonCount} conta(s) a vencer nos próximos dias.`;
                    if (descEl) descEl.textContent = 'Evite juros e atrasos organizando seus pagamentos com antecedência.';
                } else {
                    banner.style.display = 'none';
                }
            }

            // 2. Check Category Budget Limits & Overruns
            if (window.TonuBudget && user) {
                try {
                    let txs = [];
                    let cats = [];

                    if (window.supabaseClient) {
                        try {
                            const [tRes, cRes] = await Promise.all([
                                window.supabaseClient.from('transactions').select('*').eq('user_id', user.id),
                                window.supabaseClient.from('categories').select('*').eq('user_id', user.id)
                            ]);
                            txs = tRes.data || [];
                            cats = cRes.data || [];
                        } catch (e) {
                            console.warn('Fallback para cache local ao verificar limites:', e);
                        }
                    }

                    if (txs.length === 0) {
                        try {
                            const localTx = localStorage.getItem('tonu_transactions_' + user.id);
                            if (localTx) txs = JSON.parse(localTx);
                        } catch (e) {}
                    }

                    if (cats.length === 0) {
                        try {
                            const localCats = localStorage.getItem('tonu_categories_' + user.id);
                            if (localCats) cats = JSON.parse(localCats);
                        } catch (e) {}
                    }

                    const budgetProgress = window.TonuBudget.calculateCategoryProgress(user.id, txs, cats);
                    const exceededList = budgetProgress.filter(p => p.isExceeded);
                    const warningList = budgetProgress.filter(p => p.isWarning);

                    exceededList.forEach(p => {
                        notifications.push({
                            id: 'budget_exceeded_' + p.categoryId,
                            type: 'danger',
                            icon: 'fa-exclamation-triangle',
                            title: `🚨 Limite Ultrapassado: ${p.name}`,
                            message: `Você gastou ${formatCurrency(p.spent)} do teto de ${formatCurrency(p.limit)} (${p.percentage.toFixed(0)}%). Excedeu em ${formatCurrency(p.spent - p.limit)}!`,
                            action: 'openBudgetModal',
                            link: '#'
                        });
                    });

                    warningList.forEach(p => {
                        notifications.push({
                            id: 'budget_warning_' + p.categoryId,
                            type: 'warning',
                            icon: 'fa-clock',
                            title: `⚠️ Perto do Limite: ${p.name}`,
                            message: `Você já utilizou ${p.percentage.toFixed(0)}% do teto (${formatCurrency(p.spent)} de ${formatCurrency(p.limit)}). Restam apenas ${formatCurrency(p.remaining)}.`,
                            action: 'openBudgetModal',
                            link: '#'
                        });
                    });

                    // Update dashboard budget banner if present
                    const budgetBanner = document.getElementById('budgetWarningBanner');
                    if (budgetBanner) {
                        if (exceededList.length > 0) {
                            budgetBanner.style.display = 'flex';
                            budgetBanner.className = 'due-bills-banner'; // danger red
                            const titleEl = document.getElementById('budgetBannerTitle');
                            const descEl = document.getElementById('budgetBannerDesc');
                            const catNames = exceededList.map(p => p.name).join(', ');
                            if (titleEl) titleEl.textContent = `🚨 Atenção aos Gastos: Limite estourado em ${exceededList.length} categoria(s)!`;
                            if (descEl) descEl.textContent = `Você ultrapassou o teto estipulado em: ${catNames}. Clique para gerenciar seus limites.`;
                        } else if (warningList.length > 0) {
                            budgetBanner.style.display = 'flex';
                            budgetBanner.className = 'due-bills-banner warning'; // warning yellow
                            const titleEl = document.getElementById('budgetBannerTitle');
                            const descEl = document.getElementById('budgetBannerDesc');
                            const catNames = warningList.map(p => p.name).join(', ');
                            if (titleEl) titleEl.textContent = `⚠️ Lembrete de Teto: Chegando perto do limite em ${warningList.length} categoria(s)!`;
                            if (descEl) descEl.textContent = `Você já atingiu a margem de alerta em: ${catNames}. Fique de olho no seu consumo.`;
                        } else {
                            budgetBanner.style.display = 'none';
                        }
                    }
                } catch (bErr) {
                    console.warn('⚠️ Erro ao avaliar limites de orçamento:', bErr);
                }
            }

            // 3. Sync status notification if offline queue has items
            if (window.tonuSync && window.tonuSync.db) {
                try {
                    const queue = await window.tonuSync.getQueue?.();
                    if (queue && queue.length > 0) {
                        notifications.push({
                            id: 'sync_queue',
                            type: 'info',
                            icon: 'fa-sync',
                            title: 'Sincronização pendente',
                            message: `Há ${queue.length} alteração(ões) offline aguardando sincronização.`,
                            link: '#'
                        });
                    }
                } catch {}
            }

        } catch (err) {
            console.warn('⚠️ Erro ao checar notificações:', err);
        }

        updateNotificationBadge();
        renderNotificationList();
    }

    function updateNotificationBadge() {
        const badge = document.getElementById('notifBadgeCount');
        if (!badge) return;

        if (notifications.length > 0) {
            badge.textContent = notifications.length > 99 ? '99+' : String(notifications.length);
            badge.classList.remove('hidden');
        } else {
            badge.textContent = '0';
            badge.classList.add('hidden');
        }
    }

    function handleNotificationClick(id) {
        const notif = notifications.find(n => n.id === id);
        const dropdown = getNotificationDropdown();
        if (dropdown) {
            dropdown.classList.add('hidden');
            isDropdownOpen = false;
        }
        if (notif) {
            if (notif.action === 'openBudgetModal') {
                if (window.TonuBudget && typeof window.TonuBudget.openBudgetModal === 'function') {
                    window.TonuBudget.openBudgetModal();
                    return;
                }
            }
            if (notif.link && notif.link !== '#') {
                window.location.href = notif.link;
            }
        }
    }

    function renderNotificationList() {
        const container = document.getElementById('notifListContainer');
        if (!container) return;

        if (notifications.length === 0) {
            container.innerHTML = '<p class="notif-empty" style="padding:16px;text-align:center;color:var(--color-text-muted,#94a3b8);">Nenhuma notificação nova.</p>';
            return;
        }

        container.innerHTML = notifications.map(n => `
            <div class="notif-item notif-${n.type || 'info'}" onclick="window.handleNotificationClick('${n.id}')" style="cursor:pointer;">
                <div class="notif-icon-box"><i class="fas ${n.icon || 'fa-info-circle'}"></i></div>
                <div class="notif-details">
                    <strong class="notif-title">${n.title}</strong>
                    <p class="notif-desc">${n.message}</p>
                </div>
            </div>
        `).join('');
    }

    function toggleNotificationDropdown(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        const dropdown = getNotificationDropdown();
        const bellBtn = document.getElementById('notifBellBtn');

        if (isDropdownOpen) {
            dropdown.classList.add('hidden');
            isDropdownOpen = false;
        } else {
            if (bellBtn) {
                const rect = bellBtn.getBoundingClientRect();
                dropdown.style.position = 'fixed';
                dropdown.style.top = (rect.bottom + 8) + 'px';
                dropdown.style.right = Math.max(16, window.innerWidth - rect.right) + 'px';
            }
            renderNotificationList();
            dropdown.classList.remove('hidden');
            isDropdownOpen = true;
        }
    }

    function clearAllNotifications() {
        notifications = [];
        updateNotificationBadge();
        renderNotificationList();
        const banner = document.getElementById('dueBillsWarningBanner');
        if (banner) banner.style.display = 'none';
        if (window.showToast) window.showToast('Notificações limpas', 'info');
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (isDropdownOpen) {
            const dropdown = document.getElementById('notifDropdownMenu');
            const bellBtn = document.getElementById('notifBellBtn');
            if (dropdown && !dropdown.contains(e.target) && (!bellBtn || !bellBtn.contains(e.target))) {
                dropdown.classList.add('hidden');
                isDropdownOpen = false;
            }
        }
    });

    // Exports
    window.toggleNotificationDropdown = toggleNotificationDropdown;
    window.checkNotifications = checkNotifications;
    window.updateNotificationBadge = updateNotificationBadge;
    window.clearAllNotifications = clearAllNotifications;
    window.handleNotificationClick = handleNotificationClick;

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(checkNotifications, 1000);
    });

    console.log('🔔 Notifications.js carregado');
})();
