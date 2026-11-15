// ==========================================================================
// TONUCONTROLE - LIGHTHOUSE COMPARE SCRIPT
// Compara métricas before vs after em lighthouse-reports/
// Uso: node scripts/lighthouse-compare.js [beforeLabel] [afterLabel]
// ==========================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'lighthouse-reports');

const beforeLabel = (process.argv[2] || 'before').replace(/[^a-zA-Z0-9_-]/g, '-');
const afterLabel = (process.argv[3] || 'after').replace(/[^a-zA-Z0-9_-]/g, '-');

function loadReportSummary(label) {
    const summaryFile = path.join(REPORTS_DIR, `${label}.summary.json`);
    if (fs.existsSync(summaryFile)) {
        return JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    }

    const rawFile = path.join(REPORTS_DIR, `${label}.report.json`);
    if (!fs.existsSync(rawFile)) {
        return null;
    }

    const lhr = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
    const cats = lhr.categories || {};
    const scoreOf = (k) => (cats[k] && typeof cats[k].score === 'number') ? Math.round(cats[k].score * 100) : null;
    const metricOf = (id) => {
        const a = lhr.audits && lhr.audits[id];
        return a ? { display: a.displayValue || 'N/A', numericValue: a.numericValue ?? null } : { display: 'N/A', numericValue: null };
    };

    return {
        label,
        url: lhr.finalDisplayedUrl || lhr.requestedUrl || '',
        scores: {
            performance: scoreOf('performance'),
            accessibility: scoreOf('accessibility'),
            bestPractices: scoreOf('best-practices'),
            seo: scoreOf('seo')
        },
        vitals: {
            fcp: metricOf('first-contentful-paint'),
            lcp: metricOf('largest-contentful-paint'),
            tbt: metricOf('total-blocking-time'),
            cls: metricOf('cumulative-layout-shift'),
            si: metricOf('speed-index'),
            tti: metricOf('interactive')
        }
    };
}

function formatDelta(beforeVal, afterVal, lowerIsBetter = false, unit = '') {
    if (typeof beforeVal !== 'number' || typeof afterVal !== 'number') return 'N/A';
    const diff = afterVal - beforeVal;
    const rounded = Math.abs(diff) < 1 && unit === '' ? Number(diff.toFixed(3)) : Math.round(diff);
    const sign = rounded > 0 ? '+' : '';
    const improved = lowerIsBetter ? diff < 0 : diff > 0;
    const tag = diff === 0 ? '=' : (improved ? '✅' : '⚠️');
    return `${tag} ${sign}${rounded}${unit}`;
}

function run() {
    const before = loadReportSummary(beforeLabel);
    const after = loadReportSummary(afterLabel);

    if (!before || !after) {
        console.error('\n❌ Relatórios não encontrados para comparação.');
        if (!before) console.error(`   - Faltando: lighthouse-reports/${beforeLabel}.report.json (rode: npm run audit:before)`);
        if (!after) console.error(`   - Faltando: lighthouse-reports/${afterLabel}.report.json (rode: npm run audit:after)`);
        console.error('');
        process.exit(1);
    }

    console.log('\n==============================================================');
    console.log(`📊 COMPARAÇÃO LIGHTHOUSE: ${beforeLabel} → ${afterLabel}`);
    console.log('==============================================================');

    const scoreRows = [
        ['Performance', before.scores.performance, after.scores.performance],
        ['Accessibility', before.scores.accessibility, after.scores.accessibility],
        ['Best Practices', before.scores.bestPractices, after.scores.bestPractices],
        ['SEO', before.scores.seo, after.scores.seo]
    ];

    console.log('\n🎯 SCORES (0-100):');
    scoreRows.forEach(([name, b, a]) => {
        console.log(`   ${name.padEnd(16)} ${String(b ?? 'N/A').padStart(5)} → ${String(a ?? 'N/A').padStart(5)}   (${formatDelta(b, a, false)})`);
    });

    const vitalRows = [
        ['FCP', before.vitals.fcp, after.vitals.fcp, 'ms'],
        ['LCP', before.vitals.lcp, after.vitals.lcp, 'ms'],
        ['TBT', before.vitals.tbt, after.vitals.tbt, 'ms'],
        ['CLS', before.vitals.cls, after.vitals.cls, ''],
        ['SI', before.vitals.si, after.vitals.si, 'ms'],
        ['TTI', before.vitals.tti, after.vitals.tti, 'ms']
    ];

    console.log('\n⚡ CORE WEB VITALS:');
    vitalRows.forEach(([name, b, a, unit]) => {
        const bDisp = b?.display || 'N/A';
        const aDisp = a?.display || 'N/A';
        const delta = formatDelta(b?.numericValue, a?.numericValue, true, unit);
        console.log(`   ${name.padEnd(6)} ${bDisp.padStart(10)} → ${aDisp.padStart(10)}   (${delta})`);
    });

    const comparison = {
        comparedAt: new Date().toISOString(),
        beforeLabel,
        afterLabel,
        scores: Object.fromEntries(scoreRows.map(([n, b, a]) => [n, { before: b, after: a, delta: (typeof b === 'number' && typeof a === 'number') ? a - b : null }])),
        vitals: Object.fromEntries(vitalRows.map(([n, b, a]) => [n, { before: b, after: a, delta: (typeof b?.numericValue === 'number' && typeof a?.numericValue === 'number') ? a.numericValue - b.numericValue : null }]))
    };

    const outPath = path.join(REPORTS_DIR, 'comparison.json');
    fs.writeFileSync(outPath, JSON.stringify(comparison, null, 2), 'utf8');
    console.log(`\n✅ Comparação salva em: ${path.relative(ROOT, outPath)}\n`);
}

run();
