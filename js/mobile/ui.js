/* ==========================================================================
   TONUCONTROLE - MOBILE PREMIUM UI ENGINE (js/mobile/ui.js)
   Pull-to-refresh, Swipe Nav, Swipe-to-Delete, Count-up, Confetti,
   Synced Privacy Mode, Command Palette, Haptics & Nav Progress Bar.
   Zero global scope leakage: IIFE exposing strictly window.TonuMobileUI.
   ========================================================================== */
(function (window, document) {
    'use strict';

    var STORAGE_PRIVACY_KEY = 'tonu_hide_balance';
    var MOBILE_TABS = [
        'dashboard.html',
        'transactions.html',
        'bills.html',
        'investments.html',
        'goals.html',
        'settings.html'
    ];

    function prefersReducedMotion() {
        try {
            return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (_) {
            return false;
        }
    }

    // ======================================================================
    // 1. HAPTIC FEEDBACK
    // ======================================================================
    function haptic(type) {
        if (typeof window.safeHaptic === 'function') {
            var ms = type === 'medium' ? 22 : (type === 'success' ? [12, 30, 18] : (type === 'warning' || type === 'error' ? [25, 40, 25] : 10));
            window.safeHaptic(ms);
            return;
        }
        try {
            if (navigator && typeof navigator.vibrate === 'function') {
                if (type === 'success') navigator.vibrate([12, 30, 18]);
                else if (type === 'warning' || type === 'error') navigator.vibrate([25, 40, 25]);
                else if (type === 'medium') navigator.vibrate(20);
                else navigator.vibrate(10);
            }
        } catch (_) {}
    }

    // ======================================================================
    // 2. THEME-COLOR META SYNC
    // ======================================================================
    function syncThemeMeta() {
        var isDark = document.body.classList.contains('dark-theme') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', isDark ? '#0B1220' : '#F8FAFC');
        }
        var statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (statusMeta) {
            statusMeta.setAttribute('content', isDark ? 'black-translucent' : 'default');
        }
    }

    // ======================================================================
    // 3. SYNCHRONIZED PRIVACY MODE (tonu_hide_balance)
    // ======================================================================
    function isPrivacyHidden() {
        try {
            return localStorage.getItem(STORAGE_PRIVACY_KEY) === 'true';
        } catch (_) {
            return false;
        }
    }

    function applyPrivacyState(hidden) {
        if (typeof hidden === 'undefined') hidden = isPrivacyHidden();
        document.documentElement.classList.toggle('tonu-privacy-hidden', !!hidden);
        document.body.classList.toggle('tonu-privacy-hidden', !!hidden);

        var icons = document.querySelectorAll('[data-privacy-icon], #privacyToggleIcon, #balanceEyeIcon');
        icons.forEach(function (ic) {
            ic.classList.toggle('fa-eye', !hidden);
            ic.classList.toggle('fa-eye-slash', !!hidden);
        });

        var btns = document.querySelectorAll('[data-privacy-toggle]');
        btns.forEach(function (btn) {
            btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
            btn.setAttribute('title', hidden ? 'Mostrar valores' : 'Ocultar valores');
        });

        var sensitive = document.querySelectorAll('[data-sensitive]');
        sensitive.forEach(function (el) {
            el.classList.toggle('mob-masked-val', !!hidden);
        });
    }

    function togglePrivacyMode() {
        haptic('light');
        // Delegate to dashboard's own toggleBalanceVisibility if present on dashboard
        if (typeof window.toggleBalanceVisibility === 'function') {
            window.toggleBalanceVisibility();
            applyPrivacyState(isPrivacyHidden());
            return isPrivacyHidden();
        }
        var next = !isPrivacyHidden();
        try {
            localStorage.setItem(STORAGE_PRIVACY_KEY, next ? 'true' : 'false');
        } catch (_) {}
        applyPrivacyState(next);
        try {
            window.dispatchEvent(new CustomEvent('tonu:privacyChanged', { detail: { hidden: next } }));
        } catch (_) {}
        return next;
    }

    // ======================================================================
    // 4. ANIMATED MONETARY COUNT-UP (550ms easeOutCubic)
    // ======================================================================
    function animateValue(el, toVal, formatter) {
        if (!el) return;
        var target = Number(toVal);
        if (!Number.isFinite(target)) return;

        if (el._tonuRafId && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(el._tonuRafId);
            el._tonuRafId = null;
        }

        var fmt = typeof formatter === 'function'
            ? formatter
            : (typeof window.formatCurrency === 'function' ? window.formatCurrency : function (v) {
                return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
            });

        if (isPrivacyHidden() && el.hasAttribute('data-sensitive')) {
            el.textContent = fmt(target);
            el.dataset.animPrev = String(target);
            return;
        }

        if (prefersReducedMotion() || typeof window.requestAnimationFrame !== 'function') {
            el.textContent = fmt(target);
            el.dataset.animPrev = String(target);
            return;
        }

        var prev = parseFloat(el.dataset.animPrev || '0');
        if (!Number.isFinite(prev)) prev = 0;
        if (Math.abs(target - prev) < 0.005) {
            el.textContent = fmt(target);
            el.dataset.animPrev = String(target);
            return;
        }

        var duration = 550;
        var startTime = performance.now();

        function step(now) {
            var p = Math.min(1, (now - startTime) / duration);
            var eased = 1 - Math.pow(1 - p, 3);
            var current = prev + (target - prev) * eased;
            el.textContent = fmt(p >= 1 ? target : current);
            if (p < 1) {
                el._tonuRafId = window.requestAnimationFrame(step);
            } else {
                el._tonuRafId = null;
                el.dataset.animPrev = String(target);
            }
        }
        el._tonuRafId = window.requestAnimationFrame(step);
    }

    // ======================================================================
    // 5. TOP NAVIGATION PROGRESS BAR
    // ======================================================================
    function ensureProgressBar() {
        var bar = document.getElementById('mobNavProgress');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'mobNavProgress';
            bar.className = 'mob-nav-progress';
            bar.setAttribute('aria-hidden', 'true');
            document.body.appendChild(bar);
        }
        return bar;
    }

    function startNavProgress() {
        var bar = ensureProgressBar();
        bar.classList.remove('done');
        bar.classList.add('loading');
    }

    function finishNavProgress() {
        var bar = document.getElementById('mobNavProgress');
        if (!bar) return;
        bar.classList.remove('loading');
        bar.classList.add('done');
        setTimeout(function () {
            bar.classList.remove('done');
        }, 320);
    }

    function setupLinkProgress() {
        document.addEventListener('click', function (e) {
            var anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!anchor) return;
            var href = anchor.getAttribute('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript:') || anchor.target === '_blank') return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            haptic('light');
            startNavProgress();
        });
        window.addEventListener('pageshow', finishNavProgress);
    }

    // ======================================================================
    // 6. PULL-TO-REFRESH
    // ======================================================================
    function setupPullToRefresh(onRefreshCallback) {
        if (!document.body || document.getElementById('mobPullIndicator')) return;

        var indicator = document.createElement('div');
        indicator.id = 'mobPullIndicator';
        indicator.className = 'mob-pull-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        indicator.innerHTML = '<div class="mob-pull-pill"><i class="fas fa-arrow-down mob-pull-icon"></i><span class="mob-pull-text">Puxe para atualizar</span></div>';
        document.body.appendChild(indicator);

        var startY = 0;
        var startX = 0;
        var pulling = false;
        var triggered = false;
        var maxPull = 76;

        function resetIndicator() {
            pulling = false;
            indicator.style.transform = '';
            indicator.style.opacity = '';
            indicator.classList.remove('ready', 'refreshing');
            var icon = indicator.querySelector('.mob-pull-icon');
            var text = indicator.querySelector('.mob-pull-text');
            if (icon) icon.className = 'fas fa-arrow-down mob-pull-icon';
            if (text) text.textContent = 'Puxe para atualizar';
        }

        function isBlockedTarget(target) {
            if (!target || !target.closest) return false;
            return Boolean(target.closest('.mobile-modal-overlay.active, .mob-cmd-overlay.active, input, textarea, select, canvas, .notif-dropdown.open'));
        }

        document.addEventListener('touchstart', function (e) {
            if (triggered || window.scrollY > 2 || !e.touches || e.touches.length !== 1) return;
            if (isBlockedTarget(e.target)) return;
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
            pulling = true;
        }, { passive: true });

        document.addEventListener('touchmove', function (e) {
            if (!pulling || triggered || !e.touches || e.touches.length !== 1) return;
            if (e.target && e.target.closest && e.target.closest('[data-swipe-row].is-swiping')) {
                pulling = false;
                return;
            }
            var dy = e.touches[0].clientY - startY;
            var dx = Math.abs(e.touches[0].clientX - startX);
            if (dy <= 6 || dx > dy * 0.85 || window.scrollY > 2) {
                if (dy <= 0 || window.scrollY > 2) pulling = false;
                return;
            }
            var dist = Math.min(maxPull, Math.round(dy * 0.45));
            indicator.style.opacity = String(Math.min(1, dist / 46));
            indicator.style.transform = 'translate(-50%, ' + dist + 'px)';
            var ready = dist >= 56;
            indicator.classList.toggle('ready', ready);
            var text = indicator.querySelector('.mob-pull-text');
            if (text) text.textContent = ready ? 'Solte para atualizar' : 'Puxe para atualizar';
        }, { passive: true });

        document.addEventListener('touchend', function () {
            if (!pulling || triggered) {
                pulling = false;
                return;
            }
            var isReady = indicator.classList.contains('ready');
            pulling = false;
            if (!isReady) {
                resetIndicator();
                return;
            }

            triggered = true;
            haptic('medium');
            indicator.classList.remove('ready');
            indicator.classList.add('refreshing');
            indicator.style.opacity = '1';
            indicator.style.transform = 'translate(-50%, 54px)';
            var icon = indicator.querySelector('.mob-pull-icon');
            var text = indicator.querySelector('.mob-pull-text');
            if (icon) icon.className = 'fas fa-circle-notch fa-spin mob-pull-icon';
            if (text) text.textContent = 'Atualizando...';

            var finish = function () {
                triggered = false;
                resetIndicator();
            };

            try {
                var cb = typeof onRefreshCallback === 'function' ? onRefreshCallback : defaultRefreshHandler;
                Promise.resolve(cb()).finally(function () {
                    setTimeout(finish, 350);
                });
            } catch (_) {
                setTimeout(finish, 400);
            }
        }, { passive: true });
    }

    function defaultRefreshHandler() {
        if (typeof window.syncMobileDashboardNow === 'function') return window.syncMobileDashboardNow();
        if (typeof window.loadMobileData === 'function') return window.loadMobileData({ forceRefresh: true });
        if (typeof window.refreshMobileInvestments === 'function') return window.refreshMobileInvestments();
        if (typeof window.loadGoals === 'function') return window.loadGoals();
        if (typeof window.loadBills === 'function') return window.loadBills();
        if (typeof window.loadTransactions === 'function') return window.loadTransactions();
        window.location.reload();
        return Promise.resolve();
    }

    // ======================================================================
    // 7. HORIZONTAL SWIPE NAVIGATION BETWEEN 6 TABS
    // ======================================================================
    function setupSwipeTabNavigation() {
        var currentFile = (window.location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
        var currentIndex = MOBILE_TABS.indexOf(currentFile);
        if (currentIndex === -1) return;

        var startX = 0;
        var startY = 0;
        var startTime = 0;
        var blocked = false;

        var IGNORE_SELECTOR = [
            '.goals-carousel-track',
            '.ios-filter-scroll',
            '.chip-filters',
            '.mobile-tabs-scroll',
            '.mobile-quick-actions',
            '.mobile-modal-overlay.active',
            '.mob-cmd-overlay.active',
            '[data-swipe-row]',
            'canvas',
            'table',
            '.matrix-scroll',
            'input',
            'select',
            'textarea'
        ].join(', ');

        document.addEventListener('touchstart', function (e) {
            if (!e.touches || e.touches.length !== 1) {
                blocked = true;
                return;
            }
            var t = e.target;
            blocked = Boolean(t && t.closest && t.closest(IGNORE_SELECTOR));
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startTime = Date.now();
        }, { passive: true });

        document.addEventListener('touchend', function (e) {
            if (blocked || !e.changedTouches || e.changedTouches.length !== 1) return;
            var dx = e.changedTouches[0].clientX - startX;
            var dy = e.changedTouches[0].clientY - startY;
            var elapsed = Date.now() - startTime;

            if (elapsed > 600) return;
            if (Math.abs(dx) < 84 || Math.abs(dy) > Math.abs(dx) * 0.45) return;

            var targetIdx = dx < 0 ? currentIndex + 1 : currentIndex - 1;
            if (targetIdx < 0 || targetIdx >= MOBILE_TABS.length) return;

            haptic('light');
            startNavProgress();
            window.location.href = MOBILE_TABS[targetIdx];
        }, { passive: true });
    }

    // ======================================================================
    // 8. SWIPE ACTIONS ON LIST ITEMS ([data-swipe-row])
    // ======================================================================
    function closeSwipeRows(exceptRow) {
        document.querySelectorAll('[data-swipe-row].swiped-open, [data-swipe-row].is-swiping').forEach(function (row) {
            if (row !== exceptRow) {
                row.classList.remove('swiped-open', 'is-swiping');
                var fg = row.querySelector('[data-swipe-content]');
                if (fg) fg.style.transform = '';
            }
        });
    }

    function getSwipeActionWidth(row) {
        if (!row) return 80;
        var attr = Number(row.getAttribute('data-swipe-width'));
        if (Number.isFinite(attr) && attr > 0) return attr;
        var tray = row.querySelector('.swipe-actions-tray, .swipe-action-delete');
        if (tray && tray.offsetWidth > 0) return tray.offsetWidth;
        return 80;
    }

    function setupSwipeToDelete() {
        var activeRow = null;
        var activeWidth = 80;
        var startX = 0;
        var startY = 0;
        var baseOffset = 0;
        var dragging = false;
        var isMouseDown = false;
        var lastTouchTime = 0;
        var suppressClickUntil = 0;

        function startDrag(target, clientX, clientY) {
            var row = target && target.closest ? target.closest('[data-swipe-row]') : null;
            if (!row) {
                closeSwipeRows(null);
                return false;
            }
            if (target.closest('button, a, input, select, label')) return false;
            closeSwipeRows(row);
            activeRow = row;
            activeWidth = getSwipeActionWidth(row);
            startX = clientX;
            startY = clientY;
            baseOffset = row.classList.contains('swiped-open') ? -activeWidth : 0;
            dragging = false;
            return true;
        }

        function moveDrag(clientX, clientY, eventObj) {
            if (!activeRow) return;
            var dx = clientX - startX;
            var dy = clientY - startY;
            if (!dragging && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
                activeRow.classList.remove('is-swiping');
                activeRow = null;
                return;
            }
            if (!dragging && Math.abs(dx) < 8) return;
            if (!dragging) {
                dragging = true;
                activeRow.classList.add('is-swiping');
            }
            if (eventObj && eventObj.cancelable) {
                eventObj.preventDefault();
            }
            var fg = activeRow.querySelector('[data-swipe-content]');
            if (fg) {
                var nextOffset = Math.max(-activeWidth, Math.min(0, baseOffset + dx));
                fg.style.transition = 'none';
                fg.style.transform = 'translateX(' + nextOffset + 'px)';
            }
        }

        function endDrag(clientX) {
            if (!activeRow) return;
            var row = activeRow;
            var fg = row.querySelector('[data-swipe-content]');
            var wasDragging = dragging;
            var wasOpen = baseOffset < 0;
            var width = activeWidth;
            activeRow = null;
            dragging = false;
            row.classList.remove('is-swiping');

            if (!fg) return;
            if (!wasDragging) {
                if (wasOpen) {
                    suppressClickUntil = Date.now() + 260;
                    row.classList.remove('swiped-open');
                    fg.style.transition = '';
                    fg.style.transform = '';
                }
                return;
            }

            suppressClickUntil = Date.now() + 260;
            var dx = clientX - startX;
            var shouldOpen = wasOpen ? (dx < 32) : (dx < -38);
            fg.style.transition = '';
            if (shouldOpen) {
                row.classList.add('swiped-open');
                fg.style.transform = 'translateX(-' + width + 'px)';
                haptic('light');
            } else {
                row.classList.remove('swiped-open');
                fg.style.transform = '';
            }
        }

        document.addEventListener('touchstart', function (e) {
            if (!e.touches || e.touches.length !== 1) return;
            lastTouchTime = Date.now();
            startDrag(e.target, e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        document.addEventListener('touchmove', function (e) {
            if (!activeRow || !e.touches || e.touches.length !== 1) return;
            moveDrag(e.touches[0].clientX, e.touches[0].clientY, e);
        }, { passive: false });

        document.addEventListener('touchend', function (e) {
            if (!activeRow || !e.changedTouches || !e.changedTouches.length) return;
            endDrag(e.changedTouches[0].clientX);
        }, { passive: true });

        document.addEventListener('touchcancel', function () {
            if (!activeRow) return;
            var row = activeRow;
            var fg = row.querySelector('[data-swipe-content]');
            row.classList.remove('is-swiping');
            if (fg) {
                fg.style.transition = '';
                fg.style.transform = row.classList.contains('swiped-open') ? ('translateX(-' + activeWidth + 'px)') : '';
            }
            activeRow = null;
            dragging = false;
        }, { passive: true });

        // Suporte a arraste com mouse/pointer em navegadores e emuladores
        document.addEventListener('mousedown', function (e) {
            if (e.button !== 0 || (Date.now() - lastTouchTime < 500)) return;
            isMouseDown = startDrag(e.target, e.clientX, e.clientY);
        });

        document.addEventListener('mousemove', function (e) {
            if (!isMouseDown || !activeRow) return;
            moveDrag(e.clientX, e.clientY, e);
        });

        window.addEventListener('mouseup', function (e) {
            if (!isMouseDown) return;
            isMouseDown = false;
            if (activeRow) endDrag(e.clientX);
        });

        window.addEventListener('blur', function () {
            isMouseDown = false;
            if (activeRow) {
                activeRow.classList.remove('is-swiping');
                activeRow = null;
                dragging = false;
            }
        });

        document.addEventListener('click', function (e) {
            if (Date.now() < suppressClickUntil) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            if (e.target && e.target.closest && !e.target.closest('[data-swipe-row]')) {
                closeSwipeRows(null);
            }
        }, true);
    }

    // ======================================================================
    // 9. GOAL CELEBRATION CONFETTI & CHIME
    // ======================================================================
    function celebrate(options) {
        options = options || {};
        haptic('success');

        if (!prefersReducedMotion() && typeof window.confetti === 'function') {
            try {
                window.confetti({
                    particleCount: 95,
                    spread: 72,
                    origin: { y: 0.62 },
                    colors: ['#3730A3', '#4F46E5', '#10B981', '#F59E0B', '#38BDF8']
                });
            } catch (_) {}
        }

        if (options.sound !== false) {
            try {
                var AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    var ctx = new AudioCtx();
                    if (ctx.state === 'suspended') ctx.resume();
                    [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, idx) {
                        var osc = ctx.createOscillator();
                        var gain = ctx.createGain();
                        var t0 = ctx.currentTime + idx * 0.09;
                        osc.type = 'triangle';
                        osc.frequency.setValueAtTime(freq, t0);
                        gain.gain.setValueAtTime(0.001, t0);
                        gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
                        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.start(t0);
                        osc.stop(t0 + 0.3);
                    });
                }
            } catch (_) {}
        }
    }

    // ======================================================================
    // 10. GLOBAL SEARCH / COMMAND PALETTE (#mobCmdOverlay)
    // ======================================================================
    function buildCommands() {
        var isDark = document.body.classList.contains('dark-theme');
        var hidden = isPrivacyHidden();
        var items = [
            {
                id: 'new-expense',
                label: 'Nova Despesa',
                sub: 'Lançamento rápido de gasto',
                icon: 'fa-arrow-down',
                color: '#EF4444',
                run: function () {
                    if (typeof window.openQuickAddModal === 'function') return window.openQuickAddModal('expense');
                    if (typeof window.openAddModal === 'function') return window.openAddModal('expense');
                    window.location.href = 'transactions.html?action=new-expense';
                }
            },
            {
                id: 'new-income',
                label: 'Nova Receita',
                sub: 'Registrar entrada ou salário',
                icon: 'fa-arrow-up',
                color: '#10B981',
                run: function () {
                    if (typeof window.openQuickAddModal === 'function') return window.openQuickAddModal('income');
                    if (typeof window.openAddModal === 'function') return window.openAddModal('income');
                    window.location.href = 'transactions.html?action=new-income';
                }
            },
            {
                id: 'nav-dashboard',
                label: 'Ir para Dashboard',
                sub: 'Visão geral e saúde financeira',
                icon: 'fa-chart-pie',
                color: '#4338CA',
                run: function () { startNavProgress(); window.location.href = 'dashboard.html'; }
            },
            {
                id: 'nav-transactions',
                label: 'Ir para Transações',
                sub: 'Extrato, busca e filtros',
                icon: 'fa-exchange-alt',
                color: '#4F46E5',
                run: function () { startNavProgress(); window.location.href = 'transactions.html'; }
            },
            {
                id: 'nav-bills',
                label: 'Ir para Contas',
                sub: 'Contas a pagar, alertas e recorrências',
                icon: 'fa-file-invoice-dollar',
                color: '#F59E0B',
                run: function () { startNavProgress(); window.location.href = 'bills.html'; }
            },
            {
                id: 'nav-investments',
                label: 'Ir para Investimentos',
                sub: 'Custódia B3, proventos e evolução',
                icon: 'fa-chart-line',
                color: '#10B981',
                run: function () { startNavProgress(); window.location.href = 'investments.html'; }
            },
            {
                id: 'nav-goals',
                label: 'Ir para Metas',
                sub: 'Projetos, patrimônio e simulador CDI',
                icon: 'fa-bullseye',
                color: '#0284C7',
                run: function () { startNavProgress(); window.location.href = 'goals.html'; }
            },
            {
                id: 'nav-settings',
                label: 'Ir para Configurações',
                sub: 'Perfil, tema, notificações e exportação',
                icon: 'fa-cog',
                color: '#64748B',
                run: function () { startNavProgress(); window.location.href = 'settings.html'; }
            },
            {
                id: 'toggle-privacy',
                label: hidden ? 'Mostrar Valores Financeiros' : 'Ocultar Valores (Privacidade)',
                sub: 'Sincronizado em todas as telas mobile',
                icon: hidden ? 'fa-eye' : 'fa-eye-slash',
                color: '#4338CA',
                run: function () { togglePrivacyMode(); }
            },
            {
                id: 'toggle-theme',
                label: isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro',
                sub: 'Alternar aparência Aurora Light/Dark',
                icon: isDark ? 'fa-sun' : 'fa-moon',
                color: '#4F46E5',
                run: function () {
                    if (typeof window.toggleTheme === 'function') window.toggleTheme();
                    syncThemeMeta();
                }
            },
            {
                id: 'open-desktop',
                label: 'Abrir Versão Desktop',
                sub: 'Alternar para interface completa',
                icon: 'fa-desktop',
                color: '#64748B',
                run: function () {
                    try { localStorage.setItem('prefer_desktop_mode', 'true'); } catch (_) {}
                    window.location.href = '../dashboard.html';
                }
            }
        ];
        return items;
    }

    function closeCommandPalette() {
        var overlay = document.getElementById('mobCmdOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
        }
    }

    function openCommandPalette() {
        haptic('light');
        var overlay = document.getElementById('mobCmdOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'mobCmdOverlay';
            overlay.className = 'mob-cmd-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML =
                '<div class="mob-cmd-dialog" role="dialog" aria-modal="true" aria-label="Busca rápida">' +
                    '<div class="mob-cmd-search">' +
                        '<i class="fas fa-search"></i>' +
                        '<input type="search" id="mobCmdInput" class="mob-cmd-input" placeholder="Buscar tela, ação ou comando..." autocomplete="off">' +
                        '<button type="button" class="mob-cmd-close" id="mobCmdCloseBtn" aria-label="Fechar busca"><i class="fas fa-times"></i></button>' +
                    '</div>' +
                    '<div class="mob-cmd-list" id="mobCmdList"></div>' +
                '</div>';
            document.body.appendChild(overlay);

            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeCommandPalette();
            });
            overlay.querySelector('#mobCmdCloseBtn').addEventListener('click', closeCommandPalette);
            overlay.querySelector('#mobCmdInput').addEventListener('input', function (e) {
                renderCommands(e.target.value || '');
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && overlay.classList.contains('active')) {
                    closeCommandPalette();
                }
            });
        }

        var input = overlay.querySelector('#mobCmdInput');
        if (input) input.value = '';
        renderCommands('');
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        setTimeout(function () {
            if (input && typeof input.focus === 'function') input.focus();
        }, 60);
    }

    function renderCommands(query) {
        var listEl = document.getElementById('mobCmdList');
        if (!listEl) return;
        var q = String(query || '').trim().toLowerCase();
        var commands = buildCommands().filter(function (c) {
            if (!q) return true;
            return c.label.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q);
        });

        listEl.innerHTML = '';
        if (!commands.length) {
            listEl.innerHTML = '<div class="mob-cmd-empty">Nenhum comando encontrado para "' + q.replace(/</g, '&lt;') + '"</div>';
            return;
        }

        commands.forEach(function (cmd) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mob-cmd-item';
            btn.innerHTML =
                '<span class="mob-cmd-item-icon" style="color:' + cmd.color + ';background:' + cmd.color + '1a;"><i class="fas ' + cmd.icon + '"></i></span>' +
                '<span class="mob-cmd-item-body"><strong>' + cmd.label + '</strong><small>' + cmd.sub + '</small></span>' +
                '<i class="fas fa-chevron-right mob-cmd-arrow"></i>';
            btn.addEventListener('click', function () {
                closeCommandPalette();
                cmd.run();
            });
            listEl.appendChild(btn);
        });
    }

    // ======================================================================
    // 11. AURORA DOCK ENHANCEMENTS (LIQUID GLASS & TOUCH RIPPLE)
    // ======================================================================
    function setupAuroraDock() {
        var nav = document.querySelector('.bottom-nav');
        if (!nav) return;

        var updateScrollGlass = function () {
            nav.classList.toggle('is-scrolled', window.scrollY > 16);
        };
        updateScrollGlass();
        window.addEventListener('scroll', updateScrollGlass, { passive: true });

        nav.addEventListener('click', function (e) {
            var addBtn = e.target && e.target.closest ? e.target.closest('.nav-add-btn') : null;
            if (addBtn) {
                haptic('medium');
                return;
            }
            var anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!anchor) return;
            try {
                var existing = anchor.querySelector('.mob-nav-ripple');
                if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                var ripple = document.createElement('span');
                ripple.className = 'mob-nav-ripple';
                ripple.setAttribute('aria-hidden', 'true');
                anchor.appendChild(ripple);
                setTimeout(function () {
                    if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
                }, 420);
            } catch (_) {}
        });
    }

    // ======================================================================
    // 12. BOOTSTRAP
    // ======================================================================
    var initialized = false;
    function init(opts) {
        if (initialized) return;
        initialized = true;
        opts = opts || {};

        syncThemeMeta();
        applyPrivacyState(isPrivacyHidden());
        setupAuroraDock();
        setupLinkProgress();
        setupPullToRefresh(opts.onRefresh);
        setupSwipeTabNavigation();
        setupSwipeToDelete();

        window.addEventListener('themeChanged', syncThemeMeta);
        window.addEventListener('storage', function (e) {
            if (e && e.key === STORAGE_PRIVACY_KEY) {
                applyPrivacyState(isPrivacyHidden());
            }
            if (e && e.key === 'tonu_theme') {
                syncThemeMeta();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
        init();
    }

    window.TonuMobileUI = {
        init: init,
        haptic: haptic,
        isPrivacyHidden: isPrivacyHidden,
        applyPrivacyState: applyPrivacyState,
        togglePrivacyMode: togglePrivacyMode,
        animateValue: animateValue,
        celebrate: celebrate,
        openCommandPalette: openCommandPalette,
        closeCommandPalette: closeCommandPalette,
        startNavProgress: startNavProgress,
        finishNavProgress: finishNavProgress,
        syncThemeMeta: syncThemeMeta,
        closeSwipeRows: closeSwipeRows
    };
})(window, document);
