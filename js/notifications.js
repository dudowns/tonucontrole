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

    function markAsReadSilently(id) {
        try {
            const map = getReadIds();
            map[id] = Date.now();
            localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(map));
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

    function getLocalISODate(d = new Date()) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getDividendISODate(d) {
        if (!d) return '';
        const raw = d.date || d.payment_date || d.date_payment;
        if (!raw) return '';
        let s = String(raw).trim();
        if (s.includes('T')) s = s.split('T')[0];
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
            const parts = s.split('/');
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }
        return s;
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
            updateNotificationBadge();
        }
        return dropdown;
    }

    // Open Dropdown
    function openNotificationDropdown(triggerEl) {
        const dropdown = getNotificationDropdown();
        const backdrop = getNotificationBackdrop();

        const bellBtn = triggerEl || document.getElementById('notifBellBtn') || document.querySelector('.notif-bell-btn');

        if (bellBtn) {
            bellBtn.classList.add('active');
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

        updateNotificationBadge();
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

        const bellButtons = document.querySelectorAll('#notifBellBtn, .notif-bell-btn');
        bellButtons.forEach(btn => btn.classList.remove('active'));

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

    // Update Topbar Badge & Dropdown Counters
    function updateNotificationBadge() {
        const readIds = getReadIds();
        const totalCount = Array.isArray(notifications) ? notifications.length : 0;
        const unreadCount = Array.isArray(notifications) ? notifications.filter(n => !readIds[n.id] && !n.isRead).length : 0;

        // 1. Atualizar contadores das abas no menu dropdown ("Todas (X)" e "Não lidas (Y)")
        const cntAllEl = document.getElementById('notifCountAll');
        const cntUnreadEl = document.getElementById('notifCountUnread');
        if (cntAllEl) cntAllEl.textContent = String(totalCount);
        if (cntUnreadEl) cntUnreadEl.textContent = String(unreadCount);

        // 2. Atualizar badges de notificação na barra superior / páginas
        const badges = document.querySelectorAll('#notifBadgeCount, .notif-badge');
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

        // 3. Atualizar marcadores nas abas de Configurações (Desktop e Mobile)
        const settingsBadges = document.querySelectorAll('#settingsNotifTabBadge, #mobileSettingsNotifBadge');
        settingsBadges.forEach(b => {
            if (unreadCount > 0) {
                b.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                b.classList.remove('hidden');
                b.style.display = 'inline-flex';
            } else {
                b.textContent = '0';
                b.classList.add('hidden');
                b.style.display = 'none';
            }
        });

        // 4. Atualizar badge contador no card de Histórico de Notificações
        const historyCountBadge = document.getElementById('notifHistoryCountBadge');
        if (historyCountBadge) {
            historyCountBadge.textContent = unreadCount > 0 ? `${unreadCount} não lida(s)` : `${totalCount} total`;
        }

        // 5. Atualizar botões de sino (destaque/animação quando há não lidas ou urgentes)
        const bellButtons = document.querySelectorAll('#notifBellBtn, .notif-bell-btn');
        const hasUrgent = Array.isArray(notifications) && notifications.some(n => n.type === 'danger' && !readIds[n.id] && !n.isRead);
        bellButtons.forEach(btn => {
            if (unreadCount > 0) {
                btn.classList.add('has-unread');
            } else {
                btn.classList.remove('has-unread');
                if (!isDropdownOpen) {
                    btn.classList.remove('active');
                }
            }
            if (hasUrgent) {
                btn.classList.add('has-urgent');
            } else {
                btn.classList.remove('has-urgent');
            }
        });
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

    function isSafeUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return false;
        const trimmed = rawUrl.trim();
        if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
        if (/[<>"'\s]/.test(trimmed)) return false;
        return /^([a-zA-Z0-9_./#]|https?:\/\/)/i.test(trimmed);
    }

    // Handle Click on Individual Notification
    function handleNotificationClick(id) {
        const notif = notifications.find(n => n.id === id);
        markAsRead(id);
        closeNotificationDropdown();

        if (notif) {
            if (notif.logId && window.supabaseClient) {
                window.supabaseClient
                    .from('notification_log')
                    .update({ read_at: new Date().toISOString() })
                    .eq('id', notif.logId)
                    .then(() => {
                        if (typeof window.loadNotificationHistory === 'function') {
                            window.loadNotificationHistory();
                        }
                    })
                    .catch(() => {});
            }

            if (notif.action === 'openBudgetModal') {
                window.location.href = 'settings.html';
                try { localStorage.setItem('tonu_settings_active_tab', 'budgets'); } catch {}
                return;
            }
            if (notif.id && notif.id.startsWith('dividend_')) {
                if (typeof window.switchTab === 'function') {
                    window.switchTab('proventos');
                    return;
                }
            }
            if (notif.link && notif.link !== '#') {
                const safeLink = isSafeUrl(notif.link) ? notif.link.trim() : '#';
                if (safeLink !== '#') {
                    window.location.href = safeLink;
                }
            }
        }
    }

    // Render Notification Items inside Dropdown
    function renderNotificationList() {
        // Garantir sincronização dos contadores de abas ("Todas", "Não lidas") e badges
        updateNotificationBadge();

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
            const badgeClass = n.type === 'danger' ? 'overdue' : (n.type === 'warning' ? 'due-today' : (n.type === 'success' ? 'paid-today' : 'due-soon'));
            const iconBg = n.type === 'danger' ? '#FF7675' : (n.type === 'warning' ? '#FDCB6E' : (n.type === 'success' ? '#00B894' : '#6C5CE7'));
            const tagLabel = n.tag || (n.type === 'danger' ? 'Atrasada' : (n.type === 'warning' ? 'Atenção' : (n.type === 'success' ? 'Recebido' : 'Aviso')));
            const safeItemTitle = typeof sanitizeString === 'function' ? sanitizeString(n.title || '') : (n.title || '');
            const safeItemMessage = typeof sanitizeString === 'function' ? sanitizeString(n.message || '') : (n.message || '');
            const safeActionText = n.actionBtnText ? (typeof sanitizeString === 'function' ? sanitizeString(n.actionBtnText) : n.actionBtnText) : '';
            const safeId = typeof sanitizeString === 'function' ? sanitizeString(n.id || '') : (n.id || '');

            return `
                <div class="notif-item ${badgeClass} ${isRead ? 'read' : 'unread'}" data-notif-id="${safeId}">
                    <div class="notif-icon-box" style="background:${iconBg};">
                        <i class="fas ${n.icon || 'fa-info-circle'}"></i>
                    </div>
                    <div class="notif-item-content">
                        <div class="notif-item-header-row">
                            <span class="notif-tag notif-tag-${n.type}">${tagLabel}</span>
                            <div class="notif-item-actions">
                                <button type="button" class="notif-dismiss-btn" data-dismiss-id="${safeId}" title="Dispensar notificação">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="notif-item-title">
                            <span>${safeItemTitle}</span>
                        </div>
                        <div class="notif-item-desc">
                            <span>${safeItemMessage}</span>
                        </div>
                        ${safeActionText ? `
                            <div class="notif-item-footer-action">
                                <span class="notif-action-pill">${safeActionText} <i class="fas fa-arrow-right"></i></span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.notif-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.notif-dismiss-btn')) return;
                const id = item.dataset.notifId;
                if (id) window.handleNotificationClick(id);
            });
        });
        container.querySelectorAll('.notif-dismiss-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.dismissId;
                if (id) window.dismissNotification(id);
            });
        });
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
        const isSuccess = notif.type === 'success';
        const color = isDanger ? '#FF7675' : (isWarning ? '#FDCB6E' : (isSuccess ? '#00B894' : '#6C5CE7'));

        const safeTitle = typeof sanitizeString === 'function' ? sanitizeString(notif.title || '') : (notif.title || '');
        const safeMessage = typeof sanitizeString === 'function' ? sanitizeString(notif.message || '') : (notif.message || '');

        const rawLink = notif.link || '';
        const safeLink = isSafeUrl(rawLink) ? rawLink.trim() : '#';
        const hasValidLink = safeLink !== '#';

        banner.innerHTML = `
            <div class="floating-alert-inner ${notif.type || 'info'}">
                <div class="floating-alert-icon" style="background:${color};">
                    <i class="fas ${notif.icon || 'fa-bell'}"></i>
                </div>
                <div class="floating-alert-body">
                    <strong>${safeTitle}</strong>
                    <p>${safeMessage}</p>
                </div>
                <div class="floating-alert-actions">
                    ${hasValidLink ? `
                        <button type="button" class="btn btn-sm btn-primary" data-notif-link="${safeLink.replace(/"/g, '&quot;')}">
                            Ver
                        </button>
                    ` : ''}
                    <button class="floating-alert-close" type="button" title="Fechar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;

        const btn = banner.querySelector('[data-notif-link]');
        if (btn) {
            btn.addEventListener('click', () => { 
                if (safeLink !== '#') window.location.href = safeLink; 
            });
        }

        const closeBtn = banner.querySelector('.floating-alert-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                banner.classList.remove('show');
            });
        }

        banner.classList.add('show');

        // Auto dispensar após 7 segundos
        clearTimeout(banner._timeout);
        banner._timeout = setTimeout(() => {
            banner.classList.remove('show');
        }, 7000);
    }

    // Check system notifications (due bills, budget overruns, goals, dividends)
    async function checkNotifications() {
        notifications = [];
        const today = new Date();
        const todayStr = getLocalISODate(today);
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

            // 4. Check Dividends / Proventos (Recebidos hoje ou a receber em breve)
            const notifSettings = window.billNotificationManager ? window.billNotificationManager.settings : {};
            const remindDividends = notifSettings.remindDividends !== false;

            if (remindDividends) {
                let divList = [];

                if (user && window.supabaseClient) {
                    try {
                        const { data: dbDivs } = await window.supabaseClient
                            .from('dividends')
                            .select('*')
                            .eq('user_id', user.id);
                        if (dbDivs && dbDivs.length > 0) {
                            divList = dbDivs;
                        }
                    } catch (e) {
                        console.warn('Fallback para proventos locais ao checar notificações:', e);
                    }
                }

                if (divList.length === 0) {
                    const localDivs = localStorage.getItem('tonucontrole_dividends_' + userId) ||
                                      localStorage.getItem('tonu_dividends_' + userId) ||
                                      localStorage.getItem('tonu_dividends');
                    if (localDivs) {
                        try {
                            const parsed = JSON.parse(localDivs);
                            if (Array.isArray(parsed)) divList = parsed;
                        } catch {}
                    }
                }

                // Se houver allDividends no escopo global (ex: tela de investimentos)
                if (divList.length === 0 && Array.isArray(window.allDividends) && window.allDividends.length > 0) {
                    divList = window.allDividends;
                }

                const pushedDividendsKey = 'tonu_pushed_dividends_' + todayStr;
                let pushedToday = {};
                try {
                    pushedToday = JSON.parse(localStorage.getItem(pushedDividendsKey) || '{}');
                } catch {}

                divList.forEach(div => {
                    const payIso = getDividendISODate(div);
                    if (!payIso) return;

                    const ticker = (div.ticker || 'ATIVO').toUpperCase();
                    const typeLabel = div.type || 'Provento';
                    const divKey = div.id || `${ticker}_${payIso}_${div.total_value}`;

                    // Calcular valor líquido se for JCP ou net_value
                    let totalVal = 0;
                    const jcpTax = (typeof window !== 'undefined' && window.TONU_JCP_TAX_RATE !== undefined) ? window.TONU_JCP_TAX_RATE : (typeof globalThis !== 'undefined' ? globalThis.TONU_JCP_TAX_RATE : 0);
                    if (div.net_value !== undefined && div.net_value !== null && Number(div.net_value) > 0) {
                        totalVal = Number(div.net_value);
                    } else if (div.total_value !== undefined && div.total_value !== null && Number(div.total_value) > 0) {
                        const raw = Number(div.total_value);
                        const isJCP = typeLabel.toUpperCase().includes('JCP');
                        totalVal = isJCP ? raw * (1 - jcpTax) : raw;
                    } else if (div.quantity && div.unit_value) {
                        const calc = Number(div.quantity) * Number(div.unit_value);
                        const isJCP = typeLabel.toUpperCase().includes('JCP');
                        totalVal = isJCP ? calc * (1 - jcpTax) : calc;
                    }

                    // A) Provento Creditado HOJE
                    if (payIso === todayStr) {
                        const notifId = 'dividend_paid_' + divKey;
                        if (!dismissed[notifId]) {
                            const item = {
                                id: notifId,
                                type: 'success',
                                tag: 'Creditado Hoje',
                                icon: 'fa-money-bill-wave',
                                title: `Provento creditado: ${ticker}`,
                                message: `Você recebeu ${formatCurrency(totalVal)} referente a ${div.quantity ? div.quantity + ' cotas/ações de ' : ''}${ticker} (${typeLabel}) hoje!`,
                                link: 'investments.html#proventos',
                                actionBtnText: 'Ver Proventos'
                            };
                            notifications.unshift(item);

                            // Alerta visual / sonoro / push se ainda não disparado hoje
                            if (!pushedToday[divKey]) {
                                pushedToday[divKey] = Date.now();
                                try {
                                    localStorage.setItem(pushedDividendsKey, JSON.stringify(pushedToday));
                                } catch {}

                                if (window.billNotificationManager?.settings?.sound) {
                                    window.billNotificationManager.playChime();
                                }
                                showPremiumNotificationBanner(item);

                                if ('Notification' in window && Notification.permission === 'granted' && window.billNotificationManager?.settings?.enabled) {
                                    try {
                                        new Notification(`💰 Provento Creditado: ${ticker}`, {
                                            body: `Você recebeu ${formatCurrency(totalVal)} de ${ticker} (${typeLabel}) hoje!`,
                                            icon: '/icons/icon-192x192.png'
                                        });
                                    } catch (err) {}
                                }
                            }
                        }
                    } else {
                        // B) Provento a Receber nos próximos dias (1 a 5 dias)
                        const dueTime = new Date(payIso + 'T00:00:00').getTime();
                        const nowTime = new Date(todayStr + 'T00:00:00').getTime();
                        const diffDays = Math.round((dueTime - nowTime) / (1000 * 60 * 60 * 24));

                        if (diffDays >= 1 && diffDays <= 5) {
                            const notifId = 'dividend_upcoming_' + divKey;
                            if (!dismissed[notifId]) {
                                const item = {
                                    id: notifId,
                                    type: 'info',
                                    tag: diffDays === 1 ? 'Cai Amanhã' : `Cai em ${diffDays}d`,
                                    icon: 'fa-calendar-check',
                                    title: `Provento a receber: ${ticker}`,
                                    message: `Previsão de crédito de ${formatCurrency(totalVal)} (${typeLabel}) em ${formatDate(payIso)} (${diffDays === 1 ? 'amanhã' : 'em ' + diffDays + ' dias'}).`,
                                    link: 'investments.html#proventos',
                                    actionBtnText: 'Ver Proventos'
                                };
                                notifications.push(item);
                            }
                        }
                    }
                });
            }

            // 5. Integração com histórico do Supabase (notification_log)
            if (user && window.supabaseClient) {
                try {
                    const { data: logData } = await window.supabaseClient
                        .from('notification_log')
                        .select('*')
                        .eq('user_id', user.id)
                        .is('dismissed_at', null)
                        .order('created_at', { ascending: false })
                        .limit(50);

                    if (logData && logData.length > 0) {
                        logData.forEach(item => {
                            const notifId = 'log_' + item.id;
                            if (!dismissed[notifId]) {
                                if (item.read_at) {
                                    markAsReadSilently(notifId);
                                }
                                notifications.push({
                                    id: notifId,
                                    logId: item.id,
                                    type: item.type === 'danger' ? 'danger' : (item.type === 'bills' ? 'warning' : 'info'),
                                    tag: item.type === 'bills' ? 'Conta' : (item.type === 'dividends_credited' ? 'Provento' : (item.type === 'goals' ? 'Meta' : 'Alerta')),
                                    icon: item.icon || (item.type === 'danger' ? 'fa-exclamation-circle' : (item.type === 'bills' ? 'fa-file-invoice-dollar' : 'fa-bell')),
                                    title: item.title,
                                    message: item.body,
                                    link: item.url || '#',
                                    actionBtnText: 'Visualizar',
                                    isFromLog: true,
                                    createdAt: item.created_at,
                                    isRead: !!item.read_at
                                });
                            }
                        });
                    }
                } catch (logErr) {
                    console.warn('[Notifications] Erro ao integrar notification_log em checkNotifications:', logErr);
                }
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

        if (window.supabaseClient) {
            window.supabaseClient.auth.getSession().then(s => {
                const uid = s?.data?.session?.user?.id || window.currentUser?.id;
                if (uid) {
                    window.supabaseClient
                        .from('notification_log')
                        .update({ dismissed_at: new Date().toISOString() })
                        .eq('user_id', uid)
                        .is('dismissed_at', null)
                        .then(() => {
                            if (typeof window.loadNotificationHistory === 'function') {
                                window.loadNotificationHistory();
                            }
                        })
                        .catch(() => {});
                }
            }).catch(() => {});
        }

        if (window.showToast) {
            window.showToast('Todas as notificações foram limpas e arquivadas!', 'success');
        }
    }

    // ============================================
    // HISTÓRICO DE NOTIFICAÇÕES (NOTIFICATION LOG)
    // ============================================
    function formatRelativeTime(dateIso) {
        if (!dateIso) return '';
        const now = Date.now();
        const diffMs = now - new Date(dateIso).getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSec < 60) return 'há poucos instantes';
        if (diffMin < 60) return `há ${diffMin} minuto${diffMin > 1 ? 's' : ''}`;
        if (diffHours < 24) return `há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
        if (diffDays === 1) return 'ontem';
        if (diffDays < 30) return `há ${diffDays} dias`;
        return new Date(dateIso).toLocaleDateString('pt-BR');
    }

    async function loadNotificationHistory() {
        const containers = [
            document.getElementById('notifHistoryListContainer'),
            document.getElementById('mobileNotifHistoryListContainer')
        ].filter(Boolean);

        if (containers.length === 0) return;

        let user = window.currentUser;
        if (!user && window.supabaseClient?.auth) {
            try {
                const s = await window.supabaseClient.auth.getSession();
                user = s?.data?.session?.user;
            } catch (_) {}
        }

        if (!user || !window.supabaseClient) {
            containers.forEach(c => {
                c.innerHTML = `
                    <div style="text-align:center; padding:20px; color:var(--color-text-muted, #64748b);">
                        <p style="font-size:13px; margin:0;">Faça login para visualizar o histórico de notificações.</p>
                    </div>
                `;
            });
            return;
        }

        try {
            const { data, error } = await window.supabaseClient
                .from('notification_log')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            const historyUnread = data ? data.filter(d => !d.read_at).length : 0;
            const historyTotal = data ? data.length : 0;
            const historyBadge = document.getElementById('notifHistoryCountBadge');
            if (historyBadge) {
                historyBadge.textContent = historyUnread > 0 ? `${historyUnread} não lida(s)` : `${historyTotal} total`;
            }

            if (!data || data.length === 0) {
                containers.forEach(c => {
                    c.innerHTML = `
                        <div style="text-align:center; padding:24px; color:var(--color-text-muted, #64748b);">
                            <i class="fas fa-inbox" style="font-size:24px; opacity:0.5; margin-bottom:8px; display:block;"></i>
                            <p style="font-size:13px; margin:0;">Nenhum registro de notificação encontrado.</p>
                        </div>
                    `;
                });
                return;
            }

            const html = data.map(item => {
                const isUnread = !item.read_at;
                const relativeTime = formatRelativeTime(item.created_at);
                const safeTitle = typeof sanitizeString === 'function' ? sanitizeString(item.title) : item.title;
                const safeBody = typeof sanitizeString === 'function' ? sanitizeString(item.body) : item.body;
                const icon = item.type === 'danger' ? 'fa-exclamation-circle' : (item.type === 'bills' ? 'fa-file-invoice-dollar' : (item.type === 'dividends_credited' ? 'fa-money-bill-wave' : (item.type === 'goals' ? 'fa-bullseye' : 'fa-bell')));
                const iconColor = item.type === 'danger' ? '#FF7675' : (item.type === 'bills' ? '#E17055' : (item.type === 'dividends_credited' ? '#00B894' : '#6C5CE7'));

                return `
                    <div class="notif-history-item" onclick="window.markHistoryItemRead('${item.id}', '${item.url || ''}')" style="display:flex; align-items:flex-start; gap:12px; padding:10px 12px; border-bottom:1px solid var(--color-border-light, #f1f2f6); cursor:pointer; background:${isUnread ? 'rgba(108, 92, 231, 0.05)' : 'transparent'}; border-radius:8px; transition:background 0.15s ease; margin-bottom:4px;">
                        <div style="width:32px; height:32px; border-radius:8px; background:${iconColor}22; color:${iconColor}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <i class="fas ${icon}" style="font-size:13px;"></i>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                                <strong style="font-size:13px; color:var(--color-text, #2d3436); font-weight:${isUnread ? '700' : '600'};">${safeTitle}</strong>
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="font-size:11px; color:var(--color-text-muted, #64748b); white-space:nowrap;">${relativeTime}</span>
                                    ${isUnread ? '<span style="width:7px; height:7px; background:#0984e3; border-radius:50%; display:inline-block;" title="Não lida"></span>' : ''}
                                </div>
                            </div>
                            <div style="font-size:12px; color:var(--color-text-light, #636e72); margin-top:2px;">${safeBody}</div>
                        </div>
                    </div>
                `;
            }).join('');

            containers.forEach(c => {
                c.innerHTML = html;
            });
        } catch (err) {
            console.warn('[Notifications] Erro ao carregar notification_log:', err);
            containers.forEach(c => {
                c.innerHTML = `
                    <div style="text-align:center; padding:20px; color:var(--color-danger, #ff7675);">
                        <p style="font-size:12px; margin:0;">Não foi possível carregar o histórico de notificações.</p>
                    </div>
                `;
            });
        }
    }

    async function markHistoryItemRead(id, url) {
        if (!window.supabaseClient || !id) return;
        try {
            await window.supabaseClient
                .from('notification_log')
                .update({ read_at: new Date().toISOString() })
                .eq('id', id);
            await loadNotificationHistory();
            if (url && url !== '#' && isSafeUrl(url)) {
                window.location.href = url;
            }
        } catch (e) {
            console.warn('[Notifications] Erro ao marcar histórico como lido:', e);
        }
    }

    async function markAllHistoryRead() {
        if (!window.supabaseClient) return;
        let user = window.currentUser;
        if (!user && window.supabaseClient?.auth) {
            try {
                const s = await window.supabaseClient.auth.getSession();
                user = s?.data?.session?.user;
            } catch (_) {}
        }
        if (!user) return;

        try {
            const { error } = await window.supabaseClient
                .from('notification_log')
                .update({ read_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .is('read_at', null);

            if (error) throw error;
            notifications.forEach(n => {
                markAsReadSilently(n.id);
            });
            updateNotificationBadge();
            renderNotificationList();
            await loadNotificationHistory();
            if (window.showToast) {
                window.showToast('Todas as notificações foram marcadas como lidas! ✅', 'success');
            }
        } catch (e) {
            console.warn('[Notifications] Erro ao marcar todas como lidas:', e);
            if (window.showToast) {
                window.showToast('Erro ao atualizar histórico.', 'error');
            }
        }
    }

    async function clearNotificationHistory() {
        if (!window.supabaseClient) return;
        let user = window.currentUser;
        if (!user && window.supabaseClient?.auth) {
            try {
                const s = await window.supabaseClient.auth.getSession();
                user = s?.data?.session?.user;
            } catch (_) {}
        }
        if (!user) return;

        try {
            const { error } = await window.supabaseClient
                .from('notification_log')
                .delete()
                .eq('user_id', user.id);

            if (error) throw error;
            await loadNotificationHistory();
            if (window.showToast) {
                window.showToast('Histórico de notificações limpo com sucesso! 🗑️', 'info');
            }
        } catch (e) {
            console.warn('[Notifications] Erro ao limpar histórico:', e);
            if (window.showToast) {
                window.showToast('Erro ao limpar histórico.', 'error');
            }
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
            remindDividends: true,
            sound: true,
            vibrate: true,
            pushPrefs: {
                bills: true,
                dividends_credited: true,
                dividends_upcoming: true,
                goals: true,
                budgets: true
            }
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

        getPushPreferences() {
            return Object.assign({
                bills: true,
                dividends_credited: true,
                dividends_upcoming: true,
                goals: true,
                budgets: true,
                remind_days_before: this.settings.remindDaysBefore || [0, 1, 2, 3],
                remind_overdue: this.settings.remindOverdue !== false,
                sound: this.settings.sound !== false
            }, this.settings.pushPrefs || {});
        },

        async savePushPreferences(prefs) {
            const updated = Object.assign(this.getPushPreferences(), prefs);
            this.settings.pushPrefs = updated;
            this.saveSettings({ pushPrefs: updated });

            // 1. Obter usuário autenticado por múltiplas fontes
            let user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);

            if (!user && window.supabaseClient?.auth) {
                try {
                    const sessionRes = await window.supabaseClient.auth.getSession();
                    user = sessionRes?.data?.session?.user;
                    if (!user) {
                        const userRes = await window.supabaseClient.auth.getUser();
                        user = userRes?.data?.user;
                    }
                } catch (e) {
                    console.warn('[Push] Erro ao obter usuário da sessão auth:', e);
                }
            }

            if (!user && window.supabaseOffline) {
                try {
                    user = await window.supabaseOffline.isAuthenticated();
                } catch (_) {}
            }

            if (!user) {
                try {
                    const s = sessionStorage.getItem('tonu_user') || localStorage.getItem('tonu_offline_session');
                    if (s) {
                        const p = JSON.parse(s);
                        user = p.user || p;
                    }
                } catch (_) {}
            }

            const userId = user?.id;
            console.log('[Push] Sincronizando push preferences para userId:', userId, updated);

            let syncSuccess = false;
            let syncError = null;

            if (userId && window.supabaseClient) {
                const nowIso = new Date().toISOString();

                // Tentativa 1: Update direto via Supabase Client
                try {
                    const { data, error } = await window.supabaseClient
                        .from('push_subscriptions')
                        .update({ 
                            preferences: updated,
                            updated_at: nowIso
                        })
                        .eq('user_id', userId)
                        .select();

                    if (!error && data && data.length > 0) {
                        console.log('✅ [Push] Preferências salvas no Supabase via client:', data);
                        syncSuccess = true;
                    } else if (error) {
                        console.warn('⚠️ [Push] Falha no update direto via client:', error);
                        syncError = error;
                    } else {
                        console.warn('⚠️ [Push] Update direto retornou 0 linhas atualizadas (possível restrição RLS ou sub inexistente):', data);
                    }
                } catch (err) {
                    console.warn('⚠️ [Push] Exceção no update direto:', err);
                    syncError = err;
                }

                // Tentativa 2: Fallback via Edge Function send-push (ignora restrições RLS através da service_role)
                if (!syncSuccess) {
                    try {
                        const supabaseUrl = window.SUPABASE_URL || 'https://rbtxrbacdpenbslqcbbl.supabase.co';
                        const supabaseKey = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHhyYmFjZHBlbmJzbHFjYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDA5MjksImV4cCI6MjEwMTk3NjkyOX0.VDmJ-pty8oLzkgEad4WBpk7leR9ZR-b_bXXUE3HkPcM';

                        const resp = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`
                            },
                            body: JSON.stringify({
                                mode: 'save-preferences',
                                user_id: userId,
                                preferences: updated
                            })
                        });

                        if (resp.ok) {
                            const resData = await resp.json();
                            if (resData.ok) {
                                console.log('✅ [Push] Preferências salvas no Supabase via Edge Function:', resData);
                                syncSuccess = true;
                                syncError = null;
                            }
                        } else {
                            const errTxt = await resp.text();
                            console.warn('⚠️ [Push] Edge Function fallback falhou:', errTxt);
                        }
                    } catch (efErr) {
                        console.warn('⚠️ [Push] Erro de rede no Edge Function fallback:', efErr);
                    }
                }
            } else {
                console.warn('[Push] Não foi possível obter o ID do usuário para sincronização no Supabase.');
            }

            return { success: syncSuccess, error: syncError, updated };
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

    // ============================================
    // PUSH EM TEMPO REAL (REALTIME PUSH)
    // ============================================
    async function sendRealtimePush(payload) {
        if (!navigator.onLine) return;
        try {
            if (!window.supabaseClient?.auth) return;
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (!session) return;

            const supabaseUrl = window.SUPABASE_URL || 'https://rbtxrbacdpenbslqcbbl.supabase.co';
            const supabaseKey = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHhyYmFjZHBlbmJzbHFjYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDA5MjksImV4cCI6MjEwMTk3NjkyOX0.VDmJ-pty8oLzkgEad4WBpk7leR9ZR-b_bXXUE3HkPcM';

            await fetch(`${supabaseUrl}/functions/v1/send-push`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + session.access_token
                },
                body: JSON.stringify({
                    user_id: session.user.id,
                    title: payload.title,
                    body: payload.body,
                    url: payload.url || 'pages/dashboard.html',
                    tag: payload.tag || 'realtime-' + Date.now()
                })
            });
        } catch (e) {
            console.warn('[Realtime Push] Falha:', e);
        }
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
    window.loadNotificationHistory = loadNotificationHistory;
    window.markHistoryItemRead = markHistoryItemRead;
    window.markAllHistoryRead = markAllHistoryRead;
    window.clearNotificationHistory = clearNotificationHistory;
    window.sendRealtimePush = sendRealtimePush;

    // Initialization
    function initNotificationDropdownSystem() {
        getNotificationDropdown();
        getNotificationBackdrop();
        attachBellListeners();
        setTimeout(checkNotifications, 300);
        setTimeout(loadNotificationHistory, 500);
        if (typeof window.renderNotificationSettingsUI === 'function') {
            window.renderNotificationSettingsUI();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNotificationDropdownSystem);
    } else {
        initNotificationDropdownSystem();
    }

    // ============================================
    // PUSH SUBSCRIPTION REGISTRATION
    // ============================================
    const VAPID_PUBLIC_KEY = 'BNMcSCK8PEa7D2Ib8XRi1FbP60_UfsPrTYtjBpo0xN5wYilPxg7BCZrUvkr39Y9997cLTcGKXmoZuFOVTYhPRIE';

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function registerPushSubscription() {
        // Verificar suporte
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[Push] Não suportado neste navegador/dispositivo');
            if (typeof window.showToast === 'function') {
                window.showToast('Push notifications não são suportadas neste dispositivo.', 'warning');
            }
            return { success: false, reason: 'unsupported' };
        }

        // iOS exige que seja PWA instalado (standalone)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isIOS && !isStandalone) {
            console.warn('[Push] iOS: instale o PWA na Tela de Início primeiro');
            if (typeof window.showToast === 'function') {
                window.showToast('No iPhone, instale o PWA na Tela de Início para ativar Push.', 'warning');
            }
            return { success: false, reason: 'ios-not-standalone' };
        }

        // Pedir permissão (precisa ser após gesture do usuário)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Push] Permissão negada');
            if (typeof window.showToast === 'function') {
                window.showToast('Permissão de notificações foi negada.', 'warning');
            }
            return { success: false, reason: 'permission-denied' };
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            
            // Verificar se já existe subscription
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
            }

            // Enviar para o Supabase
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (!user) {
                if (typeof window.showToast === 'function') {
                    window.showToast('Faça login para salvar suas notificações push.', 'warning');
                }
                return { success: false, reason: 'not-authenticated' };
            }

            const pushPrefs = billNotificationManager.getPushPreferences();
            const subJson = subscription.toJSON();
            const { error } = await window.supabaseClient
                .from('push_subscriptions')
                .upsert({
                    user_id: user.id,
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                    user_agent: navigator.userAgent,
                    preferences: pushPrefs,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,endpoint' });

            if (error) throw error;

            console.log('[Push] Subscription registrada com sucesso');
            if (typeof window.showToast === 'function') {
                window.showToast('🔔 Notificações Push nativas ativadas com sucesso!', 'success');
            }
            return { success: true, subscription };
        } catch (err) {
            console.error('[Push] Erro ao registrar subscription:', err);
            if (typeof window.showToast === 'function') {
                window.showToast('Erro ao ativar push: ' + (err.message || 'Falha na chave VAPID'), 'error');
            }
            return { success: false, reason: 'error', error: err.message };
        }
    }

    async function unregisterPushSubscription() {
        if (!('serviceWorker' in navigator)) return;
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                await window.supabaseClient
                    .from('push_subscriptions')
                    .delete()
                    .eq('endpoint', subscription.endpoint);
            }
            console.log('[Push] Subscription removida');
            if (typeof window.showToast === 'function') {
                window.showToast('Notificações Push desativadas.', 'info');
            }
        } catch (err) {
            console.error('[Push] Erro ao remover subscription:', err);
        }
    }

    // Expor globalmente
    window.registerPushSubscription = registerPushSubscription;
    window.unregisterPushSubscription = unregisterPushSubscription;
    window.getPushPreferences = () => billNotificationManager.getPushPreferences();
    window.savePushPreferences = (prefs) => billNotificationManager.savePushPreferences(prefs);

    console.log('🔔 Notifications.js Premium carregado com sucesso!');
})();
