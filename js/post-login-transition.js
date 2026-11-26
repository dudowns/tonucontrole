// ============================================
// TONUCONTROLE - POST-LOGIN WELCOME & FADE REVEAL
// ============================================

(function () {
    'use strict';

    var STORAGE_KEY = 'tonu_just_logged_in';
    var MAX_MARKER_AGE_MS = 120000; // 2 minutos
    var MIN_DISPLAY_MS = 1550;      // Tempo mínimo para evitar flicker abrupto e exibir a mensagem de sucesso
    var READY_HOLD_MS = 320;        // Pausa breve exibindo "Tudo pronto!" antes do fade lento
    var FADE_OUT_MS = 850;          // Duração do fade devagarzinho
    var SAFETY_TIMEOUT_MS = 5200;   // Garantia absoluta para nunca travar a abertura

    var TIPS = [
        'Seu painel organiza receitas, contas e investimentos em tempo real.',
        'Dica: use a busca rápida e o modo privacidade sempre que estiver em público.',
        'Metas e patrimônio sincronizados com criptografia de ponta a ponta.',
        'Acompanhe seus proventos e projeção de caixa em um só lugar.'
    ];

    var STAGES = [
        'Validando sua sessão com segurança...',
        'Sincronizando saldo, contas e categorias...',
        'Organizando seu painel financeiro...'
    ];

    var state = {
        active: false,
        completed: false,
        shownAt: 0,
        meta: null,
        overlayEl: null,
        stageTimer: null,
        safetyTimer: null,
        stageIndex: 0
    };

    function safeReadSession(key) {
        try {
            return sessionStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function safeWriteSession(key, value) {
        try {
            sessionStorage.setItem(key, value);
        } catch (_) {}
    }

    function safeRemoveSession(key) {
        try {
            sessionStorage.removeItem(key);
        } catch (_) {}
    }

    function getMetaFromStorage() {
        var raw = safeReadSession(STORAGE_KEY);
        if (!raw) return null;
        try {
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (parsed.ts && (Date.now() - Number(parsed.ts)) > MAX_MARKER_AGE_MS) {
                safeRemoveSession(STORAGE_KEY);
                return null;
            }
            return parsed;
        } catch (_) {
            return null;
        }
    }

    function detectOAuthParamsInUrl() {
        try {
            var search = window.location.search || '';
            var hash = window.location.hash || '';
            var sp = new URLSearchParams(search);
            return Boolean(
                sp.get('code') ||
                sp.get('post_login') === '1' ||
                hash.indexOf('access_token=') !== -1 ||
                (sp.get('state') && !sp.get('error'))
            );
        } catch (_) {
            return false;
        }
    }

    function resolveInitialUserName(meta) {
        if (meta && meta.name && String(meta.name).trim()) {
            return String(meta.name).trim();
        }
        try {
            var su = safeReadSession('tonu_user');
            if (su) {
                var parsed = JSON.parse(su);
                var u = parsed.user || parsed;
                var n = u?.user_metadata?.full_name || u?.user_metadata?.name || u?.name || u?.email?.split('@')[0];
                if (n && String(n).trim()) return String(n).trim();
            }
        } catch (_) {}
        try {
            var off = localStorage.getItem('tonu_offline_session');
            if (off) {
                var po = JSON.parse(off);
                var uo = po.user || po;
                var no = uo?.user_metadata?.full_name || uo?.user_metadata?.name || uo?.name || uo?.email?.split('@')[0];
                if (no && String(no).trim()) return String(no).trim();
            }
        } catch (_) {}
        return '';
    }

    function extractFirstName(fullName) {
        if (!fullName) return '';
        var clean = String(fullName).trim();
        if (!clean) return '';
        if (clean.indexOf('@') !== -1) {
            clean = clean.split('@')[0];
        }
        var first = clean.split(/\s+/)[0] || clean;
        return first.charAt(0).toUpperCase() + first.slice(1);
    }

    function resolveSuccessBadgeText(meta) {
        var method = meta && meta.method ? String(meta.method).toLowerCase() : '';
        if (method === 'register') return 'Conta criada com sucesso';
        if (method === 'biometric') return 'Autenticado via biometria';
        if (method === 'google') return 'Login com Google realizado com sucesso';
        if (method === 'github') return 'Login com GitHub realizado com sucesso';
        if (method === 'session') return 'Sessão verificada com sucesso';
        return 'Login realizado com sucesso';
    }

    function resolveAssetPrefix() {
        var p = window.location.pathname || '';
        if (p.indexOf('/pages/mobile/') !== -1) return '../../';
        if (p.indexOf('/pages/') !== -1) return '../';
        return './';
    }

    function shouldActivateOnLoad() {
        if (document.documentElement.classList.contains('tonu-entering-dashboard')) {
            return true;
        }
        if (getMetaFromStorage()) return true;
        if (detectOAuthParamsInUrl()) return true;
        return false;
    }

    function buildOverlayElement(meta) {
        var el = document.createElement('div');
        el.id = 'tonuPostLoginOverlay';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-label', 'Login realizado com sucesso. Preparando seu painel.');

        var prefix = resolveAssetPrefix();
        var badgeText = resolveSuccessBadgeText(meta);
        var rawName = resolveInitialUserName(meta);
        var firstName = extractFirstName(rawName);
        var tipText = TIPS[Math.floor(Math.random() * TIPS.length)];

        // Esferas ambientais
        var orb1 = document.createElement('div');
        orb1.className = 'tonu-pl-orb tonu-pl-orb--indigo';
        orb1.setAttribute('aria-hidden', 'true');
        var orb2 = document.createElement('div');
        orb2.className = 'tonu-pl-orb tonu-pl-orb--emerald';
        orb2.setAttribute('aria-hidden', 'true');
        el.appendChild(orb1);
        el.appendChild(orb2);

        // Card central
        var card = document.createElement('div');
        card.className = 'tonu-pl-card';

        // Badge de sucesso
        var pill = document.createElement('div');
        pill.className = 'tonu-pl-success-pill';
        pill.id = 'tonuPlBadge';
        var dot = document.createElement('span');
        dot.className = 'tonu-pl-pulse-dot';
        dot.setAttribute('aria-hidden', 'true');
        var pillText = document.createElement('span');
        pillText.id = 'tonuPlBadgeText';
        pillText.textContent = badgeText;
        pill.appendChild(dot);
        pill.appendChild(pillText);
        card.appendChild(pill);

        // Círculo giratório orbital com logo central
        var orbitStage = document.createElement('div');
        orbitStage.className = 'tonu-pl-orbit-stage';
        orbitStage.setAttribute('aria-hidden', 'true');

        var halo = document.createElement('div');
        halo.className = 'tonu-pl-halo-glow';
        var spinnerRing = document.createElement('div');
        spinnerRing.className = 'tonu-pl-spinner-ring';
        var innerRing = document.createElement('div');
        innerRing.className = 'tonu-pl-inner-ring';

        var logoCore = document.createElement('div');
        logoCore.className = 'tonu-pl-logo-core';
        var logoImg = document.createElement('img');
        logoImg.src = prefix + 'icons/logo.png?v=3.2.7';
        logoImg.alt = 'TonuControle';
        logoImg.addEventListener('error', function () {
            logoCore.innerHTML = '<span class="tonu-pl-logo-fallback">💎</span>';
        });
        logoCore.appendChild(logoImg);

        var checkChip = document.createElement('div');
        checkChip.className = 'tonu-pl-check-chip';
        checkChip.innerHTML = '<i class="fas fa-check"></i>';

        orbitStage.appendChild(halo);
        orbitStage.appendChild(spinnerRing);
        orbitStage.appendChild(innerRing);
        orbitStage.appendChild(logoCore);
        orbitStage.appendChild(checkChip);
        card.appendChild(orbitStage);

        // Brand kicker
        var kicker = document.createElement('div');
        kicker.className = 'tonu-pl-brand-kicker';
        kicker.textContent = 'TonuControle';
        card.appendChild(kicker);

        // Saudação personalizada
        var title = document.createElement('h2');
        title.className = 'tonu-pl-title';
        title.id = 'tonuPlTitle';
        updateGreetingHeading(title, firstName, meta);
        card.appendChild(title);

        // Mensagem de etapa dinâmica
        var status = document.createElement('p');
        status.className = 'tonu-pl-status';
        status.id = 'tonuPlStatus';
        status.textContent = STAGES[0];
        card.appendChild(status);

        // Indicador de 3 etapas
        var steps = document.createElement('div');
        steps.className = 'tonu-pl-steps';
        steps.id = 'tonuPlSteps';
        steps.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 3; i++) {
            var sDot = document.createElement('span');
            sDot.className = 'tonu-pl-step-dot' + (i === 0 ? ' is-active' : '');
            steps.appendChild(sDot);
        }
        card.appendChild(steps);

        // Cartão de destaque / dica
        var insight = document.createElement('div');
        insight.className = 'tonu-pl-insight';
        insight.innerHTML = '<i class="fas fa-sparkles" aria-hidden="true"></i>';
        var insightSpan = document.createElement('span');
        insightSpan.textContent = tipText;
        insight.appendChild(insightSpan);
        card.appendChild(insight);

        el.appendChild(card);
        return el;
    }

    function updateGreetingHeading(titleEl, firstName, meta) {
        if (!titleEl) return;
        titleEl.innerHTML = '';
        var isRegister = meta && meta.method === 'register';
        var prefixText = isRegister ? 'Que bom ter você aqui' : 'Bem-vindo(a) de volta';

        if (firstName) {
            titleEl.appendChild(document.createTextNode(prefixText + ', '));
            var accent = document.createElement('span');
            accent.className = 'tonu-pl-user-accent';
            accent.textContent = firstName;
            titleEl.appendChild(accent);
            titleEl.appendChild(document.createTextNode('!'));
        } else {
            var accentOnly = document.createElement('span');
            accentOnly.className = 'tonu-pl-user-accent';
            accentOnly.textContent = prefixText + '!';
            titleEl.appendChild(accentOnly);
        }
    }

    function setStageText(text, stepIdx) {
        var statusEl = document.getElementById('tonuPlStatus');
        if (statusEl && text && statusEl.textContent !== text) {
            statusEl.classList.add('is-swapping');
            setTimeout(function () {
                statusEl.textContent = text;
                statusEl.classList.remove('is-swapping');
            }, 150);
        }
        if (typeof stepIdx === 'number') {
            var dots = document.querySelectorAll('#tonuPlSteps .tonu-pl-step-dot');
            dots.forEach(function (dot, i) {
                dot.classList.remove('is-active', 'is-done');
                if (i < stepIdx) dot.classList.add('is-done');
                else if (i === stepIdx) dot.classList.add('is-active');
            });
        }
    }

    function startStageRotation() {
        stopStageRotation();
        state.stageIndex = 0;
        state.stageTimer = setInterval(function () {
            if (!state.active || state.completed) {
                stopStageRotation();
                return;
            }
            state.stageIndex = Math.min(state.stageIndex + 1, STAGES.length - 1);
            setStageText(STAGES[state.stageIndex], state.stageIndex);
            if (state.stageIndex >= STAGES.length - 1) {
                stopStageRotation();
            }
        }, 620);
    }

    function stopStageRotation() {
        if (state.stageTimer) {
            clearInterval(state.stageTimer);
            state.stageTimer = null;
        }
    }

    function mountOverlayIfNeeded() {
        if (state.active) return true;
        if (!shouldActivateOnLoad()) {
            document.documentElement.classList.remove('tonu-entering-dashboard');
            return false;
        }

        state.meta = getMetaFromStorage();
        if (!state.meta && detectOAuthParamsInUrl()) {
            state.meta = { method: 'google', ts: Date.now() };
            safeWriteSession(STORAGE_KEY, JSON.stringify(state.meta));
        }

        document.documentElement.classList.add('tonu-entering-dashboard');

        var existing = document.getElementById('tonuPostLoginOverlay');
        if (existing) {
            state.overlayEl = existing;
        } else if (document.body) {
            state.overlayEl = buildOverlayElement(state.meta);
            document.body.insertBefore(state.overlayEl, document.body.firstChild);
        } else {
            return false;
        }

        state.active = true;
        state.completed = false;
        state.shownAt = Date.now();
        startStageRotation();

        if (state.safetyTimer) clearTimeout(state.safetyTimer);
        state.safetyTimer = setTimeout(function () {
            complete({ forceImmediate: true });
        }, SAFETY_TIMEOUT_MS);

        return true;
    }

    function markJustLoggedIn(meta) {
        var payload = {
            method: (meta && meta.method) || 'password',
            name: (meta && meta.name) || '',
            ts: Date.now()
        };
        safeWriteSession(STORAGE_KEY, JSON.stringify(payload));
        return payload;
    }

    function updateUser(user) {
        if (!user) return;
        var rawName = user.user_metadata?.full_name || user.user_metadata?.name || user.name || user.email?.split('@')[0] || '';
        var firstName = extractFirstName(rawName);
        if (!firstName) return;

        var titleEl = document.getElementById('tonuPlTitle');
        if (titleEl) {
            updateGreetingHeading(titleEl, firstName, state.meta);
        }

        var provider = user.app_metadata?.provider;
        if (provider && (!state.meta || !state.meta.method || state.meta.method === 'google')) {
            var badgeTextEl = document.getElementById('tonuPlBadgeText');
            if (badgeTextEl && provider === 'github') {
                badgeTextEl.textContent = 'Login com GitHub realizado com sucesso';
            }
        }
    }

    function setStage(text) {
        if (!state.active || state.completed) return;
        setStageText(text);
    }

    function performSlowFadeOut() {
        var overlay = state.overlayEl || document.getElementById('tonuPostLoginOverlay');

        // Marca visual de conclusão no anel e texto
        if (overlay) {
            overlay.classList.add('is-ready');
        }
        setStageText('Tudo pronto! Abrindo seu painel...', 2);
        var dots = document.querySelectorAll('#tonuPlSteps .tonu-pl-step-dot');
        dots.forEach(function (dot) {
            dot.classList.remove('is-active');
            dot.classList.add('is-done');
        });

        setTimeout(function () {
            // Limpa o marcador apenas quando a tela destino realmente começa a abrir
            safeRemoveSession(STORAGE_KEY);

            // Revela o dashboard com fade suave sincronizado
            document.documentElement.classList.add('tonu-dashboard-revealed');
            document.documentElement.classList.remove('tonu-entering-dashboard');

            if (overlay) {
                overlay.classList.add('is-fading-out');
                setTimeout(function () {
                    if (overlay && overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                    state.overlayEl = null;
                    state.active = false;
                }, FADE_OUT_MS + 60);
            } else {
                state.active = false;
            }
        }, READY_HOLD_MS);
    }

    function complete(options) {
        if (state.completed) return;

        if (!state.active) {
            document.documentElement.classList.remove('tonu-entering-dashboard');
            safeRemoveSession(STORAGE_KEY);
            return;
        }

        state.completed = true;
        stopStageRotation();
        if (state.safetyTimer) {
            clearTimeout(state.safetyTimer);
            state.safetyTimer = null;
        }

        var forceImmediate = Boolean(options && options.forceImmediate);
        var elapsed = Date.now() - state.shownAt;
        var remaining = forceImmediate ? 0 : Math.max(0, MIN_DISPLAY_MS - elapsed);

        if (remaining > 0) {
            setTimeout(performSlowFadeOut, remaining);
        } else {
            performSlowFadeOut();
        }
    }

    // Monta imediatamente caso já exista document.body
    mountOverlayIfNeeded();

    if (typeof document !== 'undefined' && !state.active && shouldActivateOnLoad()) {
        document.addEventListener('DOMContentLoaded', mountOverlayIfNeeded);
    }

    window.TonuPostLoginTransition = {
        markJustLoggedIn: markJustLoggedIn,
        mount: mountOverlayIfNeeded,
        updateUser: updateUser,
        setStage: setStage,
        complete: complete,
        isActive: function () { return state.active && !state.completed; }
    };
})();
