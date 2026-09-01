// ============================================
// TONUCONTROLE - EXPRESS SERVER
// ============================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const archiver = require('archiver');

const app = express();
const PORT = 3000;
const ROOT_DIR = __dirname;

// Middlewares básicos
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// ============================================
// API ROUTES
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

// Download project ZIP
app.get('/api/download-zip', (req, res) => {
    const zipFileName = 'tonucontrole-source-code.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    archive.on('error', (err) => {
        console.error('Erro ao gerar arquivo ZIP:', err);
        res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    // Adiciona arquivos e diretórios ignorando node_modules, .git e dist
    archive.glob('**/*', {
        cwd: ROOT_DIR,
        ignore: ['node_modules/**', '.git/**', 'dist/**', '*.zip', '.DS_Store']
    });

    archive.finalize();
});

// ============================================
// COMPATIBILIDADE / ALIAS PARA /tonucontrole/*
// ============================================
// Permite que caminhos com prefixo /tonucontrole/ funcionem como /
app.use('/tonucontrole', express.static(ROOT_DIR));

// ============================================
// ARQUIVOS ESTÁTICOS
// ============================================
app.use(express.static(ROOT_DIR));

// Rota raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// Rota para páginas desktop e mobile sem extensão .html
app.get('/pages/mobile/:page', (req, res, next) => {
    const pageName = req.params.page;
    const fileWithExt = pageName.endsWith('.html') ? pageName : `${pageName}.html`;
    const filePath = path.join(ROOT_DIR, 'pages', 'mobile', fileWithExt);
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }
    next();
});

app.get('/pages/:page', (req, res, next) => {
    const pageName = req.params.page;
    const fileWithExt = pageName.endsWith('.html') ? pageName : `${pageName}.html`;
    const filePath = path.join(ROOT_DIR, 'pages', fileWithExt);
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }
    next();
});

// Fallback para 404
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
    console.log(`🚀 Servidor TonuControle rodando em http://0.0.0.0:${PORT}`);
});
