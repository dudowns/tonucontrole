// ============================================
// TONUCONTROLE — MODO DEMONSTRAÇÃO (PWA)
// Ativa uma sessão e um banco local de exemplo, sem depender de
// credenciais externas. Gatilhos:
//   • ?demo=1 na URL (persistente na aba)
//   • BASE44_PREVIEW_MODE=1 → window.__TONU_CONFIG__.demoMode
//   • ?demo=0 encerra o modo
// Quando nenhum gatilho está ativo, este arquivo não altera nada.
// ============================================

(function () {
    'use strict';

    const FLAG_KEY = 'tonu_demo_mode';
    const EXIT_KEY = 'tonu_demo_exit';
    const config = (typeof window !== 'undefined' && window.__TONU_CONFIG__) || {};

    function safeSession(action, key, value) {
        try {
            if (action === 'get') return sessionStorage.getItem(key);
            if (action === 'set') sessionStorage.setItem(key, value);
            if (action === 'remove') sessionStorage.removeItem(key);
        } catch (e) {
            return null;
        }
        return null;
    }

    let params = null;
    try {
        params = new URLSearchParams(window.location.search);
    } catch (e) {
        params = null;
    }

    const demoParam = params ? params.get('demo') : null;
    const hasFlag = safeSession('get', FLAG_KEY) === '1';
    const explicitlyExited = safeSession('get', EXIT_KEY) === '1';

    // Remove a sessão de exemplo sem afetar um usuário real logado
    function clearDemoSessionIfAny() {
        try {
            const raw = localStorage.getItem('tonu_offline_session');
            const stored = raw ? JSON.parse(raw) : null;
            const storedUser = stored && (stored.user || stored);
            const isDemoUser = storedUser && (
                storedUser.id === (window.TonuDemoData && window.TonuDemoData.userId) ||
                String(storedUser.email || '').endsWith('@demo.tonucontrole.app')
            );
            if (isDemoUser) localStorage.removeItem('tonu_offline_session');
        } catch (e) {}

        try {
            const sessionRaw = sessionStorage.getItem('tonu_user');
            const sessionUser = sessionRaw ? JSON.parse(sessionRaw) : null;
            const actual = sessionUser && (sessionUser.user || sessionUser);
            const isDemoSession = actual && (
                actual.id === (window.TonuDemoData && window.TonuDemoData.userId) ||
                String(actual.email || '').endsWith('@demo.tonucontrole.app')
            );
            if (isDemoSession) sessionStorage.removeItem('tonu_user');
        } catch (e) {}
    }

    let active = false;
    if (demoParam === '0') {
        safeSession('remove', FLAG_KEY);
        safeSession('set', EXIT_KEY, '1');
        clearDemoSessionIfAny();
        active = false;
    } else if (demoParam === '1') {
        safeSession('set', FLAG_KEY, '1');
        safeSession('remove', EXIT_KEY);
        active = true;
    } else if (hasFlag) {
        active = true;
    } else if (config.demoMode === true && !explicitlyExited) {
        active = true;
    }

    window.TonuDemoMode = { active, available: config.demoMode === true || !!demoParam };

    function jsonResponse(payload, status) {
        return new Response(JSON.stringify(payload), {
            status: status || 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const CLASSIFY_KEYWORDS = [
        [/mercado|supermercado|padaria|restaurante|ifood|lanche|cafe|cafeteria|pizza/i, 'Alimentação'],
        [/uber|99|combust|gasolina|posto|metro|onibus|estacionamento/i, 'Transporte'],
        [/aluguel|condom[ií]nio|iptu|moradia|luz|[aá]gua|energia|internet|celular/i, 'Moradia'],
        [/farm[aá]cia|m[eé]dico|dentista|consulta|exame|sa[uú]de/i, 'Saúde'],
        [/curso|escola|faculdade|livro|educa/i, 'Educação'],
        [/cinema|streaming|netflix|spotify|academia|viagem|lazer/i, 'Lazer'],
        [/sal[aá]rio|pagamento|holerite|provento|freela/i, 'Salário']
    ];

    function guessCategory(description) {
        const text = String(description || '');
        for (const [pattern, category] of CLASSIFY_KEYWORDS) {
            if (pattern.test(text)) return category;
        }
        return null;
    }

    function patchFetch(demoUser) {
        if (typeof window.fetch !== 'function' || window.__tonuDemoFetchPatched) return;
        const originalFetch = window.fetch.bind(window);
        window.__tonuDemoFetchPatched = true;

        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            try {
                if (url.includes('/api/insights')) {
                    return Promise.resolve(jsonResponse({
                        insights: window.TonuDemoData.buildAiInsights(),
                        source: 'demo',
                        generated_at: new Date().toISOString()
                    }));
                }
                if (url.includes('/api/classify')) {
                    let description = '';
                    try {
                        description = JSON.parse((init && init.body) || '{}').description || '';
                    } catch (e) {
                        description = '';
                    }
                    return Promise.resolve(jsonResponse({ category: guessCategory(description), source: 'demo' }));
                }
                if (url.includes('/api/ai-health') || url.includes('/api/insights-health')) {
                    return Promise.resolve(jsonResponse({ status: 'ok', mode: 'demo', user: demoUser.email }));
                }
            } catch (e) {
                // Cai para a requisição real em caso de erro de parsing
            }
            return originalFetch(input, init);
        };
    }

    function installDemoSession() {
        if (!window.TonuDemoData || !window.createTonuDemoClient) {
            console.warn('⚠️ Módulos do modo demo não carregaram.');
            return null;
        }

        const demoUser = window.TonuDemoData.user;
        const dataset = window.TonuDemoData.buildDataset(demoUser.id);
        const client = window.createTonuDemoClient(dataset, demoUser);

        // O cliente real nunca deve substituir o cliente demo
        window.initializeSupabaseClient = function () {
            window.supabaseClient = client;
            return client;
        };
        window.supabaseClient = client;

        // Outros módulos (offline/biometria) leem a sessão destes storages
        try {
            sessionStorage.setItem('tonu_user', JSON.stringify(demoUser));
            localStorage.setItem('tonu_offline_session', JSON.stringify({
                user: demoUser,
                email: demoUser.email,
                timestamp: Date.now()
            }));
        } catch (e) {
            // Storage indisponível: o cliente demo já garante a sessão
        }

        window.__TONU_DEMO_USER__ = demoUser;
        patchFetch(demoUser);
        return demoUser;
    }

    function isLoginPage() {
        const path = window.location.pathname;
        return path === '/' || path.endsWith('/') || path.endsWith('/index.html') || path.endsWith('/index-mobile.html');
    }

    function demoEntryPath() {
        // Permite abrir o modo demo direto em uma tela: ?demo=1&next=/pages/mobile/goals.html
        const next = params ? params.get('next') : null;
        if (next && /^\/pages\/[a-zA-Z0-9/_-]+\.html$/.test(next)) {
            return `${next}?demo=1`;
        }
        const wide = window.innerWidth >= 900;
        return wide ? '/pages/dashboard.html?demo=1' : '/pages/mobile/dashboard.html?demo=1';
    }

    function exitDemo() {
        safeSession('remove', FLAG_KEY);
        safeSession('set', EXIT_KEY, '1');
        try {
            localStorage.removeItem('tonu_offline_session');
            sessionStorage.removeItem('tonu_user');
        } catch (e) {}
        window.location.href = '/index.html?demo=0';
    }

    function buildDemoChip(demoUser) {
        if (document.getElementById('tonuDemoChip')) return;
        const chip = document.createElement('div');
        chip.id = 'tonuDemoChip';
        chip.className = 'tonu-demo-chip';
        chip.setAttribute('role', 'status');
        chip.innerHTML = '<span class="tonu-demo-dot" aria-hidden="true"></span>'
            + '<span class="tonu-demo-text">Modo demo</span>'
            + '<button type="button" class="tonu-demo-exit" aria-label="Sair do modo demonstração">Sair</button>';
        chip.querySelector('.tonu-demo-exit').addEventListener('click', exitDemo);
        chip.title = `Dados de exemplo de ${demoUser.user_metadata.full_name}. Toque em "Sair" para voltar ao login.`;
        document.body.appendChild(chip);
    }

    function buildLoginEntryButton() {
        if (document.getElementById('tonuDemoEntryBtn')) return;
        const host = document.querySelector('.login-side') || document.querySelector('main') || document.body;
        if (!host) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'tonuDemoEntryBtn';
        btn.className = 'tonu-demo-entry-btn';
        btn.innerHTML = '✨ Entrar no modo demonstração';
        btn.addEventListener('click', function () {
            safeSession('remove', EXIT_KEY);
            safeSession('set', FLAG_KEY, '1');
            window.location.href = demoEntryPath();
        });
        host.appendChild(btn);
    }

    if (!active) {
        if (isLoginPage() && config.demoMode === true) {
            // Depois de sair do demo, a página de login oferece a entrada novamente
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', buildLoginEntryButton);
            } else {
                buildLoginEntryButton();
            }
        }
        return;
    }

    if (isLoginPage()) {
        // Abre direto a experiência demo, sem passar pelo login real
        safeSession('set', EXIT_KEY, '0');
        window.location.replace(demoEntryPath());
        return;
    }

    const demoUser = installDemoSession();
    if (!demoUser) return;

    // Saída do modo demo pelo logout normal do app
    if (window.supabaseOffline && typeof window.supabaseOffline.logout === 'function') {
        window.supabaseOffline.logout = async function () {
            exitDemo();
        };
    }

    function bootstrapUi() {
        buildDemoChip(demoUser);
        document.documentElement.setAttribute('data-demo', '1');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapUi);
    } else {
        bootstrapUi();
    }

    console.log('🧪 Modo demonstração ativo — dados locais de exemplo, nenhuma credencial externa usada.');
})();
