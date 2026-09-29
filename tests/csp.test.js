// ============================================
// TONUCONTROLE - CSP TEST SUITE (npm run test:csp)
// ============================================

const http = require('http');
const { createHelmetMiddleware, generateNonceMiddleware } = require('../security-headers');

const SERVER_HOST = '127.0.0.1';
// O servidor Express roda na porta 3000 no ambiente do Google AI Studio
const SERVER_PORT = 3000;

function requestGet(path) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: SERVER_HOST,
            port: SERVER_PORT,
            path: path,
            timeout: 4000
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout de requisição GET'));
        });
    });
}

function requestPost(path, data, contentType = 'application/json') {
    return new Promise((resolve, reject) => {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        const req = http.request({
            hostname: SERVER_HOST,
            port: SERVER_PORT,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': contentType,
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 4000
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout de requisição POST'));
        });

        req.write(payload);
        req.end();
    });
}

// Função utilitária para avaliar o header CSP gerado por createHelmetMiddleware isoladamente
function evaluateHelmetCspForEnv(nodeEnvValue) {
    const originalEnv = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = nodeEnvValue;
        const helmetMiddleware = createHelmetMiddleware();

        let headerVal = '';
        const mockReq = { headers: {} };
        const mockRes = {
            locals: { cspNonce: 'test-unit-nonce-12345' },
            setHeader: (k, v) => {
                if (k.toLowerCase() === 'content-security-policy') {
                    headerVal = v;
                }
            },
            getHeader: () => undefined,
            removeHeader: () => {}
        };

        helmetMiddleware(mockReq, mockRes, () => {});
        return headerVal;
    } finally {
        process.env.NODE_ENV = originalEnv;
    }
}

async function runCspTests() {
    console.log('\n======================================================');
    console.log('🛡️ TESTES DE CONTENT SECURITY POLICY & NONCE (CSP)');
    console.log('======================================================\n');

    let total = 0;
    let passed = 0;
    let failed = 0;

    // 1. GET / → verifica se header CSP contém nonce do servidor ativo
    total++;
    try {
        const resHome = await requestGet('/');
        const cspHeader = resHome.headers['content-security-policy'] || '';

        if (!cspHeader) {
            failed++;
            console.error('❌ FAIL: Header Content-Security-Policy ausente na resposta de GET /');
        } else if (!/script-src[^;]*'nonce-[A-Za-z0-9+/=_-]+'/.test(cspHeader)) {
            failed++;
            console.error(`❌ FAIL: Header CSP não contém diretiva de nonce em script-src: "${cspHeader}"`);
        } else if (cspHeader.includes("'unsafe-eval'")) {
            failed++;
            console.error(`❌ FAIL: script-src contém 'unsafe-eval' proibido: "${cspHeader}"`);
        } else if (cspHeader.includes("frame-ancestors 'self' https: http:") || /connect-src[^;]*\bwss:\b(?!\/\/)/.test(cspHeader)) {
            failed++;
            console.error(`❌ FAIL: frame-ancestors ou connect-src possuem curingas genéricos inseguros: "${cspHeader}"`);
        } else {
            passed++;
            console.log('✅ PASS: GET / → Header Content-Security-Policy gerado com nonce criptográfico único e sem unsafe-eval.');
        }
    } catch (err) {
        failed++;
        console.error('❌ FAIL: Erro ao executar GET /:', err.message);
    }

    // 2. Validação da Estratégia Híbrida: Em produção (NODE_ENV=production) NÃO contém 'unsafe-inline' no script-src
    total++;
    try {
        const prodCsp = evaluateHelmetCspForEnv('production');
        const scriptSrcMatch = prodCsp.match(/script-src\s+([^;]+)/i);
        const scriptSrcDirectives = scriptSrcMatch ? scriptSrcMatch[1] : '';

        const hasUnsafeInlineInScript = scriptSrcDirectives.includes("'unsafe-inline'");
        const hasNonceInScript = scriptSrcDirectives.includes("'nonce-");

        if (!hasUnsafeInlineInScript && hasNonceInScript) {
            passed++;
            console.log('✅ PASS: Produção (NODE_ENV=production) → script-src NÃO contém unsafe-inline e requer nonce estrito.');
        } else {
            failed++;
            console.error(`❌ FAIL: Em produção script-src deveria proibir unsafe-inline: "${scriptSrcDirectives}"`);
        }
    } catch (err) {
        failed++;
        console.error('❌ FAIL: Erro ao validar CSP em produção:', err.message);
    }

    // 3. Validação da Estratégia Híbrida: Em desenvolvimento (NODE_ENV=development) script-src CONTÉM 'unsafe-inline'
    total++;
    try {
        const devCsp = evaluateHelmetCspForEnv('development');
        const scriptSrcMatch = devCsp.match(/script-src\s+([^;]+)/i);
        const scriptSrcDirectives = scriptSrcMatch ? scriptSrcMatch[1] : '';

        const hasUnsafeInlineInScript = scriptSrcDirectives.includes("'unsafe-inline'");
        const hasNonceInScript = scriptSrcDirectives.includes("'nonce-");

        if (hasUnsafeInlineInScript && hasNonceInScript) {
            passed++;
            console.log('✅ PASS: Desenvolvimento (NODE_ENV=development) → script-src contém unsafe-inline para compatibilidade com handlers inline.');
        } else {
            failed++;
            console.error(`❌ FAIL: Em dev script-src deveria conter unsafe-inline: "${scriptSrcDirectives}"`);
        }
    } catch (err) {
        failed++;
        console.error('❌ FAIL: Erro ao validar CSP em desenvolvimento:', err.message);
    }

    // 4. GET / → verifica se o HTML renderizado contém as tags injetadas com nonce e preserva window.__TONU_CONFIG__
    total++;
    try {
        const resHtml = await requestGet('/');
        const hasNonceScript = /<script\s+nonce="[A-Za-z0-9+/=_-]+"/.test(resHtml.body);
        const hasConfigObject = resHtml.body.includes('window.__TONU_CONFIG__');

        if (hasNonceScript && hasConfigObject) {
            passed++;
            console.log('✅ PASS: GET / → HTML contém tags <script nonce="..."> e preserva window.__TONU_CONFIG__.');
        } else {
            failed++;
            console.error(`❌ FAIL: HTML sem injeção de nonce ou window.__TONU_CONFIG__ perdido (hasNonceScript=${hasNonceScript}, hasConfigObject=${hasConfigObject})`);
        }
    } catch (err) {
        failed++;
        console.error('❌ FAIL: Erro ao verificar injeção de nonce no HTML:', err.message);
    }

    // 5. POST /api/csp-report → verifica se retorna 204
    total++;
    try {
        const violationPayload = {
            'csp-report': {
                'document-uri': 'https://localhost:3000/',
                'referrer': '',
                'violated-directive': 'script-src',
                'effective-directive': 'script-src',
                'original-policy': 'script-src ...',
                'disposition': 'enforce',
                'blocked-uri': 'https://evil-site.com/malicious.js',
                'line-number': 1,
                'source-file': 'https://localhost:3000/'
            }
        };

        const resReport = await requestPost('/api/csp-report', violationPayload, 'application/csp-report');
        if (resReport.statusCode === 204) {
            passed++;
            console.log('✅ PASS: POST /api/csp-report → Retorna HTTP 204 No Content com auditoria registrada.');
        } else {
            failed++;
            console.error(`❌ FAIL: POST /api/csp-report retornou status HTTP ${resReport.statusCode} (esperado: 204)`);
        }
    } catch (err) {
        failed++;
        console.error('❌ FAIL: Erro ao enviar relatório para /api/csp-report:', err.message);
    }

    console.log('\n------------------------------------------------------');
    console.log(`📊 RESULTADO DOS TESTES CSP: ${passed}/${total} passaram`);
    console.log('------------------------------------------------------\n');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runCspTests();
