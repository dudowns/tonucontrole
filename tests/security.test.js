// ============================================
// TONUCONTROLE - SECURITY & SERVER TESTS
// ============================================

const http = require('http');

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:3000${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(3000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

async function runSecurityTests() {
    const results = [];

    // Teste 1: Bloqueio de .env
    try {
        const res = await makeRequest('/.env.example');
        if (res.statusCode === 403) {
            results.push({ name: 'Segurança: Bloqueio de arquivos .env (Retorna 403)', passed: true });
        } else {
            results.push({ name: 'Segurança: Bloqueio de arquivos .env', passed: false, error: `Retornou status ${res.statusCode}` });
        }
    } catch (e) {
        results.push({ name: 'Segurança: Bloqueio de arquivos .env', passed: false, error: e.message });
    }

    // Teste 2: Bloqueio de package.json e server.js
    try {
        const resPkg = await makeRequest('/package.json');
        const resServer = await makeRequest('/server.js');
        if (resPkg.statusCode === 403 && resServer.statusCode === 403) {
            results.push({ name: 'Segurança: Bloqueio de arquivos de sistema package.json e server.js (Retorna 403)', passed: true });
        } else {
            results.push({ name: 'Segurança: Bloqueio de arquivos de sistema', passed: false, error: `package.json=${resPkg.statusCode}, server.js=${resServer.statusCode}` });
        }
    } catch (e) {
        results.push({ name: 'Segurança: Bloqueio de arquivos de sistema', passed: false, error: e.message });
    }

    // Teste 3: Prevenção contra Path Traversal
    try {
        const res = await makeRequest('/pages/../server.js');
        if (res.statusCode === 403 || res.statusCode === 400 || res.statusCode === 404) {
            results.push({ name: 'Segurança: Proteção contra Path Traversal /pages/../server.js', passed: true });
        } else {
            results.push({ name: 'Segurança: Proteção contra Path Traversal', passed: false, error: `Retornou status ${res.statusCode}` });
        }
    } catch (e) {
        results.push({ name: 'Segurança: Proteção contra Path Traversal', passed: false, error: e.message });
    }

    // Teste 4: Headers de Proteção do Helmet & Rate Limiter
    try {
        const res = await makeRequest('/');
        const hasNosniff = res.headers['x-content-type-options'] === 'nosniff';
        const hasRateLimit = !!res.headers['ratelimit-limit'] || !!res.headers['ratelimit-policy'];
        if (hasNosniff && hasRateLimit) {
            results.push({ name: 'Segurança: Cabeçalhos Helmet (X-Content-Type-Options) e Rate Limiting ativos', passed: true });
        } else {
            results.push({ name: 'Segurança: Cabeçalhos de Proteção', passed: false, error: `nosniff=${hasNosniff}, ratelimit=${hasRateLimit}` });
        }
    } catch (e) {
        results.push({ name: 'Segurança: Cabeçalhos de Proteção', passed: false, error: e.message });
    }

    // Teste 5: Páginas públicas legítimas continuam acessíveis
    try {
        const resDash = await makeRequest('/pages/dashboard');
        const resHealth = await makeRequest('/api/health');
        if (resDash.statusCode === 200 && resHealth.statusCode === 200) {
            results.push({ name: 'Servidor: Páginas públicas e rotas de API legítimas funcionando normalmente', passed: true });
        } else {
            results.push({ name: 'Servidor: Páginas públicas', passed: false, error: `dashboard=${resDash.statusCode}, health=${resHealth.statusCode}` });
        }
    } catch (e) {
        results.push({ name: 'Servidor: Páginas públicas', passed: false, error: e.message });
    }

    // Teste 6: Configuração de ambiente segura (/api/config)
    try {
        const resConfig = await makeRequest('/api/config');
        if (resConfig.statusCode === 200) {
            const body = JSON.parse(resConfig.body);
            const hasUrl = typeof body.supabaseUrl === 'string' && body.supabaseUrl.length > 0;
            const hasKey = typeof body.supabaseAnonKey === 'string' && body.supabaseAnonKey.length > 0;
            const noGemini = body.geminiApiKey === undefined && body.GEMINI_API_KEY === undefined;
            const noServiceRole = body.supabaseServiceRoleKey === undefined && body.SUPABASE_SERVICE_ROLE_KEY === undefined;
            const hasShortCache = resConfig.headers['cache-control'] && resConfig.headers['cache-control'].includes('max-age=60');

            if (hasUrl && hasKey && noGemini && noServiceRole && hasShortCache) {
                results.push({ name: 'Servidor: Endpoint /api/config fornece apenas chaves públicas sem vazar segredos', passed: true });
            } else {
                results.push({ name: 'Servidor: Endpoint /api/config', passed: false, error: `url=${hasUrl}, key=${hasKey}, noGemini=${noGemini}, cache=${hasShortCache}` });
            }
        } else {
            results.push({ name: 'Servidor: Endpoint /api/config', passed: false, error: `Retornou status ${resConfig.statusCode}: ${resConfig.body}` });
        }
    } catch (e) {
        results.push({ name: 'Servidor: Endpoint /api/config', passed: false, error: e.message });
    }

    return results;
}

module.exports = { runSecurityTests };
