// ============================================
// TONUCONTROLE - DETECTOR E ROTEADOR DE DISPOSITIVO (DESKTOP <-> MOBILE)
// ============================================

(function () {
    'use strict';

    function isMobileClient() {
        try {
            var preferred = localStorage.getItem('tonu_device_mode');
            if (preferred === 'mobile') return true;
            if (preferred === 'desktop') return false;

            var ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
            var isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
            var isTouch = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
            var isSmallScreen = (window.innerWidth > 0 && window.innerWidth <= 820) || (window.screen && window.screen.width <= 820);

            return isMobileUA || (isTouch && isSmallScreen) || (window.innerWidth > 0 && window.innerWidth <= 768);
        } catch (e) {
            return false;
        }
    }

    // Se estiver em uma página desktop (ex: /pages/dashboard.html) e for celular:
    function checkDesktopToMobileRedirect() {
        try {
            var pathname = window.location.pathname;
            // Apenas redireciona se estiver dentro de /pages/ e NÃO estiver já em /pages/mobile/
            if (pathname.indexOf('/pages/') !== -1 && pathname.indexOf('/pages/mobile/') === -1) {
                var preferred = localStorage.getItem('tonu_device_mode');
                // Se o usuário selecionou explicitamente "desktop", respeita a escolha
                if (preferred === 'desktop') return;

                if (isMobileClient()) {
                    var filename = pathname.substring(pathname.lastIndexOf('/') + 1) || 'dashboard.html';
                    var mobileSupported = ['dashboard.html', 'transactions.html', 'bills.html', 'goals.html', 'investments.html', 'settings.html'];
                    if (mobileSupported.indexOf(filename) !== -1) {
                        var search = window.location.search || '';
                        var hash = window.location.hash || '';
                        var target = pathname.replace('/pages/' + filename, '/pages/mobile/' + filename) + search + hash;
                        console.log('📱 Redirecionando para interface móvel:', target);
                        window.location.replace(target);
                    }
                }
            }
        } catch (e) {
            console.warn('Erro na verificação de dispositivo:', e);
        }
    }

    // Executa imediatamente no carregamento do script (antes da renderização da página)
    checkDesktopToMobileRedirect();

    window.TonuDeviceRouter = {
        isMobile: isMobileClient,
        checkRedirect: checkDesktopToMobileRedirect
    };
})();
