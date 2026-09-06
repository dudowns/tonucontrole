// ============================================
// TONUCONTROLE - SECURE EXPRESS SERVER
// ============================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const archiverModule = require('archiver');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

function createZipArchive(options = {}) {
    if (typeof archiverModule === 'function') {
        return archiverModule('zip', options);
    }
    if (archiverModule.ZipArchive) {
        return new archiverModule.ZipArchive(options);
    }
    if (archiverModule.default && typeof archiverModule.default === 'function') {
        return archiverModule.default('zip', options);
    }
    throw new Error('Módulo archiver não suportado');
}

const app = express();

// A porta 3000 é estritamente exigida pelo proxy reverso do Google AI Studio.
// Permite APP_PORT para ambientes externos caso necessário.
const PORT = process.env.APP_PORT || 3000;
const ROOT_DIR = __dirname;

// ============================================
// 1. CABEÇALHOS DE SEGURANÇA (HELMET)
// ============================================
app.use(helmet({
    // Permite que a aplicação funcione no iframe do Google AI Studio e PWA
    frameguard: false,
    // Permite carregamento de CDNs externos (FontAwesome, Supabase, Chart.js, Google Fonts) e scripts da aplicação
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// ============================================
// 2. LIMITADOR DE REQUISIÇÕES (RATE LIMITING)
// ============================================
// Limite global para navegação e chamadas de API
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Janela de 15 minutos
    max: 1500, // Limite seguro para requisições por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Muitas requisições deste IP. Por favor, tente novamente em alguns instantes.'
    }
});
app.use(globalLimiter);

// Limite restritivo para operações pesadas (download do ZIP)
const zipDownloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Limite de downloads de código-fonte atingido. Aguarde alguns minutos.'
    }
});

// Middlewares essenciais
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// ============================================
// 3. DEFESA EM PROFUNDIDADE: BLOQUEIO DE ARQUIVOS SENSÍVEIS
// ============================================
// Impede qualquer tentativa direta de ler variáveis de ambiente, código de servidor,
// dependências ou arquivos de configuração do sistema.
app.use((req, res, next) => {
    let decodedPath = '';
    try {
        decodedPath = decodeURIComponent(req.path).toLowerCase();
    } catch {
        return res.status(400).send('Caminho de requisição malformado.');
    }

    const sensitivePatterns = [
        '.env',
        '.git',
        'package.json',
        'bun.lock',
        'metadata.json',
        'server.js',
        'node_modules',
        'tests/',
        'scripts/',
        '.ds_store'
    ];

    const isSensitive = sensitivePatterns.some(pattern => decodedPath.includes(pattern));
    if (isSensitive) {
        return res.status(403).json({
            error: 'Acesso proibido a arquivos internos e protegidos do sistema.'
        });
    }

    next();
});

// ============================================
// 4. ROTAS DE API
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'TonuControle',
        version: '2.1.0',
        timestamp: new Date().toISOString()
    });
});

// Download do código-fonte (ZIP Seguro)
app.get('/api/download-zip', zipDownloadLimiter, (req, res) => {
    const zipFileName = 'tonucontrole-source-code.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const archive = createZipArchive({
        zlib: { level: 9 }
    });

    archive.on('error', (err) => {
        console.error('Erro ao gerar arquivo ZIP:', err);
        if (!res.headersSent) {
            res.status(500).send({ error: err.message });
        }
    });

    archive.pipe(res);

    // Adiciona arquivos do projeto garantindo exclusão absoluta de credenciais e logs
    archive.glob('**/*', {
        cwd: ROOT_DIR,
        ignore: [
            'node_modules/**',
            '.git/**',
            'dist/**',
            '*.zip',
            '.DS_Store',
            '.env*',
            '*.env',
            'env.example',
            '.env.example',
            '*.log',
            '*.pem',
            '*.key',
            '*.crt',
            'coverage/**',
            '.vscode/**',
            '.idea/**',
            'tmp/**',
            'temp/**',
            'metadata.json'
        ]
    });

    archive.finalize();
});

// ============================================
// 5. SERVIÇO ESTRUTURADO DE ASSETS PÚBLICOS
// ============================================
// Serve estritamente pastas públicas, nunca a raiz do projeto.
const staticOptions = {
    dotfiles: 'ignore',
    index: false,
    maxAge: '1h'
};

app.use('/css', express.static(path.join(ROOT_DIR, 'css'), staticOptions));
app.use('/js', express.static(path.join(ROOT_DIR, 'js'), staticOptions));
app.use('/icons', express.static(path.join(ROOT_DIR, 'icons'), staticOptions));

// Suporte ao alias legado /tonucontrole/*
app.use('/tonucontrole/css', express.static(path.join(ROOT_DIR, 'css'), staticOptions));
app.use('/tonucontrole/js', express.static(path.join(ROOT_DIR, 'js'), staticOptions));
app.use('/tonucontrole/icons', express.static(path.join(ROOT_DIR, 'icons'), staticOptions));

// Manifest PWA e Service Worker
app.get(['/manifest.json', '/tonucontrole/manifest.json'], (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'manifest.json'));
});

app.get(['/sw.js', '/tonucontrole/sw.js'], (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(ROOT_DIR, 'sw.js'));
});

// Entrada principal da aplicação
app.get(['/', '/index.html', '/tonucontrole', '/tonucontrole/index.html'], (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get(['/index-mobile.html', '/tonucontrole/index-mobile.html'], (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index-mobile.html'));
});

// ============================================
// 6. RENDERIZAÇÃO SEGURA DE PÁGINAS (ANTI PATH-TRAVERSAL)
// ============================================
function serveSecurePage(req, res, next, isMobile = false) {
    const rawPage = req.params.page;
    if (!rawPage) return next();

    // Sanitização e validação estrita: apenas letras, dígitos, traços e underscores
    const cleanPage = rawPage.replace(/\.html$/i, '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanPage)) {
        return res.status(400).send('Nome de página inválido.');
    }

    const baseDir = isMobile
        ? path.resolve(ROOT_DIR, 'pages', 'mobile')
        : path.resolve(ROOT_DIR, 'pages');

    const filePath = path.resolve(baseDir, `${cleanPage}.html`);

    // Validação de fronteira de diretório (Prevenção definitiva contra Path Traversal)
    if (!filePath.startsWith(baseDir)) {
        return res.status(403).send('Acesso não permitido.');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
    }

    next();
}

// Rotas desktop e mobile protegidas
app.get('/pages/mobile/:page', (req, res, next) => serveSecurePage(req, res, next, true));
app.get('/pages/:page', (req, res, next) => serveSecurePage(req, res, next, false));

app.get('/tonucontrole/pages/mobile/:page', (req, res, next) => serveSecurePage(req, res, next, true));
app.get('/tonucontrole/pages/:page', (req, res, next) => serveSecurePage(req, res, next, false));

// ============================================
// 7. FALLBACK E PÁGINA 404
// ============================================
app.use((req, res) => {
    const notFoundPath = path.join(ROOT_DIR, 'pages', '404.html');
    if (fs.existsSync(notFoundPath)) {
        res.status(404).sendFile(notFoundPath);
    } else {
        res.status(404).sendFile(path.join(ROOT_DIR, 'index.html'));
    }
});

// Inicia servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🛡️ Servidor TonuControle Seguro rodando em http://0.0.0.0:${PORT}`);
});
