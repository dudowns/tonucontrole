// ============================================
// NOTIFICATIONS.JS - TonuControle Push & Reminders
// Versão com agrupamento de notificações
// ============================================

(function () {
    'use strict';

    console.log('🔔 Notifications.js carregado');

    const STORAGE_KEY_SETTINGS = 'tc_notification_settings_v1';
    const STORAGE_KEY_NOTIFIED = 'tc_notified_bills_log_v1';

    const defaultSettings = {
        enabled: true,
        remindOnDueDate: true,
        remindDaysBefore: [0, 1, 2, 3],
        remindOverdue: true,
        sound: true,
        vibrate: true,
        preferredTime: '09:00',
        lastChecked: null
    };

    // ============================================
    // CLASSE NOTIFICATION MANAGER
    // ============================================

    class BillNotificationManager {
        constructor() {
            this.settings = this.loadSettings();
            this.dueBills = [];
            this.swRegistration = null;
            this.init();
        }

        // ============================================
        // VERIFICAR SE É PÁGINA PERMITIDA
        // ============================================

        isAllowedPage() {
            const currentPath = window.location.pathname;
            const allowedPages = ['dashboard.html', 'bills.html'];
            return allowedPages.some(page => currentPath.includes(page));
        }

        async init() {
            if ('serviceWorker' in navigator) {
                try {
                    this.swRegistration = await navigator.serviceWorker.ready;
                } catch (e) {
                    console.warn('⚠️ Service Worker não pronto para notificações:', e);
                }
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupUI());
            } else {
                this.setupUI();
            }

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data && event.data.type === 'BILL_ACTION_PAY') {
                        if (typeof window.payBill === 'function') {
                            window.payBill(event.data.billId);
                        }
                    }
                });
            }

            this.startPeriodicCheck();

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.isAllowedPage()) {
                    this.checkDueBills(false);
                }
            });
        }

        // ============================================
        // CONFIGURAÇÕES
        // ============================================

        loadSettings() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
                if (saved) {
                    return { ...defaultSettings, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.warn('⚠️ Erro ao carregar configurações de notificação:', e);
            }
            return { ...defaultSettings };
        }

        saveSettings(newSettings) {
            this.settings = { ...this.settings, ...newSettings };
            try {
                localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
            } catch (e) {
                console.warn('⚠️ Erro ao salvar configurações de notificação:', e);
            }
            this.updateBellBadge();
            return this.settings;
        }

        getBillsPageUrl() {
            if (window.location.pathname.includes('/pages/')) {
                return 'bills.html';
            }
            return 'pages/bills.html';
        }

        // ============================================
        // PERMISSÕES DE PUSH
        // ============================================

        isSupported() {
            return 'Notification' in window;
        }

        getPermissionState() {
            if (!this.isSupported()) return 'unsupported';
            return Notification.permission;
        }

        async requestPermission() {
            if (!this.isSupported()) {
                if (typeof showToast === 'function') {
                    showToast('Seu navegador não suporta notificações Push.', 'warning');
                }
                return false;
            }

            try {
                const result = await Notification.requestPermission();
                if (result === 'granted') {
                    this.saveSettings({ enabled: true });
                    if (typeof showToast === 'function') {
                        showToast('🔔 Notificações ativadas com sucesso!', 'success');
                    }
                    this.playChime();
                    this.sendPushNotification('TonuControle 💰', {
                        body: 'Lembretes de contas a vencer ativados com sucesso!',
                        tag: 'tc-welcome'
                    });
                    this.updateUI();
                    if (this.isAllowedPage()) {
                        this.checkDueBills(true);
                    }
                    return true;
                } else if (result === 'denied') {
                    if (typeof showToast === 'function') {
                        showToast('Notificações bloqueadas nas permissões do navegador.', 'error');
                    }
                    this.updateUI();
                    return false;
                } else {
                    this.updateUI();
                    return false;
                }
            } catch (err) {
                console.error('❌ Erro ao solicitar permissão de notificação:', err);
                return false;
            }
        }

        // ============================================
        // SOM E VIBRAÇÃO
        // ============================================

        playChime() {
            if (!this.settings.sound) return;
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                const now = ctx.currentTime;
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(587.33, now);
                osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);

                osc2.type = 'triangle';
                osc2.frequency.setValueAtTime(880, now);
                osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);

                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ctx.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.45);
                osc2.stop(now + 0.45);
            } catch (e) {
                console.warn('⚠️ Não foi possível reproduzir som:', e);
            }
        }

        vibrate() {
            if (!this.settings.vibrate) return;
            if ('vibrate' in navigator) {
                try {
                    navigator.vibrate([150, 80, 150]);
                } catch (e) { }
            }
        }

        // ============================================
        // ENVIAR NOTIFICAÇÃO PUSH
        // ============================================

        async sendPushNotification(title, options = {}) {
            if (!this.isSupported() || Notification.permission !== 'granted') {
                return false;
            }

            if (!this.settings.enabled) {
                return false;
            }

            const defaultOptions = {
                icon: '/icons/icon-128x128.png',
                badge: '/icons/icon-128x128.png',
                vibrate: this.settings.vibrate ? [150, 80, 150] : undefined,
                renotify: true,
                tag: 'tc-bill-reminder',
                data: {
                    url: this.getBillsPageUrl(),
                    timestamp: Date.now(),
                    ...options.data
                },
                actions: [
                    { action: 'view', title: '👁️ Ver Contas' },
                    { action: 'pay', title: '✅ Marcar como Paga' }
                ]
            };

            const finalOptions = { ...defaultOptions, ...options };

            this.playChime();
            this.vibrate();

            try {
                if (this.swRegistration && 'showNotification' in this.swRegistration) {
                    await this.swRegistration.showNotification(title, finalOptions);
                    return true;
                } else {
                    const notif = new Notification(title, finalOptions);
                    notif.onclick = () => {
                        window.focus();
                        if (finalOptions.data && finalOptions.data.url) {
                            if (!window.location.pathname.includes('bills.html')) {
                                window.location.href = finalOptions.data.url;
                            }
                        }
                        notif.close();
                    };
                    return true;
                }
            } catch (e) {
                console.warn('⚠️ Erro ao disparar notificação push:', e);
                return false;
            }
        }

        async testNotification() {
            const perm = this.getPermissionState();
            if (perm !== 'granted') {
                const granted = await this.requestPermission();
                if (!granted) return false;
            }

            const sampleTitles = [
                '⏰ Lembrete: Conta vence hoje!',
                '⚠️ Lembrete: Conta vence amanhã!',
                '🚨 Alerta: Conta vencida!'
            ];
            const sampleBodies = [
                'Conta de Energia (R$ 185,50) vence hoje. Toque para pagar!',
                'Internet Fibra (R$ 119,90) vence amanhã. Não esqueça!',
                'Cartão de Crédito (R$ 450,00) está vencido. Evite juros!'
            ];

            const idx = Math.floor(Math.random() * sampleTitles.length);

            await this.sendPushNotification(sampleTitles[idx], {
                body: sampleBodies[idx],
                tag: 'tc-test-' + Date.now(),
                data: { test: true }
            });

            if (typeof showToast === 'function') {
                showToast('🔔 Notificação de teste enviada!', 'success');
            }
            return true;
        }

        // ============================================
        // CHECAGEM DE CONTAS A VENCER
        // ============================================

        async checkDueBills(forceNotify = false) {
            try {
                if (!this.isAllowedPage()) {
                    console.log('🔔 Página não suporta banner de contas, ignorando');
                    return;
                }

                if (!window.supabaseClient) return;
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (!user) return;

                const { data: bills, error } = await window.supabaseClient
                    .from('transactions')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('type', 'expense')
                    .eq('is_bill', true)
                    .eq('paid', false)
                    .order('date', { ascending: true });

                if (error) throw error;

                this.processDueBills(bills || [], forceNotify);
            } catch (e) {
                console.warn('⚠️ Erro ao verificar contas a vencer:', e);
            }
        }

        processDueBills(bills, forceNotify = false) {
            const todayStr = new Date().toISOString().split('T')[0];
            const today = new Date(todayStr + 'T00:00:00');

            const categorized = [];

            bills.forEach(bill => {
                const billDateStr = bill.date;
                const billDate = new Date(billDateStr + 'T00:00:00');
                const diffTime = billDate - today;
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                let status = 'upcoming';
                let statusLabel = '';
                let urgency = 'low';

                if (diffDays < 0) {
                    status = 'overdue';
                    statusLabel = `Venceu há ${Math.abs(diffDays)} dia(s)`;
                    urgency = 'high';
                } else if (diffDays === 0) {
                    status = 'today';
                    statusLabel = 'Vence hoje!';
                    urgency = 'urgent';
                } else if (diffDays === 1) {
                    status = 'tomorrow';
                    statusLabel = 'Vence amanhã';
                    urgency = 'medium';
                } else if (diffDays <= 7) {
                    status = 'soon';
                    statusLabel = `Vence em ${diffDays} dias`;
                    urgency = 'normal';
                }

                categorized.push({
                    ...bill,
                    diffDays,
                    status,
                    statusLabel,
                    urgency
                });
            });

            this.dueBills = categorized;
            this.updateBellBadge();
            this.renderDropdownContent();

            if (this.isAllowedPage()) {
                this.renderDueBanner();
            }

            if (this.settings.enabled && (this.getPermissionState() === 'granted' || forceNotify)) {
                this.dispatchPushReminders(categorized, todayStr, forceNotify);
            }
        }

        // ============================================
        // 🔥 AGRUPAR NOTIFICAÇÕES POR CONTA
        // ============================================

        groupNotificationsByBill(notifications) {
            const grouped = {};

            notifications.forEach(notif => {
                const key = notif.billId || notif.id || notif.description;

                if (!grouped[key]) {
                    grouped[key] = {
                        bill: notif,
                        count: 0,
                        messages: [],
                        totalAmount: 0
                    };
                }

                grouped[key].count++;
                grouped[key].messages.push(notif.statusLabel || 'Pendente');
                grouped[key].totalAmount += Number(notif.amount) || 0;
            });

            return grouped;
        }

        // ============================================
        // RENDER DUE BANNER
        // ============================================

        renderDueBanner() {
            const currentPath = window.location.pathname;
            const allowedPages = ['dashboard.html', 'bills.html'];
            const isAllowedPage = allowedPages.some(page => currentPath.includes(page));

            if (!isAllowedPage) {
                const existingBanner = document.getElementById('dueBillsWarningBanner');
                if (existingBanner) existingBanner.remove();
                return;
            }

            const targetContainer = document.querySelector('.content');
            if (!targetContainer) return;

            const existingBanner = document.getElementById('dueBillsWarningBanner');
            if (existingBanner) existingBanner.remove();

            const urgentBills = this.dueBills.filter(b => b.status === 'overdue' || b.status === 'today');
            if (urgentBills.length === 0) return;

            const overdueCount = urgentBills.filter(b => b.status === 'overdue').length;
            const todayCount = urgentBills.filter(b => b.status === 'today').length;

            let bannerTitle = '';
            let bannerDesc = '';
            let isWarning = overdueCount === 0;

            if (overdueCount > 0 && todayCount > 0) {
                bannerTitle = `⚠️ Você tem ${overdueCount} conta(s) vencida(s) e ${todayCount} que vence(m) hoje!`;
                bannerDesc = 'Mantenha seus pagamentos em dia para evitar juros e multas.';
            } else if (overdueCount > 0) {
                bannerTitle = `🚨 Atenção: ${overdueCount} conta(s) em atraso!`;
                bannerDesc = 'Acesse a lista e efetue o pagamento para regularizar suas contas.';
            } else {
                bannerTitle = `⏰ Lembrete: ${todayCount} conta(s) com vencimento marcado para HOJE!`;
                bannerDesc = 'Efetue o pagamento hoje para não gerar atraso.';
            }

            const billsPageUrl = this.getBillsPageUrl();

            const banner = document.createElement('div');
            banner.id = 'dueBillsWarningBanner';
            banner.className = `due-bills-banner ${isWarning ? 'warning' : ''}`;
            banner.innerHTML = `
                <div class="due-banner-left">
                    <div class="due-banner-icon">
                        <i class="fas ${isWarning ? 'fa-clock' : 'fa-exclamation-triangle'}"></i>
                    </div>
                    <div class="due-banner-info">
                        <h4>${bannerTitle}</h4>
                        <p>${bannerDesc}</p>
                    </div>
                </div>
                <div class="due-banner-actions">
                    <button class="btn btn-sm ${isWarning ? 'btn-primary' : 'btn-danger'}" onclick="window.location.href='${billsPageUrl}'">
                        <i class="fas fa-file-invoice-dollar"></i> Ver Contas
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('dueBillsWarningBanner').remove()" title="Dispensar aviso">
                        &times;
                    </button>
                </div>
            `;

            targetContainer.insertBefore(banner, targetContainer.firstChild);
        }

        dispatchPushReminders(categorizedBills, todayStr, forceNotify = false) {
            const notifiedLog = this.getNotifiedLog();
            const allowedDays = this.settings.remindDaysBefore || [0, 1, 2, 3];

            categorizedBills.forEach(bill => {
                let shouldNotify = false;
                let title = '';
                let body = '';

                const formattedAmount = typeof formatCurrency === 'function'
                    ? formatCurrency(bill.amount)
                    : `R$ ${Number(bill.amount).toFixed(2)}`;

                if (bill.status === 'overdue' && this.settings.remindOverdue) {
                    shouldNotify = true;
                    title = `🚨 Conta vencida: ${bill.description}`;
                    body = `Valor: ${formattedAmount} • Venceu em ${typeof formatDate === 'function' ? formatDate(bill.date) : bill.date}. Toque para pagar e evitar juros.`;
                } else if (bill.status === 'today' && (allowedDays.includes(0) || this.settings.remindOnDueDate)) {
                    shouldNotify = true;
                    title = `⏰ Vence HOJE: ${bill.description}`;
                    body = `Valor: ${formattedAmount} • Não esqueça de efetuar o pagamento hoje!`;
                } else if (bill.status === 'tomorrow' && allowedDays.includes(1)) {
                    shouldNotify = true;
                    title = `⚠️ Vence amanhã: ${bill.description}`;
                    body = `Valor: ${formattedAmount} • Vencimento em ${typeof formatDate === 'function' ? formatDate(bill.date) : bill.date}.`;
                } else if (bill.status === 'soon' && allowedDays.includes(bill.diffDays)) {
                    shouldNotify = true;
                    title = `📅 Lembrete de conta: ${bill.description}`;
                    body = `Valor: ${formattedAmount} • Vence em ${bill.diffDays} dias (${typeof formatDate === 'function' ? formatDate(bill.date) : bill.date}).`;
                }

                if (shouldNotify) {
                    const logKey = `${todayStr}_${bill.id}_${bill.status}`;
                    if (!notifiedLog[logKey] || forceNotify) {
                        this.sendPushNotification(title, {
                            body: body,
                            tag: `bill-${bill.id}-${todayStr}`,
                            data: { billId: bill.id, url: this.getBillsPageUrl() }
                        });
                        notifiedLog[logKey] = Date.now();
                    }
                }
            });

            this.saveNotifiedLog(notifiedLog);
        }

        getNotifiedLog() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY_NOTIFIED);
                return raw ? JSON.parse(raw) : {};
            } catch (e) {
                return {};
            }
        }

        saveNotifiedLog(log) {
            try {
                const now = Date.now();
                const cleaned = {};
                for (const k in log) {
                    if (now - log[k] < 7 * 24 * 60 * 60 * 1000) {
                        cleaned[k] = log[k];
                    }
                }
                localStorage.setItem(STORAGE_KEY_NOTIFIED, JSON.stringify(cleaned));
            } catch (e) { }
        }

        startPeriodicCheck() {
            setInterval(() => {
                if (this.isAllowedPage()) {
                    this.checkDueBills(false);
                }
            }, 20 * 60 * 1000);
        }

        // ============================================
        // UI
        // ============================================

        setupUI() {
            this.injectDropdown();
            this.injectBellToTopbar();

            if (this.isAllowedPage()) {
                this.checkDueBills(false);
            }
        }

        injectBellToTopbar() {
            let bellBtn = document.getElementById('notifBellBtn');

            if (!bellBtn) {
                const topbarActions = document.querySelector('.topbar-actions');
                if (!topbarActions) return;

                bellBtn = document.createElement('button');
                bellBtn.id = 'notifBellBtn';
                bellBtn.className = 'notif-bell-btn';
                bellBtn.title = 'Lembretes e Notificações de Contas';
                bellBtn.setAttribute('aria-label', 'Notificações');
                bellBtn.setAttribute('type', 'button');
                bellBtn.innerHTML = `
                    <i class="fas fa-bell"></i>
                    <span class="notif-badge hidden" id="notifBadgeCount">0</span>
                `;

                topbarActions.insertBefore(bellBtn, topbarActions.firstChild);
            }

            bellBtn.setAttribute('type', 'button');
            bellBtn.onclick = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                this.toggleDropdown();
            };
        }

        injectDropdown() {
            let dropdown = document.getElementById('notifDropdown');
            let backdrop = document.getElementById('notifBackdrop');

            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.id = 'notifBackdrop';
                backdrop.className = 'notif-backdrop';
                backdrop.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeDropdown();
                });
                document.body.appendChild(backdrop);
            }

            if (!dropdown) {
                dropdown = document.createElement('div');
                dropdown.id = 'notifDropdown';
                dropdown.className = 'notif-dropdown';
                document.body.appendChild(dropdown);
            }

            this.renderDropdownContent();
        }

        toggleDropdown() {
            let dropdown = document.getElementById('notifDropdown');
            if (!dropdown) {
                this.injectDropdown();
                dropdown = document.getElementById('notifDropdown');
            }
            if (!dropdown) return;

            const isShown = dropdown.classList.contains('show') || dropdown.style.display === 'flex';
            if (isShown) {
                this.closeDropdown();
            } else {
                this.openDropdown();
            }
        }

        openDropdown() {
            this.injectDropdown();
            const dropdown = document.getElementById('notifDropdown');
            const backdrop = document.getElementById('notifBackdrop');

            this.renderDropdownContent();

            if (dropdown) {
                dropdown.classList.add('show');
                dropdown.style.display = 'flex';
                dropdown.style.opacity = '1';
                dropdown.style.visibility = 'visible';
                dropdown.style.pointerEvents = 'auto';
            }
            if (backdrop) {
                backdrop.classList.add('show');
                backdrop.style.display = 'block';
            }
            if (this.isAllowedPage()) {
                this.checkDueBills(false);
            }
        }

        closeDropdown() {
            const dropdown = document.getElementById('notifDropdown');
            const backdrop = document.getElementById('notifBackdrop');
            if (dropdown) {
                dropdown.classList.remove('show');
                dropdown.style.display = 'none';
                dropdown.style.opacity = '0';
                dropdown.style.visibility = 'hidden';
                dropdown.style.pointerEvents = 'none';
            }
            if (backdrop) {
                backdrop.classList.remove('show');
                backdrop.style.display = 'none';
            }
        }

        updateBellBadge() {
            const badge = document.getElementById('notifBadgeCount');
            const bellBtn = document.getElementById('notifBellBtn');
            if (!badge) return;

            const urgentCount = this.dueBills.filter(b => b.status === 'overdue' || b.status === 'today' || b.status === 'tomorrow').length;
            const totalDue = this.dueBills.length;

            if (totalDue > 0) {
                badge.textContent = totalDue > 9 ? '9+' : totalDue;
                badge.classList.remove('hidden');
                badge.style.display = 'flex';

                if (urgentCount > 0 && bellBtn) {
                    bellBtn.classList.add('has-urgent');
                } else if (bellBtn) {
                    bellBtn.classList.remove('has-urgent');
                }
            } else {
                badge.classList.add('hidden');
                badge.style.display = 'none';
                if (bellBtn) bellBtn.classList.remove('has-urgent');
            }
        }

        // ============================================
        // RENDER DROPDOWN - COM AGRUPAMENTO
        // ============================================

        renderDropdownContent() {
            const dropdown = document.getElementById('notifDropdown');
            if (!dropdown) return;

            const perm = this.getPermissionState();
            const isGranted = perm === 'granted';
            const billsPageUrl = this.getBillsPageUrl();

            const grouped = this.groupNotificationsByBill(this.dueBills);
            const totalBills = Object.keys(grouped).length;

            let permBannerHTML = '';
            if (!isGranted) {
                permBannerHTML = `
                    <div class="notif-perm-banner">
                        <div class="notif-perm-text">
                            <i class="fas fa-bell-slash text-warning"></i>
                            <span>Ative as Notificações Push para não esquecer contas a vencer</span>
                        </div>
                        <button class="notif-perm-btn" onclick="window.billNotificationManager.requestPermission()">
                            Ativar
                        </button>
                    </div>
                `;
            }

            let billsListHTML = '';
            if (totalBills === 0) {
                billsListHTML = `
                    <div class="notif-empty">
                        <span class="notif-empty-icon">🎉</span>
                        <p><strong>Tudo em dia!</strong></p>
                        <small>Você não possui contas pendentes ou a vencer nos próximos dias.</small>
                    </div>
                `;
            } else {
                billsListHTML = Object.entries(grouped).map(([key, group]) => {
                    const bill = group.bill;
                    const formattedAmount = typeof formatCurrency === 'function'
                        ? formatCurrency(bill.amount)
                        : `R$ ${Number(bill.amount).toFixed(2)}`;

                    let tagClass = 'due-soon';
                    let itemClass = 'due-soon';
                    let iconBg = '#6C5CE7';
                    let icon = 'fa-file-invoice-dollar';

                    if (bill.status === 'overdue') {
                        tagClass = 'overdue';
                        itemClass = 'overdue';
                        iconBg = '#FF7675';
                        icon = 'fa-exclamation-triangle';
                    } else if (bill.status === 'today') {
                        tagClass = 'due-today';
                        itemClass = 'due-today';
                        iconBg = '#F39C12';
                        icon = 'fa-clock';
                    }

                    const countBadge = group.count > 1 ? `<span class="notif-group-count">${group.count}</span>` : '';

                    return `
                        <div class="notif-item ${itemClass}" onclick="window.location.href='${billsPageUrl}'">
                            <div class="notif-icon-box" style="background:${iconBg}">
                                <i class="fas ${icon}"></i>
                                ${countBadge}
                            </div>
                            <div class="notif-item-content">
                                <div class="notif-item-title">
                                    <span>${sanitizeString(bill.description)}</span>
                                    <span class="notif-item-amount">${formattedAmount}</span>
                                </div>
                                <div class="notif-item-desc">
                                    <span class="notif-tag ${tagClass}">${bill.statusLabel}</span>
                                    <span>• Venc: ${typeof formatDate === 'function' ? formatDate(bill.date) : bill.date}</span>
                                    ${group.count > 1 ? `<span class="notif-more">+${group.count - 1} mais</span>` : ''}
                                </div>
                                <div class="notif-actions">
                                    <button class="notif-btn-pay" onclick="event.stopPropagation(); window.billNotificationManager.quickPayBill('${bill.id}')">
                                        <i class="fas fa-check"></i> Pagar
                                    </button>
                                    <button class="notif-btn-view" onclick="event.stopPropagation(); window.location.href='${billsPageUrl}'">
                                        Ver detalhes
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            dropdown.innerHTML = `
                <div class="notif-header">
                    <div class="notif-header-title">
                        <i class="fas fa-bell"></i>
                        <span>Lembretes de Contas</span>
                        ${totalBills > 0 ? `<span class="notif-header-badge">${totalBills}</span>` : ''}
                    </div>
                    <div class="notif-header-actions">
                        <button class="notif-header-btn" onclick="window.billNotificationManager.testNotification()" title="Enviar notificação de teste">
                            <i class="fas fa-paper-plane"></i> Testar
                        </button>
                        <button class="notif-header-btn" onclick="window.billNotificationManager.checkDueBills(true)" title="Atualizar agora">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
                ${permBannerHTML}
                <div class="notif-body">
                    ${billsListHTML}
                </div>
                <div class="notif-footer">
                    <span>${totalBills} conta(s) pendente(s)</span>
                    <a href="${billsPageUrl}">Gerenciar Contas →</a>
                </div>
            `;
        }

        async quickPayBill(billId) {
            if (typeof window.payBill === 'function') {
                await window.payBill(billId);
                if (this.isAllowedPage()) {
                    this.checkDueBills(false);
                }
                return;
            }

            if (!confirm('Confirmar pagamento desta conta?')) return;

            try {
                if (!window.supabaseClient) throw new Error('Supabase não disponível');
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (!user) throw new Error('Usuário não autenticado');

                const { data: bill, error: fetchErr } = await window.supabaseClient
                    .from('transactions')
                    .select('*')
                    .eq('id', billId)
                    .single();

                if (fetchErr) throw fetchErr;

                await window.supabaseClient
                    .from('transactions')
                    .update({ paid: true })
                    .eq('id', billId);

                await window.supabaseClient
                    .from('transactions')
                    .insert([{
                        user_id: user.id,
                        type: 'expense',
                        description: `💰 ${bill.description} (pago)`,
                        amount: bill.amount,
                        category_id: bill.category_id,
                        date: new Date().toISOString().split('T')[0],
                        paid: true,
                        is_bill: false,
                        notes: `Pagamento da conta ${bill.description}`
                    }]);

                if (typeof showToast === 'function') {
                    showToast('💰 Conta marcada como paga com sucesso! ✅', 'success');
                }

                if (this.isAllowedPage()) {
                    await this.checkDueBills(false);
                }

                if (typeof window.loadBills === 'function') {
                    window.loadBills();
                } else if (typeof window.loadDashboardData === 'function') {
                    window.loadDashboardData();
                }
            } catch (err) {
                console.error('❌ Erro ao pagar conta rapidamente:', err);
                if (typeof showToast === 'function') {
                    showToast('Erro ao pagar conta', 'error');
                }
            }
        }

        updateUI() {
            this.renderDropdownContent();
            this.updateBellBadge();
            if (typeof window.renderNotificationSettingsUI === 'function') {
                window.renderNotificationSettingsUI();
            }
        }
    }

    // ============================================
    // INSTANCIAR GLOBALMENTE
    // ============================================

    const manager = new BillNotificationManager();
    window.billNotificationManager = manager;
    window.NotificationManager = BillNotificationManager;

    window.toggleNotificationDropdown = function (event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (window.billNotificationManager) {
            window.billNotificationManager.toggleDropdown();
        }
    };
    window.toggleNotifications = window.toggleNotificationDropdown;

    document.addEventListener('click', (e) => {
        const bell = e.target.closest('#notifBellBtn, .notif-bell-btn');
        if (bell) {
            e.preventDefault();
            e.stopPropagation();
            window.toggleNotificationDropdown();
            return;
        }

        const dropdown = document.getElementById('notifDropdown');
        const insideDropdown = e.target.closest('#notifDropdown');
        if (dropdown && dropdown.classList.contains('show') && !insideDropdown) {
            window.billNotificationManager?.closeDropdown();
        }
    });

})();