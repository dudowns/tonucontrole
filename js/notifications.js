// ============================================
// TONUCONTROLE - NOTIFICATIONS & ALERTS MANAGER
// ============================================

(function () {
    'use strict';

    let notifications = [];
    let isDropdownOpen = false;

    // Helper: format currency
    function formatCurrency(val) {
        const n = Number(val) || 0;
        try {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
        } catch {
            return 'R$ ' + n.toFixed(2);
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

            // Sync status notification if offline queue has items
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

    function renderNotificationList() {
        const container = document.getElementById('notifListContainer');
        if (!container) return;

        if (notifications.length === 0) {
            container.innerHTML = '<p class="notif-empty" style="padding:16px;text-align:center;color:var(--color-text-muted,#94a3b8);">Nenhuma notificação nova.</p>';
            return;
        }

        container.innerHTML = notifications.map(n => `
            <div class="notif-item notif-${n.type || 'info'}" onclick="window.location.href='${n.link || '#'}'">
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

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(checkNotifications, 1000);
    });

    console.log('🔔 Notifications.js carregado');
})();
