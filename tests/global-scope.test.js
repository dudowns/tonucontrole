// ==========================================================================
// TONUCONTROLE - GLOBAL SCOPE COLLISION TEST
// Detecta colisões de identificadores entre core.js e scripts que dependem dele
// ==========================================================================

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadFile(filePath) {
    return fs.readFileSync(path.join(ROOT, filePath), 'utf8');
}

function createBrowserLikeContext() {
    const noop = () => {};
    const mockElement = () => ({
        addEventListener: noop,
        removeEventListener: noop,
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        style: {},
        setAttribute: noop,
        getAttribute: () => null,
        appendChild: noop,
        removeChild: noop,
        querySelector: () => null,
        querySelectorAll: () => [],
        textContent: '',
        innerHTML: '',
        value: '',
        dataset: {}
    });

    const ctx = vm.createContext({
        window: null,
        self: null,
        globalThis: null,
        location: { hostname: 'localhost', pathname: '/', origin: 'http://localhost', search: '', hash: '' },
        matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: noop,
        document: {
            addEventListener: noop,
            removeEventListener: noop,
            getElementById: () => mockElement(),
            querySelector: () => mockElement(),
            querySelectorAll: () => [],
            createElement: () => mockElement(),
            readyState: 'complete',
            body: mockElement(),
            head: mockElement(),
            documentElement: mockElement()
        },
        navigator: { userAgent: 'NodeTest', onLine: true, vibrate: noop },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        console: { log: noop, warn: noop, error: noop, info: noop },
        setTimeout: noop,
        clearTimeout: noop,
        setInterval: noop,
        clearInterval: noop,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
        indexedDB: null,
        crypto: require('crypto').webcrypto,
        CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
        requestAnimationFrame: noop,
        cancelAnimationFrame: noop,
        MutationObserver: class { observe() {} disconnect() {} },
        IntersectionObserver: class { observe() {} disconnect() {} },
        Chart: class { constructor() {} destroy() {} update() {} },
        Intl,
        Math,
        Date,
        JSON,
        Promise,
        Set,
        Map,
        Array,
        Object,
        Number,
        String,
        Boolean,
        Error,
        URLSearchParams
    });

    ctx.window = ctx;
    ctx.self = ctx;
    ctx.globalThis = ctx;
    return ctx;
}

function runTest() {
    const results = [];

    // Arquivos que dependem de core.js e podem colidir no escopo global
    const dependentFiles = [
        'js/mobile/dashboard.js',
        'js/dashboard.js',
        'js/goals.js',
        'js/investments.js',
        'js/transactions.js',
        'js/bills.js',
        'js/settings.js'
    ];

    for (const file of dependentFiles) {
        const fullPath = path.join(ROOT, file);
        if (!fs.existsSync(fullPath)) {
            results.push({ name: `[${file}] arquivo não existe (pulado)`, passed: true });
            continue;
        }

        try {
            const context = createBrowserLikeContext();

            // Carrega core.js primeiro (fonte de helpers globais)
            vm.runInContext(loadFile('js/core.js'), context, { filename: 'js/core.js' });

            // Carrega o arquivo dependente no mesmo contexto global
            vm.runInContext(loadFile(file), context, { filename: file });

            results.push({ name: `[${file}] sem colisão de escopo global`, passed: true });
        } catch (err) {
            results.push({
                name: `[${file}] sem colisão de escopo global`,
                passed: false,
                error: err.message
            });
        }
    }

    return results;
}

module.exports = { runTest };

if (require.main === module) {
    console.log('\n🛡️ Teste de colisão de escopo global...\n');
    const results = runTest();
    let passed = 0;
    let failed = 0;
    results.forEach(r => {
        if (r.passed) {
            passed++;
            console.log(`   ✅ ${r.name}`);
        } else {
            failed++;
            console.error(`   ❌ ${r.name} - ${r.error}`);
        }
    });
    console.log(`\n📊 Resultado: ${passed}/${results.length}\n`);
    process.exit(failed > 0 ? 1 : 0);
}
