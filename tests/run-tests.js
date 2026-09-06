// ==========================================================================
// TONUCONTROLE - AUTOMATED TEST RUNNER (Unit & E2E Tests)
// ==========================================================================

const { runUnitTests } = require('./unit.test');
const { runE2ETests } = require('./e2e.test');
const { runSecurityTests } = require('./security.test');

async function main() {
    console.log('\n======================================================');
    console.log('🧪 INICIANDO SUÍTE DE TESTES AUTOMATIZADOS TONUCONTROLE');
    console.log('======================================================\n');

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    const startTime = Date.now();

    // 1. Testes Unitários
    console.log('📦 [1/3] Executando Testes Unitários...');
    const unitResults = await runUnitTests();
    unitResults.forEach(r => {
        totalTests++;
        if (r.passed) {
            passedTests++;
            console.log(`   ✅ PASS: ${r.name}`);
        } else {
            failedTests++;
            console.error(`   ❌ FAIL: ${r.name} - ${r.error}`);
        }
    });

    console.log('');

    // 2. Testes E2E & Integração
    console.log('🔄 [2/3] Executando Testes End-to-End (E2E) & Fluxos...');
    const e2eResults = await runE2ETests();
    e2eResults.forEach(r => {
        totalTests++;
        if (r.passed) {
            passedTests++;
            console.log(`   ✅ PASS: ${r.name}`);
        } else {
            failedTests++;
            console.error(`   ❌ FAIL: ${r.name} - ${r.error}`);
        }
    });

    console.log('');

    // 3. Testes de Segurança e Servidor
    console.log('🛡️ [3/3] Executando Testes de Segurança & Servidor...');
    const secResults = await runSecurityTests();
    secResults.forEach(r => {
        totalTests++;
        if (r.passed) {
            passedTests++;
            console.log(`   ✅ PASS: ${r.name}`);
        } else {
            failedTests++;
            console.error(`   ❌ FAIL: ${r.name} - ${r.error}`);
        }
    });

    const duration = Date.now() - startTime;

    console.log('\n------------------------------------------------------');
    console.log(`📊 RESULTADO FINAL: ${passedTests}/${totalTests} testes passaram (${duration}ms)`);
    console.log('------------------------------------------------------');

    if (failedTests > 0) {
        console.error(`❌ ${failedTests} teste(s) falharam.\n`);
        process.exit(1);
    } else {
        console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!\n');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Erro fatal durante execução dos testes:', err);
    process.exit(1);
});
