// ============================================
// TONUCONTROLE - NOTIFICATIONS & ALERTS MANAGER (PREMIUM)
// ============================================

(function () {
    'use strict';

    let notifications = [];
    let isDropdownOpen = false;
    let activeFilter = 'all'; // 'all' | 'unread'

    // Armazenamento de notificações dispensadas pelo usuário
    const DISMISSED_STORAGE_KEY = 'tonu_dismissed_notifications';
    const READ_STORAGE_KEY = 'tonu_read_notifications';

    function getDismissedIds() {
        try {
            const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function saveDismissedId(id) {
        try {
            const map = getDismissedIds();
            map[id] = Date.now();
            localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(map));
        } catch {}
    }

    function getReadIds() {
        try {
            const raw = localStorage.getItem(READ_STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function markAsRead(id) {
        try {
            const map = getReadIds();
            map[id] = Date.now();
            localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(map));
            updateNotificationBadge();
            renderNotificationList();
        } catch {}
    }

    // Helper: format currency safely
    function formatCurrency(val) {
        if (typeof window.formatCurrency === 'function' && window.formatCurrency !== formatCurrency) {
            try { return window.formatCurrency(val); } catch {}
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

    // Helper: format date safely
    function formatDate(val) {
        if (!val) return '';
        if (typeof window.formatDate === 'function' && window.formatDate !== formatDate) {
            try { return window.formatDate(val); } catch {}
        }
        try {
            const s = String(val).split('T')[0];
            const parts = s.split('-');
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            const d = new Date(val);
            return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('pt-BR');
        } catch {
            return String(val);
        }
    }

    // Web Audio API Synthesizer Chime
    function playChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;
            // Dual-tone chime agradável (587.33Hz D5 -> 880Hz A5)
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);

            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(880, now + 0.1);

            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now + 0.08);
            osc1.stop(now + 0.5);
            osc2.stop(now + 0.5);
        } catch (e) {
            console.warn('Áudio não suportado ou bloqueado pelo navegador:', e);
        }
    }

    // Helper: create or get backdrop
    function getNotificationBackdrop() {
        let backdrop = document.getElementById('notifBackdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'notifBackdrop';
            backdrop.className = 'notif-backdrop';
            backdrop.style.position = 'fixed';
            backdrop.style.inset = '0';
            backdrop.style.zIndex = '99990';
            backdrop.style.display = 'none';
            backdrop.addEventListener('click', () => {
                closeNotificationDropdown();
            });
            document.body.appendChild(backdrop);
        }
        return backdrop;
    }

    // Helper: create or get dropdown container
    function getNotificationDropdown() {
        let dropdown = document.getElementById('notifDropdownMenu');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'notifDropdownMenu';
            dropdown.className = 'notif-dropdown';
            dropdown.style.zIndex = '999999';
            dropdown.innerHTML = `
                <div class="notif-header">
                    <div class="notif-header-title">
                        <i class="fas fa-bell"></i>
                        <span>Central de Notificações</span>
                    </div>
                    <div class="notif-header-actions">
                        <button class="notif-header-btn" type="button" onclick="window.clearAllNotifications()" title="Limpar e dispensar notificações">
                            <i class="fas fa-check-double"></i> Limpar todas
                        </button>
                        <button class="notif-header-btn close-btn" type="button" onclick="window.closeNotificationDropdown()" title="Fechar">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="notif-sub-tabs">
                    <button type="button" class="notif-sub-tab active" id="notifTabAll" onclick="window.setNotificationFilter('all')">
                        Todas (<span id="notifCountAll">0</span>)
                    </button>
                    <button type="button" class="notif-sub-tab" id="notifTabUnread" onclick="window.setNotificationFilter('unread')">
                        Não lidas (<span id="notifCountUnread">0</span>)
                    </button>
                </div>
                <div class="notif-body" id="notifListContainer">
                    <div class="notif-empty">
                        <i class="fas fa-bell-slash notif-empty-icon"></i>
                        <p>Nenhuma notificação no momento.</p>
                        <small>Você está em dia com seus pagamentos e metas!</small>
                    </div>
                </div>
                <div class="notif-footer">
                    <a href="bills.html"><i class="fas fa-calendar-alt"></i> Ver contas</a>
                    <a href="settings.html" onclick="try{localStorage.setItem('tonu_settings_active_tab','notifications');}catch(e){}"><i class="fas fa-cog"></i> Configurar</a>
                </div>
            `;
            document.body.appendChild(dropdown);
        }
        return dropdown;
    }

    // Open Dropdown
    function openNotificationDropdown(triggerEl) {
        const dropdown = getNotificationDropdown();
        const backdrop = getNotificationBackdrop();

        const bellBtn = triggerEl || document.getElementById('notifBellBtn') || document.querySelector('.notif-bell-btn');

        if (bellBtn) {
            const rect = bellBtn.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.top = Math.max(10, rect.bottom + 8) + 'px';
            const rightPos = Math.max(12, window.innerWidth - rect.right);
            dropdown.style.right = rightPos + 'px';
            dropdown.style.left = 'auto';
        } else {
            dropdown.style.position = 'fixed';
            dropdown.style.top = '60px';
            dropdown.style.right = '20px';
            dropdown.style.left = 'auto';
        }

        renderNotificationList();

        dropdown.classList.remove('hidden');
        dropdown.classList.add('show');
        dropdown.style.display = 'flex';
        dropdown.style.opacity = '1';
        dropdown.style.visibility = 'visible';
        dropdown.style.pointerEvents = 'auto';
        dropdown.style.transform = 'translateY(0) scale(1)';

        backdrop.classList.add('show');
        backdrop.style.display = 'block';

        isDropdownOpen = true;
    }

    // Close Dropdown
    function closeNotificationDropdown() {
        const dropdown = document.getElementById('notifDropdownMenu');
        const backdrop = document.getElementById('notifBackdrop');

        if (dropdown) {
            dropdown.classList.remove('show');
            dropdown.classList.add('hidden');
            dropdown.style.display = 'none';
            dropdown.style.opacity = '0';
            dropdown.style.visibility = 'hidden';
            dropdown.style.pointerEvents = 'none';
            dropdown.style.transform = 'translateY(-8px) scale(0.98)';
        }

        if (backdrop) {
            backdrop.classList.remove('show');
            backdrop.style.display = 'none';
        }

        isDropdownOpen = false;
    }

    // Toggle Dropdown
    function toggleNotificationDropdown(event) {
        if (event) {
            event.stopPropagation();
            if (typeof event.preventDefault === 'function') {
                event.preventDefault();
            }
        }

        const trigger = (event && event.currentTarget) || (event && event.target && event.target.closest('#notifBellBtn, .notif-bell-btn')) || null;

        if (isDropdownOpen) {
            closeNotificationDropdown();
        } else {
            openNotificationDropdown(trigger);
        }
    }

    // Filter selector
    function setNotificationFilter(filter) {
        activeFilter = filter;
        const btnAll = document.getElementById('notifTabAll');
        const btnUnread = document.getElementById('notifTabUnread');
        if (btnAll && btnUnread) {
            if (filter === 'all') {
                btnAll.classList.add('active');
                btnUnread.classList.remove('active');
            } else {
                btnAll.classList.remove('active');
                btnUnread.classList.add('active');
            }
        }
        renderNotificationList();
    }

    // Update Topbar Badge
    function updateNotificationBadge() {
        const badges = document.querySelectorAll('#notifBadgeCount, .notif-badge');
        if (!badges.length) return;

        const readIds = getReadIds();
        const unreadCount = notifications.filter(n => !readIds[n.id]).length;

        badges.forEach(badge => {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                badge.classList.remove('hidden');
                badge.style.display = 'flex';
                badge.classList.add('has-unread');
            } else {
                badge.textContent = '0';
                badge.classList.add('hidden');
                badge.style.display = 'none';
                badge.classList.remove('has-unread');
            }
        });

        const cntAllEl = document.getElementById('notifCountAll');
        const cntUnreadEl = document.getElementById('notifCountUnread');
        if (cntAllEl) cntAllEl.textContent = String(notifications.length);
        if (cntUnreadEl) cntUnreadEl.textContent = String(unreadCount);
    }

    // Dismiss a single notification permanently
    function dismissNotification(id) {
        saveDismissedId(id);
        notifications = notifications.filter(n => n.id !== id);
        updateNotificationBadge();
        renderNotificationList();

        if (window.showToast) {
            window.showToast('Notificação dispensada', 'info');
        }
    }

    // Handle Click on Individual Notification
    function handleNotificationClick(id) {
        const notif = notifications.find(n => n.id === id);
        markAsRead(id);
        closeNotificationDropdown();

        if (notif) {
            if (notif.action === 'openBudgetModal') {
                window.location.href = 'settings.html';
                try { localStorage.setItem('tonu_settings_active_tab', 'budgets'); } catch {}
                return;
            }
            if (notif.link && notif.link !== '#') {
                window.location.href = notif.link;
            }
        }
    }

    // Render Notification Items inside Dropdown
    function renderNotificationList() {
        const container = document.getElementById('notifListContainer');
        if (!container) return;

        const readIds = getReadIds();
        let itemsToShow = notifications;
        if (activeFilter === 'unread') {
            itemsToShow = notifications.filter(n => !readIds[n.id]);
        }

        if (!itemsToShow || itemsToShow.length === 0) {
            container.innerHTML = `
                <div class="notif-empty">
                    <i class="fas fa-bell-slash notif-empty-icon"></i>
                    <p>${activeFilter === 'unread' ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação no momento.'}</p>
                    <small>Você está em dia com seus pagamentos e metas!</small>
                </div>
            `;
            return;
        }

        container.innerHTML = itemsToShow.map(n => {
            const isRead = !!readIds[n.id];
            const badgeClass = n.type === 'danger' ? 'overdue' : (n.type === 'warning' ? 'due-today' : 'due-soon');
            const iconBg = n.type === 'danger' ? '#FF7675' : (n.type === 'warning' ? '#FDCB6E' : '#6C5CE7');
            const tagLabel = n.tag || (n.type === 'danger' ? 'Atrasada' : (n.type === 'warning' ? 'Atenção' : 'Aviso'));

            return `
                <div class="notif-item ${badgeClass} ${isRead ? 'read' : 'unread'}" onclick="window.handleNotificationClick('${n.id}')">
                    <div class="notif-icon-box" style="background:${iconBg};">
                        <i class="fas ${n.icon || 'fa-info-circle'}"></i>
                    </div>
                    <div class="notif-item-content">
                        <div class="notif-item-header-row">
                            <span class="notif-tag notif-tag-${n.type}">${tagLabel}</span>
                            <div class="notif-item-actions">
                                <button type="button" class="notif-dismiss-btn" onclick="event.stopPropagation(); window.dismissNotification('${n.id}')" title="Dispensar notificação">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="notif-item-title">
                            <span>${n.title}</span>
                        </div>
                        <div class="notif-item-desc">
                            <span>${n.message}</span>
                        </div>
                        ${n.actionBtnText ? `
                            <div class="notif-item-footer-action">
                                <span class="notif-action-pill">${n.actionBtnText} <i class="fas fa-arrow-right"></i></span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    // ============================================
    // TOAST / BANNER FLUTUANTE PREMIUM (POP-IN)
    // ============================================
    function showPremiumNotificationBanner(notif) {
        if (!notif) return;

        // Verifica se já existe um banner ativo
        let banner = document.getElementById('tonuFloatingAlertBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'tonuFloatingAlertBanner';
            banner.className = 'floating-alert-banner';
            document.body.appendChild(banner);
        }

        const isDanger = notif.type === 'danger';
        const isWarning = notif.type === 'warning';
        const color = isDanger ? '#FF7675' : (isWarning ? '#FDCB6E' : '#6C5CE7');

        banner.innerHTML = `
            <div class="floating-alert-inner ${notif.type}">
                <div class="floating-alert-icon" style="background:${color};">
                    <i class="fas ${notif.icon || 'fa-bell'}"></i>
                </div>
                <div class="floating-alert-body">
                    <strong>${notif.title}</strong>
                    <p>${notif.message}</p>
                </div>
                <div class="floating-alert-actions">
                    ${notif.link && notif.link !== '#' ? `
                        <button class="btn btn-sm btn-primary" onclick="window.location.href='${notif.link}'">
                            Ver
                        </button>
                    ` : ''}
                    <button class="floating-alert-close" onclick="document.getElementById('tonuFloatingAlertBanner').classList.remove('show')" title="Fechar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;

        banner.classList.add('show');

        // Auto dispensar após 7 segundos
        clearTimeout(banner._timeout);
        banner._timeout = setTimeout(() => {
            banner.classList.remove('show');
        }, 7000);
    }

    // Check system notifications (due bills, budget overruns, goals)
    async function checkNotifications() {
        notifications = [];
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const dismissed = getDismissedIds();

        try {
            // 1. Check offline/online bills
            let bills = [];
            let user = null;

            try {
                if (window.supabaseOffline) {
                    user = await window.supabaseOffline.isAuthenticated();
                }
                if (!user && window.supabaseClient?.auth?.getUser) {
                    user = (await window.supabaseClient.auth.getUser())?.data?.user;
                }
                if (!user && window.currentUser) {
                    user = window.currentUser;
                }
            } catch {}

            const userId = user?.id || 'offline_user';

            if (user && window.supabaseClient) {
                try {
                    const { data } = await window.supabaseClient
                        .from('transactions')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('type', 'expense')
                        .eq('is_bill', true)
                        .eq('paid', false);
                    if (data && data.length > 0) bills = data;
                } catch (e) {
                    console.warn('Fallback para bills locais:', e);
                }
            }

            if (bills.length === 0) {
                const localBills = localStorage.getItem('tonu_bills_' + userId) || localStorage.getItem('tonu_bills_offline_user');
                if (localBills) {
                    try { bills = JSON.parse(localBills).filter(b => !b.paid); } catch {}
                }
            }

            // Also check transactions marked as bills in local storage
            if (bills.length === 0) {
                const localTx = localStorage.getItem('tonu_transactions_' + userId) || localStorage.getItem('tonu_transactions_offline_user');
                if (localTx) {
                    try {
                        const parsed = JSON.parse(localTx);
                        bills = parsed.filter(t => (t.is_bill || t.isBill) && !t.paid && (t.type === 'expense' || t.amount < 0));
                    } catch {}
                }
            }

            // Evaluate bills
            let overdueCount = 0;
            let dueSoonCount = 0;
            let firstUrgentNotif = null;

            bills.forEach(bill => {
                const billDate = bill.date || bill.due_date;
                const billTitle = bill.description || bill.name || 'Conta a Pagar';
                if (billDate) {
                    const billId = bill.id || String(billDate) + '_' + String(bill.amount);
                    if (billDate < todayStr) {
                        overdueCount++;
                        const notifId = 'bill_overdue_' + billId;
                        if (!dismissed[notifId]) {
                            const item = {
                                id: notifId,
                                type: 'danger',
                                tag: 'Atrasada',
                                icon: 'fa-exclamation-circle',
                                title: `Conta em atraso: ${billTitle}`,
                                message: `Venceu em ${formatDate(billDate)} no valor de ${formatCurrency(Math.abs(bill.amount))}`,
                                link: 'bills.html',
                                actionBtnText: 'Efetuar Pagamento'
                            };
                            notifications.push(item);
                            if (!firstUrgentNotif) firstUrgentNotif = item;
                        }
                    } else {
                        const dueTime = new Date(billDate + 'T00:00:00').getTime();
                        const diffDays = Math.round((dueTime - today.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays <= 3 && diffDays >= 0) {
                            dueSoonCount++;
                            const notifId = 'bill_due_' + billId;
                            if (!dismissed[notifId]) {
                                const item = {
                                    id: notifId,
                                    type: 'warning',
                                    tag: diffDays === 0 ? 'Vence Hoje' : `Vence em ${diffDays}d`,
                                    icon: 'fa-clock',
                                    title: `Vence em breve: ${billTitle}`,
                                    message: `Vence ${diffDays === 0 ? 'hoje' : 'em ' + diffDays + ' dia(s)'} (${formatDate(billDate)}) - ${formatCurrency(Math.abs(bill.amount))}`,
                                    link: 'bills.html',
                                    actionBtnText: 'Ver Detalhes'
                                };
                                notifications.push(item);
                                if (!firstUrgentNotif && diffDays === 0) firstUrgentNotif = item;
                            }
                        }
                    }
                }
            });

            // Update warning banner on dashboard if present (Apenas para contas atrasadas)
            const banner = document.getElementById('dueBillsWarningBanner');
            if (banner) {
                if (overdueCount > 0) {
                    banner.style.display = 'flex';
                    const titleEl = document.getElementById('dueBannerTitle');
                    const descEl = document.getElementById('dueBannerDesc');
                    if (titleEl) titleEl.textContent = `⚠️ Atenção: Você tem ${overdueCount} conta(s) em atraso!`;
                    if (descEl) descEl.textContent = 'Acesse a lista e efetue o pagamento para regularizar suas finanças.';
                } else if (dueSoonCount > 0) {
                    banner.style.display = 'flex';
                    const titleEl = document.getElementById('dueBannerTitle');
                    const descEl = document.getElementById('dueBannerDesc');
                    if (titleEl) titleEl.textContent = `⏰ Lembrete: Você tem ${dueSoonCount} conta(s) a vencer nos próximos dias.`;
                    if (descEl) descEl.textContent = 'Evite juros organizando seus pagamentos com antecedência.';
                } else {
                    banner.style.display = 'none';
                }
            }

            // 2. Check Category Budget Limits & Overruns (notificações para o sininho)
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
                        const notifId = 'budget_exceeded_' + p.categoryId;
                        if (!dismissed[notifId]) {
                            notifications.push({
                                id: notifId,
                                type: 'danger',
                                tag: 'Limite Estourado',
                                icon: 'fa-exclamation-triangle',
                                title: `🚨 Limite Ultrapassado: ${p.name}`,
                                message: `Você gastou ${formatCurrency(p.spent)} do teto de ${formatCurrency(p.limit)} (${p.percentage.toFixed(0)}%). Excedeu em ${formatCurrency(p.spent - p.limit)}!`,
                                action: 'openBudgetModal',
                                link: 'settings.html',
                                actionBtnText: 'Ajustar Limite'
                            });
                        }
                    });

                    warningList.forEach(p => {
                        const notifId = 'budget_warning_' + p.categoryId;
                        if (!dismissed[notifId]) {
                            notifications.push({
                                id: notifId,
                                type: 'warning',
                                tag: 'Alerta de Teto',
                                icon: 'fa-chart-pie',
                                title: `⚠️ Perto do Limite: ${p.name}`,
                                message: `Você já consumiu ${p.percentage.toFixed(0)}% do teto (${formatCurrency(p.spent)} de ${formatCurrency(p.limit)}). Restam ${formatCurrency(p.remaining)}.`,
                                action: 'openBudgetModal',
                                link: 'settings.html',
                                actionBtnText: 'Ver Limites'
                            });
                        }
                    });

                } catch (bErr) {
                    console.warn('⚠️ Erro ao avaliar limites de orçamento:', bErr);
                }
            }

            // 3. Sync status notification if offline queue has items
            if (window.tonuSync && window.tonuSync.db) {
                try {
                    const queue = await window.tonuSync.getQueue?.();
                    if (queue && queue.length > 0) {
                        const notifId = 'sync_queue';
                        if (!dismissed[notifId]) {
                            notifications.push({
                                id: notifId,
                                type: 'info',
                                tag: 'Offline',
                                icon: 'fa-sync',
                                title: 'Sincronização pendente',
                                message: `Há ${queue.length} alteração(ões) offline aguardando conexão.`,
                                link: '#',
                                actionBtnText: 'Sincronizar'
                            });
                        }
                    }
                } catch {}
            }

        } catch (err) {
            console.warn('⚠️ Erro ao checar notificações:', err);
        }

        updateNotificationBadge();
        renderNotificationList();
    }

    // Dismiss / Clear all notifications permanently
    function clearAllNotifications() {
        notifications.forEach(n => {
            saveDismissedId(n.id);
        });
        notifications = [];
        updateNotificationBadge();
        renderNotificationList();

        const banner = document.getElementById('dueBillsWarningBanner');
        if (banner) banner.style.display = 'none';

        if (window.showToast) {
            window.showToast('Todas as notificações foram limpas e arquivadas!', 'success');
        }
    }

    // ============================================
    // BILL NOTIFICATION MANAGER
    // ============================================
    const billNotificationManager = {
        settings: {
            enabled: true,
            remindDaysBefore: [0, 1, 2, 3],
            remindOverdue: true,
            sound: true,
            vibrate: true
        },

        loadSettings() {
            try {
                const saved = localStorage.getItem('tonu_notif_settings');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    this.settings = Object.assign(this.settings, parsed);
                }
            } catch (e) {
                console.warn('Erro ao carregar tonu_notif_settings:', e);
            }
            return this.settings;
        },

        saveSettings(newSettings) {
            this.settings = Object.assign(this.settings, newSettings);
            try {
                localStorage.setItem('tonu_notif_settings', JSON.stringify(this.settings));
            } catch (e) {}
            if (typeof window.renderNotificationSettingsUI === 'function') {
                window.renderNotificationSettingsUI();
            }
            return this.settings;
        },

        getPermissionState() {
            if (!('Notification' in window)) return 'unsupported';
            return Notification.permission;
        },

        async requestPermission() {
            if (!('Notification' in window)) {
                if (window.showToast) window.showToast('Seu navegador não suporta a API de Notificações Web.', 'warning');
                return false;
            }
            try {
                const permission = await Notification.requestPermission();
                const granted = permission === 'granted';
                this.saveSettings({ enabled: granted });
                if (granted) {
                    if (window.showToast) window.showToast('🔔 Permissão de notificações concedida com sucesso!', 'success');
                } else {
                    if (window.showToast) window.showToast('Permissão de notificações recusada ou bloqueada.', 'warning');
                }
                return granted;
            } catch (err) {
                console.warn('Erro ao solicitar permissão de notificação:', err);
                return false;
            }
        },

        playChime() {
            if (this.settings.sound) {
                playChime();
            }
        },

        async testNotification() {
            this.playChime();
            const testId = 'test_' + Date.now();
            const testItem = {
                id: testId,
                type: 'info',
                tag: 'Teste Premium',
                icon: 'fa-bell',
                title: 'Notificação Premium TonuControle',
                message: 'Seus alertas inteligentes e lembretes de contas estão configurados e ativos!',
                link: '#',
                actionBtnText: 'Tudo Certo'
            };

            notifications.unshift(testItem);
            updateNotificationBadge();
            renderNotificationList();

            // Exibir Banner Flutuante Premium in-app
            showPremiumNotificationBanner(testItem);

            // Push Notification Web
            if ('Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification('TonuControle - Teste de Alerta', {
                        body: 'Seus alertas e lembretes de contas estão ativos e funcionando perfeitamente!',
                        icon: '/icons/icon-192x192.png'
                    });
                } catch (e) {
                    console.warn('Push notification falhou:', e);
                }
            }

            if (window.showToast) {
                window.showToast('🔔 Notificação premium disparada com sucesso!', 'success');
            }
        },

        async checkDueBills(force) {
            await checkNotifications();
            if (this.settings.sound && notifications.length > 0) {
                this.playChime();
            }
        }
    };

    billNotificationManager.loadSettings();

    // Close on click outside (fallback in case backdrop isn't clicked)
    document.addEventListener('click', (e) => {
        if (isDropdownOpen) {
            const dropdown = document.getElementById('notifDropdownMenu');
            const bellBtn = e.target.closest('#notifBellBtn, .notif-bell-btn');
            if (dropdown && !dropdown.contains(e.target) && !bellBtn) {
                closeNotificationDropdown();
            }
        }
    });

    // Attach click events directly to all bell buttons in the document
    function attachBellListeners() {
        const bellButtons = document.querySelectorAll('#notifBellBtn, .notif-bell-btn');
        bellButtons.forEach(btn => {
            btn.onclick = function (e) {
                toggleNotificationDropdown(e);
            };
        });
    }

    // Exports to Global Scope
    window.toggleNotificationDropdown = toggleNotificationDropdown;
    window.openNotificationDropdown = openNotificationDropdown;
    window.closeNotificationDropdown = closeNotificationDropdown;
    window.checkNotifications = checkNotifications;
    window.updateNotificationBadge = updateNotificationBadge;
    window.clearAllNotifications = clearAllNotifications;
    window.dismissNotification = dismissNotification;
    window.setNotificationFilter = setNotificationFilter;
    window.handleNotificationClick = handleNotificationClick;
    window.billNotificationManager = billNotificationManager;
    window.showPremiumNotificationBanner = showPremiumNotificationBanner;
    window.playNotificationChime = playChime;

    // Initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            attachBellListeners();
            setTimeout(checkNotifications, 400);
            if (typeof window.renderNotificationSettingsUI === 'function') {
                window.renderNotificationSettingsUI();
            }
        });
    } else {
        attachBellListeners();
        setTimeout(checkNotifications, 400);
        if (typeof window.renderNotificationSettingsUI === 'function') {
            window.renderNotificationSettingsUI();
        }
    }

    console.log('🔔 Notifications.js Premium carregado com sucesso!');
})();
