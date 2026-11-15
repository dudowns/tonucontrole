// ============================================
// TONUCONTROLE — MOBILE V2: MICROINTERAÇÕES
// Camada apenas visual/interativa. Não altera regras de negócio:
// transições de página, revelação de cartões, contadores animados,
// pull-to-refresh, navegação por gesto e feedback háptico.
// ============================================

(function () {
    'use strict';

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supportsHaptics = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

    function haptic(pattern) {
        if (!supportsHaptics) return;
        try {
            navigator.vibrate(pattern || 8);
        } catch (e) {}
    }

    // ---------- 1. Entrada de página ----------
    function enterPage() {
        document.body.classList.add('page-enter');
        window.setTimeout(() => document.body.classList.remove('page-enter'), 320);
        updateThemeColor();
    }

    function updateThemeColor() {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        const dark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-theme');
        meta.setAttribute('content', dark ? '#070B18' : '#EEF1F8');
    }

    // ---------- 2. Revelação suave dos cartões ----------
    const REVEAL_SELECTOR = [
        '.mobile-card',
        '.mobile-transaction',
        '.mobile-list-card',
        '.goal-type-card',
        '.settings-card-group',
        '.mobile-chart-card',
        '.mobile-insights-card',
        '.mobile-empty',
        '.mobile-empty-friendly'
    ].join(',');

    const revealed = new WeakSet();

    function revealNewCards(root) {
        if (reduceMotion) return;
        const nodes = (root || document).querySelectorAll(REVEAL_SELECTOR);
        let index = 0;
        nodes.forEach(node => {
            if (revealed.has(node)) return;
            revealed.add(node);
            const isList = node.classList.contains('mobile-transaction') || node.classList.contains('mobile-list-card');
            const delay = isList ? Math.min(index, 7) * 38 : Math.min(index, 4) * 55;
            index += 1;
            if (typeof node.animate !== 'function') return;
            node.animate(
                [
                    { opacity: 0, transform: 'translate3d(0, 12px, 0)' },
                    { opacity: 1, transform: 'translate3d(0, 0, 0)' }
                ],
                { duration: 420, delay, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' }
            );
        });
    }

    // ---------- 3. Contadores animados ----------
    const CURRENCY_RE = /^R\$\s*-?\d{1,3}(\.\d{3})*,\d{2}$/;
    const counted = new WeakSet();

    function parseCurrencyBr(text) {
        const clean = String(text || '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    }

    function formatCurrencyBr(value) {
        const negative = value < 0;
        const fixed = Math.abs(value).toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return `${negative ? '-' : ''}R$ ${grouped},${decPart}`;
    }

    function animateCounters() {
        if (reduceMotion) return;
        const candidates = document.querySelectorAll('.mobile-hero-value, .hero-value, .card-value, .hero-stat-val');
        candidates.forEach((el, index) => {
            if (counted.has(el)) return;
            const text = (el.textContent || '').trim();
            if (!CURRENCY_RE.test(text)) return;
            const target = parseCurrencyBr(text);
            if (target === null || target === 0) {
                counted.add(el);
                return;
            }
            counted.add(el);
            const duration = 720;
            const start = performance.now();
            const delay = Math.min(index, 4) * 70;

            function frame(now) {
                const elapsed = now - start - delay;
                if (elapsed < 0) {
                    el.textContent = formatCurrencyBr(0);
                    requestAnimationFrame(frame);
                    return;
                }
                const progress = Math.min(1, elapsed / duration);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = formatCurrencyBr(target * eased);
                if (progress < 1) requestAnimationFrame(frame);
                else el.textContent = formatCurrencyBr(target);
            }
            requestAnimationFrame(frame);
        });
    }

    // ---------- 4. Observador de renderizações dinâmicas ----------
    function watchDynamicContent() {
        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(() => {
                scheduled = false;
                revealNewCards(document);
                animateCounters();
            });
        };

        const target = document.querySelector('.mobile-content') || document.body;
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(schedule).observe(target, { childList: true, subtree: true });
        }
        schedule();
    }

    // ---------- 5. Transição entre páginas ----------
    function isInternalPageLink(anchor) {
        if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return false;
        if (anchor.getAttribute('href') === null) return false;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
        if (/^https?:\/\//i.test(href)) return false;
        return /\.html(\?|#|$)/i.test(href);
    }

    function setupPageTransitions() {
        const progress = document.createElement('div');
        progress.className = 'tonu-progress';
        document.body.appendChild(progress);

        document.addEventListener('click', function (event) {
            const anchor = event.target.closest ? event.target.closest('a') : null;
            if (!anchor || !isInternalPageLink(anchor)) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            haptic(6);
            if (reduceMotion) return;
            event.preventDefault();
            document.body.classList.add('page-leaving');
            progress.style.opacity = '1';
            progress.style.width = '80%';
            window.setTimeout(() => {
                window.location.href = anchor.href;
            }, 150);
        }, true);

        window.addEventListener('pageshow', function () {
            document.body.classList.remove('page-leaving');
            progress.style.opacity = '0';
            progress.style.width = '0';
        });
    }

    // ---------- 6. Pull to refresh ----------
    function currentRefreshAction() {
        if (typeof window.syncMobileDashboardNow === 'function') return window.syncMobileDashboardNow;
        if (typeof window.loadMobileData === 'function') return () => window.loadMobileData({ forceRefresh: true });
        if (typeof window.loadTransactions === 'function') return window.loadTransactions;
        if (typeof window.loadBills === 'function') return window.loadBills;
        if (typeof window.loadGoals === 'function') return window.loadGoals;
        if (typeof window.loadInvestments === 'function') return window.loadInvestments;
        return null;
    }

    function setupPullToRefresh() {
        if (reduceMotion) return;
        const indicator = document.createElement('div');
        indicator.className = 'tonu-ptr';
        indicator.innerHTML = '<i class="fas fa-arrow-down"></i>';
        document.body.appendChild(indicator);

        let startY = 0;
        let pulling = false;
        let distance = 0;
        const THRESHOLD = 78;

        document.addEventListener('touchstart', function (event) {
            if (window.scrollY > 4 || event.touches.length !== 1) return;
            const inScrollableX = event.target.closest && event.target.closest('.goals-carousel-track, .ios-filter-scroll, .mobile-quick-actions, .ios-segmented-control, .bottom-nav');
            if (inScrollableX) return;
            startY = event.touches[0].clientY;
            pulling = true;
            distance = 0;
        }, { passive: true });

        document.addEventListener('touchmove', function (event) {
            if (!pulling) return;
            distance = event.touches[0].clientY - startY;
            if (distance <= 0) {
                distance = 0;
                indicator.classList.remove('visible');
                return;
            }
            if (window.scrollY > 4) {
                pulling = false;
                indicator.classList.remove('visible');
                return;
            }
            const pull = Math.min(distance * 0.55, 90);
            indicator.classList.add('visible');
            indicator.style.transform = `translate(-50%, ${pull - 56}px) rotate(${pull * 2.4}deg)`;
        }, { passive: true });

        document.addEventListener('touchend', function () {
            if (!pulling) return;
            pulling = false;
            const triggered = distance >= THRESHOLD;
            indicator.style.transform = '';
            if (!triggered) {
                indicator.classList.remove('visible');
                return;
            }
            haptic([12, 40, 12]);
            indicator.classList.add('spinning');
            indicator.querySelector('i').className = 'fas fa-circle-notch';
            const action = currentRefreshAction();
            const done = () => {
                window.setTimeout(() => {
                    indicator.classList.remove('spinning', 'visible');
                    indicator.querySelector('i').className = 'fas fa-arrow-down';
                }, 450);
            };
            try {
                if (action) {
                    const result = action();
                    if (result && typeof result.then === 'function') result.then(done, done);
                    else done();
                } else {
                    window.location.reload();
                }
            } catch (e) {
                done();
            }
        }, { passive: true });
    }

    // ---------- 7. Navegação por gesto entre abas ----------
    function setupSwipeNavigation() {
        const links = Array.from(document.querySelectorAll('.bottom-nav a[href]'));
        if (links.length < 2) return;
        const currentIndex = links.findIndex(link => link.classList.contains('active'));
        if (currentIndex < 0) return;

        let startX = 0;
        let startY = 0;
        let tracking = false;

        document.addEventListener('touchstart', function (event) {
            if (event.touches.length !== 1) return;
            const blocked = event.target.closest && event.target.closest('.goals-carousel-track, .ios-filter-scroll, .mobile-quick-actions, .mobile-modal-sheet, .ios-segmented-control, canvas, .bottom-nav');
            if (blocked) return;
            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
            tracking = true;
        }, { passive: true });

        document.addEventListener('touchend', function (event) {
            if (!tracking) return;
            tracking = false;
            const touch = event.changedTouches && event.changedTouches[0];
            if (!touch) return;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (Math.abs(dx) < 70 || Math.abs(dy) > 46) return;
            const dir = dx < 0 ? 1 : -1;
            const next = links[currentIndex + dir];
            if (!next) return;
            haptic(10);
            if (reduceMotion) {
                window.location.href = next.href;
                return;
            }
            document.body.classList.add('page-leaving');
            window.setTimeout(() => { window.location.href = next.href; }, 130);
        }, { passive: true });
    }

    // ---------- 8. Feedback háptico em ações principais ----------
    function setupHaptics() {
        if (!supportsHaptics) return;
        document.addEventListener('pointerdown', function (event) {
            const target = event.target.closest && event.target.closest('.bottom-nav a, .quick-action-btn, .nav-add-btn, .sheet-submit-btn, .month-nav, .btn-today');
            if (target) haptic(7);
        }, { passive: true });
    }

    // ---------- 9. Init ----------
    function init() {
        enterPage();
        watchDynamicContent();
        setupPageTransitions();
        setupPullToRefresh();
        setupSwipeNavigation();
        setupHaptics();
        window.addEventListener('tonu-theme-changed', updateThemeColor);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.TonuMobileUi = {
        reveal: () => revealNewCards(document),
        refreshTheme: updateThemeColor
    };
})();
