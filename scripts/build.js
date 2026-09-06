// ============================================
// TONUCONTROLE - PRODUCTION BUILD SCRIPT
// ============================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log('🚀 Iniciando processo de build de produção TonuControle...\n');

const startTime = Date.now();
let totalErrors = 0;
let filesProcessed = 0;

// 1. Limpeza e preparação do diretório dist/
try {
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(DIST_DIR, { recursive: true });
    console.log('📁 [1/5] Diretório dist/ preparado com sucesso.');
} catch (err) {
    console.error('❌ Erro ao preparar pasta dist/:', err.message);
    process.exit(1);
}

// 2. Validação de Sintaxe em todos os arquivos JS
console.log('🔍 [2/5] Validando integridade sintática do JavaScript...');
const jsFiles = [
    'js/core.js',
    'js/security.js',
    'js/auth.js',
    'js/dashboard.js',
    'js/transactions.js',
    'js/bills.js',
    'js/goals.js',
    'js/investments.js',
    'js/settings.js',
    'js/sync.js',
    'js/notifications.js',
    'js/financial-tools.js',
    'server.js',
    'sw.js'
];

jsFiles.forEach(file => {
    const fullPath = path.join(ROOT_DIR, file);
    if (fs.existsSync(fullPath)) {
        try {
            execSync(`node --check "${fullPath}"`);
            filesProcessed++;
        } catch (err) {
            console.error(`❌ Erro de sintaxe em ${file}:`, err.message);
            totalErrors++;
        }
    }
});
console.log(`   ✅ ${filesProcessed} arquivos JavaScript validados com sucesso.`);

// 3. Validação do Manifest PWA
console.log('📱 [3/5] Validando Web App Manifest...');
const manifestPath = path.join(ROOT_DIR, 'manifest.json');
try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(manifestContent);
    if (!parsed.name || !parsed.icons || !parsed.start_url) {
        throw new Error('Manifest incompleto: faltam campos obrigatórios (name, icons ou start_url)');
    }
    console.log(`   ✅ Manifest PWA válido (${parsed.name} v${parsed.version || '2.1.0'}).`);
} catch (err) {
    console.error('❌ Erro na validação do manifest.json:', err.message);
    totalErrors++;
}

// 4. Cópia e Otimização de Assets Públicos para dist/
console.log('📦 [4/5] Otimizando e exportando assets de produção para dist/...');

function copyDirRecursive(src, dest, transformFile = null) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath, transformFile);
        } else if (entry.isFile()) {
            if (transformFile) {
                const transformed = transformFile(srcPath, entry.name);
                fs.writeFileSync(destPath, transformed);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

// Minificador simples e seguro para CSS (remove comentários e espaços extras)
function minifyCss(filePath, fileName) {
    if (fileName.endsWith('.css')) {
        let content = fs.readFileSync(filePath, 'utf8');
        // Remove comentários
        content = content.replace(/\/\*[\s\S]*?\*\//g, '');
        // Normaliza espaços
        content = content.replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1');
        return content.trim();
    }
    return fs.readFileSync(filePath);
}

try {
    // Copiar CSS otimizado
    if (fs.existsSync(path.join(ROOT_DIR, 'css'))) {
        copyDirRecursive(path.join(ROOT_DIR, 'css'), path.join(DIST_DIR, 'css'), minifyCss);
    }
    // Copiar JS
    if (fs.existsSync(path.join(ROOT_DIR, 'js'))) {
        copyDirRecursive(path.join(ROOT_DIR, 'js'), path.join(DIST_DIR, 'js'));
    }
    // Copiar Icons
    if (fs.existsSync(path.join(ROOT_DIR, 'icons'))) {
        copyDirRecursive(path.join(ROOT_DIR, 'icons'), path.join(DIST_DIR, 'icons'));
    }
    // Copiar Pages
    if (fs.existsSync(path.join(ROOT_DIR, 'pages'))) {
        copyDirRecursive(path.join(ROOT_DIR, 'pages'), path.join(DIST_DIR, 'pages'));
    }
    // Copiar arquivos raiz essenciais para produção
    const rootAssets = ['index.html', 'index-mobile.html', 'manifest.json', 'sw.js'];
    rootAssets.forEach(f => {
        const src = path.join(ROOT_DIR, f);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(DIST_DIR, f));
        }
    });

    console.log('   ✅ Assets estruturados e otimizados em dist/.');
} catch (err) {
    console.error('❌ Erro na otimização dos assets:', err.message);
    totalErrors++;
}

// 5. Geração do Manifesto de Build com Metadata
console.log('📊 [5/5] Gerando relatório de integridade do build...');
const buildReport = {
    app: 'TonuControle',
    version: '2.1.0',
    buildDate: new Date().toISOString(),
    nodeVersion: process.version,
    status: totalErrors === 0 ? 'success' : 'failed',
    errorsCount: totalErrors,
    durationMs: Date.now() - startTime
};

fs.writeFileSync(path.join(DIST_DIR, 'build-info.json'), JSON.stringify(buildReport, null, 2));

console.log('\n------------------------------------------------------');
if (totalErrors === 0) {
    console.log(`🎉 BUILD DE PRODUÇÃO CONCLUÍDO COM SUCESSO! (${buildReport.durationMs}ms)`);
    console.log('   Diretório dist/ pronto para distribuição.');
    console.log('------------------------------------------------------\n');
    process.exit(0);
} else {
    console.error(`❌ O build falhou com ${totalErrors} erro(s).`);
    console.log('------------------------------------------------------\n');
    process.exit(1);
}
