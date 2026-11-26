// ==========================================================================
// TONUCONTROLE - LIGHTHOUSE AUDIT SCRIPT
// Executa auditoria Lighthouse e salva relatórios JSON + HTML em lighthouse-reports/
// Uso: node scripts/lighthouse-audit.js <url> <label>
// ==========================================================================

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'lighthouse-reports');

const url = process.argv[2] || 'http://localhost:3000/pages/mobile/dashboard.html';
const rawLabel = process.argv[3] || 'audit';
const label = rawLabel.replace(/[^a-zA-Z0-9_-]/g, '-');

function ensureReportsDir() {
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
}

function formatMetric(lhr, id) {
    const audit = lhr && lhr.audits && lhr.audits[id];
    if (!audit) return { display: 'N/A', numericValue: null };
    return {
        display: audit.displayValue || (typeof audit.numericValue === 'number' ? String(Math.round(audit.numericValue)) : 'N/A'),
        numericValue: typeof audit.numericValue === 'number' ? audit.numericValue : null
    };
}

function extractSummary(lhr) {
    const cats = (lhr && lhr.categories) || {};
    const scoreOf = (k) => (cats[k] && typeof cats[k].score === 'number') ? Math.round(cats[k].score * 100) : null;

    return {
        label,
        url,
        fetchedAt: new Date().toISOString(),
        scores: {
            performance: scoreOf('performance'),
            accessibility: scoreOf('accessibility'),
            bestPractices: scoreOf('best-practices'),
            seo: scoreOf('seo'),
            pwa: scoreOf('pwa')
        },
        vitals: {
            fcp: formatMetric(lhr, 'first-contentful-paint'),
            lcp: formatMetric(lhr, 'largest-contentful-paint'),
            tbt: formatMetric(lhr, 'total-blocking-time'),
            cls: formatMetric(lhr, 'cumulative-layout-shift'),
            si: formatMetric(lhr, 'speed-index'),
            tti: formatMetric(lhr, 'interactive')
        }
    };
}

function run() {
    ensureReportsDir();

    const baseOut = path.join(REPORTS_DIR, label);
    const jsonPath = `${baseOut}.report.json`;
    const htmlPath = `${baseOut}.report.html`;
    const summaryPath = `${baseOut}.summary.json`;

    const args = [
        'lighthouse',
        url,
        '--output=json',
        '--output=html',
        `--output-path=${baseOut}`,
        '--preset=desktop',
        '--chrome-flags=--headless --no-sandbox --disable-gpu',
        '--quiet'
    ];

    if (url.includes('/pages/mobile/')) {
        const presetIdx = args.indexOf('--preset=desktop');
        if (presetIdx !== -1) args.splice(presetIdx, 1);
    }

    console.log(`\n🔍 Executando Lighthouse (${label}): ${url}`);
    console.log(`📁 Saída: lighthouse-reports/${label}.report.{json,html}\n`);

    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const res = spawnSync(npxCmd, args, {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env }
    });

    if (res.status !== 0 || !fs.existsSync(jsonPath)) {
        console.error('\n❌ Falha ao executar Lighthouse.');
        console.error('ℹ️  Verifique se o servidor está rodando (npm run dev) e se há Chrome/Chromium instalado.');
        console.error('ℹ️  Você também pode definir CHROME_PATH=/caminho/para/chrome ou consultar: npx lighthouse --help\n');
        process.exit(res.status || 1);
    }

    const lhr = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const summary = extractSummary(lhr);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

    console.log('📊 SCORES LIGHTHOUSE:');
    console.log(`   Performance:    ${summary.scores.performance ?? 'N/A'}`);
    console.log(`   Accessibility:  ${summary.scores.accessibility ?? 'N/A'}`);
    console.log(`   Best Practices: ${summary.scores.bestPractices ?? 'N/A'}`);
    console.log(`   SEO:            ${summary.scores.seo ?? 'N/A'}`);
    console.log('\n⚡ CORE WEB VITALS:');
    console.log(`   FCP: ${summary.vitals.fcp.display}`);
    console.log(`   LCP: ${summary.vitals.lcp.display}`);
    console.log(`   TBT: ${summary.vitals.tbt.display}`);
    console.log(`   CLS: ${summary.vitals.cls.display}`);
    console.log(`   SI:  ${summary.vitals.si.display}`);
    console.log(`\n✅ Relatórios salvos:`);
    console.log(`   - ${path.relative(ROOT, jsonPath)}`);
    console.log(`   - ${path.relative(ROOT, htmlPath)}`);
    console.log(`   - ${path.relative(ROOT, summaryPath)}\n`);
}

run();
